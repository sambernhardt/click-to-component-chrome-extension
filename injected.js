// Runs in the PAGE's JS context (not the extension isolated world).
// Handles hover highlight only — click resolution is handled by background.js via CDP.

(function () {
  'use strict';

  if (window.__ctcPageInjected) return;
  window.__ctcPageInjected = true;

  // ─── Fiber utils ─────────────────────────────────────────────────────────────

  function getFiber(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    const keys = Object.keys(el);
    const key = keys.find((k) => k.startsWith('__reactFiber$'));
    return key ? el[key] : null;
  }

  function findNearestFiber(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const fiber = getFiber(node);
      if (fiber) return fiber;
      node = node.parentElement;
    }
    return null;
  }

  function unwrapType(type) {
    if (!type) return null;
    if (type.$$typeof === Symbol.for('react.memo')) return unwrapType(type.type);
    if (type.$$typeof === Symbol.for('react.forward_ref')) return type.render;
    if (type.$$typeof === Symbol.for('react.lazy')) return null;
    if (typeof type === 'function') return type;
    return null;
  }

  function getComponentName(fiber) {
    const fn = unwrapType(fiber?.type);
    if (!fn) return null;
    return fn.displayName || fn.name || null;
  }

  function findNearestComponentName(fiber) {
    let f = fiber;
    while (f) {
      const name = getComponentName(f);
      if (name) return name;
      f = f.return;
    }
    return null;
  }

  // ─── Fiber utils (DOM element) ────────────────────────────────────────────────

  // Walk a fiber's subtree depth-first to find the first host DOM element.
  function getFiberDomElement(fiber) {
    if (!fiber) return null;
    if (fiber.stateNode instanceof Element) return fiber.stateNode;
    let child = fiber.child;
    while (child) {
      const result = getFiberDomElement(child);
      if (result) return result;
      child = child.sibling;
    }
    return null;
  }

  // ─── Message handler ─────────────────────────────────────────────────────────

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__ctc) return;

    if (e.data.type === 'CTC_HOVER') {
      const { x, y, id } = e.data;
      const el = document.elementFromPoint(x, y);

      if (el?.closest('#__ctc-popover, #__ctc-highlight')) {
        reply({ type: 'CTC_HOVER_RESULT', id, name: null, rect: null });
        return;
      }

      const fiber = findNearestFiber(el);
      const name = fiber ? findNearestComponentName(fiber) : null;
      const rect = el ? el.getBoundingClientRect() : null;

      reply({
        type: 'CTC_HOVER_RESULT',
        id,
        name,
        rect: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null,
      });
    }

    if (e.data.type === 'CTC_GET_FIBER_RECTS') {
      const { x, y, id } = e.data;
      const el = document.elementFromPoint(x, y);
      const results = [];
      const seen = new Set();

      let fiber = findNearestFiber(el);
      while (fiber) {
        const name = getComponentName(fiber);
        if (name && !seen.has(name)) {
          seen.add(name);
          const domEl = getFiberDomElement(fiber);
          if (domEl) {
            const r = domEl.getBoundingClientRect();
            results.push({ name, rect: { top: r.top, left: r.left, width: r.width, height: r.height } });
          }
        }
        fiber = fiber.return;
      }

      reply({ type: 'CTC_FIBER_RECTS_RESULT', id, results });
    }
  });

  function reply(data) {
    window.postMessage({ __ctc: true, ...data }, '*');
  }
})();
