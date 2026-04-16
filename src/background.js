// Background service worker — CDP-based source resolution for Click to Component.
// Bundled via esbuild (src/background.js → background.js) to include source-map-js.

import { TraceMap, FlattenMap, originalPositionFor, GREATEST_LOWER_BOUND } from '@jridgewell/trace-mapping';

// ─── Settings ─────────────────────────────────────────────────────────────────

let projectRoot = '';

chrome.storage.sync.get(['projectRoot'], (result) => {
  if (result.projectRoot) projectRoot = result.projectRoot;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.projectRoot) projectRoot = changes.projectRoot.newValue || '';
});

// ─── Session state ────────────────────────────────────────────────────────────

const sessions = new Map(); // tabId → { attached, scripts, sourceMaps, locationCache, scriptSources }

function getSession(tabId) {
  if (!sessions.has(tabId)) {
    sessions.set(tabId, {
      attached: false,
      scripts: new Map(),       // scriptId → { url, sourceMapURL }
      sourceMaps: new Map(),    // resolvedSourceMapURL → SourceMapConsumer
      locationCache: new Map(), // `${scriptId}:${line}:${col}` → { file, line, col }
      scriptSources: new Map(), // scriptId → full bundle text
    });
  }
  return sessions.get(tabId);
}

// ─── Attach / detach ─────────────────────────────────────────────────────────

async function attachToTab(tabId) {
  const session = getSession(tabId);
  if (session.attached) return;
  await chrome.debugger.attach({ tabId }, '1.3');
  session.attached = true;
  await sendCDP(tabId, 'Debugger.enable', {});
  await sendCDP(tabId, 'Runtime.enable', {});
}

async function detachFromTab(tabId) {
  const session = sessions.get(tabId);
  if (!session?.attached) return;
  try { await chrome.debugger.detach({ tabId }); } catch (_) {}
  sessions.delete(tabId);
}

// ─── CDP helpers ─────────────────────────────────────────────────────────────

function sendCDP(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

// ─── scriptParsed event ───────────────────────────────────────────────────────

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method !== 'Debugger.scriptParsed') return;
  const { tabId } = source;
  const session = sessions.get(tabId);
  if (!session) return;

  const { scriptId, url, sourceMapURL } = params;
  if (!url) return;

  let resolvedSourceMapURL = null;
  if (sourceMapURL) {
    if (sourceMapURL.startsWith('data:')) {
      resolvedSourceMapURL = sourceMapURL;
    } else if (/^https?:\/\//.test(sourceMapURL)) {
      resolvedSourceMapURL = sourceMapURL;
    } else if (sourceMapURL.startsWith('//')) {
      resolvedSourceMapURL = `https:${sourceMapURL}`;
    } else {
      try { resolvedSourceMapURL = new URL(sourceMapURL, url).href; } catch (_) {}
    }
  }

  // HMR: clear stale cache entries for scripts with the same URL
  for (const [sid, info] of session.scripts) {
    if (info.url === url && sid !== scriptId) {
      session.scripts.delete(sid);
      session.scriptSources.delete(sid);
      for (const key of session.locationCache.keys()) {
        if (key.startsWith(`${sid}:`)) session.locationCache.delete(key);
      }
    }
  }

  session.scripts.set(scriptId, { url, sourceMapURL: resolvedSourceMapURL });
  if (resolvedSourceMapURL && !resolvedSourceMapURL.startsWith('data:')) {
    console.log('[ctc] script with source map:', url.split('/').pop(), '→', resolvedSourceMapURL);
  }
});

// ─── Fiber walk ───────────────────────────────────────────────────────────────
// Single expression that:
//   1. Walks the fiber tree at (x, y)
//   2. Stores serializable stack data AND fn references in window.__ctcTmp
//   3. Returns only the serializable stack (so returnByValue:true works)
//
// A second expression retrieves window.__ctcTmp.fns by reference (returnByValue:false)
// so we can get objectIds for [[FunctionLocation]]. The two arrays are index-aligned.

function buildStoreExpr(x, y) {
  return `(function() {
    function unwrapType(type) {
      if (!type) return null;
      if (type.$$typeof === Symbol.for('react.memo')) return unwrapType(type.type);
      if (type.$$typeof === Symbol.for('react.forward_ref')) return type.render;
      if (type.$$typeof === Symbol.for('react.lazy')) return null;
      if (typeof type === 'function') return type;
      return null;
    }
    function getFiber(el) {
      if (!el || el.nodeType !== 1) return null;
      var keys = Object.keys(el);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].startsWith('__reactFiber$')) return el[keys[i]];
      }
      return null;
    }
    function findNearestFiber(el) {
      var node = el;
      while (node && node !== document.documentElement) {
        var f = getFiber(node); if (f) return f;
        node = node.parentElement;
      }
      return null;
    }
    function getSafeProps(props) {
      var safeProps = {};
      var propKeys = ['className', 'id', 'data-testid', 'aria-label', 'name', 'type', 'href', 'role'];
      props = props || {};
      for (var pi = 0; pi < propKeys.length; pi++) {
        var pv = props[propKeys[pi]];
        if (pv != null && typeof pv !== 'function' && typeof pv !== 'object') {
          safeProps[propKeys[pi]] = String(pv);
        }
      }
      return safeProps;
    }
    function getDisplayName(fiber) {
      var fn = unwrapType(fiber && fiber.type);
      return fn ? (fn.displayName || fn.name || null) : null;
    }
    function getPathToNearestComponent(fiber) {
      var path = [];
      var node = fiber;
      while (node) {
        var isHost = typeof node.type === 'string';
        var name = getDisplayName(node);
        if (node !== fiber && name) break;
        if (isHost) {
          path.unshift({ kind: 'host', type: node.type, index: node.index });
        } else if (name) {
          path.unshift({ kind: 'component', name: name, index: node.index });
        }
        node = node.return;
      }
      return path;
    }
    function getFiberKey(fiber) {
      if (fiber == null || fiber.key == null) return null;
      return typeof fiber.key === 'string' || typeof fiber.key === 'number'
        ? String(fiber.key)
        : null;
    }

    var el = document.elementFromPoint(${x}, ${y});
    if (!el || el.closest('#__ctc-popover,#__ctc-highlight')) {
      window.__ctcTmp = { entries: [], fns: [] };
      return { entries: [] };
    }

    var fiber = findNearestFiber(el);
    if (!fiber) {
      window.__ctcTmp = { entries: [], fns: [] };
      return { entries: [] };
    }

    var fibers = [];
    var fns = [];
    var componentFnIndexByFiber = new WeakMap();
    var f = fiber;
    while (f) {
      fibers.push(f);
      var componentFn = unwrapType(f.type);
      if (componentFn) {
        componentFnIndexByFiber.set(f, fns.length);
        fns.push(componentFn);
      }
      f = f.return;
    }

    var entries = [];
    for (var fi = 0; fi < fibers.length; fi++) {
      var current = fibers[fi];
      if (typeof current.type === 'string') {
        entries.push({ kind: 'host', type: current.type, props: getSafeProps(current.memoizedProps), key: getFiberKey(current), path: getPathToNearestComponent(current) });
        continue;
      }

      var fn = unwrapType(current.type);
      if (!fn) continue;

      var name = fn.displayName || fn.name || null;
      if (!name) continue;

      var fnIndex = componentFnIndexByFiber.get(current);
      var owner = current._debugOwner || null;
      var ownerFnIndex = owner ? componentFnIndexByFiber.get(owner) : null;
      if (ownerFnIndex == null) ownerFnIndex = null;

      if (current._debugSource) {
        entries.push({ kind: 'component', name: name, file: current._debugSource.fileName, line: current._debugSource.lineNumber, col: current._debugSource.columnNumber, hasDebugSource: true, fnIndex: fnIndex, ownerFnIndex: ownerFnIndex, props: getSafeProps(current.memoizedProps), key: getFiberKey(current), path: getPathToNearestComponent(current) });
      } else {
        entries.push({ kind: 'component', name: name, file: null, line: null, col: null, hasDebugSource: false, fnIndex: fnIndex, ownerFnIndex: ownerFnIndex, props: getSafeProps(current.memoizedProps), key: getFiberKey(current), path: getPathToNearestComponent(current) });
      }
    }

    window.__ctcTmp = { entries: entries, fns: fns };
    return { entries: entries };
  })()`;
}

const RETRIEVE_FNS_EXPR = 'window.__ctcTmp ? window.__ctcTmp.fns : []';
const CLEANUP_EXPR = 'delete window.__ctcTmp';

// ─── [[FunctionLocation]] ─────────────────────────────────────────────────────

async function getFunctionLocation(tabId, objectId) {
  const result = await sendCDP(tabId, 'Runtime.getProperties', {
    objectId,
    ownProperties: false,
    accessorPropertiesOnly: false,
    generatePreview: false,
  });

  const internal = result.internalProperties || [];
  const loc = internal.find((p) => p.name === '[[FunctionLocation]]');
  if (!loc?.value) return null;

  // [[FunctionLocation]] value is an object — fetch its properties
  if (loc.value.objectId) {
    const locProps = await sendCDP(tabId, 'Runtime.getProperties', {
      objectId: loc.value.objectId,
      ownProperties: true,
      generatePreview: false,
    });
    await sendCDP(tabId, 'Runtime.releaseObject', { objectId: loc.value.objectId }).catch(() => {});
    const props = {};
    for (const p of locProps.result || []) props[p.name] = p.value?.value;
    if (props.scriptId == null) return null;
    return { scriptId: String(props.scriptId), lineNumber: Number(props.lineNumber), columnNumber: Number(props.columnNumber) };
  }

  if (loc.value.value) return loc.value.value;
  return null;
}

// ─── Source map resolution ────────────────────────────────────────────────────

async function fetchSourceMap(url) {
  if (url.startsWith('data:')) {
    const b64 = url.split(',')[1];
    return JSON.parse(atob(b64));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`source map fetch failed: ${res.status} ${url}`);
  return res.json();
}

// Convert a raw source map source URL to a filesystem path the editor can open.
function resolveSourcePath(source, mapURL) {
  // Already an absolute filesystem path
  if (source.startsWith('/')) return source;

  // webpack://name/./relative/path  or  webpack:///absolute/path
  if (source.startsWith('webpack://')) {
    const rest = source.slice('webpack://'.length);
    if (rest.startsWith('/')) {
      // webpack:///absolute/path → /absolute/path
      return rest;
    }
    // webpack://name/./path or webpack://name/path
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) return source;
    let path = rest.slice(slashIdx + 1);
    if (path.startsWith('./')) path = path.slice(2);
    if (projectRoot) return `${projectRoot}/${path}`;
    // No project root configured — return the relative path so it's at least visible
    return path;
  }

  // Relative path — resolve against the source map URL to get a URL pathname.
  // For localhost dev servers this gives us a URL path like /_next/static/...
  // which isn't a filesystem path, but for absolute-looking sources it's fine.
  if (!/^https?:\/\//.test(source)) {
    try { return new URL(source, mapURL).pathname; } catch (_) {}
  }

  return source;
}

async function resolveLocation(session, scriptId, lineNumber, columnNumber) {
  const cacheKey = `${scriptId}:${lineNumber}:${columnNumber}`;
  if (session.locationCache.has(cacheKey)) return session.locationCache.get(cacheKey);

  const scriptInfo = session.scripts.get(String(scriptId));
  if (!scriptInfo?.sourceMapURL) {
    console.log(`[ctc] resolveLocation: no source map for scriptId=${scriptId} url=${scriptInfo?.url ?? 'unknown'}`);
    return null;
  }

  const mapURL = scriptInfo.sourceMapURL;
  let consumer = session.sourceMaps.get(mapURL);
  if (!consumer) {
    try {
      const rawMap = await fetchSourceMap(mapURL);
      // Turbopack emits sectioned source maps (with a `sections` array).
      // FlattenMap merges them into a single flat map that TraceMap-compatible
      // functions like originalPositionFor can consume.
      consumer = rawMap.sections ? new FlattenMap(rawMap) : new TraceMap(rawMap);
      session.sourceMaps.set(mapURL, consumer);
    } catch (err) {
      console.warn('[ctc] source map parse failed:', mapURL, err.message);
      return null;
    }
  }

  // TraceMap uses 1-based lines; CDP gives 0-based
  const pos = originalPositionFor(consumer, {
    line: lineNumber + 1,
    column: columnNumber,
  }, GREATEST_LOWER_BOUND);

  if (!pos.source) {
    console.log(`[ctc] resolveLocation: no mapping at line=${lineNumber} col=${columnNumber} in ${scriptInfo.url}`);
    return null;
  }

  let file = resolveSourcePath(pos.source, mapURL);

  const result = { file, line: pos.line, col: (pos.column ?? 0) + 1, name: pos.name || null };
  session.locationCache.set(cacheKey, result);
  return result;
}

// ─── Script source fetching ───────────────────────────────────────────────────

async function getScriptSource(tabId, scriptId) {
  const session = getSession(tabId);
  if (session.scriptSources.has(scriptId)) return session.scriptSources.get(scriptId);
  const result = await sendCDP(tabId, 'Debugger.getScriptSource', { scriptId });
  const text = result.scriptSource || '';
  session.scriptSources.set(scriptId, text);
  return text;
}

// ─── jsxDEV call scanning ─────────────────────────────────────────────────────

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeJsxArg(argText) {
  return (argText || '').replace(/\s+/g, '');
}

function parseJsxDevArg(lineText, startIndex) {
  const openParen = lineText.indexOf('(', startIndex);
  if (openParen === -1) return null;

  let depth = 0;
  let quote = null;
  let escaped = false;
  let argStart = openParen + 1;

  for (let i = argStart; i < lineText.length; i++) {
    const ch = lineText[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth > 0) depth--;
      continue;
    }

    if (ch === ',' && depth === 0) {
      return {
        argText: lineText.slice(argStart, i).trim(),
        argStart,
      };
    }
  }

  return null;
}

// Scan the bundle text starting at startLine for jsxDEV("targetType", ...) calls.
// Returns [{line, col, lineText}] — all in 0-based bundle coordinates.
// Scans up to 300 lines from the function start to stay within the component body.
function findJsxDevCalls(scriptText, startLine, targetType) {
  const lines = scriptText.split('\n');
  const results = [];
  const limit = Math.min(startLine + 300, lines.length);
  const pattern = /\bjsxDEV\b/g;

  for (let i = startLine; i < limit; i++) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(lines[i])) !== null) {
      const parsed = parseJsxDevArg(lines[i], match.index);
      if (!parsed?.argText) continue;
      const argText = parsed.argText.trim();
      if (!/^["'`]/.test(argText)) continue;
      const unquoted = argText.slice(1, -1);
      if (unquoted !== targetType) continue;
      results.push({ line: i, col: match.index, lineText: lines[i] });
    }
  }
  return results;
}

function findComponentJsxDevCalls(scriptText, startLine) {
  const lines = scriptText.split('\n');
  const results = [];
  const limit = Math.min(startLine + 300, lines.length);
  const pattern = /\bjsxDEV\b/g;

  for (let i = startLine; i < limit; i++) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(lines[i])) !== null) {
      const parsed = parseJsxDevArg(lines[i], match.index);
      if (!parsed?.argText) continue;
      const argText = parsed.argText.trim();
      if (!argText || /^["'`]/.test(argText) || /^(null|void 0|undefined)$/.test(argText)) continue;
      results.push({ line: i, col: match.index, lineText: lines[i], argText });
    }
  }

  return results;
}

// Pick the candidate whose surrounding text best matches the fiber's props.
// Falls back to the first candidate when no props match.
function pickBestMatch(candidates, hostElementInfo) {
  if (candidates.length <= 1) return candidates[0] ?? null;

  const { props } = hostElementInfo;
  const distinctiveKeys = ['className', 'id', 'data-testid', 'aria-label', 'name', 'type', 'href', 'role'];

  const scored = candidates.map(c => {
    let score = 0;
    for (const key of distinctiveKeys) {
      const val = props?.[key];
      if (val && typeof val === 'string' && c.lineText && c.lineText.includes(val)) score++;
    }
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

function pickBestComponentMatch(candidates, componentInfo, parentComponent) {
  if (candidates.length <= 1) return candidates[0] ?? null;

  const normalizedName = normalizeJsxArg(componentInfo.name || '');
  const parentFile = parentComponent?.definition?.file ?? null;
  const distinctiveKeys = ['className', 'id', 'data-testid', 'aria-label', 'name', 'type', 'href', 'role'];

  const scored = candidates.map(c => {
    let score = 0;
    const normalizedArg = normalizeJsxArg(c.argText);

    if (normalizedName && normalizedArg.includes(normalizedName)) score += 4;
    if (componentInfo.name && c.name === componentInfo.name) score += 5;
    if (parentFile && c.file === parentFile) score += 2;
    if (componentInfo.key && c.lineText && c.lineText.includes(componentInfo.key)) score += 2;

    for (const key of distinctiveKeys) {
      const val = componentInfo.props?.[key];
      if (val && typeof val === 'string' && c.lineText && c.lineText.includes(val)) score++;
    }

    return { ...c, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.line - b.line;
  });
  return scored[0];
}

async function resolveHostElement(tabId, session, ownerBundleLoc, hostElementInfo) {
  const { scriptId, lineNumber } = ownerBundleLoc;

  let scriptText;
  try {
    scriptText = await getScriptSource(tabId, scriptId);
  } catch (err) {
    console.warn('[ctc] getScriptSource failed:', err.message);
    return null;
  }
  if (!scriptText) return null;

  const rawCandidates = findJsxDevCalls(scriptText, lineNumber, hostElementInfo.type);
  console.log(`[ctc] found ${rawCandidates.length} jsxDEV("${hostElementInfo.type}") candidates from line ${lineNumber}`);
  if (rawCandidates.length === 0) return null;

  // Reverse-map each candidate through the source map
  const resolved = [];
  for (const c of rawCandidates) {
    let loc;
    try {
      loc = await resolveLocation(session, scriptId, c.line, c.col);
    } catch (err) {
      console.warn('[ctc] resolveLocation failed for jsxDEV candidate:', err.message);
    }
    if (loc) resolved.push({ ...loc, lineText: c.lineText });
  }

  if (resolved.length === 0) return null;

  const best = pickBestMatch(resolved, hostElementInfo);
  if (!best) return null;

  console.log(`[ctc] host element <${hostElementInfo.type}> → ${best.file}:${best.line}:${best.col}`);
  return {
    file: best.file,
    line: best.line,
    col: best.col,
    type: hostElementInfo.type,
    className: hostElementInfo.props?.className ?? null,
  };
}

async function resolveComponentUsage(tabId, session, parentBundleLoc, componentInfo, parentComponent) {
  const { scriptId, lineNumber } = parentBundleLoc;

  let scriptText;
  try {
    scriptText = await getScriptSource(tabId, scriptId);
  } catch (err) {
    console.warn('[ctc] getScriptSource failed for component usage:', err.message);
    return null;
  }
  if (!scriptText) return null;

  const rawCandidates = findComponentJsxDevCalls(scriptText, lineNumber);
  console.log(`[ctc] found ${rawCandidates.length} component jsxDEV candidates from line ${lineNumber} for ${componentInfo.name}`);
  if (rawCandidates.length === 0) return null;

  const resolved = [];
  for (const c of rawCandidates) {
    let loc;
    try {
      loc = await resolveLocation(session, scriptId, c.line, c.col);
    } catch (err) {
      console.warn('[ctc] resolveLocation failed for component jsxDEV candidate:', err.message);
    }
    if (loc) resolved.push({ ...loc, lineText: c.lineText, argText: c.argText });
  }

  if (resolved.length === 0) return null;

  const best = pickBestComponentMatch(resolved, componentInfo, parentComponent);
  if (!best) return null;

  console.log(`[ctc] component usage ${componentInfo.name} → ${best.file}:${best.line}:${best.col}`);
  return {
    file: best.file,
    line: best.line,
    col: best.col,
  };
}

// ─── Main resolution flow ─────────────────────────────────────────────────────

async function resolveSources(tabId, x, y) {
  await attachToTab(tabId);
  const session = getSession(tabId);

  // Pass 1: walk fibers, store serializable hierarchy entries + fn refs in window.__ctcTmp
  const storeResult = await sendCDP(tabId, 'Runtime.evaluate', {
    expression: buildStoreExpr(x, y),
    returnByValue: true,
    awaitPromise: false,
    includeCommandLineAPI: false,
  });

  if (storeResult.exceptionDetails) {
    console.error('[ctc] fiber walk threw:', storeResult.exceptionDetails.text);
    return { hierarchy: [] };
  }

  const rawReturn = storeResult.result?.value;
  const rawEntries = rawReturn?.entries ?? rawReturn;
  console.log('[ctc] fiber walk returned', rawEntries?.length ?? 0, 'hierarchy entries');
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) return { hierarchy: [] };

  // Pass 2: retrieve fn references by object reference (not by value)
  const fnsResult = await sendCDP(tabId, 'Runtime.evaluate', {
    expression: RETRIEVE_FNS_EXPR,
    returnByValue: false,
    awaitPromise: false,
  });

  // Cleanup the temporary global regardless of what happens next
  sendCDP(tabId, 'Runtime.evaluate', { expression: CLEANUP_EXPR, returnByValue: true }).catch(() => {});

  // Extract individual fn objectIds from the fns array
  const fnObjectIds = [];
  if (!fnsResult.exceptionDetails && fnsResult.result?.objectId) {
    const arrProps = await sendCDP(tabId, 'Runtime.getProperties', {
      objectId: fnsResult.result.objectId,
      ownProperties: true,
      generatePreview: false,
    });
    await sendCDP(tabId, 'Runtime.releaseObject', { objectId: fnsResult.result.objectId }).catch(() => {});
    for (const prop of arrProps.result || []) {
      if (/^\d+$/.test(prop.name)) {
        fnObjectIds[parseInt(prop.name)] = prop.value?.objectId ?? null;
      }
    }
  }

  const ownerFnIndexByEntry = new Array(rawEntries.length).fill(null);
  const parentComponentFnIndexByEntry = new Array(rawEntries.length).fill(null);
  let currentOwnerFnIndex = null;
  for (let i = rawEntries.length - 1; i >= 0; i--) {
    const entry = rawEntries[i];
    if (entry.kind === 'component') {
      parentComponentFnIndexByEntry[i] = entry.ownerFnIndex ?? currentOwnerFnIndex;
      currentOwnerFnIndex = entry.fnIndex;
      continue;
    }
    if (entry.kind === 'host') {
      ownerFnIndexByEntry[i] = currentOwnerFnIndex;
    }
  }

  // Pass 3: resolve each component entry and keep bundle locations for nearby host elements
  const resolvedComponents = new Map();
  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    if (entry.kind !== 'component' || resolvedComponents.has(entry.fnIndex)) continue;

    // Filter out clearly minified names (1–2 chars, all lowercase) when we have no source.
    // Real component names start uppercase or are ≥3 chars.
    const looksMinified = /^[a-z]{1,2}$/.test(entry.name);

    const fnObjectId = fnObjectIds[entry.fnIndex] ?? null;
    let loc = null;
    if (fnObjectId) {
      try {
        loc = await getFunctionLocation(tabId, fnObjectId);
      } catch (err) {
        console.warn('[ctc] getFunctionLocation failed for', entry.name, ':', err.message);
      } finally {
        await sendCDP(tabId, 'Runtime.releaseObject', { objectId: fnObjectId }).catch(() => {});
      }
    }

    if (loc) {
      console.log(`[ctc] ${entry.name} → scriptId=${loc.scriptId} line=${loc.lineNumber} col=${loc.columnNumber}`);
    }

    let resolved = null;
    if (loc && !entry.hasDebugSource) {
      try {
        resolved = await resolveLocation(session, loc.scriptId, loc.lineNumber, loc.columnNumber);
      } catch (err) {
        console.warn('[ctc] resolveLocation failed for', entry.name, ':', err.message);
      }
      console.log(`[ctc] ${entry.name} → resolved:`, resolved);
    }

    const definition = entry.hasDebugSource
      ? { file: entry.file, line: entry.line, col: entry.col }
      : { file: resolved?.file ?? null, line: resolved?.line ?? null, col: resolved?.col ?? null };
    const displayName = (!entry.hasDebugSource && resolved?.name) || entry.name;

    if (entry.hasDebugSource || definition.file || !looksMinified) {
      resolvedComponents.set(entry.fnIndex, {
        kind: 'component',
        name: displayName,
        file: definition.file,
        line: definition.line,
        col: definition.col,
        definition,
        bundleLoc: loc,
      });
    }
  }

  // Pass 4: build the full hierarchy, resolving host elements and component usages using parent bundle locations
  const hierarchy = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    if (entry.kind === 'component') {
      const component = resolvedComponents.get(entry.fnIndex);
      if (!component) continue;

      const parentFnIndex = parentComponentFnIndexByEntry[i];
      const parentComponent = parentFnIndex == null ? null : resolvedComponents.get(parentFnIndex);
      let usage = null;
      if (parentComponent?.bundleLoc) {
        try {
          usage = await resolveComponentUsage(tabId, session, parentComponent.bundleLoc, entry, parentComponent);
        } catch (err) {
          console.warn('[ctc] resolveComponentUsage failed:', err.message);
        }
      }

      hierarchy.push({
        kind: 'component',
        name: component.name,
        file: component.file,
        line: component.line,
        col: component.col,
        definition: component.definition,
        usage,
      });
      continue;
    }

    const ownerFnIndex = ownerFnIndexByEntry[i];
    const ownerComponent = ownerFnIndex == null ? null : resolvedComponents.get(ownerFnIndex);
    let resolvedHost = null;
    if (ownerComponent?.bundleLoc) {
      try {
        resolvedHost = await resolveHostElement(tabId, session, ownerComponent.bundleLoc, entry);
      } catch (err) {
        console.warn('[ctc] resolveHostElement failed:', err.message);
      }
    }

    hierarchy.push({
      kind: 'host',
      type: entry.type,
      className: entry.props?.className ?? null,
      file: resolvedHost?.file ?? null,
      line: resolvedHost?.line ?? null,
      col: resolvedHost?.col ?? null,
      usage: resolvedHost ? { file: resolvedHost.file, line: resolvedHost.line, col: resolvedHost.col } : null,
    });
  }

  return { hierarchy };
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return false;

  if (msg.type === 'ATTACH') {
    attachToTab(tabId).catch((err) => console.warn('[ctc] attach failed:', err.message));
    return false;
  }

  if (msg.type === 'DETACH') {
    detachFromTab(tabId);
    return false;
  }

  if (msg.type === 'RESOLVE_SOURCES') {
    resolveSources(tabId, msg.x, msg.y)
      .then(sendResponse)
      .catch((err) => {
        console.error('[ctc] resolveSources error:', err);
        sendResponse({ hierarchy: [], error: err.message });
      });
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));
