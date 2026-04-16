<img src="icons/256.png" width="128" alt="Click to Component icon" />

<br />

# Click to Component

A Chrome extension that lets you hover over any React component on a dev page and jump straight to its source in your editor — including host elements like `<div>` and `<span>`, not just component functions.

Works with React 19, Next.js + Turbopack, and source maps. Zero changes required to your app.

## Features

- Hover overlay shows the nearest React component name
- Click to open a popover with the full component hierarchy
- Resolves both **component definitions** and **host element JSX call sites**
- Source map aware — resolves bundled positions back to original `.tsx` files
- Handles Turbopack's sectioned source maps
- HMR-safe: cache invalidated when scripts are re-parsed
- Supports VS Code, Cursor, Zed, and WebStorm

## Installation

1. Clone or download this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the repo folder

> **Note:** Chrome only allows one debugger attached to a tab at a time. Close DevTools before using the extension — they can't run simultaneously.

## Usage

- Press `Alt` `Shift` `C` to toggle the overlay
- Hover over any element to see the nearest React component highlighted
- Click to open the source popover showing the full component hierarchy
- Click any row to jump to that file in your editor
- Press `Esc` to close the popover or deactivate the overlay

## Configuration

Click the extension icon to open the popup:

- **Editor** — choose VS Code, Cursor, Zed, or WebStorm
- **Project Root** — absolute path to your project root (e.g. `/Users/you/Dev/my-project`). Required for resolving webpack-style source map paths like `webpack://name/./src/...`

## How it works

The extension uses the Chrome DevTools Protocol (CDP) to attach to the inspected tab without requiring any modifications to the target app.

**Component resolution:**
1. On click, `content.js` sends a `RESOLVE_SOURCES` message to the background service worker
2. `background.js` evaluates a fiber-walking expression in the page context via CDP, collecting the React fiber hierarchy at the clicked coordinates
3. For each component fiber, V8's `[[FunctionLocation]]` is retrieved to get the bundle position of the component function
4. Bundle positions are reverse-mapped through source maps to original file locations

**Host element resolution:**
React 19 removed `_debugSource`, so `<div>` and other host elements have no direct source annotation. The extension recovers their locations by:
1. Fetching the bundle script text via `Debugger.getScriptSource`
2. Scanning for `jsxDEV("div", ...)` calls within the owning component's function body
3. Reverse-mapping each candidate through the source map
4. Picking the best match using the element's props (className, id, data-testid, etc.)

## Development

The built output (`background.js`) is checked in, so no build step is needed to use the extension. If you modify `src/background.js`, rebuild with:

```sh
npm install
npm run build   # or: npm run watch
```

Then click the refresh icon on `chrome://extensions` to reload the extension.

### File overview

| File | Role |
|------|------|
| `src/background.js` | Source — CDP logic, fiber walking, source map resolution |
| `background.js` | Built output (esbuild bundle including `@jridgewell/trace-mapping`) |
| `content.js` | Injected into every page — overlay, popover, editor deep links |
| `injected.js` | Runs in page JS context — fiber tree access for hover highlighting |
| `popup.html` / `popup.js` | Extension popup — editor and project root settings |
| `build.js` | esbuild build script |
