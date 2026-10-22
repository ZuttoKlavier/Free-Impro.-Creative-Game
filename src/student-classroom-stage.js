import { apiBase } from './client-role.js';
import { classroomFetch, canUseClassroom } from './classroom-transport.js';
import { prepareAudioSession, resumeAudioContext } from './audio-session.js';
import { stepDuration, stepTime as rhythmStepTime } from './rhythm-timing.js';
import './student-classroom-stage.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const environment = background => ({ 教室: 'classroom', 厨房: 'kitchen', 操场: 'playground' })[background] || 'classroom';
export const studentStageMarkup = room => `<section class="student-classroom-stage" aria-label="教师同步舞台"><div class="student-stage-heading"><h3>${escape(room.background)}声音舞台</h3><button data-stage-audio class="secondary">开启课堂声音</button></div><div class="performance-stage teacher-scene ${environment(room.background)}"><div class="scene-decoration" aria-hidden="true"></div><div data-stage-characters class="performance-characters"></div><p data-stage-empty class="performance-empty">等待教师播放</p></div><progress data-stage-progress max="1" value="0" aria-label="教师播放进度"></progress><p data-stage-position role="status">正在连接教师舞台…</p></section>`;

// The server timestamp and request midpoint put both devices on the teacher's
// audible loop clock. Rejoining never restarts a loop at step zero.
function position(stage, receivedAt, time) {
  const state = stage.performance, timeline = state.timeline;
  if (!state.playing || !timeline) return null;
  const duration = timeline.bars * 240 / timeline.bpm;
  const elapsed = (time - receivedAt + state.serverNow - state.updatedAt) / 1000;
  const total = duration - timeline.remaining + elapsed;
  const loops = Math.floor(Math.max(0, total) / duration);
  return { phase: total < 0 ? total : total % duration, loop: timeline.loop + 1 + loops, duration };
}
const stepTime = (step, timeline) => rhythmStepTime(step, timeline.bpm, timeline.swing);

export function createStudentClassroomStage({ root, stopPlayback }) {
  let roomId = '', active = false, disposed = false, bound = null, snapshot = null, receivedAt = 0, lastResponse = 0;
  let pollTimer, audioTimer, frame, request = null, generation = 0, context, master, enabled = false, rendering = '', soundSignature = '', failed = false;
  const buffers = new Map(), pictures = new Map(), downloading = new Map(), scheduled = new Map(), voices = new Set();
  const $ = selector => bound?.querySelector(selector);
  function silence() {
    for (const voice of voices) { try { voice.stop(); } catch {} voice.disconnect(); }
    voices.clear(); scheduled.clear();
  }
  function clearMedia() {
    silence(); buffers.clear(); downloading.clear();
    for (const url of pictures.values()) URL.revokeObjectURL(url);
    pictures.clear();
  }
  async function ready() {
    const prepared = prepareAudioSession('playback');
    if (!context || context.state === 'closed') {
      context = new AudioContext(); master = context.createGain();
      if (context.createDynamicsCompressor) {
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .003; limiter.release.value = .12;
        master.connect(limiter); limiter.connect(context.destination);
      } else master.connect(context.destination);
    }
    await Promise.all([prepared, resumeAudioContext(context)]);
    return context;
  }
  async function media(track, kind, ticket) {
    const cache = kind === 'audio' ? buffers : pictures, key = `${kind}:${track.submissionId}`;
    if (cache.has(track.submissionId)) return;
    if (downloading.has(key)) return downloading.get(key);
    const selectedRoom = roomId;
    const task = (async () => {
      const response = await classroomFetch(`${apiBase}/classrooms/${selectedRoom}/stage/${track.submissionId}/${kind}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('舞台作品正在更新');
      const value = kind === 'audio' ? await context.decodeAudioData(await response.arrayBuffer()) : URL.createObjectURL(await response.blob());
      if (ticket !== generation || disposed || !active) { if (kind === 'image') URL.revokeObjectURL(value); return; }
      cache.set(track.submissionId, value); if (kind === 'image') { rendering = ''; paint(); }
    })();
    downloading.set(key, task);
    try { await task; } finally { if (downloading.get(key) === task) downloading.delete(key); }
  }
  async function preload(ticket) {
    const tracks = [...(snapshot?.performers || [])];
    await Promise.all(Array.from({ length: Math.min(2, tracks.length) }, async () => {
      while (tracks.length && ticket === generation && active) {
        const track = tracks.shift();
        await Promise.allSettled([...(track.hasImage ? [media(track, 'image', ticket)] : []), ...(enabled && context?.state === 'running' ? [media(track, 'audio', ticket)] : [])]);
      }
    }));
  }
  function schedule() {
    if (!active || !enabled || context?.state !== 'running' || failed || !snapshot || performance.now() - lastResponse > 4000) { silence(); return; }
    const now = performance.now(), cursor = position(snapshot, receivedAt, now);
    if (!cursor) { silence(); return; }
    const timeline = snapshot.performance.timeline;
    master.gain.value = timeline.volume;
    for (const track of snapshot.performers) {
      const buffer = buffers.get(track.submissionId); if (!buffer) continue;
      for (let nextLoop = 0; nextLoop < 2; nextLoop++) {
        for (let step = 0; step < track.pattern.length; step++) {
          if (!track.pattern[step]) continue;
          const onset = nextLoop * cursor.duration + stepTime(step, timeline) - cursor.phase;
          if (onset > .14) continue;
          const length = typeof track.pattern[step] === 'number' ? track.pattern[step] : 1;
          const duration = Math.min(buffer.duration, stepTime(step + length, timeline) - stepTime(step, timeline));
          if (onset + duration <= 0) continue;
          const key = `${cursor.loop + nextLoop}:${track.id}:${track.submissionId}:${step}`;
          if (scheduled.has(key)) continue;
          const source = context.createBufferSource(), gain = context.createGain();
          source.buffer = buffer; gain.gain.value = track.volume; source.connect(gain); gain.connect(master);
          voices.add(source); scheduled.set(key, cursor.loop + nextLoop);
          source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); };
          const offset = Math.max(0, -onset);
          source.start(context.currentTime + Math.max(0, onset), offset, duration - offset);
        }
      }
    }
    for (const [key, loop] of scheduled) if (loop < cursor.loop - 1) scheduled.delete(key);
  }
  function paint() {
    if (!bound?.isConnected || !active) return;
    const button = $('[data-stage-audio]');
    button.hidden = enabled && context?.state === 'running';
    if (!snapshot) { $('[data-stage-position]').textContent = failed ? '课堂连接中断，正在重新同步…' : '正在连接教师舞台…'; return; }
    const stage = snapshot, cursor = position(stage, receivedAt, performance.now()), timeline = stage.performance.timeline;
    bound.querySelector('h3').textContent = `${stage.background}声音舞台`;
    bound.querySelector('.performance-stage').className = `performance-stage teacher-scene ${environment(stage.background)}${stage.performers.length > 25 ? ' many-performers' : ''}`;
    const signature = JSON.stringify(stage.performers.map(track => [track.id, track.submissionId, track.name, track.position, pictures.get(track.submissionId)]));
    if (signature !== rendering) {
      rendering = signature;
      $('[data-stage-characters]').innerHTML = stage.performers.map(track => `<div class="performer student-stage-performer" data-student-performer="${escape(track.id)}" style="left:${track.position.x * 100}%;top:${track.position.y * 100}%"><span class="performer-art">${pictures.has(track.submissionId) ? `<img src="${pictures.get(track.submissionId)}" alt="${escape(track.soundName)}">` : '<span aria-hidden="true">♫</span>'}</span><span class="performer-name">${escape(track.name)}</span></div>`).join('');
    }
    $('[data-stage-empty]').hidden = !!cursor && stage.performers.length > 0;
    $('[data-stage-empty]').textContent = cursor ? '等待伙伴加入演奏' : '等待教师播放';
    let step = 0;
    if (cursor) while (step < timeline.bars * 16 - 1 && stepTime(step + 1, timeline) <= cursor.phase) step++;
    $('[data-stage-progress]').value = cursor ? Math.max(0, (step + (cursor.phase - stepTime(step, timeline)) / stepDuration(step, timeline.bpm, timeline.swing)) / (timeline.bars * 16)) : 0;
    $('[data-stage-position]').textContent = failed || performance.now() - lastResponse > 4000 ? '课堂连接中断，正在重新同步…' : cursor ? `第 ${cursor.loop} 遍 · 第 ${Math.floor(step / 16) + 1} / ${timeline.bars} 小节 · 第 ${Math.floor(step % 16 / 4) + 1} 拍` : '等待教师播放';
    for (const track of stage.performers) {
      const sounding = !!cursor && track.pattern.some((on, index) => {
        if (!on) return false;
        const start = stepTime(index, timeline), duration = Math.min(buffers.get(track.submissionId)?.duration ?? Infinity, stepTime(index + (typeof on === 'number' ? on : 1), timeline) - start);
        return cursor.phase >= start && cursor.phase < start + duration;
      });
      $(`[data-student-performer="${track.id}"]`)?.classList.toggle('is-sounding', sounding);
    }
  }
  async function poll() {
    if (!active || disposed || request || !canUseClassroom()) return;
    const ticket = generation, started = performance.now(), controller = request = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await classroomFetch(`${apiBase}/classrooms/${roomId}/stage`, { signal: controller.signal });
      if (!response.ok) throw new Error('无法同步教师舞台');
      const { stage } = await response.json();
      if (!active || ticket !== generation) return;
      const previous = snapshot && position(snapshot, receivedAt, performance.now());
      const nextReceived = (started + performance.now()) / 2;
      const next = position(stage, nextReceived, performance.now());
      const signature = JSON.stringify([stage.performance.playing, stage.performance.timeline && [stage.performance.timeline.bpm, stage.performance.timeline.swing, stage.performance.timeline.bars, stage.performance.timeline.volume], stage.performers.map(track => [track.id, track.submissionId, track.pattern, track.volume])]);
      if (soundSignature !== signature || (previous && next && (previous.loop !== next.loop || Math.abs(previous.phase - next.phase) > .08))) silence();
      soundSignature = signature; snapshot = stage; receivedAt = nextReceived; lastResponse = performance.now(); failed = false;
      const ids = new Set(stage.performers.map(track => track.submissionId));
      for (const [id, url] of pictures) if (!ids.has(id)) { URL.revokeObjectURL(url); pictures.delete(id); }
      for (const id of buffers.keys()) if (!ids.has(id)) buffers.delete(id);
      paint(); preload(ticket).catch(() => {}); schedule();
    } catch (error) {
      if (active && ticket === generation && error.name !== 'AbortError') { failed = true; silence(); paint(); }
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
      if (active && ticket === generation) pollTimer = setTimeout(poll, 600);
    }
  }
  function animate() { if (!active) return; paint(); frame = requestAnimationFrame(animate); }
  function suspend() {
    active = false; generation++; clearTimeout(pollTimer); clearInterval(audioTimer); cancelAnimationFrame(frame);
    request?.abort(); request = null; silence();
  }
  function sync(room, visible) {
    const switched = roomId !== room.id;
    if (switched) { suspend(); clearMedia(); snapshot = null; soundSignature = ''; roomId = room.id; }
    bound = root.querySelector('.student-classroom-stage'); rendering = '';
    if (bound) $('[data-stage-audio]').onclick = async () => {
      const selected = roomId;
      try { stopPlayback(); await ready(); if (!active || selected !== roomId) return; enabled = true; await preload(generation); schedule(); paint(); }
      catch { if (bound?.isConnected) $('[data-stage-position]').textContent = '请再次点击开启课堂声音。'; }
    };
    if (!visible || document.hidden) { if (active) suspend(); return; }
    if (!active) { active = true; generation++; audioTimer = setInterval(schedule, 25); poll(); animate(); }
    paint();
  }
  return { sync, suspend, dispose() { suspend(); disposed = true; clearMedia(); context?.close().catch(() => {}); } };
}
