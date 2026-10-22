import { UI_PAGES, UI_PROPERTIES, emptyDesign, validateDesign } from './ui-design-schema.js';

const copy = value => JSON.parse(JSON.stringify(value));
const signature = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const presets = { phone: { label: '手机', width: 390, height: 844 }, tablet: { label: '平板', width: 768, height: 1024 }, desktop: { label: '桌面', width: 1280, height: 900 } };
const node = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
const button = (text, handler, className) => { const item = node('button', text, className); item.type = 'button'; item.addEventListener('click', handler); return item; };

export function createPageEditor({ root, api, onUnauthorized }) {
  const state = { page: 'student', target: 'page', device: 'phone', editing: false, ready: false, active: false, loaded: false, loading: false, saving: false, destroyed: false, conflict: false, revision: 0, saved: emptyDesign(), draft: emptyDesign(), values: {}, available: true, invalid: new Set(), frame: null, retry: null, timeout: null, previewPages: null, readOnlyPreview: false };
  const wrapper = node('div', undefined, 'ui-editor');
  wrapper.innerHTML = `
    <div class="ui-editor-intro"><div><strong>在真实页面中调整外观</strong><p>未保存的修改仅在此预览。保存后，此服务器上的所有用户都会使用新外观。</p></div><span class="ui-editor-badge" id="ui-editor-dirty">已保存</span></div>
    <div class="ui-editor-toolbar">
      <label>编辑页面<select id="ui-editor-page" aria-label="编辑页面"></select></label>
      <label>预览尺寸<select id="ui-editor-device" aria-label="预览尺寸"></select></label>
      <button type="button" id="ui-editor-mode" role="switch" aria-checked="false">页面编辑模式：关闭</button>
      <span class="ui-editor-mode-help" id="ui-editor-mode-help">关闭时可正常切换页面和滚动浏览。</span>
    </div>
    <p class="ui-editor-notice" id="ui-editor-notice" role="status" hidden></p>
    <div class="ui-editor-conflict" id="ui-editor-conflict" role="alert" hidden><strong>服务器上已有更新版本。</strong><p>你的草稿仍保留在这里。请先记下需要的数值，再载入服务器版本继续编辑。</p><button type="button" id="ui-editor-conflict-reload">放弃草稿，载入服务器版本</button></div>
    <div class="ui-editor-body">
      <aside class="ui-editor-inspector" aria-label="元素外观设置">
        <label class="ui-editor-target-label" for="ui-editor-target">选择要调整的元素</label><select id="ui-editor-target" aria-label="选择要调整的元素"></select>
        <p class="ui-editor-hint" id="ui-editor-selection-help">开启编辑模式后，也可直接点选预览中的元素。</p>
        <p class="ui-editor-hint ui-editor-common">同类元素会一起调整；例如修改“主要按钮”会影响当前端的所有主要按钮。</p>
        <fieldset class="ui-editor-properties" id="ui-editor-properties"><legend class="ui-editor-sr">外观属性</legend><div id="ui-editor-controls"></div></fieldset>
        <div class="ui-editor-reset"><button type="button" id="ui-editor-reset-target">恢复当前元素默认</button><button type="button" id="ui-editor-reset-page">恢复当前页面默认</button></div>
      </aside>
      <section class="ui-editor-preview" aria-label="应用实时预览"><div class="ui-editor-preview-heading"><span id="ui-editor-preview-title">学生端 · 手机</span><span id="ui-editor-connection" role="status">正在准备预览…</span></div><div class="ui-editor-preview-scroll" id="ui-editor-preview-scroll"><div class="ui-editor-stage" id="ui-editor-stage"></div></div><p class="ui-editor-preview-note" id="ui-editor-preview-note">滚动预览可查看整页。先关闭编辑模式，即可使用应用导航进入其他页面，再开启模式调整。</p><button type="button" id="ui-editor-retry-preview" hidden>重新连接预览</button></section>
    </div>
    <div class="ui-editor-footer"><div><strong id="ui-editor-save-state" role="status">尚未修改</strong><p id="ui-editor-updated">正在读取已保存的页面设置…</p></div><div class="ui-editor-save-actions"><button type="button" id="ui-editor-reload">重新载入</button><button type="button" id="ui-editor-discard">撤销未保存修改</button><button type="button" id="ui-editor-save" class="primary">保存并应用</button></div></div>`;
  root.replaceChildren(wrapper);
  const get = id => wrapper.querySelector('#' + id);
  const dirty = () => signature(state.draft) !== signature(state.saved);
  function announce(text = '', tone = '') { if (state.destroyed) return; const el = get('ui-editor-notice'); el.textContent = text; el.hidden = !text; el.className = 'ui-editor-notice' + (tone ? ' is-' + tone : ''); }
  function updateActions() {
    if (state.destroyed) return;
    const changed = dirty();
    get('ui-editor-dirty').textContent = changed ? '有未保存修改' : '已保存';
    get('ui-editor-dirty').classList.toggle('is-dirty', changed);
    get('ui-editor-save-state').textContent = state.saving ? '正在保存…' : state.conflict ? '需要载入服务器版本后再保存' : state.invalid.size ? '请修正输入的数值' : changed ? '草稿已变更，保存后对所有用户生效' : '当前外观已保存';
    get('ui-editor-save').textContent = state.saving ? '正在保存…' : '保存并应用';
    get('ui-editor-save').disabled = !changed || state.saving || state.loading || !state.loaded || state.conflict || !!state.invalid.size;
    get('ui-editor-discard').disabled = !changed || state.saving || state.loading;
    get('ui-editor-reload').disabled = state.saving || state.loading;
    get('ui-editor-conflict-reload').disabled = state.saving || state.loading;
    get('ui-editor-conflict').hidden = !state.conflict;
    get('ui-editor-mode').disabled = !state.ready || state.saving || state.loading;
    get('ui-editor-mode').setAttribute('aria-checked', String(state.editing));
    get('ui-editor-mode').textContent = '页面编辑模式：' + (state.editing ? '开启' : '关闭');
    get('ui-editor-mode').classList.toggle('is-active', state.editing);
    get('ui-editor-mode-help').textContent = state.editing ? '点击元素查看设置，拖动支持偏移的元素可微调位置。' : state.readOnlyPreview ? '预览仅用于调整外观，不进行真实课堂操作。可切换页面和滚动浏览。' : '关闭时可正常切换页面和滚动浏览。';
    get('ui-editor-properties').disabled = !state.editing || !state.ready || state.loading || state.saving;
    get('ui-editor-reset-target').disabled = !state.editing || !state.ready || state.loading || state.saving || !state.draft.pages[state.page]?.[state.target];
    get('ui-editor-reset-page').disabled = !state.editing || !state.ready || state.loading || state.saving || !Object.keys(state.draft.pages[state.page] || {}).length;
    get('ui-editor-page').disabled = state.loading || state.saving;
    get('ui-editor-target').disabled = state.loading || state.saving;
  }
  function push() { if (!state.destroyed && state.frame?.contentWindow && state.ready) state.frame.contentWindow.postMessage({ type: 'fi-ui-editor', action: 'update', design: state.draft, editing: state.active && state.editing, selection: state.target }, location.origin); }
  function setProperty(name, value) {
    if (!state.editing || state.destroyed || state.saving) return;
    const page = state.draft.pages[state.page];
    if (value === undefined) { if (page[state.target]) { delete page[state.target][name]; if (!Object.keys(page[state.target]).length) delete page[state.target]; } }
    else { page[state.target] ||= {}; page[state.target][name] = value; }
    state.invalid.delete(name); announce(); updateActions(); push();
  }
  function renderControls() {
    if (state.destroyed) return;
    state.invalid.clear();
    const controls = get('ui-editor-controls'); controls.replaceChildren();
    const styles = state.draft.pages[state.page][state.target] || {};
    const props = UI_PAGES[state.page].targets[state.target].properties;
    for (const name of props) {
      const spec = UI_PROPERTIES[name]; const custom = Object.hasOwn(styles, name); const inherited = state.values[name];
      const row = node('div', undefined, 'ui-editor-property' + (custom ? ' is-modified' : ''));
      const heading = node('div', undefined, 'ui-editor-property-heading'); const label = node('label', spec.label + (spec.unit ? `（${spec.unit}）` : '')); label.htmlFor = 'ui-property-' + name;
      const clear = button('默认', () => { setProperty(name, undefined); renderControls(); }, 'ui-editor-property-clear'); clear.setAttribute('aria-label', `恢复${spec.label}默认`); clear.disabled = !custom;
      heading.append(label, clear); row.append(heading);
      if (spec.type === 'color') {
        const inputs = node('div', undefined, 'ui-editor-color'); const input = node('input'); input.type = 'color'; input.id = 'ui-property-' + name; input.value = custom ? styles[name] : /^#[0-9a-f]{6}$/i.test(inherited || '') ? inherited : '#ffffff';
        const value = node('span', custom ? styles[name] : inherited || '跟随默认样式');
        input.addEventListener('input', () => { setProperty(name, input.value); value.textContent = input.value; row.classList.add('is-modified'); clear.disabled = false; });
        inputs.append(input, value); row.append(inputs);
      } else {
        const inputs = node('div', undefined, 'ui-editor-number'); const range = node('input'); range.type = 'range'; range.min = spec.min; range.max = spec.max; range.step = '1'; range.setAttribute('aria-label', spec.label + '滑块');
        const input = node('input'); input.type = 'number'; input.id = 'ui-property-' + name; input.min = spec.min; input.max = spec.max; input.step = '1'; input.inputMode = 'numeric'; input.placeholder = '默认';
        const current = custom ? styles[name] : inherited; input.value = Number.isFinite(current) ? String(Math.round(current)) : ''; range.value = Number.isFinite(current) ? String(current) : String(Math.max(spec.min, 0));
        const hint = node('span', undefined, 'ui-editor-field-error'); hint.hidden = true;
        const apply = () => {
          if (!input.value.trim()) { setProperty(name, undefined); row.classList.remove('is-modified'); clear.disabled = true; hint.hidden = true; input.removeAttribute('aria-invalid'); return; }
          const value = Number(input.value); const valid = Number.isInteger(value) && value >= spec.min && value <= spec.max;
          hint.hidden = valid; input.setAttribute('aria-invalid', String(!valid));
          if (!valid) { hint.textContent = `请输入 ${spec.min}～${spec.max} 的整数。`; state.invalid.add(name); updateActions(); return; }
          range.value = String(value); setProperty(name, value); row.classList.add('is-modified'); clear.disabled = false;
        };
        input.addEventListener('input', apply); range.addEventListener('input', () => { input.value = range.value; apply(); }); inputs.append(range, input); row.append(inputs, hint);
      }
      controls.append(row);
    }
    get('ui-editor-selection-help').textContent = !state.ready ? '正在连接真实应用预览…' : !state.available ? '当前视图中没有此元素。关闭编辑模式后可使用应用导航进入对应页面。' : state.editing ? '已选中：' + UI_PAGES[state.page].targets[state.target].label + '。可在右侧预览点选其他元素。' : '开启编辑模式后，可使用下方控件或点选预览中的元素。';
    updateActions();
  }
  function populateTargets() { const select = get('ui-editor-target'); select.replaceChildren(); for (const [id, target] of Object.entries(UI_PAGES[state.page].targets)) { const option = node('option', target.label); option.value = id; select.append(option); } select.value = state.target; state.values = {}; state.available = true; renderControls(); }
  function resize() {
    if (state.destroyed) return;
    const preset = presets[state.device]; const area = get('ui-editor-preview-scroll'); const stage = get('ui-editor-stage');
    const areaStyle = getComputedStyle(area);
    const maxHeight = Number.parseFloat(areaStyle.maxHeight);
    const availableHeight = Math.max(1, (Number.isFinite(maxHeight) ? maxHeight : window.innerHeight * .78) - Number.parseFloat(areaStyle.paddingTop || '0') - Number.parseFloat(areaStyle.paddingBottom || '0'));
    // Fit the complete device viewport, including fixed app navigation, inside the preview.
    const scale = Math.min(1, Math.max(1, area.clientWidth - 24) / preset.width, availableHeight / preset.height);
    stage.style.width = preset.width * scale + 'px'; stage.style.height = preset.height * scale + 'px';
    if (state.frame) { state.frame.style.width = preset.width + 'px'; state.frame.style.height = preset.height + 'px'; state.frame.style.transform = `scale(${scale})`; }
    get('ui-editor-preview-title').textContent = `${UI_PAGES[state.page].label} · ${preset.label} ${preset.width} × ${preset.height}`;
  }
  function clearPreviewTimers() { clearInterval(state.retry); clearTimeout(state.timeout); state.retry = null; state.timeout = null; }
  function mountPreview() {
    if (!state.previewPages || state.destroyed) return;
    clearPreviewTimers(); state.frame?.remove(); state.ready = false; state.editing = false; state.values = {};
    get('ui-editor-connection').textContent = '正在加载真实应用…'; get('ui-editor-retry-preview').hidden = true;
    const frame = node('iframe'); frame.id = 'ui-editor-frame'; frame.title = UI_PAGES[state.page].label + '页面编辑预览'; frame.setAttribute('referrerpolicy', 'same-origin');
    const url = new URL(state.previewPages[state.page], location.origin); url.searchParams.set('uiPreview', '1'); frame.src = url.href; state.frame = frame;
    frame.addEventListener('load', () => { if (state.destroyed || frame !== state.frame) return; state.ready = false; get('ui-editor-connection').textContent = '正在连接编辑模式…'; get('ui-editor-retry-preview').hidden = true; frame.contentWindow?.postMessage({ type: 'fi-ui-editor', action: 'request' }, location.origin); updateActions(); });
    get('ui-editor-stage').replaceChildren(frame); resize(); renderControls();
    state.retry = setInterval(() => { if (!state.destroyed && !state.ready && frame === state.frame) frame.contentWindow?.postMessage({ type: 'fi-ui-editor', action: 'request' }, location.origin); }, 1500);
    state.timeout = setTimeout(() => { if (state.destroyed || state.ready) return; get('ui-editor-connection').textContent = '预览连接未完成'; get('ui-editor-retry-preview').hidden = false; announce('暂时无法连接页面编辑预览。请检查服务后重新连接；已修改的草稿仍保留。', 'error'); }, 18000);
  }
  async function loadPreviewConfig() {
    if (state.previewPages) return;
    let config;
    try { config = await api('/editor-config'); }
    catch (error) {
      if (error.status !== 404) throw error;
      config = { previewPages: Object.fromEntries(Object.entries(UI_PAGES).map(([page, definition]) => [page, definition.url])), readOnlyPreview: false };
    }
    if (state.destroyed) return;
    if (!config || typeof config.readOnlyPreview !== 'boolean') throw new Error('后台返回了无效的页面预览配置，请重新载入。');
    const pages = {};
    for (const [page, definition] of Object.entries(UI_PAGES)) {
      const value = config.previewPages?.[page];
      let url;
      try { if (typeof value !== 'string') throw new Error(); url = new URL(value, location.origin); } catch { throw new Error('后台返回了无效的页面预览地址，请重新载入。'); }
      if (url.origin !== location.origin || url.username || url.password || ![definition.url, `/api/admin/preview/${page}`].includes(url.pathname) || url.search || url.hash) throw new Error('页面预览必须使用本站受支持的地址，请重新载入。');
      pages[page] = url.pathname;
    }
    state.previewPages = pages; state.readOnlyPreview = config.readOnlyPreview;
    if (state.readOnlyPreview) get('ui-editor-preview-note').textContent = '预览仅用于调整外观，不进行真实课堂操作。关闭编辑模式后，可使用预览中的导航切换页面，再开启模式调整。';
  }
  function receive(event) {
    if (state.destroyed || event.origin !== location.origin || !state.frame || event.source !== state.frame.contentWindow) return;
    const data = event.data; if (!data || data.type !== 'fi-ui-preview') return;
    if (data.action === 'unauthorized') { onUnauthorized?.(); return; }
    if (data.action === 'ready' && data.page === state.page) { state.ready = true; clearPreviewTimers(); get('ui-editor-connection').textContent = '预览已连接'; get('ui-editor-retry-preview').hidden = true; updateActions(); push(); return; }
    if (!state.ready || !state.active) return;
    if (data.action === 'selected' && Object.hasOwn(UI_PAGES[state.page].targets, data.target)) {
      const different = state.target !== data.target; state.target = data.target; get('ui-editor-target').value = state.target; state.available = data.available !== false;
      state.values = data.values && typeof data.values === 'object' ? data.values : {};
      if (different || !get('ui-editor-controls').contains(document.activeElement)) renderControls();
    }
    if (data.action === 'changed' && state.editing && !state.saving && Object.hasOwn(UI_PAGES[state.page].targets, data.target)) {
      const allowed = UI_PAGES[state.page].targets[data.target].properties; const styles = {};
      for (const name of ['x', 'y']) { const value = data.styles?.[name]; const spec = UI_PROPERTIES[name]; if (allowed.includes(name) && Number.isInteger(value) && value >= spec.min && value <= spec.max) styles[name] = value; }
      if (!Object.keys(styles).length) return; state.target = data.target; get('ui-editor-target').value = state.target; state.draft.pages[state.page][state.target] = { ...state.draft.pages[state.page][state.target], ...styles }; announce(); renderControls(); push();
    }
  }
  async function loadSnapshot({ discard = false } = {}) {
    if (state.destroyed || state.loading || state.saving) return false;
    if (dirty() && !discard && !window.confirm('重新载入会放弃当前未保存的修改，继续吗？')) return false;
    state.loading = true; updateActions();
    try {
      await loadPreviewConfig(); if (state.destroyed) return false;
      const snapshot = await api('/ui-design'); if (state.destroyed) return false;
      state.saved = validateDesign(snapshot.design || emptyDesign()); state.draft = copy(state.saved); state.revision = snapshot.revision; state.conflict = false; state.loaded = true; state.invalid.clear();
      const date = snapshot.updatedAt ? new Date(snapshot.updatedAt) : null; get('ui-editor-updated').textContent = date && Number.isFinite(date.valueOf()) ? '最近保存：' + date.toLocaleString('zh-CN') : '尚未保存自定义外观，当前使用应用默认样式。';
      announce(); renderControls(); if (state.active && !state.frame) mountPreview(); else push(); return true;
    } catch (error) { if (!state.destroyed) announce(error.message || '读取页面设置失败，请重新载入。', 'error'); return false; }
    finally { if (!state.destroyed) { state.loading = false; updateActions(); } }
  }
  async function save() {
    if (get('ui-editor-save').disabled || state.destroyed) return;
    state.saving = true; announce(); updateActions();
    try {
      const design = validateDesign(state.draft); const result = await api('/ui-design', { revision: state.revision, design }); if (state.destroyed) return;
      state.saved = validateDesign(result.design || design); state.draft = copy(state.saved); state.revision = result.revision; state.conflict = false;
      get('ui-editor-updated').textContent = '最近保存：' + new Date(result.updatedAt || Date.now()).toLocaleString('zh-CN'); announce('页面外观已保存并应用。学生端和教师端刷新后会使用新外观。', 'success'); renderControls(); push();
    } catch (error) { if (state.destroyed) return; if (error.status === 409) { state.conflict = true; announce('保存未完成：服务器已有新的页面设置，你的未保存草稿已保留。', 'error'); } else announce(error.message || '保存未完成，草稿已保留，请重试。', 'error'); }
    finally { if (!state.destroyed) { state.saving = false; updateActions(); } }
  }
  for (const [id, page] of Object.entries(UI_PAGES)) { const option = node('option', page.label); option.value = id; get('ui-editor-page').append(option); }
  for (const [id, preset] of Object.entries(presets)) { const option = node('option', `${preset.label} · ${preset.width}px`); option.value = id; get('ui-editor-device').append(option); }
  get('ui-editor-page').addEventListener('change', () => { state.page = get('ui-editor-page').value; state.target = 'page'; populateTargets(); mountPreview(); announce(dirty() ? '已切换预览页面。两个页面的未保存修改会一起保存。' : ''); });
  get('ui-editor-device').addEventListener('change', () => { state.device = get('ui-editor-device').value; resize(); });
  get('ui-editor-target').addEventListener('change', () => { state.target = get('ui-editor-target').value; state.values = {}; state.available = true; renderControls(); push(); });
  get('ui-editor-mode').addEventListener('click', () => { state.editing = !state.editing; renderControls(); push(); });
  get('ui-editor-reset-target').addEventListener('click', () => { delete state.draft.pages[state.page][state.target]; state.values = {}; announce('当前元素已在草稿中恢复默认。保存后对所有用户生效。'); renderControls(); push(); });
  get('ui-editor-reset-page').addEventListener('click', () => { state.draft.pages[state.page] = {}; state.values = {}; announce('当前页面已在草稿中恢复默认。保存后对所有用户生效。'); renderControls(); push(); });
  get('ui-editor-discard').addEventListener('click', () => { state.draft = copy(state.saved); state.values = {}; announce('已撤销未保存修改。'); renderControls(); push(); });
  get('ui-editor-save').addEventListener('click', save); get('ui-editor-reload').addEventListener('click', () => loadSnapshot()); get('ui-editor-conflict-reload').addEventListener('click', () => loadSnapshot({ discard: true })); get('ui-editor-retry-preview').addEventListener('click', mountPreview);
  const beforeUnload = event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('message', receive); window.addEventListener('beforeunload', beforeUnload);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(get('ui-editor-preview-scroll'));
  window.addEventListener('resize', resize); populateTargets(); updateActions();
  return {
    async activate() { if (state.destroyed) return; state.active = true; if (!state.loaded) { const loaded = await loadSnapshot(); if (!loaded || state.destroyed || !state.active) return; } if (!state.frame) mountPreview(); else { resize(); push(); renderControls(); if (dirty()) announce('未保存的草稿已保留，可继续调整或保存。'); } },
    suspend() { if (state.destroyed) return; state.active = false; state.editing = false; push(); updateActions(); },
    hasUnsavedChanges: dirty,
    isSaving: () => state.saving,
    destroy() { if (state.destroyed) return; state.active = false; state.editing = false; push(); state.destroyed = true; clearPreviewTimers(); observer?.disconnect(); window.removeEventListener('message', receive); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('resize', resize); state.frame?.remove(); state.frame = null; state.saved = emptyDesign(); state.draft = emptyDesign(); state.values = {}; root.replaceChildren(); },
  };
}
