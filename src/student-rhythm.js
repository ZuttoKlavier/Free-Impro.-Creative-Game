import { listSounds, saveSounds } from './storage.js';
import { Sequencer } from './sequencer.js';
import { validateRhythm, resizeSteps } from './rhythm-data.js';
import './student-rhythm.css';

export function createStudentRhythm({ notify, stopPlayback, onSaved }) {
  const dialog = document.createElement('dialog'); dialog.className = 'student-rhythm';
  dialog.innerHTML = `<h2>节奏编创</h2><p data-name></p><p>每小节 16 个位置 · 点击圆点发声，向右拖动延长；向左收回缩短。延长只发声一次，保持原音高；大幅拉伸可能影响音色。</p>
    <div class="rhythm-controls"><label>小节数 <input data-bars aria-label="编创小节数" type="number" min="1" max="16" value="1"></label>
    <label>试听速度 <input data-bpm aria-label="试听速度" type="number" min="40" max="240" value="100"></label></div>
    <div data-pages class="rhythm-pages"></div><div class="rhythm-water-stage"><svg class="rhythm-water" aria-hidden="true"><defs><filter id="rhythm-water-merge" x="-30%" y="-100%" width="160%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="4"/><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter></defs><g data-water-shapes></g></svg><div data-grid class="student-rhythm-grid" aria-label="学生节奏格子"></div></div>
    <div class="dialog-actions"><button data-copy class="secondary">复制到下一小节</button><button data-clear class="secondary">清空本小节</button></div>
    <progress data-progress max="1" value="0" aria-label="试听循环进度"></progress>
    <div class="dialog-actions"><button data-play class="secondary">播放试听</button><button data-stop class="secondary">停止</button><button data-save class="primary">保存节奏</button><button data-close class="secondary">关闭</button></div>
    <p data-status role="status">保存到当前声音作品；课堂内另行提交，教师接受后使用。</p>`;
  const content = document.createElement('div'); content.className = 'rhythm-landscape-content';
  while (dialog.firstChild) content.append(dialog.firstChild); dialog.append(content);
  const rotate = document.createElement('div'); rotate.className = 'rhythm-rotate'; rotate.innerHTML = '<span aria-hidden="true">↻</span><h2>请横屏使用</h2><p>将设备旋转为横屏后，即可编创节奏。</p><button class="secondary" data-rotate-close>返回</button>'; dialog.append(rotate);
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let soundId, draft, page = 0, engine = null, generation = 0, dirty = false, saving = false, gesture = null;
  const stop = () => { generation++; engine?.dispose(); engine = null; $('[data-progress]').value = 0; $('[data-play]').disabled = false; };
  const edited = () => { dirty = true; engine?.setPattern('self', draft.steps); $('[data-status]').textContent = '尚未保存；播放中的格子修改下一遍生效。'; };
  function draw() {
    $('[data-pages]').replaceChildren(...Array.from({ length: draft.bars }, (_, i) => {
      const button = document.createElement('button'); button.textContent = `第 ${i + 1} 小节`; button.className = 'secondary'; button.setAttribute('aria-pressed', String(i === page));
      button.onclick = () => { page = i; draw(); }; return button;
    }));
    $('[data-grid]').replaceChildren(...Array.from({ length: 16 }, (_, i) => {
      const button = document.createElement('button'); button.dataset.step = i; button.innerHTML = `<span class="rhythm-dot" aria-hidden="true"></span><span class="rhythm-dot-number" aria-hidden="true">${i + 1}</span>`;
      button.setAttribute('aria-label', `第 ${page + 1} 小节第 ${i + 1} 格`); button.setAttribute('aria-pressed', String(Boolean(draft.steps[page * 16 + i])));
      button.onclick = event => { if (event.detail === 0) toggle(i, !draft.steps[page * 16 + i]); }; return button;
    }));
    $('[data-copy]').disabled = page + 1 === draft.bars;
    paintLengths();
  }
  function paintLengths() {
    const cells = [...$('[data-grid]').children];
    cells.forEach((cell, i) => { cell.classList.remove('held', 'held-start', 'held-end'); cell.setAttribute('aria-pressed', String(Boolean(draft.steps[page * 16 + i]))); });
    for (let i = 0; i < 16; i++) {
      const length = draft.steps[page * 16 + i];
      if (typeof length !== 'number') continue;
      for (let j = i; j < i + length; j++) cells[j]?.classList.add('held');
      cells[i].classList.add('held-start'); cells[i + length - 1]?.classList.add('held-end');
    }
    requestAnimationFrame(paintWater);
  }
  function paintWater() {
    if (!dialog.open) return;
    const stage = $('.rhythm-water-stage').getBoundingClientRect();
    const points = [...$('[data-grid]').children].map(cell => { const r = cell.querySelector('.rhythm-dot').getBoundingClientRect(); return { x: r.x - stage.x + r.width / 2, y: r.y - stage.y + r.height / 2, radius: r.width / 2 }; });
    const layer = $('[data-water-shapes]'), wanted = new Set();
    for (let i = 0; i < 16; i++) {
      const value = draft.steps[page * 16 + i]; if (!value) continue;
      const last = i + (typeof value === 'number' ? value : 1) - 1;
      for (let start = i; start <= last;) {
        let end = start; while (end < last && Math.abs(points[end + 1].y - points[start].y) < 3) end++;
        const key = `${i}-${start}`, a = points[start], b = points[end]; wanted.add(key);
        let group = layer.querySelector(`[data-water-key="${key}"]`);
        if (!group) {
          group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.dataset.waterKey = key; group.setAttribute('filter', 'url(#rhythm-water-merge)');
          group.innerHTML = '<rect rx="11" height="22"/><circle r="16"/><circle r="16"/>'; layer.append(group);
          group.querySelector('rect').style.width = '0px'; group.querySelectorAll('circle').forEach(c => { c.style.cx = `${a.x}px`; c.style.cy = `${a.y}px`; });
          group.getBoundingClientRect();
        }
        const rect = group.querySelector('rect'), circles = group.querySelectorAll('circle');
        circles.forEach(c => c.setAttribute('r', a.radius)); rect.setAttribute('height', a.radius * 1.375); rect.setAttribute('rx', a.radius * .6875);
        rect.setAttribute('x', a.x); rect.setAttribute('y', a.y - a.radius * .6875); rect.style.width = `${b.x - a.x}px`;
        circles[0].style.cx = `${a.x}px`; circles[0].style.cy = `${a.y}px`; circles[1].style.cx = `${b.x}px`; circles[1].style.cy = `${b.y}px`;
        start = end + 1;
      }
    }
    for (const group of layer.children) if (!wanted.has(group.dataset.waterKey)) group.remove();
  }
  new ResizeObserver(() => requestAnimationFrame(paintWater)).observe($('[data-grid]'));
  function clearCover(index) {
    for (let i = 0; i <= index; i++) { const n = draft.steps[page * 16 + i]; if (typeof n === 'number' && i + n > index) draft.steps[page * 16 + i] = false; }
  }
  function toggle(index, value) {
    clearCover(index);
    draft.steps[page * 16 + index] = value;
    const button = $('[data-grid]').children[index];
    const changed = button.getAttribute('aria-pressed') !== String(value);
    button.setAttribute('aria-pressed', String(value));
    if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) button.querySelector('.rhythm-dot').animate([{ transform: 'scale(.75)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 230, easing: 'ease-out' });
    paintLengths(); edited();
  }
  const grid = $('[data-grid]');
  grid.onpointerdown = event => {
    const button = event.target.closest('[data-step]'); if (!button || event.button !== 0) return;
    event.preventDefault(); const index = Number(button.dataset.step); gesture = { id: event.pointerId, start: index, original: [...draft.steps], moved: false };
    grid.setPointerCapture(event.pointerId);
  };
  grid.onpointermove = event => {
    if (gesture?.id !== event.pointerId) return;
    const button = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-step]');
    if (button && grid.contains(button)) {
      const end = Math.max(gesture.start, Number(button.dataset.step));
      if (end === gesture.start && !gesture.moved) return;
      gesture.moved = true; draft.steps = [...gesture.original]; clearCover(gesture.start);
      for (let i = gesture.start; i <= end; i++) { clearCover(i); draft.steps[page * 16 + i] = false; }
      draft.steps[page * 16 + gesture.start] = end === gesture.start ? true : end - gesture.start + 1;
      paintLengths(); edited();
    }
  };
  grid.onpointerup = () => { if (gesture && !gesture.moved) toggle(gesture.start, !draft.steps[page * 16 + gesture.start]); gesture = null; };
  grid.onpointercancel = () => { if (gesture) { draft.steps = gesture.original; paintLengths(); edited(); } gesture = null; };
  grid.onlostpointercapture = () => { gesture = null; };
  $('[data-bars]').onchange = event => {
    const bars = Number(event.target.value);
    if (!Number.isInteger(bars) || bars < 1 || bars > 16) { event.target.value = draft.bars; return; }
    stop(); draft.steps = resizeSteps(draft.steps, bars * 16); draft.bars = bars; page = Math.min(page, bars - 1); edited(); draw();
  };
  $('[data-bpm]').onchange = event => { const bpm = Math.min(240, Math.max(40, Number(event.target.value) || 100)); event.target.value = bpm; engine?.setBpm(bpm); };
  $('[data-clear]').onclick = () => { draft.steps.fill(false, page * 16, (page + 1) * 16); edited(); draw(); };
  $('[data-copy]').onclick = () => { if (page + 1 >= draft.bars) return; draft.steps.splice((page + 1) * 16, 16, ...draft.steps.slice(page * 16, (page + 1) * 16)); edited(); draw(); };
  $('[data-stop]').onclick = stop;
  $('[data-play]').onclick = async () => {
    stopPlayback(); stop(); const ticket = generation; $('[data-play]').disabled = true;
    const current = engine = new Sequencer({ onTick: state => { $('[data-progress]').value = state.progress; } });
    try {
      const context = await current.ready(); const sound = (await listSounds()).find(s => s.id === soundId);
      if (!sound) throw new Error('这份声音已被删除。');
      const buffer = await context.decodeAudioData(await sound.blob.arrayBuffer());
      if (ticket !== generation) return;
      current.setBars(draft.bars); current.setBpm(Number($('[data-bpm]').value));
      current.upsertTrack({ id: 'self', submissionId: sound.id, buffer, pattern: draft.steps, position: { x: .5, y: .5 } }); current.setActive('self', true); await current.play();
    } catch (e) { if (ticket === generation) { stop(); notify(e.message, true); } }
  };
  $('[data-save]').onclick = async () => {
    if (saving) return; saving = true; $('[data-save]').disabled = true;
    try {
      const sound = (await listSounds()).find(s => s.id === soundId); if (!sound) throw new Error('这份声音已被删除。');
      const saved = validateRhythm(draft);
      await saveSounds([{ ...sound, rhythm: saved }]); dirty = JSON.stringify(saved) !== JSON.stringify(draft); $('[data-status]').textContent = dirty ? '已保存先前的节奏；刚才的修改尚未保存。' : '节奏已保存在这份声音中。到“我的课堂”提交节奏申请。'; await onSaved();
    } catch (e) { notify(e.message, true); } finally { saving = false; $('[data-save]').disabled = false; }
  };
  function orientationChanged() {
    const landscape = matchMedia('(orientation: landscape)').matches;
    content.hidden = !landscape; content.inert = !landscape; rotate.hidden = landscape;
    if (!landscape) { stop(); if (gesture) { draft.steps = gesture.original; gesture = null; if (draft) draw(); } } else if (dialog.open) requestAnimationFrame(paintWater);
  }
  window.addEventListener('resize', orientationChanged);
  matchMedia('(orientation: landscape)').addEventListener('change', orientationChanged);
  $('[data-rotate-close]').onclick = () => close();
  function close() { if (saving) return; if (dirty && !confirm('节奏尚未保存，放弃本次修改？')) return; dialog.close(); }
  $('[data-close]').onclick = close; dialog.oncancel = event => { event.preventDefault(); close(); }; dialog.onclose = stop;
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('freeimpro-background', stop); window.addEventListener('pagehide', stop);
  return { edit(sound) { stopPlayback(); stop(); soundId = sound.id; draft = sound.rhythm ? validateRhythm(sound.rhythm) : { bars: 1, steps: Array(16).fill(false) }; page = 0; dirty = false; $('[data-name]').textContent = sound.name; $('[data-bars]').value = draft.bars; $('[data-status]').textContent = '保存到当前声音作品；课堂内另行提交，教师接受后使用。'; draw(); dialog.showModal(); orientationChanged(); } };
}
