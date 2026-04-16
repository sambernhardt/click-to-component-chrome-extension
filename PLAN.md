# Click-to-Component v2 — Plan

## Goal

Extend the v1 extension to resolve source locations for **host elements** (divs, spans, buttons, etc.) — not just the component that contains them, but the exact line in the TSX file where the element is written.

Zero changes required to the target app. Works with Next.js + Turbopack + SWC + React 19.

---

## Why v1 Can't Locate Host Elements

The v1 extension works by:
1. Walking the fiber tree to find component fibers (where `fiber.type` is a function)
2. Getting `[[FunctionLocation]]` from V8 for that function via CDP
3. Reverse-mapping the bundle position through source maps

Host elements like `<div>` have `fiber.type === "div"` — a string, not a function. There's no JS function to call `[[FunctionLocation]]` on.

`fiber._debugSource` would solve this (React stores the JSX call site there), but React 19 removed `_debugSource` entirely. Even if SWC injects `__source` into JSX props, React 19 strips it before it reaches the fiber.

---

## The v2 Approach: jsxDEV Call Enumeration

SWC compiles every JSX element into a `jsxDEV(type, props, ...)` call in the bundle. Each call has a bundle position that maps back to the original TSX line via source maps. The extension already fetches and parses source maps.

**Key insight:** the extension already has everything needed to find those jsxDEV calls — the component's bundle location, the script source (fetchable via CDP), and the source map consumer. We just need to:

1. Fetch the bundle script text for the component's script
2. Scan it for `jsxDEV("div", ...)` calls within the component function body
3. Reverse-map each call's bundle position → original TSX line
4. Match the right call to the clicked fiber using the fiber's structural position + props

---

## Data Flow

```
User clicks <div className="card-header">
  ↓
content.js → background.js RESOLVE_SOURCES message (same as v1)
  ↓
buildStoreExpr runs in page context
  - existing: collects component stack (fiber.type is function)
  - NEW: if clicked root is a host element, collect hostElementInfo:
      { type: "div", props: { className: "card-header" }, path: [["div",0],["section",0],["div",1]] }
      path = sequence of [type, index] from owning component fiber down to the clicked element
  ↓
background.js resolves component stack (same as v1)
  - NEW: if hostElementInfo present, also run resolveHostElement()
  ↓
resolveHostElement(tabId, session, componentScriptId, componentLine, componentCol, hostElementInfo)
  1. getScriptSource(scriptId) → full bundle text
  2. findJsxDevCalls(bundleText, startLine, targetType) → [{line, col, propsText}]
  3. for each candidate: resolveLocation(session, scriptId, line, col) → {file, line, col}
  4. pick best match via props + structural path
  ↓
popover shows host element entry at top (above component stack)
  - label: "<div>" or "div.card-header" (first className if present)
  - source: file:line → click opens in editor
```

---

## Implementation Steps

### Step 1 — Collect host element info in buildStoreExpr

In `src/background.js`, modify `buildStoreExpr(x, y)` to also detect when the clicked element is a host element and collect:

```js
var hostElementInfo = null;
var rootFiber = findNearestFiber(el);
if (rootFiber && typeof rootFiber.type === 'string') {
  // Build path from the clicked fiber up to (but not including) the owning component fiber
  var path = [];
  var f = rootFiber;
  while (f && typeof f.type === 'string') {
    path.unshift({ type: f.type, index: f.index });
    f = f.return;
  }
  hostElementInfo = {
    type: rootFiber.type,
    props: rootFiber.memoizedProps,  // for className, id, data-* disambiguation
    path: path,                       // structural path from component to this element
  };
}
// Store in window.__ctcTmp alongside stack/fns
window.__ctcTmp = { stack, fns, hostElementInfo };
```

The returned `stack` array stays the same (component ancestors). `hostElementInfo` is returned separately.

### Step 2 — Retrieve hostElementInfo in resolveSources

After the existing Pass 1 / Pass 2, read `window.__ctcTmp.hostElementInfo` by value (it's serializable — no function refs needed).

```js
const hostInfoResult = await sendCDP(tabId, 'Runtime.evaluate', {
  expression: 'window.__ctcTmp ? window.__ctcTmp.hostElementInfo : null',
  returnByValue: true,
});
const hostElementInfo = hostInfoResult.result?.value ?? null;
```

### Step 3 — Add getScriptSource with caching

Fetch script source text once per script, cache by scriptId. Store in `session.scriptSources: Map<scriptId, string>`.

```js
async function getScriptSource(tabId, scriptId) {
  const session = getSession(tabId);
  if (session.scriptSources.has(scriptId)) return session.scriptSources.get(scriptId);
  const result = await sendCDP(tabId, 'Debugger.getScriptSource', { scriptId });
  const text = result.scriptSource || '';
  session.scriptSources.set(scriptId, text);
  return text;
}
```

Clear from cache in the HMR handler (when `scriptParsed` re-fires for the same URL):
```js
session.scriptSources.delete(sid); // alongside scripts.delete(sid)
```

### Step 4 — Add findJsxDevCalls

Given bundle text, a start line (0-indexed), and a target type string, return all jsxDEV call positions for that type within the function body.

```js
function findJsxDevCalls(scriptText, startLine, targetType) {
  const lines = scriptText.split('\n');
  const results = [];
  // Only scan from the function's start line to avoid false positives from
  // other functions. Stop heuristic: stop after encountering a blank line
  // followed by a new function keyword at column 0 (top-level boundary).
  // For now: scan up to 300 lines from startLine.
  const scanLines = lines.slice(startLine, startLine + 300);

  // Match: jsxDEV("div", ...) or jsxDEV('div', ...)
  // Handles: (0,r.jsxDEV)("div",...), _jsx("div",...), jsxDEV("div",...)
  const pattern = new RegExp(`\\bjsxDEV\\s*\\(\\s*["']${escapeRegex(targetType)}["']`, 'g');

  for (let i = 0; i < scanLines.length; i++) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(scanLines[i])) !== null) {
      results.push({
        line: startLine + i,       // 0-indexed bundle line
        col: match.index,          // 0-indexed bundle column
        lineText: scanLines[i],    // for props extraction
      });
    }
  }
  return results;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### Step 5 — Pick the best match

Given multiple jsxDEV call candidates all mapped to source positions, pick the right one:

```js
function pickBestMatch(candidates, hostElementInfo) {
  if (candidates.length === 1) return candidates[0];

  const { props, path } = hostElementInfo;

  // Score each candidate by how many distinctive props match the text near the call
  const distinctiveProps = ['className', 'id', 'data-testid', 'aria-label', 'name', 'type', 'href'];

  return candidates
    .map(c => {
      let score = 0;
      for (const key of distinctiveProps) {
        const val = props?.[key];
        if (val && typeof val === 'string' && c.lineText.includes(val)) score++;
      }
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score)[0];
}
```

If the top score is 0 (no props match), fall back to the first candidate or show all in the popover.

### Step 6 — Wire up resolveHostElement

```js
async function resolveHostElement(tabId, session, componentLoc, hostElementInfo) {
  // componentLoc: { scriptId, lineNumber, columnNumber } from [[FunctionLocation]]
  const scriptText = await getScriptSource(tabId, componentLoc.scriptId);
  if (!scriptText) return null;

  const candidates = findJsxDevCalls(scriptText, componentLoc.lineNumber, hostElementInfo.type);
  if (candidates.length === 0) return null;

  // Reverse-map each candidate through source maps
  const resolved = [];
  for (const c of candidates) {
    const loc = await resolveLocation(session, componentLoc.scriptId, c.line, c.col);
    if (loc) resolved.push({ ...loc, lineText: c.lineText });
  }
  if (resolved.length === 0) return null;

  return pickBestMatch(resolved, hostElementInfo);
}
```

Call this in `resolveSources` after the component stack is resolved, using the owning component's bundle location:

```js
// hostElementInfo was collected in step 2
if (hostElementInfo && resolvedStack.length > 0) {
  // The owning component is the first entry in the stack (innermost component)
  const ownerBundleLoc = /* the scriptId/line/col for resolvedStack[0] — see note below */;
  const hostLoc = await resolveHostElement(tabId, session, ownerBundleLoc, hostElementInfo);
  return { stack: resolvedStack, hostElement: hostLoc ?? null };
}
```

**Note:** We need to keep the bundle locations (scriptId, lineNumber, columnNumber) alongside the resolved source locations for the component stack entries, so we can pass the owning component's bundle loc to `resolveHostElement`. Currently `resolveLocation` only returns source positions. Store the bundle loc in the pass 3 loop.

### Step 7 — Update content.js popover

Add a host element row at the top of the popover when `hostElement` is present in the response:

```
┌─────────────────────────────────────────┐
│ <div> · div.card-header                 │  ← host element (new)
│   src/components/Card.tsx:42            │
│─────────────────────────────────────────│
│ Card                                    │  ← component stack (existing)
│   src/components/Card.tsx:5             │
│ Page                                    │
│   src/app/page.tsx:12                   │
└─────────────────────────────────────────┘
```

The host element row is styled differently (e.g. monospace tag label, slightly dimmed if no source found).

---

## Edge Cases

| Case | Handling |
|------|---------|
| Bare `<div>` with no props | Candidates scored 0 — return first candidate or show all |
| Multiple `<div>`s with same className | Pick first; future: show all candidates in popover |
| Conditional renders (some divs not in fiber tree) | Props matching still works on the rendered ones |
| `jsx` vs `jsxDEV` | In dev builds, SWC always uses `jsxDEV`. Production uses `jsx` — no source to resolve anyway |
| SWC naming variants (`r.jsxDEV`, `_jsxDEV`, etc.) | Regex matches `\bjsxDEV\b` — handles all identifier forms |
| Component function body > 300 lines | Increase scan limit or detect function end via brace counting |
| Host element in a subcomponent | `path` traces through intermediate host elements — the owning component fiber is the nearest function-type fiber in the return chain, which is already what `_debugOwner` points to |
| No source map for the script | Fall back to showing component row only (same as v1) |
| `resolveLocation` returns wrong file | Source map is authoritative — same as v1 behavior |

---

## What Does NOT Change from v1

- Manifest, permissions, popup, editor deep links — unchanged
- Component stack resolution via `[[FunctionLocation]]` — unchanged
- `_debugSource` fast path — unchanged (kept for Vite/CRA)
- Source map fetching, caching, HMR invalidation — unchanged (just add `scriptSources` cache)
- `injected.js` hover behavior — unchanged

---

## Files to Edit

| File | Change |
|------|--------|
| `src/background.js` | Main changes: `buildStoreExpr`, `resolveSources`, new `getScriptSource`, `findJsxDevCalls`, `pickBestMatch`, `resolveHostElement` |
| `content.js` | Popover rendering: add host element row at top |
| `injected.js` | No changes |
| `build.js` | No changes |
| `manifest.json` | No changes |
| `popup.js` / `popup.html` | No changes |
