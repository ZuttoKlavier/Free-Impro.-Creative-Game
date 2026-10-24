import { UI_PAGES, UI_PROPERTIES, emptyDesign, validateDesign, designCSS } from '../server/ui-design-schema.js';
import { classroomFetch, canUseClassroom, isOfflineStudent } from './classroom-transport.js';

let currentRuntime;
const copy = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function hexColor(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(value);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) === 0)) return null;
  return '#' + rgb.slice(1, 4).map(channel => clamp(Math.round(Number(channel)), 0, 255).toString(16).padStart(2, '0')).join('');
}

function colorValue(element, property) {
  for (let current = element; current; current = current.parentElement) {
    const color = hexColor(getComputedStyle(current)[property]);
    if (color) return color;
  }
  return property === 'backgroundColor' ? '#ffffff' : '#000000';
}

const visible = element => Boolean(element?.isConnected && !element.closest('[hidden]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && element.getBoundingClientRect().width && element.getBoundingClientRect().height);

// Published settings are read-only here. Only the separate administrator page
// owns the authenticated save operation; even an authorized preview cannot save.
export function initUIDesign(page) {
  if (!UI_PAGES[page]) throw new Error('Unknown UI page');
  currentRuntime?.destroy();
  const definition = UI_PAGES[page];
  const protectedPreview = /^\/api\/admin\/preview\/(student|teacher)$/.test(location.pathname);
  document.documentElement.dataset.uiPage = page;
  const style = document.createElement('style');
  style.id = 'fi-ui-design';
  document.head.append(style);
  let published = emptyDesign(), draft = null, disposed = false;
  let requestVersion = 0, updateVersion = 0, requestController, authController, authPending, authenticatedAt = 0;
  let authorized = false, editing = false, selection = null, selectedElement = null;
  let overlay, hint, previewStyle, observer, frame = 0, lastSelection = '', gesture = null;
  let textObserver, textFrame = 0;
  const textChanges = new Map();
  const removers = [];
  const on = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  };
  const activeDesign = () => draft || published;
  const send = data => {
    if (authorized && !disposed) window.parent.postMessage({ type: 'fi-ui-preview', page, ...data }, location.origin);
  };

  function valuesFor(element, target) {
    const saved = activeDesign().pages[page][target] || {};
    const computed = getComputedStyle(element);
    return Object.fromEntries(definition.targets[target].properties.map(property => {
      if (Object.hasOwn(saved, property)) return [property, saved[property]];
      const spec = UI_PROPERTIES[property];
      if (spec.type === 'text') return [property, element.innerText];
      if (spec.type === 'color') return [property, colorValue(element, property)];
      if (property === 'x' || property === 'y') return [property, 0];
      let value;
      if (property === 'columns') value = computed.gridTemplateColumns === 'none' ? 1 : computed.gridTemplateColumns.split(/\s+(?![^()]*\))/).length;
      else value = Number.parseFloat(computed[property]);
      if (!Number.isFinite(value)) value = property === 'maxWidth' ? element.getBoundingClientRect().width : 0;
      return [property, Math.round(value)];
    }));
  }

  function resolveSelection() {
    if (!definition.targets[selection]) return null;
    if (selectedElement?.matches(definition.targets[selection].selector) && visible(selectedElement)) return selectedElement;
    return [...document.querySelectorAll(definition.targets[selection].selector)].find(visible) || null;
  }

  function updateSelection(force = false) {
    if (!authorized || disposed) return;
    selectedElement = resolveSelection();
    const available = Boolean(selectedElement);
    if (overlay) {
      overlay.hidden = !editing || !available;
      if (!overlay.hidden) {
        const bounds = selectedElement.getBoundingClientRect();
        Object.assign(overlay.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
        overlay.firstChild.textContent = definition.targets[selection].label;
      }
    }
    if (!selection) return;
    const payload = { action: 'selected', target: selection, available, values: available ? valuesFor(selectedElement, selection) : {} };
    const signature = JSON.stringify(payload);
    if (force || signature !== lastSelection) { lastSelection = signature; send(payload); }
  }

  function scheduleSelection() {
    if (!frame && !disposed) frame = requestAnimationFrame(() => { frame = 0; updateSelection(); });
  }

  function render() {
    if (disposed) return;
    style.textContent = designCSS(activeDesign(), page);
    renderTexts();
    scheduleSelection();
  }

  function renderTexts() {
    const desired = new Map();
    for (const [key, target] of Object.entries(definition.targets)) {
      const value = activeDesign().pages[page][key]?.text;
      if (!target.properties.includes('text') || value === undefined) continue;
      for (const element of document.querySelectorAll(target.selector)) desired.set(element, value);
    }
    for (const [element, change] of textChanges) {
      if (desired.has(element) && element.isConnected) continue;
      if (element.isConnected && element.childNodes.length === 1 && element.firstChild === change.node && element.textContent === change.text) element.replaceChildren(...change.original);
      textChanges.delete(element);
    }
    for (const [element, text] of desired) {
      let change = textChanges.get(element);
      const unchanged = change && element.childNodes.length === 1 && element.firstChild === change.node && element.textContent === change.text;
      if (!unchanged) {
        change = { original: [...element.childNodes] };
        textChanges.set(element, change);
      } else if (change.text === text) continue;
      change.node = document.createTextNode(text); change.text = text;
      // Plain text only. Keep the original nodes for reset, including heading breaks.
      element.replaceChildren(change.node);
    }
  }

  async function refresh() {
    if (disposed) return;
    const version = ++requestVersion;
    requestController?.abort();
    if (page === 'student' && isOfflineStudent() && !canUseClassroom()) {
      published = emptyDesign();
      render();
      return;
    }
    const generation = window.FreeImproClassroom?.generation;
    const controller = requestController = new AbortController();
    try {
      const offline = page === 'student' && isOfflineStudent();
      const response = await (offline ? classroomFetch : fetch)(offline ? '/api/student/ui-design' : protectedPreview ? '/api/admin/ui-design' : '/api/ui-design', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-FreeImpro-UI-Text': '1' }, signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      const next = validateDesign(data.design);
      if (disposed || version !== requestVersion || (offline && (!canUseClassroom() || generation !== window.FreeImproClassroom?.generation))) return;
      published = next;
      // A late published response must never overwrite the administrator draft.
      render();
    } catch { /* A fresh/offline installation keeps the built-in appearance. */ }
  }

  function disconnect() {
    if (page !== 'student' || !isOfflineStudent()) return;
    ++requestVersion;
    requestController?.abort();
    published = emptyDesign(); draft = null;
    render();
  }

  function stopEvent(event) { event.preventDefault(); event.stopImmediatePropagation(); }

  function targetAt(element) {
    if (!(element instanceof Element)) return null;
    const candidates = Object.entries(definition.targets).flatMap(([target, spec]) => {
      const match = element.closest(spec.selector);
      if (!match) return [];
      let distance = 0;
      for (let node = element; node && node !== match; node = node.parentElement) distance++;
      return [{ target, element: match, distance, generic: ['page', 'main'].includes(target) ? 1 : 0, text: spec.properties.includes('text') ? 0 : 1 }];
    });
    candidates.sort((a, b) => a.generic - b.generic || a.distance - b.distance || a.text - b.text);
    return candidates[0] || null;
  }

  function finishGesture(cancel = false) {
    if (!gesture) return;
    const finished = gesture; gesture = null;
    try { finished.element.releasePointerCapture(finished.pointerId); } catch { /* The pointer may have left the frame. */ }
    if (!finished.moved) return;
    if (cancel) { draft = finished.originalDraft; render(); }
    else send({ action: 'changed', target: finished.target, styles: finished.styles });
    updateSelection();
  }

  function pointerDown(event) {
    if (!editing) return;
    stopEvent(event);
    finishGesture(true);
    const match = targetAt(event.target);
    if (!match) return;
    selection = match.target; selectedElement = match.element;
    updateSelection(true);
    const properties = definition.targets[selection].properties;
    if (event.button !== 0 || event.isPrimary === false || !properties.some(property => property === 'x' || property === 'y')) return;
    const saved = activeDesign().pages[page][selection] || {};
    gesture = { target: selection, element: selectedElement, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: saved.x || 0, y: saved.y || 0, originalDraft: draft ? copy(draft) : null, moved: false, styles: {} };
    try { selectedElement.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers need no capture. */ }
  }

  function pointerMove(event) {
    if (!editing || !gesture || event.pointerId !== gesture.pointerId) return;
    stopEvent(event);
    if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 3) return;
    gesture.moved = true;
    const properties = definition.targets[gesture.target].properties;
    const changes = {};
    if (properties.includes('x')) changes.x = clamp(Math.round(gesture.x + event.clientX - gesture.startX), -160, 160);
    if (properties.includes('y')) changes.y = clamp(Math.round(gesture.y + event.clientY - gesture.startY), -160, 160);
    gesture.styles = changes;
    draft ||= copy(published);
    draft.pages[page][gesture.target] = { ...draft.pages[page][gesture.target], ...changes };
    render();
  }

  function setEditing(value) {
    if (editing === value) return;
    if (!value) finishGesture(true);
    editing = value;
    document.documentElement.dataset.uiEditing = String(editing);
    hint.hidden = !editing;
    updateSelection();
  }

  async function verifyPreview(force = false) {
    if (authPending) return authPending;
    if (!force && Date.now() - authenticatedAt < 30000) return true;
    authController = new AbortController();
    authPending = (async () => {
      try {
        const response = await fetch('/api/admin/me', { credentials: 'same-origin', cache: 'no-store', signal: authController.signal });
        if ([401, 403].includes(response.status) && !disposed) {
          if (authorized) {
            finishGesture(true); setEditing(false);
            authorized = false; draft = null; render();
          }
          window.parent.postMessage({ type: 'fi-ui-preview', action: 'unauthorized', page }, location.origin);
        }
        if (!response.ok || !(await response.json()).admin?.id || disposed) return false;
        authenticatedAt = Date.now();
        return true;
      } catch { return false; }
      finally { authPending = null; }
    })();
    return authPending;
  }

  async function receive(event) {
    if (!authorized || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'fi-ui-editor') return;
    const message = event.data;
    if (message.action === 'request') { send({ action: 'ready' }); return; }
    if (message.action !== 'update' || typeof message.editing !== 'boolean') return;
    let next;
    try { next = validateDesign(message.design); } catch { return; }
    const version = ++updateVersion;
    if (message.editing && !(await verifyPreview())) return;
    if (disposed || !authorized || version !== updateVersion) return;
    if (!message.editing) finishGesture(true);
    if (gesture?.moved) next.pages[page][gesture.target] = { ...next.pages[page][gesture.target], ...gesture.styles };
    draft = next;
    if (message.selection !== selection) selectedElement = null;
    selection = Object.hasOwn(definition.targets, message.selection) ? message.selection : null;
    setEditing(message.editing);
    render();
    updateSelection(true);
  }

  async function enablePreview() {
    if (isOfflineStudent() || window.parent === window || new URLSearchParams(location.search).get('uiPreview') !== '1') return;
    try {
      if (window.parent.location.origin !== location.origin) return;
      if (!(await verifyPreview())) return;
    } catch { return; }
    authorized = true;
    previewStyle = document.createElement('style');
    previewStyle.textContent = `
      html[data-ui-editing="true"] body, html[data-ui-editing="true"] body * {cursor:crosshair!important;user-select:none!important;-webkit-user-select:none!important}
      #fi-ui-outline {position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #5947d2;box-sizing:border-box;border-radius:3px}
      #fi-ui-outline span {position:absolute;top:0;left:0;max-width:260px;white-space:nowrap;background:#5947d2;color:white;font:12px/1.5 system-ui;padding:2px 6px;border-radius:0 0 4px 0}
      #fi-ui-hint {position:fixed;right:10px;top:10px;z-index:2147483647;pointer-events:none;max-width:calc(100vw - 20px);padding:7px 10px;border-radius:8px;background:#302650;color:white;font:12px/1.5 system-ui;box-shadow:0 2px 10px #0002}
      #fi-ui-outline[hidden],#fi-ui-hint[hidden] {display:none!important}
    `;
    document.head.append(previewStyle);
    overlay = document.createElement('div'); overlay.id = 'fi-ui-outline'; overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); overlay.append(document.createElement('span'));
    hint = document.createElement('div'); hint.id = 'fi-ui-hint'; hint.hidden = true; hint.setAttribute('role', 'status'); hint.textContent = '编辑预览 · 点选元素；拖动可调整位置';
    document.body.append(overlay, hint);
    on(window, 'message', receive);
    on(window, 'pointerdown', pointerDown, true);
    on(window, 'pointermove', pointerMove, true);
    on(window, 'pointerup', event => { if (editing) { stopEvent(event); if (gesture?.pointerId === event.pointerId) finishGesture(); } }, true);
    on(window, 'pointercancel', event => { if (editing) { stopEvent(event); finishGesture(true); } }, true);
    for (const type of ['click', 'dblclick', 'auxclick', 'submit', 'contextmenu']) on(window, type, event => { if (editing) stopEvent(event); }, true);
    // Keep the browser's focus navigation so keyboard users can leave the frame.
    for (const type of ['keydown', 'keyup']) on(window, type, event => { if (editing && event.key !== 'Tab') stopEvent(event); }, true);
    on(window, 'scroll', scheduleSelection, true);
    on(window, 'resize', scheduleSelection);
    on(window, 'focus', () => { if (editing) void verifyPreview(true); });
    const authorizationTimer = setInterval(() => { if (editing) void verifyPreview(true); }, 60000);
    removers.push(() => clearInterval(authorizationTimer));
    observer = new MutationObserver(records => {
      if (records.some(record => !overlay.contains(record.target) && !hint.contains(record.target))) scheduleSelection();
    });
    observer.observe(document.querySelector('#app') || document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    send({ action: 'ready' });
  }

  on(window, 'focus', refresh);
  on(document, 'visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  on(window, 'freeimpro-classroom-connected', refresh);
  on(window, 'freeimpro-classroom-disconnected', disconnect);
  // Static headings can be mounted again by navigation or classroom refresh.
  textObserver = new MutationObserver(() => {
    if (!textFrame && !disposed) textFrame = requestAnimationFrame(() => { textFrame = 0; renderTexts(); });
  });
  textObserver.observe(document.querySelector('#app') || document.body, { subtree: true, childList: true, characterData: true });
  const runtime = {
    refresh,
    destroy() {
      if (disposed) return;
      finishGesture(true);
      disposed = true; ++requestVersion;
      requestController?.abort(); authController?.abort();
      removers.forEach(remove => remove());
      observer?.disconnect(); cancelAnimationFrame(frame);
      textObserver.disconnect(); cancelAnimationFrame(textFrame);
      for (const [element, change] of textChanges) if (element.isConnected && element.childNodes.length === 1 && element.firstChild === change.node && element.textContent === change.text) element.replaceChildren(...change.original);
      textChanges.clear();
      style.remove(); overlay?.remove(); hint?.remove(); previewStyle?.remove();
      delete document.documentElement.dataset.uiPage;
      delete document.documentElement.dataset.uiEditing;
      if (currentRuntime === runtime) currentRuntime = null;
    },
  };
  currentRuntime = runtime;
  void refresh();
  void enablePreview();
  return runtime;
}
