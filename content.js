(function () {
  'use strict';

  if (window.__ctcInjected) return;
  window.__ctcInjected = true;

  // ─── Inject page-context script ──────────────────────────────────────────────
  // Content scripts run in an isolated world — Object.keys(el) can't see
  // __reactFiber$ keys set by React's JS. injected.js runs in the PAGE context
  // where those keys are visible, and communicates back via postMessage.
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // ─── State ───────────────────────────────────────────────────────────────────

  let active = false;
  let highlightEl = null;
  let secondaryHighlightEl = null;
  let popoverEl = null;
  let editor = 'cursor';
  let showHostElements = true;
  let msgId = 0;
  let pendingHoverId = null;
  let fiberRects = [];
  let currentHierarchy = [];

  chrome.storage.sync.get(['editor', 'showHostElements'], (result) => {
    if (result.editor) editor = result.editor;
    if (typeof result.showHostElements === 'boolean') {
      showHostElements = result.showHostElements;
    }
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.editor) editor = changes.editor.newValue;
    if (changes.showHostElements) {
      showHostElements = changes.showHostElements.newValue !== false;
      rerenderPopover();
    }
  });

  // ─── Page communication ───────────────────────────────────────────────────────

  function sendToPage(data) {
    window.postMessage({ __ctc: true, ...data }, '*');
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__ctc) return;

    if (e.data.type === 'CTC_HOVER_RESULT' && e.data.id === pendingHoverId) {
      if (e.data.name && e.data.rect) {
        updateHighlight(e.data.rect, e.data.name);
      } else {
        hideHighlight();
      }
    }

    if (e.data.type === 'CTC_FIBER_RECTS_RESULT') {
      fiberRects = e.data.results || [];
    }
  });

  // ─── Highlight overlay ────────────────────────────────────────────────────────

  function ensureHighlight() {
    if (highlightEl) return;
    highlightEl = document.createElement('div');
    highlightEl.id = '__ctc-highlight';
    document.documentElement.appendChild(highlightEl);
  }

  function updateHighlight(rect, name) {
    ensureHighlight();
    highlightEl.style.cssText = `
      display: block;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
    `;
    highlightEl.dataset.label = name;
  }

  function hideHighlight() {
    if (highlightEl) {
      highlightEl.style.display = 'none';
      highlightEl.style.position = ''; // Revert to CSS-defined 'fixed'
      delete highlightEl.dataset.selected;
    }
  }

  function ensureSecondaryHighlight() {
    if (secondaryHighlightEl) return;
    secondaryHighlightEl = document.createElement('div');
    secondaryHighlightEl.id = '__ctc-secondary-highlight';
    document.documentElement.appendChild(secondaryHighlightEl);
  }

  function showSecondaryHighlight(rect) {
    ensureSecondaryHighlight();
    secondaryHighlightEl.style.cssText = `
      display: block;
      top: ${rect.top + window.scrollY}px;
      left: ${rect.left + window.scrollX}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
    `;
  }

  function hideSecondaryHighlight() {
    if (secondaryHighlightEl) secondaryHighlightEl.style.display = 'none';
  }

  // ─── Popover ─────────────────────────────────────────────────────────────────

  function showLoadingPopover(x, y) {
    hidePopover();
    popoverEl = document.createElement('div');
    popoverEl.id = '__ctc-popover';
    const msg = document.createElement('div');
    msg.className = '__ctc-empty';
    msg.textContent = 'Resolving sources…';
    popoverEl.appendChild(msg);
    document.documentElement.appendChild(popoverEl);
    positionPopover(popoverEl, x, y);
  }

  function showErrorPopover(x, y, message) {
    hidePopover();
    popoverEl = document.createElement('div');
    popoverEl.id = '__ctc-popover';
    const msg = document.createElement('div');
    msg.className = '__ctc-empty';
    msg.textContent = `Error: ${message}`;
    popoverEl.appendChild(msg);
    document.documentElement.appendChild(popoverEl);
    positionPopover(popoverEl, x, y);
  }

  function positionPopover(el, x, y) {
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = el.offsetWidth || 320;
    const ph = el.offsetHeight || 200;
    let left = x + margin;
    let top = y + margin;
    if (left + pw > vw - margin) left = x - pw - margin;
    if (top + ph > vh - margin) top = y - ph - margin;
    el.style.left = `${Math.max(margin, left)}px`;
    el.style.top = `${Math.max(margin, top)}px`;
  }

  function showPopover(hierarchy, x, y) {
    hidePopover();
    currentHierarchy = hierarchy;
    popoverEl = buildPopoverEl(hierarchy);
    document.documentElement.appendChild(popoverEl);
    positionPopover(popoverEl, x, y);
    // Scroll to bottom so the innermost (most specific) component is visible
    const list = popoverEl.querySelector('.__ctc-stack');
    if (list) list.scrollTop = list.scrollHeight;
    // Lock highlight to document coordinates so it follows the element on scroll
    if (highlightEl) {
      highlightEl.dataset.selected = '';
      const top = parseFloat(highlightEl.style.top) || 0;
      const left = parseFloat(highlightEl.style.left) || 0;
      highlightEl.style.position = 'absolute';
      highlightEl.style.top = `${top + window.scrollY}px`;
      highlightEl.style.left = `${left + window.scrollX}px`;
    }
  }

  function buildPopoverEl(hierarchy) {
    const el = document.createElement('div');
    el.id = '__ctc-popover';
    let footerState = null;

    const header = document.createElement('div');
    header.className = '__ctc-header';
    const title = document.createElement('span');
    title.textContent = 'Click to Component';
    const controls = document.createElement('div');
    controls.className = '__ctc-header-controls';
    const toggleLabel = document.createElement('label');
    toggleLabel.className = '__ctc-toggle';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = showHostElements;
    toggleInput.addEventListener('change', (e) => {
      e.stopPropagation();
      chrome.storage.sync.set({ showHostElements: toggleInput.checked });
    });
    const toggleText = document.createElement('span');
    toggleText.textContent = 'HTML elements';
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleText);
    const closeBtn = document.createElement('button');
    closeBtn.className = '__ctc-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hidePopover();
    });
    header.appendChild(title);
    controls.appendChild(toggleLabel);
    controls.appendChild(closeBtn);
    header.appendChild(controls);
    el.appendChild(header);

    const visibleHierarchy = (hierarchy || []).filter((entry) => showHostElements || entry.kind !== 'host');

    if (!visibleHierarchy.length) {
      const msg = document.createElement('div');
      msg.className = '__ctc-empty';
      msg.textContent = hierarchy?.length
        ? 'Only HTML elements were found. Enable "Show HTML elements" in the extension popup.'
        : 'No React components found. Is this a React dev build?';
      el.appendChild(msg);
      return el;
    }

    const list = document.createElement('ul');
    list.className = '__ctc-stack';

    // Reverse so root is at top, innermost component at bottom
    const reversed = [...visibleHierarchy].reverse();
    const depths = computeHierarchyDepths(reversed);
    const selectedEntry = reversed[reversed.length - 1] ?? null;
    const selectedPrimaryLoc = selectedEntry
      ? (selectedEntry.kind === 'host'
          ? (selectedEntry.usage ?? null)
          : (selectedEntry.definition ?? (selectedEntry.file ? {
              file: selectedEntry.file,
              line: selectedEntry.line,
              col: selectedEntry.col,
            } : null)))
      : null;

    function setFooter(actionText, loc) {
      if (!footerState) return;
      footerState.action.textContent = actionText || '';
      footerState.path.textContent = loc ? formatFooterPath(loc.file, loc.line, loc.col) : '';
      footerState.path.title = loc ? `${loc.file}:${loc.line}:${loc.col}` : '';
    }

    function resetFooter() {
      if (!selectedEntry || !selectedPrimaryLoc) {
        setFooter('', null);
        return;
      }
      setFooter(selectedEntry.kind === 'host' ? 'Jump to occurance' : 'Jump to definition', selectedPrimaryLoc);
    }

    reversed.forEach((entry, i) => {
      const isHost = entry.kind === 'host';
      const definition = entry.definition ?? (entry.file ? { file: entry.file, line: entry.line, col: entry.col } : null);
      const usage = entry.usage ?? null;
      const primaryLoc = isHost ? usage : definition;
      const hasPrimarySource = !!primaryLoc?.file;
      const hasUsageAction = !isHost && !!usage?.file;
      const name = isHost ? formatHostLabel(entry) : formatComponentLabel(entry);
      const isSelected = i === reversed.length - 1; // last = the innermost clicked item
      const row = document.createElement('li');
      row.className = ['__ctc-row', isSelected ? '__ctc-row--selected' : ''].join(' ').trim();

      const item = document.createElement(hasPrimarySource ? 'a' : 'div');
      item.className = [
        hasPrimarySource ? '__ctc-item' : '__ctc-item __ctc-item--no-source',
        isHost ? '__ctc-item--host' : '',
        isSelected ? '__ctc-item--selected' : '',
      ].join(' ').trim();
      item.style.setProperty('--ctc-depth', String(depths[i]));

      const nameEl = document.createElement('span');
      nameEl.className = '__ctc-name';
      nameEl.textContent = name;

      const pathEl = document.createElement('span');
      pathEl.className = '__ctc-path';
      pathEl.textContent = hasPrimarySource
        ? `${shortPath(primaryLoc.file)}:${primaryLoc.line}`
        : isHost
          ? 'HTML element'
          : '(no source)';
      if (hasPrimarySource) {
        pathEl.addEventListener('mouseenter', () => {
          syncOverflowTitle(pathEl, `${primaryLoc.file}:${primaryLoc.line}:${primaryLoc.col}`);
        });
        pathEl.addEventListener('mouseleave', () => {
          pathEl.removeAttribute('title');
        });
      }

      item.appendChild(nameEl);
      item.appendChild(pathEl);

      if (hasPrimarySource) {
        item.addEventListener('mouseenter', () => {
          setFooter(isHost ? 'Jump to occurance' : 'Jump to definition', primaryLoc);
        });
        item.addEventListener('mouseleave', resetFooter);
      }

      if (!isHost && !isSelected) {
        row.addEventListener('mouseenter', () => {
          const match = fiberRects.find((fr) => fr.name === name);
          if (match) showSecondaryHighlight(match.rect);
        });
        row.addEventListener('mouseleave', hideSecondaryHighlight);
      }

      if (hasPrimarySource) {
        configureEditorLink(item, primaryLoc);
      }

      row.appendChild(item);

      const usageSlot = document.createElement('div');
      usageSlot.className = '__ctc-usage-slot';
      if (hasUsageAction) {
        const usageLink = document.createElement('a');
        usageLink.className = '__ctc-usage-link';
        usageLink.setAttribute('aria-label', `Jump to occurance: ${usage.file}:${usage.line}:${usage.col}`);
        usageLink.appendChild(createUsageIcon());
        configureEditorLink(usageLink, usage);
        usageLink.addEventListener('mouseenter', () => {
          setFooter('Jump to occurance', usage);
        });
        usageLink.addEventListener('mouseleave', resetFooter);
        usageLink.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        usageSlot.appendChild(usageLink);
      }
      row.appendChild(usageSlot);

      list.appendChild(row);
    });

    const footer = document.createElement('div');
    footer.className = '__ctc-footer';
    const footerAction = document.createElement('span');
    footerAction.className = '__ctc-footer-action';
    const footerPath = document.createElement('span');
    footerPath.className = '__ctc-footer-path';
    footer.appendChild(footerAction);
    footer.appendChild(footerPath);
    footerState = { action: footerAction, path: footerPath };
    resetFooter();

    el.appendChild(list);
    el.appendChild(footer);
    return el;
  }

  function hidePopover() {
    if (popoverEl) {
      popoverEl.remove();
      popoverEl = null;
    }
    currentHierarchy = [];
    hideSecondaryHighlight();
    fiberRects = [];
  }

  function shortPath(filePath) {
    if (!filePath) return '';
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts.slice(-2).join('/');
  }

  function formatHostLabel(entry) {
    const firstClass = entry.className?.trim().split(/\s+/)[0];
    return firstClass ? `<${entry.type}.${firstClass} />` : `<${entry.type} />`;
  }

  function formatComponentLabel(entry) {
    return `<${entry.name} />`;
  }

  function formatFooterPath(filePath, line, col) {
    if (!filePath) return '';
    const parts = filePath.replace(/\\/g, '/').split('/');
    const tail = parts.slice(-4).join('/');
    return `${tail}:${line}:${col}`;
  }

  function syncOverflowTitle(el, text) {
    if (!text) {
      el.removeAttribute('title');
      return;
    }
    if (el.scrollWidth > el.clientWidth) {
      el.title = text;
    } else {
      el.removeAttribute('title');
    }
  }

  function computeHierarchyDepths(entries) {
    let hostDepth = 0;
    return entries.map((entry, index) => {
      if (index === 0) return 0;
      if (entry.kind === 'host') {
        hostDepth = Math.min(hostDepth + 1, 4);
        return hostDepth;
      }
      return hostDepth;
    });
  }

  function rerenderPopover() {
    if (!popoverEl || !currentHierarchy.length) return;
    const { left, top } = popoverEl.style;
    const nextPopover = buildPopoverEl(currentHierarchy);
    nextPopover.style.left = left;
    nextPopover.style.top = top;
    popoverEl.replaceWith(nextPopover);
    popoverEl = nextPopover;
  }

  // ─── Editor ──────────────────────────────────────────────────────────────────

  function createUsageIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('__ctc-usage-icon');

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M6 3h7v7h-1.5V5.56L4.53 12.53l-1.06-1.06L10.44 4.5H6V3z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  function configureEditorLink(el, loc) {
    el.href = getEditorUrl(loc.file, loc.line, loc.col);
    el.target = '_self';
    el.rel = 'noopener';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  function getEditorUrl(file, line, col) {
    const urls = {
      vscode:   `vscode://file/${file}:${line}:${col}`,
      cursor:   `cursor://file/${file}:${line}:${col}`,
      zed:      `zed://file${file}:${line}:${col}`,
      webstorm: `jetbrains://idea/navigate/reference?file=${encodeURIComponent(file)}&line=${line}`,
    };
    return urls[editor] ?? urls.vscode;
  }

  // ─── Activation ──────────────────────────────────────────────────────────────

  function activate() {
    active = true;
    document.documentElement.setAttribute('data-ctc', '');
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    chrome.runtime.sendMessage({ type: 'ATTACH' });
  }

  function deactivate() {
    active = false;
    document.documentElement.removeAttribute('data-ctc');
    hideHighlight();
    hidePopover();
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    chrome.runtime.sendMessage({ type: 'DETACH' });
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function onMouseMove(e) {
    if (popoverEl) return; // freeze highlight while popover is open
    if (e.target.closest('#__ctc-popover, #__ctc-highlight')) return;
    pendingHoverId = ++msgId;
    sendToPage({ type: 'CTC_HOVER', x: e.clientX, y: e.clientY, id: pendingHoverId });
  }

  function onClick(e) {
    if (e.target.closest('#__ctc-popover')) return;
    e.preventDefault();
    e.stopPropagation();
    // If the result popover is already open, clicking outside closes it rather than
    // starting a new inspection (prevents accidental re-inspection on misclick).
    if (popoverEl) {
      hidePopover();
      return;
    }
    showLoadingPopover(e.clientX, e.clientY);
    const clickX = e.clientX;
    const clickY = e.clientY;
    chrome.runtime.sendMessage({ type: 'RESOLVE_SOURCES', x: clickX, y: clickY }, (response) => {
      hidePopover();
      if (chrome.runtime.lastError || !response) {
        showErrorPopover(clickX, clickY, chrome.runtime.lastError?.message || 'No response from background');
        return;
      }
      sendToPage({ type: 'CTC_GET_FIBER_RECTS', x: clickX, y: clickY, id: ++msgId });
      showPopover(response.hierarchy || [], clickX, clickY);
    });
  }

  function onKeyDown(e) {
    if (e.altKey && e.shiftKey && e.code === 'KeyC') {
      e.preventDefault();
      active ? deactivate() : activate();
      return;
    }
    if (e.key === 'Escape' && active) {
      if (popoverEl) {
        hidePopover();
      } else {
        deactivate();
      }
    }
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  document.addEventListener('keydown', onKeyDown, true);
})();
