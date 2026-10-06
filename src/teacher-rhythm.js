import './teacher-rhythm.css';

const STEPS = 16;
const colours = ['#337968', '#b57634', '#8063a8', '#397d96', '#b46069', '#648341'];
const emptyArrangement = () => ({ bars: 1, revision: 0, tracks: [] });

function tracksFor(room, arrangement) {
  return room.members.filter(m => m.admitted).sort((a, b) => a.slot - b.slot).flatMap(member => {
    const sound = room.submissions.find(s => s.student_id === member.student_id && s.status === 'current');
    if (!sound) return [];
    const saved = arrangement.tracks.find(t => t.studentId === member.student_id);
    return [{ ...member, sound, steps: saved?.steps.slice() || Array(arrangement.bars * STEPS).fill(false) }];
  });
}

export function rhythmMarkup(room, escape, view) {
  const arrangement = room.arrangement || emptyArrangement();
  view.bar = Math.min(view.bar || 0, arrangement.bars - 1);
  return `<section class="rhythm-editor" aria-labelledby="rhythm-title">
    <div class="rhythm-heading"><div><span class="section-kicker">03 / 编排节奏</span><h3 id="rhythm-title">让声音，排成节奏</h3><p class="muted">点亮一个格子，安排一次发声。每位学生有自己的声音轨道。</p></div><button id="rhythm-toggle" class="secondary" aria-expanded="${!view.collapsed}" aria-controls="rhythm-content">${view.collapsed ? '展开格子' : '收起格子'}</button></div>
    <div id="rhythm-content" ${view.collapsed ? 'hidden' : ''}>
      <div class="rhythm-toolbar"><div class="rhythm-meter"><strong>4/4</strong><span>每拍 4 格 · 每小节 16 格</span></div><label for="rhythm-bars">循环长度 <select id="rhythm-bars">${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}" ${arrangement.bars === i + 1 ? 'selected' : ''}>${i + 1} 小节</option>`).join('')}</select></label></div>
      <div class="rhythm-navigation"><span>编辑小节</span><div class="rhythm-bars" aria-label="选择编辑的小节"></div><span id="rhythm-bar-label"></span></div>
      <div class="rhythm-grid-scroll" role="region" aria-label="学生节奏轨道" tabindex="0"><div class="rhythm-grid"></div></div>
      <div class="rhythm-footnote"><p>点击切换 · 拖动连续涂写 · 方向键移动，空格切换</p><p>缩短循环会删除末尾小节；再次增加时为空白。</p></div>
    </div>
    <div class="rhythm-save"><span id="rhythm-status" role="status">编排已保存</span><button id="rhythm-retry" class="text-button" hidden>重试保存</button><button id="rhythm-reload" class="text-button" hidden>放弃未保存修改并重新载入</button></div>
    <p class="rhythm-stage-note">编排自动保存。播放时，左侧带金色标记的轨道将在下一遍应用修改；浅金色列表示当前播放位置。</p>
  </section>`;
}

export function bindRhythmEditor({ root, room, view, escape, save, begin, settled, reload, notify }) {
  const section = root.querySelector('.rhythm-editor');
  const $ = selector => section.querySelector(selector);
  const grid = $('.rhythm-grid'), scroller = $('.rhythm-grid-scroll'), barButtons = $('.rhythm-bars');
  const status = $('#rhythm-status'), retry = $('#rhythm-retry'), reloadButton = $('#rhythm-reload'), barSelect = $('#rhythm-bars');
  let arrangement = structuredClone(room.arrangement || emptyArrangement());
  const tracks = tracksFor(room, arrangement);
  let pending = new Map(), pendingBars = null, saving = false, failed = false, conflict = false, drag = null, timer = null, disposed = false;
  const busy = () => saving || pending.size > 0 || pendingBars !== null || !!drag;
  const nameFor = (track, step) => `${track.name} · 第 ${Math.floor(step / STEPS) + 1} 小节 · 第 ${step % STEPS + 1} 格`;
  const rowFor = id => [...grid.querySelectorAll('.rhythm-track')].find(row => row.dataset.studentId === id);
  function controls() {
    barSelect.disabled = busy();
    grid.querySelectorAll('button').forEach(button => { button.disabled = pendingBars !== null || (button.hasAttribute('data-copy-bar') && view.bar === arrangement.bars - 1); });
    retry.hidden = !failed; retry.disabled = saving || conflict;
    reloadButton.hidden = !failed; reloadButton.disabled = saving;
    section.classList.toggle('has-unsaved', failed);
  }
  function renderGrid() {
    barButtons.innerHTML = Array.from({ length: arrangement.bars }, (_, bar) => `<button data-rhythm-bar="${bar}" aria-label="编辑第 ${bar + 1} 小节" aria-pressed="${view.bar === bar}">${String(bar + 1).padStart(2, '0')}</button>`).join('');
    $('#rhythm-bar-label').textContent = `第 ${view.bar + 1} / ${arrangement.bars} 小节`;
    grid.innerHTML = tracks.length ? `<div class="rhythm-grid-header"><div>学生 / 声音 <span>${tracks.length} 条轨道</span></div><div class="rhythm-beats">${[1, 2, 3, 4].map(beat => `<span>第 ${beat} 拍</span>`).join('')}</div><div class="rhythm-step-numbers">${Array.from({ length: STEPS }, (_, i) => `<span>${i + 1}</span>`).join('')}</div><div class="rhythm-actions-label">本小节</div></div>${tracks.map(track => `<div class="rhythm-track" data-student-id="${escape(track.student_id)}" style="--track-colour:${colours[(track.slot - 1) % colours.length]}"><div class="rhythm-track-name"><span class="rhythm-track-number">${track.slot}</span><div><strong>${escape(track.name)}</strong><span>${escape(track.sound.name)}</span></div></div><div class="rhythm-steps" role="group" aria-label="${escape(track.name)}的节奏">${track.steps.slice(view.bar * STEPS, (view.bar + 1) * STEPS).map((on, i) => `<button class="rhythm-step${i % 4 === 0 ? ' beat-start' : ''}" data-step="${view.bar * STEPS + i}" aria-label="${escape(nameFor(track, view.bar * STEPS + i))}" aria-pressed="${on}" title="${escape(nameFor(track, view.bar * STEPS + i))}"><span aria-hidden="true"></span></button>`).join('')}</div><div class="rhythm-row-actions"><button class="text-button" data-copy-bar="${escape(track.student_id)}" aria-label="将${escape(track.name)}的本小节复制到下一小节" title="复制到下一小节">复制 →</button><button class="text-button" data-clear-bar="${escape(track.student_id)}" aria-label="清空${escape(track.name)}的本小节">清空</button></div></div>`).join('')}` : '<div class="rhythm-empty"><span aria-hidden="true">▥</span><h4>等待第一条声音轨道</h4><p>学生提交作品后，会自动出现在这里。每人一行，从空白节奏开始。</p></div>';
    for (const track of tracks) {
      const row = rowFor(track.student_id);
      for (let i = view.bar * STEPS; i < (view.bar + 1) * STEPS; i++) {
        const cell = row?.querySelector(`[data-step="${i}"]`);
        cell?.setAttribute('aria-pressed', String(Boolean(track.steps[i])));
        if (typeof track.steps[i] === 'number') {
          cell.title += ` · 持续 ${track.steps[i]} 个位置`;
          for (let j = i; j < i + track.steps[i]; j++) row?.querySelector(`[data-step="${j}"]`)?.classList.add('rhythm-held');
        }
      }
    }
    controls();
  }
  function updateStep(track, step, on) {
    for (let i = Math.floor(step / STEPS) * STEPS; i <= step; i++) if (typeof track.steps[i] === 'number' && i + track.steps[i] > step) {
      track.steps[i] = false;
      rowFor(track.student_id)?.querySelector(`[data-step="${i}"]`)?.setAttribute('aria-pressed', 'false');
    }
    rowFor(track.student_id)?.querySelectorAll('.rhythm-held').forEach(cell => cell.classList.remove('rhythm-held'));
    track.steps[step] = on;
    rowFor(track.student_id)?.querySelector(`[data-step="${step}"]`)?.setAttribute('aria-pressed', String(on));
  }
  function schedule(track) {
    begin(); pending.set(track.student_id, track.steps.slice());
    if (!failed) status.textContent = '有修改，正在保存…';
    clearTimeout(timer); timer = setTimeout(flush, 350); controls();
  }
  async function flush() {
    clearTimeout(timer);
    if (saving || drag || failed || disposed) return;
    saving = true; controls();
    try {
      while (pending.size || pendingBars !== null) {
        const entry = pending.entries().next().value;
        const update = entry ? { track: { studentId: entry[0], steps: entry[1] } } : { bars: pendingBars };
        if (entry) pending.delete(entry[0]);
        status.textContent = '正在保存编排…';
        try {
          const result = await save({ revision: arrangement.revision, ...update });
          if (disposed) return;
          arrangement.revision = result.revision;
          if (!entry) { arrangement = result; pendingBars = null; view.bar = Math.min(view.bar, result.bars - 1); }
        } catch (error) {
          if (entry && !pending.has(entry[0])) pending.set(entry[0], entry[1]);
          failed = true; conflict = error.status === 409;
          status.textContent = conflict ? '其他窗口已修改编排。此处修改尚未保存，请重新载入后编辑。' : '保存失败，修改仍保留在此页面，请重试保存。';
          notify(error.message || '编排保存失败，请重试。', true); break;
        }
      }
    } finally {
      saving = false;
      if (!disposed) {
        controls();
        if (!busy()) { status.textContent = '编排已保存'; settled(); }
      }
    }
  }
  renderGrid();
  scroller.scrollTop = view.scrollTop || 0; scroller.scrollLeft = view.scrollLeft || 0;
  scroller.onscroll = () => { view.scrollTop = scroller.scrollTop; view.scrollLeft = scroller.scrollLeft; };
  $('#rhythm-toggle').onclick = () => {
    view.collapsed = !view.collapsed; $('#rhythm-content').hidden = view.collapsed;
    $('#rhythm-toggle').textContent = view.collapsed ? '展开格子' : '收起格子';
    $('#rhythm-toggle').setAttribute('aria-expanded', String(!view.collapsed));
  };
  barButtons.onclick = event => {
    const button = event.target.closest('[data-rhythm-bar]'); if (!button || drag) return;
    view.bar = Number(button.dataset.rhythmBar); renderGrid();
    barButtons.querySelector(`[data-rhythm-bar="${view.bar}"]`).focus({ preventScroll: true });
  };
  barSelect.onchange = () => {
    const bars = Number(barSelect.value); if (bars === arrangement.bars) return;
    begin(); pendingBars = bars; failed = false; conflict = false; flush();
  };
  grid.onclick = event => {
    const step = event.target.closest('.rhythm-step');
    // Pointer interactions paint on pointerdown; keyboard/assistive clicks toggle here.
    if (step && event.detail === 0 && pendingBars === null) {
      const track = tracks.find(t => t.student_id === step.closest('.rhythm-track').dataset.studentId);
      const index = Number(step.dataset.step); updateStep(track, index, !track.steps[index]); schedule(track); return;
    }
    const clear = event.target.closest('[data-clear-bar]'), copy = event.target.closest('[data-copy-bar]');
    if ((!clear && !copy) || pendingBars !== null) return;
    const track = tracks.find(t => t.student_id === (clear?.dataset.clearBar || copy?.dataset.copyBar));
    const start = view.bar * STEPS;
    if (clear) for (let step = start; step < start + STEPS; step++) updateStep(track, step, false);
    else { if (view.bar === arrangement.bars - 1) return; track.steps.splice(start + STEPS, STEPS, ...track.steps.slice(start, start + STEPS)); }
    schedule(track);
  };
  grid.onpointerdown = event => {
    const button = event.target.closest('.rhythm-step');
    if (!button || button.disabled || drag || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); button.focus({ preventScroll: true });
    const track = tracks.find(t => t.student_id === button.closest('.rhythm-track').dataset.studentId);
    const step = Number(button.dataset.step);
    drag = { id: event.pointerId, track, on: !track.steps[step], last: step };
    grid.setPointerCapture(event.pointerId); updateStep(track, step, drag.on); schedule(track);
  };
  grid.onpointermove = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const button = document.elementFromPoint(event.clientX, event.clientY)?.closest('.rhythm-step');
    if (!button || button.closest('.rhythm-track')?.dataset.studentId !== drag.track.student_id) return;
    const step = Number(button.dataset.step);
    for (let index = Math.min(step, drag.last); index <= Math.max(step, drag.last); index++) updateStep(drag.track, index, drag.on);
    drag.last = step; schedule(drag.track);
  };
  const endDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    if (grid.hasPointerCapture(event.pointerId)) grid.releasePointerCapture(event.pointerId);
    controls(); if (!failed) { clearTimeout(timer); timer = setTimeout(flush, 150); }
  };
  grid.onpointerup = endDrag; grid.onpointercancel = endDrag; grid.onlostpointercapture = endDrag;
  grid.onkeydown = event => {
    const step = event.target.closest('.rhythm-step'); if (!step) return;
    let column = Number(step.dataset.step) % STEPS, row = tracks.findIndex(t => t.student_id === step.closest('.rhythm-track').dataset.studentId);
    if (event.key === 'ArrowLeft') column--;
    else if (event.key === 'ArrowRight') column++;
    else if (event.key === 'ArrowUp') row--;
    else if (event.key === 'ArrowDown') row++;
    else if (event.key === 'Home') column = 0;
    else if (event.key === 'End') column = STEPS - 1;
    else return;
    event.preventDefault();
    rowFor(tracks[Math.max(0, Math.min(tracks.length - 1, row))].student_id)?.querySelector(`[data-step="${view.bar * STEPS + Math.max(0, Math.min(STEPS - 1, column))}"]`)?.focus();
  };
  retry.onclick = () => { failed = false; conflict = false; flush(); };
  reloadButton.onclick = async () => {
    if (saving) return;
    try { await reload(); pending.clear(); pendingBars = null; failed = false; conflict = false; settled(); }
    catch (error) { notify(error.message, true); }
  };
  const beforeUnload = event => { if (busy()) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return {
    get busy() { return busy(); },
    captureFocus() {
      const element = document.activeElement;
      if (!section.contains(element)) return null;
      if (element.matches('.rhythm-step')) return `.rhythm-track[data-student-id="${element.closest('.rhythm-track').dataset.studentId}"] [data-step="${element.dataset.step}"]`;
      if (element.id) return '#' + element.id;
      for (const attr of ['data-rhythm-bar', 'data-clear-bar', 'data-copy-bar']) if (element.hasAttribute(attr)) return `[${attr}="${element.getAttribute(attr)}"]`;
      return null;
    },
    destroy() { disposed = true; clearTimeout(timer); window.removeEventListener('beforeunload', beforeUnload); },
  };
}
