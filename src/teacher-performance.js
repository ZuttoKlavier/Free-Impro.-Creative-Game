import { apiBase } from './client-role.js';
import { Sequencer } from './sequencer.js';
import './teacher-performance.css';

export function performanceMarkup(room, escape) {
  const environment = ({ 教室: 'classroom', 厨房: 'kitchen', 操场: 'playground' })[room.background];
  return `<section class="teacher-performance" aria-labelledby="performance-title">
    <div class="teacher-section-title"><div><span class="section-kicker">合奏 / 让大家一起发声</span><h3 id="performance-title">${escape(room.background)}声音舞台</h3></div><button id="performance-fullscreen" class="secondary">全屏舞台</button></div>
    <div class="performance-stage teacher-scene ${environment}" aria-label="正在演奏的角色"><div class="scene-decoration" aria-hidden="true"></div><div class="performance-characters"></div><p class="performance-empty">选择声音伙伴，再点击播放</p></div>
    <div class="performance-progress" data-loop-state="stopped">
      <div class="loop-dial" aria-hidden="true"><svg viewBox="0 0 80 80"><circle class="loop-dial-track" cx="40" cy="40" r="34"/><circle class="loop-dial-fill" cx="40" cy="40" r="34" pathLength="100"/></svg><div><strong id="loop-number">—</strong><span>循环</span></div></div>
      <div class="loop-timeline"><div class="loop-heading"><span id="loop-position">已停止 · 从第 1 小节开始</span><span id="loop-countdown">等待播放</span></div>
        <progress id="loop-progress" max="1" value="0" aria-label="完整 loop 播放进度"></progress>
        <div id="loop-bars" class="loop-bars" aria-label="完整 loop 的小节进度"></div>
        <div class="loop-footer"><div class="loop-beats" aria-hidden="true">${[1, 2, 3, 4].map(beat => `<span data-loop-beat="${beat}">${beat}</span>`).join('')}</div><span id="loop-joining">加入将在下一遍起点生效</span></div>
      </div>
      <div class="mix-summary"><strong id="mix-count">0</strong><span id="mix-label">个已选声部</span><small id="mix-waiting">同一起点 · 一起循环</small></div>
    </div>
    <div class="performance-controls"><div class="transport"><button id="performance-play" class="primary">▶ 播放</button><button id="performance-stop" class="secondary">■ 停止</button></div><div class="tempo-control"><label for="performance-bpm">速度 BPM</label><div><button id="bpm-minus" aria-label="降低速度">−</button><input id="performance-bpm" type="number" min="40" max="240" value="100"><button id="bpm-plus" aria-label="提高速度">＋</button></div><input id="performance-tempo" aria-label="速度滑块" type="range" min="40" max="240" value="100"></div><label class="performance-slider">Swing <output id="swing-value">0%</output><input id="performance-swing" type="range" min="0" max="50" value="0"></label><label class="performance-slider">总音量 <output id="volume-value">80%</output><input id="performance-volume" type="range" min="0" max="100" value="80"></label></div>
    <p id="performance-message" role="status" class="muted"></p><p id="performance-network" role="status" class="inline-error"></p>
    <div class="performance-layer-heading"><div><strong>声音叠加</strong><span>每个伙伴一层声音 · 发声时亮起</span></div><div><button id="performance-add-all" class="secondary">全部加入</button><button id="performance-remove-all" class="secondary">全部退出</button></div></div>
    <div class="performance-roster" aria-label="选择参与演奏的学生"></div>
    <p class="performance-rule">一遍覆盖全部小节，持续循环直到停止。格子与声音更换下一遍生效，小节数在两遍边界生效。停止会应用待生效修改，并保留已选伙伴。</p>
  </section>`;
}

export function createTeacherPerformance({ root, room: initialRoom, api, escape, notify, receive, settled, canPlay }) {
  let room = initialRoom, disposed = false, starting = false, savingPosition = false, drag = null, bound = null;
  let revision = -1, rendered = '', lastStep = '', meterBars = 0, meterBeat = '', publishTimer = null, publishing = false, publishAgain = false, blocked = false, owned = false;
  let joiningAll = false, groupGeneration = 0;
  const clientId = crypto.randomUUID(), buffers = new Map(), records = new Map(), loading = new Map(), intents = new Map(), appliedPatterns = new Map();
  const $ = selector => bound?.querySelector(selector);
  const engine = new Sequencer({
    onChange: () => { paint(); if (!starting) queuePublish(); },
    onBoundary: () => queuePublish(),
    onTick: state => tick(state),
    onTrigger: ({ id }) => {
      const avatar = $(`[data-performer="${id}"] .performer-art`);
      const signal = $(`[data-performance-member="${id}"] .layer-signal`);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (const element of [avatar, signal]) element?.getAnimations().forEach(animation => animation.cancel());
        avatar?.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-12px) scale(1.1)' }, { transform: 'translateY(0) scale(1)' }], { duration: 180 });
        signal?.animate([{ opacity: .35, transform: 'scaleY(.35)' }, { opacity: 1, transform: 'scaleY(1)' }, { opacity: .35, transform: 'scaleY(.35)' }], { duration: 180 });
      }
    },
  });
  const members = () => room.members.filter(m => m.admitted && room.submissions.some(s => s.student_id === m.student_id && s.status === 'current')).sort((a, b) => a.slot - b.slot);
  const current = id => room.submissions.find(s => s.student_id === id && s.status === 'current');
  const accepted = id => room.submissions.find(s => s.student_id === id && s.status === 'accepted');
  const pending = id => room.submissions.find(s => s.student_id === id && s.status === 'pending');
  const pattern = id => room.arrangement?.tracks.find(t => t.studentId === id)?.steps || Array((room.arrangement?.bars || 1) * 16).fill(false);
  const stateTrack = id => engine.getState().tracks.find(t => t.id === id);
  const position = id => room.layout.find(p => p.slot === room.members.find(m => m.student_id === id)?.slot) || { x: .5, y: .5 };

  async function buffer(item) {
    if (!buffers.has(item.id)) {
      buffers.set(item.id, (async () => {
        const context = await engine.ready();
        const response = await fetch(`${apiBase}/submissions/${item.id}/audio`, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('声音载入失败，请刷新课堂后重试。');
        return context.decodeAudioData(await response.arrayBuffer());
      })().catch(error => { buffers.delete(item.id); throw error; }));
    }
    return buffers.get(item.id);
  }
  async function loadTrack(id) {
    if (loading.has(id)) return loading.get(id);
    const task = (async () => {
      const original = current(id); if (!original) return;
      if (!stateTrack(id)) {
        const sound = await buffer(original); if (disposed) return;
        engine.upsertTrack({ id, submissionId: original.id, buffer: sound, pattern: pattern(id), position: position(id) });
        engine.setPattern(id, pattern(id)); appliedPatterns.set(id, JSON.stringify(pattern(id)));
      }
      const replacement = accepted(id) || current(id), before = stateTrack(id);
      if (replacement && replacement.id !== before.submissionId && replacement.id !== before.pendingSubmissionId) {
        const sound = await buffer(replacement); if (disposed) return;
        if ((accepted(id) || current(id))?.id === replacement.id) engine.replaceTrack(id, { submissionId: replacement.id, buffer: sound });
      }
    })();
    loading.set(id, task); paint();
    try { await task; }
    finally { loading.delete(id); paint(); }
  }
  async function toggle(id) {
    const track = stateTrack(id);
    if (track?.active || track?.waiting || intents.get(id)) {
      intents.set(id, false); if (track) engine.setActive(id, false); paint(); return;
    }
    intents.set(id, true); paint();
    try { await loadTrack(id); if (!disposed && intents.get(id)) engine.setActive(id, true); }
    catch (error) { intents.set(id, false); notify(error.message, true); paint(); }
  }
  async function joinAll() {
    if (joiningAll || disposed) return;
    const ids = members().map(m => m.student_id).filter(id => !stateTrack(id)?.active && !stateTrack(id)?.waiting && !intents.get(id));
    if (!ids.length) return;
    const generation = ++groupGeneration, ready = [], failed = [];
    joiningAll = true;
    ids.forEach(id => intents.set(id, true)); paint();
    // Bound downloads/decodes on tablets and large classrooms. Commit the group
    // only after preparation, rather than letting each download choose a loop.
    const queue = [...ids];
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (queue.length && !disposed && generation === groupGeneration) {
        const id = queue.shift();
        if (!intents.get(id)) continue;
        try { await loadTrack(id); ready.push(id); }
        catch { failed.push(id); intents.set(id, false); }
      }
    }));
    if (disposed || generation !== groupGeneration) return;
    const admitted = new Set(members().map(m => m.student_id));
    engine.setActiveMany(ready.filter(id => intents.get(id) && admitted.has(id)), true);
    joiningAll = false;
    if (failed.length) notify(`${failed.length} 个声音载入失败，其余已准备好；可以单独重试。`, true);
    paint();
  }
  function removeAll() {
    ++groupGeneration; joiningAll = false;
    for (const [id] of intents) intents.set(id, false);
    engine.setActiveMany(engine.getState().tracks.map(t => t.id), false); paint();
  }
  function sync(nextRoom) {
    room = nextRoom;
    for (const item of room.submissions) records.set(item.id, item);
    if (revision !== room.arrangement?.revision) {
      revision = room.arrangement?.revision ?? 0; engine.setBars(room.arrangement?.bars || 1);
      for (const track of engine.getState().tracks) {
        const next = pattern(track.id), json = JSON.stringify(next);
        if (appliedPatterns.get(track.id) !== json) { engine.setPattern(track.id, next); appliedPatterns.set(track.id, json); }
      }
    }
    for (const member of members()) {
      const track = stateTrack(member.student_id), p = position(member.student_id);
      if (track && (track.position.x !== p.x || track.position.y !== p.y)) engine.setPosition(track.id, p);
      const desired = accepted(member.student_id) || current(member.student_id);
      if ((track && desired.id !== track.submissionId && desired.id !== track.pendingSubmissionId) || (!track && accepted(member.student_id) && (!room.performance?.playing || owned))) loadTrack(member.student_id).catch(error => notify(error.message, true));
    }
    paint();
  }
  function queuePublish() {
    if (disposed || blocked) return;
    clearTimeout(publishTimer); publishTimer = setTimeout(publish, 70);
  }
  async function publish() {
    if (disposed || blocked) return;
    if (publishing) { publishAgain = true; return; }
    publishing = true;
    try {
      const state = engine.getState();
      const submissionIds = state.tracks.filter(t => room.submissions.some(s => s.id === t.submissionId && s.status === 'accepted')).map(t => t.submissionId);
      if (!owned && !state.playing && !submissionIds.length) return;
      if (submissionIds.length) {
        const result = await api(`/classrooms/${room.id}/activate`, { clientId, submissionIds });
        if (!disposed) { room = { ...room, submissions: result.classroom.submissions }; receive(result.classroom); }
      }
      if (owned || state.playing) {
        const result = await api(`/classrooms/${room.id}/performance`, { clientId, playing: state.playing, activeStudentIds: state.playing ? state.tracks.filter(t => t.active).map(t => t.id) : [] });
        if (!disposed) { receive(result.classroom); if ($('#performance-network')) $('#performance-network').textContent = ''; }
      }
    } catch (error) {
      if (disposed) return;
      if (error.status === 409) { blocked = true; engine.stop(); notify(error.message, true); }
      if ($('#performance-network')) $('#performance-network').textContent = error.status === 409 ? error.message : '课堂状态暂未同步，已载入的声音可继续演奏，正在等待连接恢复。';
    } finally { publishing = false; if (publishAgain) { publishAgain = false; queuePublish(); } }
  }
  async function play() {
    if (starting || engine.getState().playing || !canPlay()) return;
    starting = true; blocked = false; paint();
    try {
      await engine.ready();
      await engine.context.resume();
      root.querySelectorAll('audio').forEach(audio => audio.pause());
      await Promise.all([...loading.values()]);
      const selected = engine.getState().tracks.filter(t => t.active);
      if (!selected.length) throw new Error('先选择至少一位声音伙伴参与演奏。');
      await api(`/classrooms/${room.id}/performance`, { clientId, playing: true, activeStudentIds: selected.map(t => t.id) });
      owned = true;
      if (disposed || !starting) {
        await api(`/classrooms/${room.id}/performance`, { clientId, playing: false, activeStudentIds: [] });
        return;
      }
      await engine.play();
    } catch (error) { notify(error.message, true); }
    finally { starting = false; paint(); queuePublish(); }
  }
  function stop() { starting = false; ++groupGeneration; joiningAll = false; engine.stop(); for (const [id] of intents) intents.set(id, !!stateTrack(id)?.active); paint(); }
  function paint() {
    if (!bound?.isConnected || disposed) return;
    const state = engine.getState();
    $('.performance-stage').classList.toggle('many-performers', state.tracks.filter(t => t.active).length > 25);
    $('#performance-play').disabled = state.playing || starting || joiningAll;
    $('#performance-play').textContent = starting ? '正在准备…' : '▶ 播放';
    $('#performance-stop').disabled = !state.playing && !starting;
    $('#performance-add-all').disabled = joiningAll || !members().some(m => !stateTrack(m.student_id)?.active && !stateTrack(m.student_id)?.waiting && !intents.get(m.student_id));
    $('#performance-add-all').textContent = joiningAll ? '正在准备声音…' : '全部加入';
    $('#performance-remove-all').disabled = !state.tracks.some(t => t.active || t.waiting) && ![...intents.values()].some(Boolean);
    for (const [selector, value] of [['#performance-bpm', state.bpm], ['#performance-tempo', state.bpm], ['#performance-swing', Math.round(state.swing * 100)], ['#performance-volume', Math.round(state.volume * 100)]]) {
      if ($(selector) !== document.activeElement) $(selector).value = value;
    }
    $('#swing-value').textContent = Math.round(state.swing * 100) + '%'; $('#volume-value').textContent = Math.round(state.volume * 100) + '%';
    $('#performance-message').textContent = state.pendingBars !== null ? `当前每遍 ${state.bars} 小节；两遍循环结束后改为 ${state.pendingBars} 小节。` : state.tracks.some(t => t.pendingPattern || t.pendingSubmissionId) ? '节奏或声音已更新，下一遍 loop 起点生效。' : state.playing ? '正在连续循环 · 可以随时调节速度、Swing 和音量' : '选好伙伴后开始；格子中点亮的位置会触发对应声音。';
    const signature = JSON.stringify([members().map(m => [m.student_id, m.name, current(m.student_id)?.name, current(m.student_id)?.id, pending(m.student_id)?.id]), state.playing, state.tracks.map(t => [t.id, t.active, t.waiting, t.submissionId, t.position]), [...loading.keys()], [...intents]]);
    if (signature !== rendered && !drag) {
      rendered = signature;
      const focus = document.activeElement?.dataset?.performToggle;
      $('.performance-roster').innerHTML = members().map(member => {
        const track = state.tracks.find(t => t.id === member.student_id), joining = track?.waiting, active = track?.active;
        const label = joining ? '取消等待' : active ? (state.playing ? '立即退出' : '取消选择') : intents.get(member.student_id) ? '取消载入' : (state.playing ? '下一遍加入' : '选择参与');
        const replacement = pending(member.student_id);
        return `<div class="performance-member ${active ? 'is-layer-active' : joining ? 'is-layer-waiting' : ''}" data-performance-member="${escape(member.student_id)}"><div class="performance-member-main"><div class="layer-symbol"><span class="member-place">${member.slot}</span><span class="layer-signal" aria-hidden="true"><i></i><i></i><i></i></span></div><div><strong>${escape(member.name)}</strong><small>${joining ? '等待下一遍' : active ? (state.playing ? '正在演奏' : '已选首轮') : loading.has(member.student_id) ? '载入声音…' : '等待区'}</small><span class="performance-sound">${escape(records.get(track?.submissionId)?.name || current(member.student_id)?.name || '')}</span></div><button class="${active || joining ? 'primary' : 'secondary'}" data-perform-toggle="${escape(member.student_id)}" aria-pressed="${!!(active || joining || intents.get(member.student_id))}">${label}</button><label>音量 <input data-track-volume="${escape(member.student_id)}" aria-label="${escape(member.name)}的音量" type="range" min="0" max="100" value="${Math.round((track?.volume ?? 1) * 100)}" ${!track ? 'disabled' : ''}></label></div>${replacement ? `<div class="performance-replacement"><span>申请更换：${escape(replacement.name)}</span><button data-performance-decision="accept" data-submission="${escape(replacement.id)}" class="text-button">接受更换</button><button data-performance-decision="reject" data-submission="${escape(replacement.id)}" class="text-button">保留原声音</button></div>` : ''}</div>`;
      }).join('') || '<p class="muted">收到学生作品后，可在这里选择演奏伙伴。</p>';
      $('.performance-characters').innerHTML = state.playing ? state.tracks.filter(t => t.active).map(track => {
        const member = room.members.find(m => m.student_id === track.id), sound = records.get(track.submissionId);
        return `<button class="performer" data-performer="${escape(track.id)}" style="left:${track.position.x * 100}%;top:${track.position.y * 100}%" aria-label="拖动${escape(member?.name)}的位置"><span class="performer-art">${sound?.has_image ? `<img src="${apiBase}/submissions/${escape(sound.id)}/image" alt="${sound.image_kind === 'avatar' ? '动漫形象' : '照片草稿'}">` : '<span aria-hidden="true">♫</span>'}</span><span class="performer-name">${escape(member?.name)}${sound?.image_kind === 'photo' ? ' · 照片' : ''}</span></button>`;
      }).join('') : '';
      $('.performance-empty').hidden = state.playing && state.tracks.some(t => t.active);
      $('.performance-empty').textContent = state.playing ? '正在循环，等待伙伴在下一遍加入' : '选择声音伙伴，再点击播放';
      for (const member of room.members) {
        const card = root.querySelector(`.teacher-waiting [data-member-slot="${member.slot}"]`);
        const track = state.tracks.find(t => t.id === member.student_id);
        if (card) { card.hidden = state.playing && !!track?.active; const label = card.querySelector('h3 .status-pill'); if (label && current(member.student_id)) label.textContent = track?.waiting ? '等待下一遍' : '等待演奏'; }
      }
      if (focus) $(`[data-perform-toggle="${focus}"]`)?.focus({ preventScroll: true });
    }
    tick(state);
  }
  function tick(state) {
    if (!bound?.isConnected) return;
    const meter = $('.performance-progress');
    meter.style.setProperty('--loop-progress', state.progress);
    meter.dataset.loopState = state.playing ? 'playing' : 'stopped';
    $('#loop-number').textContent = state.playing ? state.loop + 1 : '—';
    $('#loop-progress').value = state.progress;
    // Keep accessibility updates at musical positions; the native progress
    // element and SVG ring can still move smoothly at the audio clock's rate.
    $('#loop-position').textContent = state.playing ? `第 ${state.loop + 1} 遍 · 小节 ${Math.floor(state.step / 16) + 1} / ${state.bars} · 第 ${Math.floor(state.step % 16 / 4) + 1} 拍` : '已停止 · 从第 1 小节开始';
    const waiting = state.tracks.filter(t => t.waiting).length;
    const countdown = `${(Math.ceil(state.remaining * 10) / 10).toFixed(1)} 秒`;
    $('#loop-countdown').textContent = state.playing ? `距下一遍 ${countdown}` : '等待播放';
    $('#loop-joining').textContent = waiting ? `${waiting} 位等待下一遍加入 · ${countdown}` : '加入将在下一遍起点生效';
    meter.classList.toggle('has-waiting', waiting > 0);
    $('#mix-count').textContent = state.tracks.filter(t => t.active).length;
    $('#mix-label').textContent = state.playing ? '个声部叠加' : '个已选声部';
    $('#mix-waiting').textContent = waiting ? `＋${waiting} 个等待加入` : '同一起点 · 一起循环';
    if (meterBars !== state.bars) {
      meterBars = state.bars;
      $('#loop-bars').innerHTML = Array.from({ length: state.bars }, (_, bar) => `<span data-loop-bar="${bar}" aria-label="第 ${bar + 1} 小节">${bar + 1}</span>`).join('');
    }
    const bar = Math.floor(state.step / 16);
    for (const segment of $('#loop-bars').children) {
      const index = Number(segment.dataset.loopBar);
      segment.classList.toggle('is-complete', state.playing && index < bar);
      segment.classList.toggle('is-current', state.playing && index === bar);
      segment.style.setProperty('--bar-progress', state.playing ? index < bar ? 1 : index === bar ? state.barProgress : 0 : 0);
    }
    const beat = Math.floor(state.step % 16 / 4) + 1, beatKey = `${state.playing}:${beat}`;
    if (meterBeat !== beatKey) {
      meterBeat = beatKey;
      for (const dot of $('.loop-beats').children) dot.classList.toggle('is-current', state.playing && Number(dot.dataset.loopBeat) === beat);
    }
    const stepKey = `${state.playing}:${state.step}:${root.querySelector('[data-rhythm-bar][aria-pressed="true"]')?.dataset.rhythmBar}`;
    if (stepKey !== lastStep) {
      lastStep = stepKey;
      root.querySelectorAll('.rhythm-step.is-playing').forEach(element => element.classList.remove('is-playing'));
      if (state.playing) root.querySelectorAll(`.rhythm-step[data-step="${state.step}"]`).forEach(element => element.classList.add('is-playing'));
    }
    for (const track of state.tracks) {
      const row = root.querySelector(`.rhythm-track[data-student-id="${track.id}"]`);
      row?.classList.toggle('pending-rhythm', !!track.pendingPattern);
    }
  }
  function attach() {
    bound = root.querySelector('.teacher-performance'); rendered = ''; lastStep = ''; meterBars = 0; meterBeat = '';
    $('#performance-play').onclick = play; $('#performance-stop').onclick = stop;
    $('#performance-add-all').onclick = joinAll; $('#performance-remove-all').onclick = removeAll;
    $('#performance-tempo').oninput = event => engine.setBpm(event.target.value);
    $('#performance-bpm').onchange = event => { engine.setBpm(event.target.value); event.target.value = engine.getState().bpm; };
    $('#bpm-minus').onclick = () => engine.setBpm(engine.getState().bpm - 1);
    $('#bpm-plus').onclick = () => engine.setBpm(engine.getState().bpm + 1);
    $('#performance-swing').oninput = event => engine.setSwing(event.target.value / 100);
    $('#performance-volume').oninput = event => engine.setVolume(event.target.value / 100);
    $('.performance-roster').onclick = async event => {
      const button = event.target.closest('[data-perform-toggle]'); if (button) { toggle(button.dataset.performToggle); return; }
      const decision = event.target.closest('[data-performance-decision]'); if (!decision) return;
      decision.disabled = true;
      try {
        const result = await api(`/submissions/${decision.dataset.submission}/${decision.dataset.performanceDecision}`, { clientId, defer: engine.getState().playing });
        receive(result.classroom); sync(result.classroom); settled();
      } catch (error) { notify(error.message, true); decision.disabled = false; }
    };
    $('.performance-roster').oninput = event => { if (event.target.matches('[data-track-volume]')) engine.setTrackVolume(event.target.dataset.trackVolume, event.target.value / 100); };
    $('#performance-fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await bound.requestFullscreen(); } catch { notify('当前浏览器暂不支持全屏，请使用浏览器全屏模式。', true); } };
    const stage = $('.performance-stage');
    stage.onpointerdown = event => {
      const avatar = event.target.closest('.performer'); if (!avatar || savingPosition || !event.isPrimary || event.button !== 0) return;
      event.preventDefault(); avatar.focus(); stage.setPointerCapture(event.pointerId);
      const previous = stateTrack(avatar.dataset.performer).position;
      drag = { id: event.pointerId, studentId: avatar.dataset.performer, avatar, x: event.clientX, y: event.clientY, previous, position: previous };
    };
    stage.onpointermove = event => {
      if (!drag || drag.id !== event.pointerId) return;
      const bounds = stage.getBoundingClientRect(), clamp = n => Math.min(.95, Math.max(.05, n));
      drag.position = { x: clamp(drag.previous.x + (event.clientX - drag.x) / bounds.width), y: clamp(drag.previous.y + (event.clientY - drag.y) / bounds.height) };
      drag.avatar.style.left = drag.position.x * 100 + '%'; drag.avatar.style.top = drag.position.y * 100 + '%';
    };
    const finish = async (event, cancel = false) => {
      if (!drag || drag.id !== event.pointerId) return;
      const ended = drag; drag = null;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      if (!cancel) {
        savingPosition = true;
        try {
          const result = await api(`/classrooms/${room.id}/layout`, { slot: room.members.find(m => m.student_id === ended.studentId).slot, ...ended.position });
          room = { ...room, layout: result.classroom.layout }; engine.setPosition(ended.studentId, ended.position); receive(result.classroom, true);
        } catch (error) { notify(error.message, true); }
        finally { savingPosition = false; }
      }
      rendered = ''; paint(); settled();
    };
    stage.onpointerup = event => finish(event); stage.onpointercancel = event => finish(event, true); stage.onlostpointercapture = event => finish(event, true);
    stage.onkeydown = async event => {
      const avatar = event.target.closest('.performer'), delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] })[event.key];
      if (!avatar || !delta || savingPosition) return;
      event.preventDefault(); savingPosition = true; const id = avatar.dataset.performer, previous = stateTrack(id).position, amount = event.shiftKey ? .05 : .01;
      const p = { x: Math.min(.95, Math.max(.05, previous.x + delta[0] * amount)), y: Math.min(.95, Math.max(.05, previous.y + delta[1] * amount)) };
      try { const result = await api(`/classrooms/${room.id}/layout`, { slot: room.members.find(m => m.student_id === id).slot, ...p }); room = { ...room, layout: result.classroom.layout }; engine.setPosition(id, p); receive(result.classroom, true); }
      catch (error) { notify(error.message, true); }
      finally { savingPosition = false; rendered = ''; paint(); settled(); $(`[data-performer="${id}"]`)?.focus({ preventScroll: true }); }
    };
    paint();
  }
  const fullscreenChange = () => { if ($('#performance-fullscreen')) $('#performance-fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏舞台'; if (!document.fullscreenElement) settled(); };
  document.addEventListener('fullscreenchange', fullscreenChange);
  const pageHide = () => {
    const release = owned || starting; stop();
    if (release) fetch(`${apiBase}/classrooms/${room.id}/performance`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, playing: false, activeStudentIds: [] }) }).catch(() => {});
  };
  window.addEventListener('pagehide', pageHide);
  window.addEventListener('freeimpro-teacher-background', pageHide);
  const heartbeat = setInterval(() => { if (engine.getState().playing || room.submissions.some(s => s.status === 'accepted')) queuePublish(); }, 5000);
  sync(room);
  return {
    roomId: room.id, clientId, sync, attach, stop,
    get playing() { return engine.getState().playing; },
    get editingPosition() { return !!drag || savingPosition; },
    get busy() { return !!drag || savingPosition || !!document.fullscreenElement; },
    dispose() { if (disposed) return; const release = owned || starting || engine.getState().playing; disposed = true; engine.dispose(); clearTimeout(publishTimer); clearInterval(heartbeat); document.removeEventListener('fullscreenchange', fullscreenChange); window.removeEventListener('pagehide', pageHide); window.removeEventListener('freeimpro-teacher-background', pageHide); if (release) api(`/classrooms/${room.id}/performance`, { clientId, playing: false, activeStudentIds: [] }).catch(() => {}); },
  };
}
