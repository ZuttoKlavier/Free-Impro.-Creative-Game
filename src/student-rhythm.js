import { listSounds, updateSound } from './storage.js';
import { Sequencer } from './sequencer.js';
import { NativeRhythmPreview } from './native-rhythm.js';
import { resumeAudioContext } from './audio-session.js';
import { validateRhythm, resizeSteps } from './rhythm-data.js';
import './student-rhythm.css';

export function createStudentRhythm({ notify, stopPlayback, onSaved, onClosed }) {
  const dialog = document.createElement('dialog'); dialog.className = 'student-rhythm';
  dialog.innerHTML = `<div class="rhythm-landscape-content">
    <div class="rhythm-setup"><div class="rhythm-controls"><div class="rhythm-control"><span>小节数</span><div class="rhythm-stepper" role="group" aria-label="小节数调整"><button data-bars-minus class="secondary" aria-label="减少小节">−</button><output data-bars aria-label="编创小节数">1</output><button data-bars-plus class="secondary" aria-label="增加小节">+</button></div></div>
    <div class="rhythm-control"><span>试听速度</span><div class="rhythm-tempo" role="group" aria-label="试听速度调整"><button data-bpm-minus class="secondary" aria-label="减慢试听速度">−</button><input data-bpm aria-label="试听速度" type="range" inputmode="none" min="40" max="240" step="1" value="100"><button data-bpm-plus class="secondary" aria-label="加快试听速度">+</button><output data-bpm-value aria-label="试听速度值">100</output></div></div></div>
    <nav data-pages class="rhythm-pages" aria-label="选择编创小节"></nav></div>
    <div class="rhythm-water-stage"><svg class="rhythm-water" aria-hidden="true"><defs><filter id="rhythm-water-merge" x="-30%" y="-100%" width="160%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="4"/><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter></defs><g data-water-shapes></g><g data-playback-shapes></g></svg><div data-grid class="student-rhythm-grid" aria-label="学生节奏格子"></div></div>
    <div class="rhythm-actions"><button data-copy class="secondary">复制到下一小节</button><button data-clear class="secondary">清空本小节</button><button data-play class="secondary">播放试听</button><button data-stop class="secondary">停止</button><button data-save class="primary">保存节奏</button></div>
    <div class="rhythm-feedback"><progress data-progress max="1" value="0" aria-label="试听循环进度"></progress><p data-status role="status"></p></div>
  </div>`;
  const heading = document.createElement('div'); heading.className = 'student-rhythm-heading';
  heading.innerHTML = '<div><h2>节奏编创</h2><p data-name></p></div><button data-close class="secondary" aria-label="返回声音库">‹ 返回声音库</button>'; dialog.prepend(heading);
  const content = dialog.querySelector('.rhythm-landscape-content');
  const rotate = document.createElement('div'); rotate.className = 'rhythm-rotate'; rotate.innerHTML = '<span aria-hidden="true">↻</span><h2>请横屏使用</h2><p>将设备旋转为横屏后，即可编创节奏。</p>'; dialog.append(rotate);
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let soundId, draft, page = 0, engine = null, generation = 0, dirty = false, saving = false, gesture = null, waterFrame = null, playbackState = null;
  let audioWatch = null, needsAudioRecovery = false;
  // Stop the timeline without closing its hardware context. Recreating an iOS
  // context on every stop/replay can leave the next preview unable to resume.
  const stop = () => { generation++; clearInterval(audioWatch); audioWatch = null; engine?.stop(); playbackState = null; paintPlayback(); $('[data-progress]').value = 0; $('[data-play]').disabled = false; };
  const release = () => { stop(); engine?.dispose(); engine = null; needsAudioRecovery = false; };
  const edited = () => { dirty = true; if (engine?.getState().tracks.some(track => track.id === 'self')) engine.setPattern('self', draft.steps); $('[data-status]').textContent = '尚未保存；播放中的格子修改下一遍生效。'; };
  function clearWater() {
    if (waterFrame !== null) cancelAnimationFrame(waterFrame);
    waterFrame = null; $('[data-water-shapes]').replaceChildren(); $('[data-playback-shapes]').replaceChildren();
  }
  function queueWater() {
    if (waterFrame !== null) cancelAnimationFrame(waterFrame);
    waterFrame = requestAnimationFrame(() => { waterFrame = null; paintWater(); });
  }
  function draw() {
    clearWater();
    touchControls();
    $('[data-pages]').replaceChildren(...Array.from({ length: draft.bars }, (_, i) => {
      const button = document.createElement('button'); button.textContent = String(i + 1); button.setAttribute('aria-label', `第 ${i + 1} 小节`); button.className = 'secondary'; button.setAttribute('aria-pressed', String(i === page));
      button.onclick = () => { if (gesture) return; page = i; draw(); }; return button;
    }));
    $('[data-grid]').replaceChildren(...Array.from({ length: 16 }, (_, i) => {
      const button = document.createElement('button'); button.dataset.step = i; button.innerHTML = `<span class="rhythm-dot" aria-hidden="true"></span><span class="rhythm-dot-number" aria-hidden="true">${i + 1}</span>`;
      button.setAttribute('aria-label', `第 ${page + 1} 小节第 ${i + 1} 格`); button.setAttribute('aria-pressed', String(Boolean(draft.steps[page * 16 + i])));
      button.onclick = event => { if (event.detail === 0) toggle(i, !draft.steps[page * 16 + i]); }; return button;
    }));
    $('[data-copy]').disabled = page + 1 === draft.bars;
    paintLengths();
    paintPlayback();
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
    queueWater();
  }
  function waterPoints() {
    const stage = $('.rhythm-water-stage').getBoundingClientRect();
    return [...$('[data-grid]').children].map(cell => {
      const box = cell.getBoundingClientRect(), dot = cell.querySelector('.rhythm-dot');
      // Feedback transforms must never become persistent SVG geometry.
      return { x: box.x - stage.x + dot.offsetLeft + dot.offsetWidth / 2, y: box.y - stage.y + dot.offsetTop + dot.offsetHeight / 2, radius: dot.offsetWidth / 2 };
    });
  }
  function setWaterGeometry(group, a, b) {
    const rect = group.querySelector('rect'), circles = group.querySelectorAll('circle');
    circles.forEach(c => c.setAttribute('r', a.radius)); rect.setAttribute('height', a.radius * 1.375); rect.setAttribute('rx', a.radius * .6875);
    rect.setAttribute('x', a.x); rect.setAttribute('y', a.y - a.radius * .6875); rect.style.width = `${b.x - a.x}px`;
    circles[0].style.cx = `${a.x}px`; circles[0].style.cy = `${a.y}px`; circles[1].style.cx = `${b.x}px`; circles[1].style.cy = `${b.y}px`;
  }
  function paintWater() {
    if (!dialog.open || content.hidden) return;
    const points = waterPoints();
    const layer = $('[data-water-shapes]'), wanted = new Set();
    for (let i = 0; i < 16; i++) {
      const value = draft.steps[page * 16 + i]; if (!value) continue;
      const last = i + (typeof value === 'number' ? value : 1) - 1;
      for (let start = i; start <= last;) {
        let end = start; while (end < last && Math.abs(points[end + 1].y - points[start].y) < 3) end++;
        const key = `${page}-${i}-${start}`, a = points[start], b = points[end]; wanted.add(key);
        let group = layer.querySelector(`[data-water-key="${key}"]`);
        if (!group) {
          group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.dataset.waterKey = key;
          group.innerHTML = '<rect rx="11" height="22"/><circle r="16"/><circle r="16"/>'; layer.append(group);
          group.querySelector('rect').style.width = '0px'; group.querySelectorAll('circle').forEach(c => { c.style.cx = `${a.x}px`; c.style.cy = `${a.y}px`; });
          group.getBoundingClientRect();
        }
        if (end > start) group.setAttribute('filter', 'url(#rhythm-water-merge)'); else group.removeAttribute('filter');
        setWaterGeometry(group, a, b);
        start = end + 1;
      }
    }
    for (const group of [...layer.children]) if (!wanted.has(group.dataset.waterKey)) group.remove();
    paintPlayback(points);
  }
  function paintPlayback(points) {
    const now = engine?.context?.currentTime;
    const notes = playbackState?.tracks.find(track => track.id === 'self')?.sounding || [];
    const visible = playbackState?.playing && dialog.open && !content.hidden ? notes.filter(note => page === Math.floor(note.step / 16) && note.time <= now && now < note.time + note.duration) : [];
    [...$('[data-grid]').children].forEach((cell, index) => cell.classList.toggle('is-playing', visible.some(note => index >= note.step % 16 && index < note.step % 16 + note.length)));
    for (const group of $('[data-water-shapes]').children) group.classList.toggle('is-playing', visible.some(note => group.dataset.waterKey === `${page}-${note.step % 16}-${note.step % 16}` && (typeof draft.steps[note.step] === 'number' ? draft.steps[note.step] : Number(Boolean(draft.steps[note.step]))) === note.length));
    const layer = $('[data-playback-shapes]');
    if (!visible.length) { layer.replaceChildren(); return; }
    const geometry = points || waterPoints(), wanted = new Set();
    for (const note of visible) {
      const key = `${note.step}-${note.length}`, start = note.step % 16; wanted.add(key);
      let group = layer.querySelector(`[data-playing-key="${key}"]`);
      if (!group) { group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.dataset.playingKey = key; group.innerHTML = '<rect/><circle/><circle/>'; layer.append(group); }
      group.dataset.playingStep = note.step; group.dataset.playingLength = note.length;
      if (note.length > 1) group.setAttribute('filter', 'url(#rhythm-water-merge)'); else group.removeAttribute('filter');
      setWaterGeometry(group, geometry[start], geometry[start + note.length - 1]);
    }
    for (const group of [...layer.children]) if (!wanted.has(group.dataset.playingKey)) group.remove();
  }
  function followPlayback(state) {
    playbackState = state;
    if (state.playing && (state.progress > 0 || state.loop > 0 || state.tracks.some(track => track.sounding?.length)) && !gesture) {
      const nextPage = Math.floor(state.step / 16);
      if (page !== nextPage) { page = nextPage; draw(); }
    }
    $('[data-progress]').value = state.progress; paintPlayback();
  }
  function finishGesture() { gesture = null; if (playbackState?.playing) followPlayback(playbackState); }
  new ResizeObserver(queueWater).observe($('[data-grid]'));
  function clearCover(index) {
    for (let i = 0; i <= index; i++) { const n = draft.steps[page * 16 + i]; if (typeof n === 'number' && i + n > index) draft.steps[page * 16 + i] = false; }
  }
  function toggle(index, value) {
    clearCover(index);
    draft.steps[page * 16 + index] = value;
    const button = $('[data-grid]').children[index];
    const changed = button.getAttribute('aria-pressed') !== String(value);
    button.setAttribute('aria-pressed', String(value));
    if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) button.querySelector('.rhythm-dot').animate([{ opacity: .45, filter: 'brightness(1.4)' }, { opacity: 1, filter: 'brightness(1)' }], { duration: 230, easing: 'ease-out' });
    paintLengths(); edited();
  }
  const grid = $('[data-grid]');
  grid.onpointerdown = event => {
    const button = event.target.closest('[data-step]'); if (gesture || !button || event.button !== 0) return;
    event.preventDefault(); const index = Number(button.dataset.step); gesture = { id: event.pointerId, page, start: index, original: [...draft.steps], moved: false };
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
  grid.onpointerup = event => { if (gesture?.id !== event.pointerId) return; if (!gesture.moved) toggle(gesture.start, !draft.steps[gesture.page * 16 + gesture.start]); finishGesture(); };
  grid.onpointercancel = event => { if (gesture?.id !== event.pointerId) return; draft.steps = gesture.original; paintLengths(); edited(); finishGesture(); };
  grid.onlostpointercapture = event => { if (gesture?.id === event.pointerId) finishGesture(); };
  function touchControls() {
    $('[data-bars]').value = String(draft?.bars || 1);
    $('[data-bars-minus]').disabled = !draft || draft.bars === 1;
    $('[data-bars-plus]').disabled = draft?.bars === 16;
    const bpm = Number($('[data-bpm]').value);
    $('[data-bpm-value]').value = String(bpm);
    $('[data-bpm-minus]').disabled = bpm === 40;
    $('[data-bpm-plus]').disabled = bpm === 240;
  }
  function setBars(bars) {
    if (gesture || !Number.isInteger(bars) || bars < 1 || bars > 16 || bars === draft.bars) return;
    stop(); draft.steps = resizeSteps(draft.steps, bars * 16); draft.bars = bars; page = Math.min(page, bars - 1); edited(); draw();
  }
  function setBpm(value) {
    const bpm = Math.min(240, Math.max(40, Number(value) || 100));
    $('[data-bpm]').value = String(bpm); touchControls(); engine?.setBpm(bpm);
  }
  $('[data-bars-minus]').onclick = () => setBars(draft.bars - 1);
  $('[data-bars-plus]').onclick = () => setBars(draft.bars + 1);
  $('[data-bpm]').oninput = event => setBpm(event.target.value);
  $('[data-bpm-minus]').onclick = () => setBpm(Number($('[data-bpm]').value) - 1);
  $('[data-bpm-plus]').onclick = () => setBpm(Number($('[data-bpm]').value) + 1);
  $('[data-clear]').onclick = () => { if (gesture) return; draft.steps.fill(false, page * 16, (page + 1) * 16); edited(); draw(); };
  $('[data-copy]').onclick = () => { if (gesture || page + 1 >= draft.bars) return; draft.steps.splice((page + 1) * 16, 16, ...draft.steps.slice(page * 16, (page + 1) * 16)); edited(); draw(); };
  $('[data-stop]').onclick = stop;
  $('[data-play]').onclick = async () => {
    stopPlayback(); stop(); const ticket = generation; $('[data-play]').disabled = true;
    if (!gesture && page !== 0) { page = 0; draw(); }
    if (!engine) {
      const Preview = window.FreeImproAudio?.playRhythm ? NativeRhythmPreview : Sequencer;
      const created = new Preview({ volume: 1, limiter: false, onTick: state => { if (engine === created) followPlayback(state); }, onError: error => { if (!created.getState().playing) stop(); notify(error.message, true); } });
      engine = created;
    }
    const current = engine;
    try {
      const context = await current.ready(); const sound = (await listSounds()).find(s => s.id === soundId);
      if (!sound) throw new Error('这份声音已被删除。');
      const buffer = await context.decodeAudioData(await sound.blob.arrayBuffer());
      if (ticket !== generation) return;
      if (needsAudioRecovery && context.suspend) { await context.suspend(); await resumeAudioContext(context); needsAudioRecovery = false; }
      if (ticket !== generation) return;
      current.setBars(draft.bars); current.setBpm(Number($('[data-bpm]').value));
      current.upsertTrack({ id: 'self', submissionId: sound.id, buffer, pattern: draft.steps, position: { x: .5, y: .5 } }); current.setPattern('self', draft.steps); current.setActive('self', true); await current.play();
      if (ticket !== generation) return;
      // Leave replay available after startup, including if iOS later interrupts
      // a context without delivering a normal end callback.
      $('[data-play]').disabled = false;
      if (window.FreeImproAudio?.startRecording) {
        let lastTime = context.currentTime, movedAt = performance.now();
        audioWatch = setInterval(() => {
          if (ticket !== generation || !current.getState().playing) return;
          if (context.currentTime > lastTime) { lastTime = context.currentTime; movedAt = performance.now(); }
          else if (!document.hidden && performance.now() - movedAt > 1200) { needsAudioRecovery = true; stop(); notify('试听被系统中断，请再次点击播放试听。', true); }
        }, 200);
      }
    } catch (e) { if (ticket === generation) { stop(); notify(e.message, true); } }
  };
  $('[data-save]').onclick = async () => {
    if (saving) return; saving = true; $('[data-save]').disabled = true;
    try {
      const saved = validateRhythm(draft);
      if (!await updateSound(soundId, sound => ({ ...sound, rhythm: saved }))) throw new Error('这份声音已被删除。');
      dirty = JSON.stringify(saved) !== JSON.stringify(draft); $('[data-status]').textContent = dirty ? '已保存先前的节奏；刚才的修改尚未保存。' : '节奏已保存在这份声音中。到“我的课堂”提交节奏申请。'; await onSaved();
    } catch (e) { notify(e.message, true); } finally { saving = false; $('[data-save]').disabled = false; }
  };
  function orientationChanged() {
    fitViewport();
    const landscape = matchMedia('(orientation: landscape)').matches;
    content.hidden = !landscape; content.inert = !landscape; rotate.hidden = landscape;
    if (!landscape) { clearWater(); stop(); if (gesture) { draft.steps = gesture.original; gesture = null; if (draft) draw(); } } else if (dialog.open) queueWater();
  }
  window.addEventListener('resize', orientationChanged);
  matchMedia('(orientation: landscape)').addEventListener('change', orientationChanged);
  function fitViewport() {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    dialog.style.setProperty('--rhythm-viewport-height', `${height}px`);
    dialog.style.setProperty('--rhythm-viewport-top', `${viewport?.offsetTop || 0}px`);
    dialog.classList.toggle('rhythm-compact', height < 280);
    dialog.classList.toggle('rhythm-tight', height < 190);
  }
  window.visualViewport?.addEventListener('resize', fitViewport);
  window.visualViewport?.addEventListener('scroll', fitViewport);
  function close() { if (saving) return; if (dirty && !confirm('节奏尚未保存，放弃本次修改？')) return; release(); clearWater(); dialog.close(); onClosed?.(); }
  $('[data-close]').onclick = close; dialog.oncancel = event => { event.preventDefault(); close(); }; dialog.onclose = () => { release(); clearWater(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('freeimpro-background', stop); window.addEventListener('pagehide', stop);
  return { edit(sound) { stopPlayback(); release(); soundId = sound.id; draft = sound.rhythm ? validateRhythm(sound.rhythm) : { bars: 1, steps: Array(16).fill(false) }; page = 0; dirty = false; $('[data-name]').textContent = sound.name; $('[data-status]').textContent = '原声播放：时值较长时后面留空，较短时只播放开头；保存后到“我的”提交。'; draw(); dialog.showModal(); orientationChanged(); } };
}
