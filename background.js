(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/@jridgewell/resolve-uri/dist/resolve-uri.umd.js
  var require_resolve_uri_umd = __commonJS({
    "node_modules/@jridgewell/resolve-uri/dist/resolve-uri.umd.js"(exports, module) {
      (function(global, factory) {
        typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, global.resolveURI = factory());
      })(exports, (function() {
        "use strict";
        const schemeRegex = /^[\w+.-]+:\/\//;
        const urlRegex = /^([\w+.-]+:)\/\/([^@/#?]*@)?([^:/#?]*)(:\d+)?(\/[^#?]*)?(\?[^#]*)?(#.*)?/;
        const fileRegex = /^file:(?:\/\/((?![a-z]:)[^/#?]*)?)?(\/?[^#?]*)(\?[^#]*)?(#.*)?/i;
        function isAbsoluteUrl(input) {
          return schemeRegex.test(input);
        }
        function isSchemeRelativeUrl(input) {
          return input.startsWith("//");
        }
        function isAbsolutePath(input) {
          return input.startsWith("/");
        }
        function isFileUrl(input) {
          return input.startsWith("file:");
        }
        function isRelative(input) {
          return /^[.?#]/.test(input);
        }
        function parseAbsoluteUrl(input) {
          const match = urlRegex.exec(input);
          return makeUrl(match[1], match[2] || "", match[3], match[4] || "", match[5] || "/", match[6] || "", match[7] || "");
        }
        function parseFileUrl(input) {
          const match = fileRegex.exec(input);
          const path = match[2];
          return makeUrl("file:", "", match[1] || "", "", isAbsolutePath(path) ? path : "/" + path, match[3] || "", match[4] || "");
        }
        function makeUrl(scheme, user, host, port, path, query, hash) {
          return {
            scheme,
            user,
            host,
            port,
            path,
            query,
            hash,
            type: 7
          };
        }
        function parseUrl(input) {
          if (isSchemeRelativeUrl(input)) {
            const url2 = parseAbsoluteUrl("http:" + input);
            url2.scheme = "";
            url2.type = 6;
            return url2;
          }
          if (isAbsolutePath(input)) {
            const url2 = parseAbsoluteUrl("http://foo.com" + input);
            url2.scheme = "";
            url2.host = "";
            url2.type = 5;
            return url2;
          }
          if (isFileUrl(input))
            return parseFileUrl(input);
          if (isAbsoluteUrl(input))
            return parseAbsoluteUrl(input);
          const url = parseAbsoluteUrl("http://foo.com/" + input);
          url.scheme = "";
          url.host = "";
          url.type = input ? input.startsWith("?") ? 3 : input.startsWith("#") ? 2 : 4 : 1;
          return url;
        }
        function stripPathFilename(path) {
          if (path.endsWith("/.."))
            return path;
          const index = path.lastIndexOf("/");
          return path.slice(0, index + 1);
        }
        function mergePaths(url, base) {
          normalizePath(base, base.type);
          if (url.path === "/") {
            url.path = base.path;
          } else {
            url.path = stripPathFilename(base.path) + url.path;
          }
        }
        function normalizePath(url, type) {
          const rel = type <= 4;
          const pieces = url.path.split("/");
          let pointer = 1;
          let positive = 0;
          let addTrailingSlash = false;
          for (let i = 1; i < pieces.length; i++) {
            const piece = pieces[i];
            if (!piece) {
              addTrailingSlash = true;
              continue;
            }
            addTrailingSlash = false;
            if (piece === ".")
              continue;
            if (piece === "..") {
              if (positive) {
                addTrailingSlash = true;
                positive--;
                pointer--;
              } else if (rel) {
                pieces[pointer++] = piece;
              }
              continue;
            }
            pieces[pointer++] = piece;
            positive++;
          }
          let path = "";
          for (let i = 1; i < pointer; i++) {
            path += "/" + pieces[i];
          }
          if (!path || addTrailingSlash && !path.endsWith("/..")) {
            path += "/";
          }
          url.path = path;
        }
        function resolve(input, base) {
          if (!input && !base)
            return "";
          const url = parseUrl(input);
          let inputType = url.type;
          if (base && inputType !== 7) {
            const baseUrl = parseUrl(base);
            const baseType = baseUrl.type;
            switch (inputType) {
              case 1:
                url.hash = baseUrl.hash;
              // fall through
              case 2:
                url.query = baseUrl.query;
              // fall through
              case 3:
              case 4:
                mergePaths(url, baseUrl);
              // fall through
              case 5:
                url.user = baseUrl.user;
                url.host = baseUrl.host;
                url.port = baseUrl.port;
              // fall through
              case 6:
                url.scheme = baseUrl.scheme;
            }
            if (baseType > inputType)
              inputType = baseType;
          }
          normalizePath(url, inputType);
          const queryHash = url.query + url.hash;
          switch (inputType) {
            // This is impossible, because of the empty checks at the start of the function.
            // case UrlType.Empty:
            case 2:
            case 3:
              return queryHash;
            case 4: {
              const path = url.path.slice(1);
              if (!path)
                return queryHash || ".";
              if (isRelative(base || input) && !isRelative(path)) {
                return "./" + path + queryHash;
              }
              return path + queryHash;
            }
            case 5:
              return url.path + queryHash;
            default:
              return url.scheme + "//" + url.user + url.host + url.port + url.path + queryHash;
          }
        }
        return resolve;
      }));
    }
  });

  // node_modules/@jridgewell/sourcemap-codec/dist/sourcemap-codec.mjs
  var comma = ",".charCodeAt(0);
  var semicolon = ";".charCodeAt(0);
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var intToChar = new Uint8Array(64);
  var charToInt = new Uint8Array(128);
  for (let i = 0; i < chars.length; i++) {
    const c = chars.charCodeAt(i);
    intToChar[i] = c;
    charToInt[c] = i;
  }
  function decodeInteger(reader, relative) {
    let value = 0;
    let shift = 0;
    let integer = 0;
    do {
      const c = reader.next();
      integer = charToInt[c];
      value |= (integer & 31) << shift;
      shift += 5;
    } while (integer & 32);
    const shouldNegate = value & 1;
    value >>>= 1;
    if (shouldNegate) {
      value = -2147483648 | -value;
    }
    return relative + value;
  }
  function hasMoreVlq(reader, max) {
    if (reader.pos >= max) return false;
    return reader.peek() !== comma;
  }
  var bufLength = 1024 * 16;
  var StringReader = class {
    constructor(buffer) {
      this.pos = 0;
      this.buffer = buffer;
    }
    next() {
      return this.buffer.charCodeAt(this.pos++);
    }
    peek() {
      return this.buffer.charCodeAt(this.pos);
    }
    indexOf(char) {
      const { buffer, pos } = this;
      const idx = buffer.indexOf(char, pos);
      return idx === -1 ? buffer.length : idx;
    }
  };
  function decode(mappings) {
    const { length } = mappings;
    const reader = new StringReader(mappings);
    const decoded = [];
    let genColumn = 0;
    let sourcesIndex = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    let namesIndex = 0;
    do {
      const semi = reader.indexOf(";");
      const line = [];
      let sorted = true;
      let lastCol = 0;
      genColumn = 0;
      while (reader.pos < semi) {
        let seg;
        genColumn = decodeInteger(reader, genColumn);
        if (genColumn < lastCol) sorted = false;
        lastCol = genColumn;
        if (hasMoreVlq(reader, semi)) {
          sourcesIndex = decodeInteger(reader, sourcesIndex);
          sourceLine = decodeInteger(reader, sourceLine);
          sourceColumn = decodeInteger(reader, sourceColumn);
          if (hasMoreVlq(reader, semi)) {
            namesIndex = decodeInteger(reader, namesIndex);
            seg = [genColumn, sourcesIndex, sourceLine, sourceColumn, namesIndex];
          } else {
            seg = [genColumn, sourcesIndex, sourceLine, sourceColumn];
          }
        } else {
          seg = [genColumn];
        }
        line.push(seg);
        reader.pos++;
      }
      if (!sorted) sort(line);
      decoded.push(line);
      reader.pos = semi + 1;
    } while (reader.pos <= length);
    return decoded;
  }
  function sort(line) {
    line.sort(sortComparator);
  }
  function sortComparator(a, b) {
    return a[0] - b[0];
  }

  // node_modules/@jridgewell/trace-mapping/dist/trace-mapping.mjs
  var import_resolve_uri = __toESM(require_resolve_uri_umd(), 1);
  function stripFilename(path) {
    if (!path) return "";
    const index = path.lastIndexOf("/");
    return path.slice(0, index + 1);
  }
  function resolver(mapUrl, sourceRoot) {
    const from = stripFilename(mapUrl);
    const prefix = sourceRoot ? sourceRoot + "/" : "";
    return (source) => (0, import_resolve_uri.default)(prefix + (source || ""), from);
  }
  var COLUMN = 0;
  var SOURCES_INDEX = 1;
  var SOURCE_LINE = 2;
  var SOURCE_COLUMN = 3;
  var NAMES_INDEX = 4;
  function maybeSort(mappings, owned) {
    const unsortedIndex = nextUnsortedSegmentLine(mappings, 0);
    if (unsortedIndex === mappings.length) return mappings;
    if (!owned) mappings = mappings.slice();
    for (let i = unsortedIndex; i < mappings.length; i = nextUnsortedSegmentLine(mappings, i + 1)) {
      mappings[i] = sortSegments(mappings[i], owned);
    }
    return mappings;
  }
  function nextUnsortedSegmentLine(mappings, start) {
    for (let i = start; i < mappings.length; i++) {
      if (!isSorted(mappings[i])) return i;
    }
    return mappings.length;
  }
  function isSorted(line) {
    for (let j = 1; j < line.length; j++) {
      if (line[j][COLUMN] < line[j - 1][COLUMN]) {
        return false;
      }
    }
    return true;
  }
  function sortSegments(line, owned) {
    if (!owned) line = line.slice();
    return line.sort(sortComparator2);
  }
  function sortComparator2(a, b) {
    return a[COLUMN] - b[COLUMN];
  }
  var found = false;
  function binarySearch(haystack, needle, low, high) {
    while (low <= high) {
      const mid = low + (high - low >> 1);
      const cmp = haystack[mid][COLUMN] - needle;
      if (cmp === 0) {
        found = true;
        return mid;
      }
      if (cmp < 0) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    found = false;
    return low - 1;
  }
  function upperBound(haystack, needle, index) {
    for (let i = index + 1; i < haystack.length; index = i++) {
      if (haystack[i][COLUMN] !== needle) break;
    }
    return index;
  }
  function lowerBound(haystack, needle, index) {
    for (let i = index - 1; i >= 0; index = i--) {
      if (haystack[i][COLUMN] !== needle) break;
    }
    return index;
  }
  function memoizedState() {
    return {
      lastKey: -1,
      lastNeedle: -1,
      lastIndex: -1
    };
  }
  function memoizedBinarySearch(haystack, needle, state, key) {
    const { lastKey, lastNeedle, lastIndex } = state;
    let low = 0;
    let high = haystack.length - 1;
    if (key === lastKey) {
      if (needle === lastNeedle) {
        found = lastIndex !== -1 && haystack[lastIndex][COLUMN] === needle;
        return lastIndex;
      }
      if (needle >= lastNeedle) {
        low = lastIndex === -1 ? 0 : lastIndex;
      } else {
        high = lastIndex;
      }
    }
    state.lastKey = key;
    state.lastNeedle = needle;
    return state.lastIndex = binarySearch(haystack, needle, low, high);
  }
  function parse(map) {
    return typeof map === "string" ? JSON.parse(map) : map;
  }
  var FlattenMap = function(map, mapUrl) {
    const parsed = parse(map);
    if (!("sections" in parsed)) {
      return new TraceMap(parsed, mapUrl);
    }
    const mappings = [];
    const sources = [];
    const sourcesContent = [];
    const names = [];
    const ignoreList = [];
    recurse(
      parsed,
      mapUrl,
      mappings,
      sources,
      sourcesContent,
      names,
      ignoreList,
      0,
      0,
      Infinity,
      Infinity
    );
    const joined = {
      version: 3,
      file: parsed.file,
      names,
      sources,
      sourcesContent,
      mappings,
      ignoreList
    };
    return presortedDecodedMap(joined);
  };
  function recurse(input, mapUrl, mappings, sources, sourcesContent, names, ignoreList, lineOffset, columnOffset, stopLine, stopColumn) {
    const { sections } = input;
    for (let i = 0; i < sections.length; i++) {
      const { map, offset } = sections[i];
      let sl = stopLine;
      let sc = stopColumn;
      if (i + 1 < sections.length) {
        const nextOffset = sections[i + 1].offset;
        sl = Math.min(stopLine, lineOffset + nextOffset.line);
        if (sl === stopLine) {
          sc = Math.min(stopColumn, columnOffset + nextOffset.column);
        } else if (sl < stopLine) {
          sc = columnOffset + nextOffset.column;
        }
      }
      addSection(
        map,
        mapUrl,
        mappings,
        sources,
        sourcesContent,
        names,
        ignoreList,
        lineOffset + offset.line,
        columnOffset + offset.column,
        sl,
        sc
      );
    }
  }
  function addSection(input, mapUrl, mappings, sources, sourcesContent, names, ignoreList, lineOffset, columnOffset, stopLine, stopColumn) {
    const parsed = parse(input);
    if ("sections" in parsed) return recurse(...arguments);
    const map = new TraceMap(parsed, mapUrl);
    const sourcesOffset = sources.length;
    const namesOffset = names.length;
    const decoded = decodedMappings(map);
    const { resolvedSources, sourcesContent: contents, ignoreList: ignores } = map;
    append(sources, resolvedSources);
    append(names, map.names);
    if (contents) append(sourcesContent, contents);
    else for (let i = 0; i < resolvedSources.length; i++) sourcesContent.push(null);
    if (ignores) for (let i = 0; i < ignores.length; i++) ignoreList.push(ignores[i] + sourcesOffset);
    for (let i = 0; i < decoded.length; i++) {
      const lineI = lineOffset + i;
      if (lineI > stopLine) return;
      const out = getLine(mappings, lineI);
      const cOffset = i === 0 ? columnOffset : 0;
      const line = decoded[i];
      for (let j = 0; j < line.length; j++) {
        const seg = line[j];
        const column = cOffset + seg[COLUMN];
        if (lineI === stopLine && column >= stopColumn) return;
        if (seg.length === 1) {
          out.push([column]);
          continue;
        }
        const sourcesIndex = sourcesOffset + seg[SOURCES_INDEX];
        const sourceLine = seg[SOURCE_LINE];
        const sourceColumn = seg[SOURCE_COLUMN];
        out.push(
          seg.length === 4 ? [column, sourcesIndex, sourceLine, sourceColumn] : [column, sourcesIndex, sourceLine, sourceColumn, namesOffset + seg[NAMES_INDEX]]
        );
      }
    }
  }
  function append(arr, other) {
    for (let i = 0; i < other.length; i++) arr.push(other[i]);
  }
  function getLine(arr, index) {
    for (let i = arr.length; i <= index; i++) arr[i] = [];
    return arr[index];
  }
  var LINE_GTR_ZERO = "`line` must be greater than 0 (lines start at line 1)";
  var COL_GTR_EQ_ZERO = "`column` must be greater than or equal to 0 (columns start at column 0)";
  var LEAST_UPPER_BOUND = -1;
  var GREATEST_LOWER_BOUND = 1;
  var TraceMap = class {
    constructor(map, mapUrl) {
      const isString = typeof map === "string";
      if (!isString && map._decodedMemo) return map;
      const parsed = parse(map);
      const { version, file, names, sourceRoot, sources, sourcesContent } = parsed;
      this.version = version;
      this.file = file;
      this.names = names || [];
      this.sourceRoot = sourceRoot;
      this.sources = sources;
      this.sourcesContent = sourcesContent;
      this.ignoreList = parsed.ignoreList || parsed.x_google_ignoreList || void 0;
      const resolve = resolver(mapUrl, sourceRoot);
      this.resolvedSources = sources.map(resolve);
      const { mappings } = parsed;
      if (typeof mappings === "string") {
        this._encoded = mappings;
        this._decoded = void 0;
      } else if (Array.isArray(mappings)) {
        this._encoded = void 0;
        this._decoded = maybeSort(mappings, isString);
      } else if (parsed.sections) {
        throw new Error(`TraceMap passed sectioned source map, please use FlattenMap export instead`);
      } else {
        throw new Error(`invalid source map: ${JSON.stringify(parsed)}`);
      }
      this._decodedMemo = memoizedState();
      this._bySources = void 0;
      this._bySourceMemos = void 0;
    }
  };
  function cast(map) {
    return map;
  }
  function decodedMappings(map) {
    var _a;
    return (_a = cast(map))._decoded || (_a._decoded = decode(cast(map)._encoded));
  }
  function originalPositionFor(map, needle) {
    let { line, column, bias } = needle;
    line--;
    if (line < 0) throw new Error(LINE_GTR_ZERO);
    if (column < 0) throw new Error(COL_GTR_EQ_ZERO);
    const decoded = decodedMappings(map);
    if (line >= decoded.length) return OMapping(null, null, null, null);
    const segments = decoded[line];
    const index = traceSegmentInternal(
      segments,
      cast(map)._decodedMemo,
      line,
      column,
      bias || GREATEST_LOWER_BOUND
    );
    if (index === -1) return OMapping(null, null, null, null);
    const segment = segments[index];
    if (segment.length === 1) return OMapping(null, null, null, null);
    const { names, resolvedSources } = map;
    return OMapping(
      resolvedSources[segment[SOURCES_INDEX]],
      segment[SOURCE_LINE] + 1,
      segment[SOURCE_COLUMN],
      segment.length === 5 ? names[segment[NAMES_INDEX]] : null
    );
  }
  function presortedDecodedMap(map, mapUrl) {
    const tracer = new TraceMap(clone(map, []), mapUrl);
    cast(tracer)._decoded = map.mappings;
    return tracer;
  }
  function clone(map, mappings) {
    return {
      version: map.version,
      file: map.file,
      names: map.names,
      sourceRoot: map.sourceRoot,
      sources: map.sources,
      sourcesContent: map.sourcesContent,
      mappings,
      ignoreList: map.ignoreList || map.x_google_ignoreList
    };
  }
  function OMapping(source, line, column, name) {
    return { source, line, column, name };
  }
  function traceSegmentInternal(segments, memo, line, column, bias) {
    let index = memoizedBinarySearch(segments, column, memo, line);
    if (found) {
      index = (bias === LEAST_UPPER_BOUND ? upperBound : lowerBound)(segments, column, index);
    } else if (bias === LEAST_UPPER_BOUND) index++;
    if (index === -1 || index === segments.length) return -1;
    return index;
  }

  // src/background.js
  var projectRoot = "";
  chrome.storage.sync.get(["projectRoot"], (result) => {
    if (result.projectRoot) projectRoot = result.projectRoot;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.projectRoot) projectRoot = changes.projectRoot.newValue || "";
  });
  var sessions = /* @__PURE__ */ new Map();
  function getSession(tabId) {
    if (!sessions.has(tabId)) {
      sessions.set(tabId, {
        attached: false,
        scripts: /* @__PURE__ */ new Map(),
        // scriptId → { url, sourceMapURL }
        sourceMaps: /* @__PURE__ */ new Map(),
        // resolvedSourceMapURL → SourceMapConsumer
        locationCache: /* @__PURE__ */ new Map(),
        // `${scriptId}:${line}:${col}` → { file, line, col }
        scriptSources: /* @__PURE__ */ new Map()
        // scriptId → full bundle text
      });
    }
    return sessions.get(tabId);
  }
  async function attachToTab(tabId) {
    const session = getSession(tabId);
    if (session.attached) return;
    await chrome.debugger.attach({ tabId }, "1.3");
    session.attached = true;
    await sendCDP(tabId, "Debugger.enable", {});
    await sendCDP(tabId, "Runtime.enable", {});
  }
  async function detachFromTab(tabId) {
    const session = sessions.get(tabId);
    if (!session?.attached) return;
    try {
      await chrome.debugger.detach({ tabId });
    } catch (_) {
    }
    sessions.delete(tabId);
  }
  function sendCDP(tabId, method, params) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(result);
      });
    });
  }
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method !== "Debugger.scriptParsed") return;
    const { tabId } = source;
    const session = sessions.get(tabId);
    if (!session) return;
    const { scriptId, url, sourceMapURL } = params;
    if (!url) return;
    let resolvedSourceMapURL = null;
    if (sourceMapURL) {
      if (sourceMapURL.startsWith("data:")) {
        resolvedSourceMapURL = sourceMapURL;
      } else if (/^https?:\/\//.test(sourceMapURL)) {
        resolvedSourceMapURL = sourceMapURL;
      } else if (sourceMapURL.startsWith("//")) {
        resolvedSourceMapURL = `https:${sourceMapURL}`;
      } else {
        try {
          resolvedSourceMapURL = new URL(sourceMapURL, url).href;
        } catch (_) {
        }
      }
    }
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
    if (resolvedSourceMapURL && !resolvedSourceMapURL.startsWith("data:")) {
      console.log("[ctc] script with source map:", url.split("/").pop(), "\u2192", resolvedSourceMapURL);
    }
  });
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
  var RETRIEVE_FNS_EXPR = "window.__ctcTmp ? window.__ctcTmp.fns : []";
  var CLEANUP_EXPR = "delete window.__ctcTmp";
  async function getFunctionLocation(tabId, objectId) {
    const result = await sendCDP(tabId, "Runtime.getProperties", {
      objectId,
      ownProperties: false,
      accessorPropertiesOnly: false,
      generatePreview: false
    });
    const internal = result.internalProperties || [];
    const loc = internal.find((p) => p.name === "[[FunctionLocation]]");
    if (!loc?.value) return null;
    if (loc.value.objectId) {
      const locProps = await sendCDP(tabId, "Runtime.getProperties", {
        objectId: loc.value.objectId,
        ownProperties: true,
        generatePreview: false
      });
      await sendCDP(tabId, "Runtime.releaseObject", { objectId: loc.value.objectId }).catch(() => {
      });
      const props = {};
      for (const p of locProps.result || []) props[p.name] = p.value?.value;
      if (props.scriptId == null) return null;
      return { scriptId: String(props.scriptId), lineNumber: Number(props.lineNumber), columnNumber: Number(props.columnNumber) };
    }
    if (loc.value.value) return loc.value.value;
    return null;
  }
  async function fetchSourceMap(url) {
    if (url.startsWith("data:")) {
      const b64 = url.split(",")[1];
      return JSON.parse(atob(b64));
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`source map fetch failed: ${res.status} ${url}`);
    return res.json();
  }
  function resolveSourcePath(source, mapURL) {
    if (source.startsWith("/")) return source;
    if (source.startsWith("webpack://")) {
      const rest = source.slice("webpack://".length);
      if (rest.startsWith("/")) {
        return rest;
      }
      const slashIdx = rest.indexOf("/");
      if (slashIdx === -1) return source;
      let path = rest.slice(slashIdx + 1);
      if (path.startsWith("./")) path = path.slice(2);
      if (projectRoot) return `${projectRoot}/${path}`;
      return path;
    }
    if (!/^https?:\/\//.test(source)) {
      try {
        return new URL(source, mapURL).pathname;
      } catch (_) {
      }
    }
    return source;
  }
  async function resolveLocation(session, scriptId, lineNumber, columnNumber) {
    const cacheKey = `${scriptId}:${lineNumber}:${columnNumber}`;
    if (session.locationCache.has(cacheKey)) return session.locationCache.get(cacheKey);
    const scriptInfo = session.scripts.get(String(scriptId));
    if (!scriptInfo?.sourceMapURL) {
      console.log(`[ctc] resolveLocation: no source map for scriptId=${scriptId} url=${scriptInfo?.url ?? "unknown"}`);
      return null;
    }
    const mapURL = scriptInfo.sourceMapURL;
    let consumer = session.sourceMaps.get(mapURL);
    if (!consumer) {
      try {
        const rawMap = await fetchSourceMap(mapURL);
        consumer = rawMap.sections ? new FlattenMap(rawMap) : new TraceMap(rawMap);
        session.sourceMaps.set(mapURL, consumer);
      } catch (err) {
        console.warn("[ctc] source map parse failed:", mapURL, err.message);
        return null;
      }
    }
    const pos = originalPositionFor(consumer, {
      line: lineNumber + 1,
      column: columnNumber
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
  async function getScriptSource(tabId, scriptId) {
    const session = getSession(tabId);
    if (session.scriptSources.has(scriptId)) return session.scriptSources.get(scriptId);
    const result = await sendCDP(tabId, "Debugger.getScriptSource", { scriptId });
    const text = result.scriptSource || "";
    session.scriptSources.set(scriptId, text);
    return text;
  }
  function normalizeJsxArg(argText) {
    return (argText || "").replace(/\s+/g, "");
  }
  function parseJsxDevArg(lineText, startIndex) {
    const openParen = lineText.indexOf("(", startIndex);
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
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        depth++;
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        if (depth > 0) depth--;
        continue;
      }
      if (ch === "," && depth === 0) {
        return {
          argText: lineText.slice(argStart, i).trim(),
          argStart
        };
      }
    }
    return null;
  }
  function findJsxDevCalls(scriptText, startLine, targetType) {
    const lines = scriptText.split("\n");
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
    const lines = scriptText.split("\n");
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
  function pickBestMatch(candidates, hostElementInfo) {
    if (candidates.length <= 1) return candidates[0] ?? null;
    const { props } = hostElementInfo;
    const distinctiveKeys = ["className", "id", "data-testid", "aria-label", "name", "type", "href", "role"];
    const scored = candidates.map((c) => {
      let score = 0;
      for (const key of distinctiveKeys) {
        const val = props?.[key];
        if (val && typeof val === "string" && c.lineText && c.lineText.includes(val)) score++;
      }
      return { ...c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }
  function pickBestComponentMatch(candidates, componentInfo, parentComponent) {
    if (candidates.length <= 1) return candidates[0] ?? null;
    const normalizedName = normalizeJsxArg(componentInfo.name || "");
    const parentFile = parentComponent?.definition?.file ?? null;
    const distinctiveKeys = ["className", "id", "data-testid", "aria-label", "name", "type", "href", "role"];
    const scored = candidates.map((c) => {
      let score = 0;
      const normalizedArg = normalizeJsxArg(c.argText);
      if (normalizedName && normalizedArg.includes(normalizedName)) score += 4;
      if (componentInfo.name && c.name === componentInfo.name) score += 5;
      if (parentFile && c.file === parentFile) score += 2;
      if (componentInfo.key && c.lineText && c.lineText.includes(componentInfo.key)) score += 2;
      for (const key of distinctiveKeys) {
        const val = componentInfo.props?.[key];
        if (val && typeof val === "string" && c.lineText && c.lineText.includes(val)) score++;
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
      console.warn("[ctc] getScriptSource failed:", err.message);
      return null;
    }
    if (!scriptText) return null;
    const rawCandidates = findJsxDevCalls(scriptText, lineNumber, hostElementInfo.type);
    console.log(`[ctc] found ${rawCandidates.length} jsxDEV("${hostElementInfo.type}") candidates from line ${lineNumber}`);
    if (rawCandidates.length === 0) return null;
    const resolved = [];
    for (const c of rawCandidates) {
      let loc;
      try {
        loc = await resolveLocation(session, scriptId, c.line, c.col);
      } catch (err) {
        console.warn("[ctc] resolveLocation failed for jsxDEV candidate:", err.message);
      }
      if (loc) resolved.push({ ...loc, lineText: c.lineText });
    }
    if (resolved.length === 0) return null;
    const best = pickBestMatch(resolved, hostElementInfo);
    if (!best) return null;
    console.log(`[ctc] host element <${hostElementInfo.type}> \u2192 ${best.file}:${best.line}:${best.col}`);
    return {
      file: best.file,
      line: best.line,
      col: best.col,
      type: hostElementInfo.type,
      className: hostElementInfo.props?.className ?? null
    };
  }
  async function resolveComponentUsage(tabId, session, parentBundleLoc, componentInfo, parentComponent) {
    const { scriptId, lineNumber } = parentBundleLoc;
    let scriptText;
    try {
      scriptText = await getScriptSource(tabId, scriptId);
    } catch (err) {
      console.warn("[ctc] getScriptSource failed for component usage:", err.message);
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
        console.warn("[ctc] resolveLocation failed for component jsxDEV candidate:", err.message);
      }
      if (loc) resolved.push({ ...loc, lineText: c.lineText, argText: c.argText });
    }
    if (resolved.length === 0) return null;
    const best = pickBestComponentMatch(resolved, componentInfo, parentComponent);
    if (!best) return null;
    console.log(`[ctc] component usage ${componentInfo.name} \u2192 ${best.file}:${best.line}:${best.col}`);
    return {
      file: best.file,
      line: best.line,
      col: best.col
    };
  }
  async function resolveSources(tabId, x, y) {
    await attachToTab(tabId);
    const session = getSession(tabId);
    const storeResult = await sendCDP(tabId, "Runtime.evaluate", {
      expression: buildStoreExpr(x, y),
      returnByValue: true,
      awaitPromise: false,
      includeCommandLineAPI: false
    });
    if (storeResult.exceptionDetails) {
      console.error("[ctc] fiber walk threw:", storeResult.exceptionDetails.text);
      return { hierarchy: [] };
    }
    const rawReturn = storeResult.result?.value;
    const rawEntries = rawReturn?.entries ?? rawReturn;
    console.log("[ctc] fiber walk returned", rawEntries?.length ?? 0, "hierarchy entries");
    if (!Array.isArray(rawEntries) || rawEntries.length === 0) return { hierarchy: [] };
    const fnsResult = await sendCDP(tabId, "Runtime.evaluate", {
      expression: RETRIEVE_FNS_EXPR,
      returnByValue: false,
      awaitPromise: false
    });
    sendCDP(tabId, "Runtime.evaluate", { expression: CLEANUP_EXPR, returnByValue: true }).catch(() => {
    });
    const fnObjectIds = [];
    if (!fnsResult.exceptionDetails && fnsResult.result?.objectId) {
      const arrProps = await sendCDP(tabId, "Runtime.getProperties", {
        objectId: fnsResult.result.objectId,
        ownProperties: true,
        generatePreview: false
      });
      await sendCDP(tabId, "Runtime.releaseObject", { objectId: fnsResult.result.objectId }).catch(() => {
      });
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
      if (entry.kind === "component") {
        parentComponentFnIndexByEntry[i] = entry.ownerFnIndex ?? currentOwnerFnIndex;
        currentOwnerFnIndex = entry.fnIndex;
        continue;
      }
      if (entry.kind === "host") {
        ownerFnIndexByEntry[i] = currentOwnerFnIndex;
      }
    }
    const resolvedComponents = /* @__PURE__ */ new Map();
    for (let i = 0; i < rawEntries.length; i++) {
      const entry = rawEntries[i];
      if (entry.kind !== "component" || resolvedComponents.has(entry.fnIndex)) continue;
      const looksMinified = /^[a-z]{1,2}$/.test(entry.name);
      const fnObjectId = fnObjectIds[entry.fnIndex] ?? null;
      let loc = null;
      if (fnObjectId) {
        try {
          loc = await getFunctionLocation(tabId, fnObjectId);
        } catch (err) {
          console.warn("[ctc] getFunctionLocation failed for", entry.name, ":", err.message);
        } finally {
          await sendCDP(tabId, "Runtime.releaseObject", { objectId: fnObjectId }).catch(() => {
          });
        }
      }
      if (loc) {
        console.log(`[ctc] ${entry.name} \u2192 scriptId=${loc.scriptId} line=${loc.lineNumber} col=${loc.columnNumber}`);
      }
      let resolved = null;
      if (loc && !entry.hasDebugSource) {
        try {
          resolved = await resolveLocation(session, loc.scriptId, loc.lineNumber, loc.columnNumber);
        } catch (err) {
          console.warn("[ctc] resolveLocation failed for", entry.name, ":", err.message);
        }
        console.log(`[ctc] ${entry.name} \u2192 resolved:`, resolved);
      }
      const definition = entry.hasDebugSource ? { file: entry.file, line: entry.line, col: entry.col } : { file: resolved?.file ?? null, line: resolved?.line ?? null, col: resolved?.col ?? null };
      const displayName = !entry.hasDebugSource && resolved?.name || entry.name;
      if (entry.hasDebugSource || definition.file || !looksMinified) {
        resolvedComponents.set(entry.fnIndex, {
          kind: "component",
          name: displayName,
          file: definition.file,
          line: definition.line,
          col: definition.col,
          definition,
          bundleLoc: loc
        });
      }
    }
    const hierarchy = [];
    for (let i = 0; i < rawEntries.length; i++) {
      const entry = rawEntries[i];
      if (entry.kind === "component") {
        const component = resolvedComponents.get(entry.fnIndex);
        if (!component) continue;
        const parentFnIndex = parentComponentFnIndexByEntry[i];
        const parentComponent = parentFnIndex == null ? null : resolvedComponents.get(parentFnIndex);
        let usage = null;
        if (parentComponent?.bundleLoc) {
          try {
            usage = await resolveComponentUsage(tabId, session, parentComponent.bundleLoc, entry, parentComponent);
          } catch (err) {
            console.warn("[ctc] resolveComponentUsage failed:", err.message);
          }
        }
        hierarchy.push({
          kind: "component",
          name: component.name,
          file: component.file,
          line: component.line,
          col: component.col,
          definition: component.definition,
          usage
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
          console.warn("[ctc] resolveHostElement failed:", err.message);
        }
      }
      hierarchy.push({
        kind: "host",
        type: entry.type,
        className: entry.props?.className ?? null,
        file: resolvedHost?.file ?? null,
        line: resolvedHost?.line ?? null,
        col: resolvedHost?.col ?? null,
        usage: resolvedHost ? { file: resolvedHost.file, line: resolvedHost.line, col: resolvedHost.col } : null
      });
    }
    return { hierarchy };
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (!tabId) return false;
    if (msg.type === "ATTACH") {
      attachToTab(tabId).catch((err) => console.warn("[ctc] attach failed:", err.message));
      return false;
    }
    if (msg.type === "DETACH") {
      detachFromTab(tabId);
      return false;
    }
    if (msg.type === "RESOLVE_SOURCES") {
      resolveSources(tabId, msg.x, msg.y).then(sendResponse).catch((err) => {
        console.error("[ctc] resolveSources error:", err);
        sendResponse({ hierarchy: [], error: err.message });
      });
      return true;
    }
    return false;
  });
  chrome.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));
})();
