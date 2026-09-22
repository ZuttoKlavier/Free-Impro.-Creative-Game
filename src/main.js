import './style.css';
import { detectSlices, mono, trimSamples, encodeWav, demoAudio, MAX_RECORDING } from './audio.js';
import { listSounds, saveSounds, deleteSound, LIMIT } from './storage.js';

const icons = {
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3m-4 0h8"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  wave: '<path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', down: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  up: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.wave}</svg>`;
document.querySelector('#app').innerHTML = `
<header><a class="brand" href="#"><span class="brand-icon">${icon('wave')}</span><span>Free Impro<small>让每个声音，自由生长</small></span></a><div class="header-right"><span class="local-dot"></span>声音保存在这台设备<span class="student-tag">学生端</span></div></header>
<main>
  <section class="intro"><div><div class="eyebrow">SOUND EXPLORER / 声音实验室</div><h1>把身边的声音，<br class="mobile-break">变成你的音乐。</h1><p>敲一敲、听一听。发现一个声音，收藏一份灵感。</p></div><div class="intro-art" aria-hidden="true"><span>♪</span><i></i><b>♫</b><em>✦</em></div></section>
  <nav class="tabs" aria-label="主要功能"><button id="studio-tab" class="tab active" aria-selected="true">${icon('mic')}采集声音</button><button id="library-tab" class="tab" aria-selected="false">${icon('wave')}我的声音库 <span id="library-count">0</span></button></nav>
  <section id="studio-view">
    <div class="steps"><span class="current"><b>1</b>录一段声音</span><i></i><span id="step2"><b>2</b>挑选与裁切</span><i></i><span id="step3"><b>3</b>存入声音库</span></div>
    <div class="studio-grid">
      <section class="panel record-panel"><div class="panel-top"><span class="section-kicker">01 / 采集</span><span class="pill">最长 15 秒</span></div><h2>今天，发现了什么声音？</h2><p class="muted">试试敲杯子、拍手，或轻轻弹一下桌面。</p>
        <div class="record-space"><div id="meter" class="meter" aria-hidden="true">${Array.from({ length: 33 }, (_, i) => `<i style="--height:${8 + Math.sin(i * 1.4) ** 2 * 25}px"></i>`).join('')}</div><div id="record-time">00:00<span> / 00:15</span></div><button id="record" class="record-button">${icon('mic')}<span>开始录音</span></button><p id="record-status" role="status">点击后允许使用麦克风</p></div>
        <div class="capture-options"><button id="import-audio" class="text-button">${icon('up')}导入音频</button><span></span><button id="demo" class="text-button">${icon('play')}试试示例声音</button></div>
        <div class="tip"><span>✦</span><p><strong>给声音留一点空隙</strong><br>每次敲击之间稍作停顿，更容易分出独立声音。</p></div>
      </section>
      <section class="panel edit-panel"><div class="panel-top"><span class="section-kicker">02 / 挑选与编辑</span><span class="pill teal">单个声音 ≤ 1 秒</span></div><h2>留下最喜欢的那一声</h2><p class="muted">自动切出声音片段，选择后还可以调整起止位置。</p>
        <div id="editor-empty" class="empty-editor"><div class="empty-wave">${icon('wave')}</div><h3>你的声音，即将出现在这里</h3><p>先录一段声音，或用示例探索一下。</p><span>录音 → 自动切片 → 试听 → 保存</span></div>
        <div id="editor" hidden><div class="source-info"><span id="source-label"></span><button id="play-original" class="text-button">${icon('play')}整段试听</button></div><canvas id="waveform" aria-label="原始录音波形及选中范围" aria-describedby="waveform-help"></canvas><p id="waveform-help" class="waveform-help">在波形上拖动框选 · 拖动选区移动 · 拖动两端裁切（最长 1 秒）</p><div class="axis"><span>0s</span><span id="source-duration"></span></div>
          <div class="slice-heading"><strong id="slice-count"></strong><button id="manual" class="text-button">${icon('plus')}手动选片</button></div><div id="slices" class="slices"></div>
          <div class="sensitivity"><label for="sensitivity">切分灵敏度</label><input id="sensitivity" type="range" min="0" max="100" value="50"><button id="reslice" class="small-button">重新切分</button></div>
          <div class="trim-box"><div class="trim-title"><strong>调整选中声音</strong><span id="trim-duration"></span></div><label class="trim-control">起点 <input id="trim-start" type="range" step="0.001" min="0" value="0"><output id="start-value">0.000s</output></label><label class="trim-control">终点 <input id="trim-end" type="range" step="0.001" min="0" value="1"><output id="end-value">1.000s</output></label><button id="preview" class="preview-button">${icon('play')}试听选中声音</button></div>
          <form id="save-form"><label for="sound-name">给声音起个名字</label><div class="save-row"><input id="sound-name" maxlength="40" placeholder="例如：清脆的杯子声" required><button id="save" class="primary" type="submit">${icon('plus')}存入声音库</button></div></form>
        </div>
      </section>
    </div>
  </section>
  <section id="library-view" hidden><div class="library-top"><div><h2>收藏你的声音灵感</h2><p class="muted">每个声音都能成为下一次创作的起点。<span id="capacity">0 / 200</span></p></div><div class="library-actions"><button id="export" class="secondary">${icon('down')}备份到本地</button><button id="restore" class="secondary">${icon('up')}导入备份</button></div></div><p class="storage-note">保存在当前浏览器中。清除网站数据会删除声音，请定期下载备份。</p><div id="library" class="library-grid"></div></section>
  <footer><span>听见日常里的不一样。</span><span>FREE IMPRO · 声音采集基础版</span></footer>
</main><div id="toast" role="status" aria-live="polite" hidden></div>
<input id="audio-file" type="file" accept="audio/*" hidden><input id="backup-file" type="file" accept=".json,application/json" hidden>
<dialog id="name-dialog"><form method="dialog"><h2>重新命名</h2><input id="rename-input" aria-label="声音新名称" maxlength="40" required><div class="dialog-actions"><button value="cancel" formnovalidate class="secondary">取消</button><button value="save" class="primary">保存名称</button></div></form></dialog>
<dialog id="delete-dialog"><h2>删除这个声音？</h2><p>删除后无法恢复，已导出的备份不受影响。</p><form method="dialog" class="dialog-actions"><button value="cancel" class="secondary">保留</button><button value="delete" class="danger">删除声音</button></form></dialog>`;

const $ = (id) => document.getElementById(id);
let context, source, sampleRate = 0, slices = [], selected = -1, range = { start: 0, end: 1 };
let recorder, stream, timer, meterFrame, startedAt, recording = false, busy = false, saveBusy = false;
let player, library = [], toastTimer, renameId, deleteId;
function notify(message, error = false) { $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, error ? 9000 : 4000); }
function report(error) { console.error(error); notify(error?.message || '操作没有完成，请重试。', true); }
async function getContext() { context ||= new AudioContext(); if (context.state === 'suspended') await context.resume(); return context; }
function stopPlayback() { if (player) { player.onended = null; try { player.stop(); } catch {} player = null; } document.querySelectorAll('[data-playing]').forEach(el => { el.removeAttribute('data-playing'); el.innerHTML = icon('play'); }); $('preview').innerHTML = `${icon('play')}试听选中声音`; }
async function playSamples(samples, rate, button) {
  const wasPlaying = button?.hasAttribute('data-playing'); stopPlayback(); if (wasPlaying) return;
  const ctx = await getContext(); const buffer = ctx.createBuffer(1, samples.length, rate); buffer.copyToChannel(samples, 0);
  player = ctx.createBufferSource(); player.buffer = buffer; player.connect(ctx.destination); player.onended = stopPlayback;
  if (button) { button.setAttribute('data-playing', ''); button.innerHTML = icon('stop'); }
  player.start();
}
function setCaptureBusy(value) { busy = value; $('editor').inert = value; ['record', 'demo', 'import-audio'].forEach(id => $(id).disabled = value); }
function setView(view) { if (recording || busy) { notify('请先完成当前录音。'); return; } stopPlayback(); ['studio', 'library'].forEach(v => { $(v + '-view').hidden = v !== view; $(v + '-tab').classList.toggle('active', v === view); $(v + '-tab').setAttribute('aria-selected', String(v === view)); }); }
$('studio-tab').onclick = () => setView('studio'); $('library-tab').onclick = () => setView('library');
function endTracks() { clearTimeout(timer); cancelAnimationFrame(meterFrame); stream?.getTracks().forEach(t => t.stop()); stream = null; $('meter').classList.remove('live'); }
function stopRecording() { if (recorder?.state === 'recording') recorder.stop(); endTracks(); }
$('record').onclick = async () => {
  if (recording) { stopRecording(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { notify('录音需要支持麦克风的浏览器，并通过 HTTPS 或本机 localhost 打开。也可以先导入音频。', true); return; }
  stopPlayback(); setCaptureBusy(true); $('record-status').textContent = '正在请求麦克风权限…';
  try {
    const ctx = await getContext();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { stopRecording(); notify('录音被中断，请重试。', true); };
    recorder.onstop = async () => {
      recording = false; endTracks(); setCaptureBusy(true); $('record').classList.remove('recording'); $('record').innerHTML = `${icon('mic')}<span>重新录音</span>`;
      $('record-status').textContent = '正在分析声音…';
      try { const buffer = await ctx.decodeAudioData(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()); loadAudio(mono(buffer), buffer.sampleRate, '刚刚录制的声音'); }
      catch { notify('未能读取录音，请稍长一点再试，或导入音频。', true); }
      finally { setCaptureBusy(false); $('record-status').textContent = '录音已结束，麦克风已关闭'; }
    };
    const input = ctx.createMediaStreamSource(stream), analyser = ctx.createAnalyser(); analyser.fftSize = 128; input.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    recorder.start(200); recording = true; busy = false; startedAt = performance.now(); $('record').disabled = false;
    $('record').classList.add('recording'); $('record').innerHTML = `${icon('stop')}<span>结束录音</span>`; $('record-status').textContent = '正在聆听 · 15 秒后自动结束'; $('meter').classList.add('live');
    const drawMeter = () => { const elapsed = Math.min(15, (performance.now() - startedAt) / 1000); $('record-time').innerHTML = `00:${Math.floor(elapsed).toString().padStart(2, '0')}<span> / 00:15</span>`; analyser.getByteFrequencyData(data); [...$('meter').children].forEach((bar, i) => bar.style.height = (6 + data[i] / 255 * 65) + 'px'); meterFrame = requestAnimationFrame(drawMeter); };
    drawMeter(); timer = setTimeout(stopRecording, MAX_RECORDING * 1000);
  } catch (error) {
    endTracks(); recording = false; setCaptureBusy(false); $('record-status').textContent = '点击后允许使用麦克风';
    notify(error.name === 'NotAllowedError' ? '没有麦克风权限，请在浏览器设置中允许录音后重试。' : error.name === 'NotFoundError' ? '没有找到麦克风，可以先导入音频。' : '麦克风暂时无法使用，请检查是否被其他应用占用。', true);
  }
};
document.addEventListener('visibilitychange', () => { if (document.hidden && recording) stopRecording(); });
window.addEventListener('pagehide', () => { stopRecording(); stopPlayback(); });
$('demo').onclick = () => { const demo = demoAudio(); loadAudio(demo.samples, demo.sampleRate, '示例 · 三次清脆敲击'); notify('已载入合成示例，可以切片和保存。'); };
$('import-audio').onclick = () => $('audio-file').click();
$('audio-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  if (file.size > 25 * 1024 * 1024) { notify('请选择小于 25 MB 的音频文件。', true); return; }
  setCaptureBusy(true); stopPlayback();
  try { const ctx = await getContext(); const buffer = await ctx.decodeAudioData(await file.arrayBuffer()); loadAudio(mono(buffer), buffer.sampleRate, file.name); if (buffer.duration > 15) notify('音频超过 15 秒，已保留前 15 秒供采样。'); }
  catch { notify('这个音频格式无法读取，请换一个 WAV、MP3 或浏览器支持的音频文件。', true); }
  finally { setCaptureBusy(false); }
};
function loadAudio(samples, rate, label) {
  stopPlayback(); source = samples; sampleRate = rate; $('source-label').textContent = label;
  $('editor-empty').hidden = true; $('editor').hidden = false; $('step2').classList.add('current'); $('step3').classList.remove('current');
  $('sound-name').value = ''; $('sensitivity').value = 50; reslice();
}
function reslice() { stopPlayback(); slices = detectSlices(source, sampleRate, Number($('sensitivity').value) / 100); renderSlices(); if (slices.length) selectSlice(0); else { selected = -1; range = { start: 0, end: Math.min(1, source.length / sampleRate) }; updateTrim(); notify('没有识别到清晰敲击，可以手动调整起点和终点。'); } }
$('reslice').onclick = reslice;
function renderSlices() {
  $('slice-count').textContent = slices.length ? `找到 ${slices.length} 个声音片段` : '手动选择一段声音';
  $('slices').replaceChildren(); slices.forEach((s, i) => { const button = document.createElement('button'); button.className = 'slice'; button.innerHTML = `${icon('wave')}<span>声音 ${String(i + 1).padStart(2, '0')}</span><small>${(s.end - s.start).toFixed(2)}s</small>`; button.onclick = () => { selectSlice(i); playSamples(trimSamples(source, sampleRate, range.start, range.end), sampleRate).catch(report); }; $('slices').append(button); });
}
function selectSlice(i) { stopPlayback(); selected = i; range = { ...slices[i] }; updateTrim(); }
$('manual').onclick = () => { stopPlayback(); selected = -1; range = { start: 0, end: Math.min(1, source.length / sampleRate) }; updateTrim(); };
function updateTrim() {
  const duration = source.length / sampleRate;
  $('trim-start').max = Math.max(0, duration - 0.01); $('trim-end').max = duration; $('trim-start').value = range.start; $('trim-end').value = range.end;
  $('start-value').value = range.start.toFixed(3) + 's'; $('end-value').value = range.end.toFixed(3) + 's'; $('trim-duration').textContent = (range.end - range.start).toFixed(3) + ' 秒';
  $('source-duration').textContent = duration.toFixed(2) + 's';
  [...$('slices').children].forEach((b, i) => { b.classList.toggle('selected', i === selected); b.setAttribute('aria-pressed', String(i === selected)); }); drawWave();
}
$('trim-start').oninput = e => { stopPlayback(); const start = Number(e.target.value); range.start = start; range.end = Math.min(source.length / sampleRate, Math.max(start + 0.01, Math.min(range.end, start + 1))); updateTrim(); };
$('trim-end').oninput = e => { stopPlayback(); const end = Math.max(0.01, Number(e.target.value)); range.end = Math.min(source.length / sampleRate, end); range.start = Math.max(0, Math.min(end - 0.01, Math.max(range.start, end - 1))); updateTrim(); };
// Pointer capture keeps a mouse or finger drag active outside the waveform.
const waveform = $('waveform');
let waveDrag = null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function waveTime(event) {
  const bounds = waveform.getBoundingClientRect();
  return clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * source.length / sampleRate;
}
function waveMode(event) {
  const bounds = waveform.getBoundingClientRect(), duration = source.length / sampleRate;
  const x = event.clientX - bounds.left, left = range.start / duration * bounds.width, right = range.end / duration * bounds.width;
  const tolerance = Math.min(event.pointerType === 'touch' ? 22 : 12, (right - left) / 3);
  if (Math.abs(x - left) <= tolerance) return 'start';
  if (Math.abs(x - right) <= tolerance) return 'end';
  return x > left && x < right ? 'move' : 'select';
}
waveform.addEventListener('pointerdown', event => {
  if (!source || recording || busy || waveDrag || !event.isPrimary || event.button !== 0) return;
  event.preventDefault(); stopPlayback();
  waveDrag = { id: event.pointerId, mode: waveMode(event), anchor: waveTime(event), original: { ...range } };
  waveform.setPointerCapture(event.pointerId);
  waveform.style.cursor = waveDrag.mode === 'move' ? 'grabbing' : 'ew-resize';
});
waveform.addEventListener('pointermove', event => {
  if (!source) return;
  if (!waveDrag) { waveform.style.cursor = waveMode(event) === 'move' ? 'grab' : waveMode(event) === 'select' ? 'crosshair' : 'ew-resize'; return; }
  if (event.pointerId !== waveDrag.id) return;
  event.preventDefault();
  const time = waveTime(event), duration = source.length / sampleRate, min = Math.min(0.01, duration);
  const { mode, anchor, original } = waveDrag;
  if (mode === 'move') {
    const length = original.end - original.start;
    const start = clamp(original.start + time - anchor, 0, duration - length);
    range = { start, end: start + length };
  } else if (mode === 'start') {
    range = { start: clamp(time, Math.max(0, original.end - 1), original.end - min), end: original.end };
  } else if (mode === 'end') {
    range = { start: original.start, end: clamp(time, original.start + min, Math.min(duration, original.start + 1)) };
  } else if (time < anchor) {
    const end = Math.max(min, anchor);
    range = { start: clamp(time, Math.max(0, end - 1), end - min), end };
  } else {
    const start = Math.min(anchor, duration - min);
    range = { start, end: clamp(time, start + min, Math.min(duration, start + 1)) };
  }
  selected = -1; updateTrim();
});
function finishWaveDrag(event) {
  if (!waveDrag || event.pointerId !== waveDrag.id) return;
  waveDrag = null;
  if (waveform.hasPointerCapture(event.pointerId)) waveform.releasePointerCapture(event.pointerId);
  waveform.style.cursor = 'crosshair';
}
waveform.addEventListener('pointerup', finishWaveDrag);
waveform.addEventListener('pointercancel', finishWaveDrag);
waveform.addEventListener('lostpointercapture', finishWaveDrag);
function drawWave() {
  if (!source) return; const canvas = $('waveform'); const width = canvas.clientWidth; if (!width) return;
  const ratio = window.devicePixelRatio || 1; canvas.width = width * ratio; canvas.height = 120 * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.fillStyle = '#f5f4f0'; ctx.fillRect(0, 0, width, 120);
  const duration = source.length / sampleRate; const x1 = range.start / duration * width, x2 = range.end / duration * width;
  ctx.fillStyle = '#e0ede3'; ctx.fillRect(x1, 0, Math.max(2, x2 - x1), 120);
  for (let x = 0; x < width; x += 3) { const begin = Math.floor(x / width * source.length), end = Math.ceil((x + 3) / width * source.length); let amplitude = 0; for (let j = begin; j < Math.min(end, source.length); j++) amplitude = Math.max(amplitude, Math.abs(source[j])); ctx.fillStyle = x >= x1 && x <= x2 ? '#2c695b' : '#b8bcb5'; const height = Math.max(2, amplitude * 102); ctx.fillRect(x, 60 - height / 2, 2, height); }
  ctx.fillStyle = '#2c695b'; ctx.fillRect(x1, 0, 2, 120); ctx.fillRect(x2 - 2, 0, 2, 120);
  for (const x of [x1, x2]) {
    const handleX = clamp(x - 5, 0, width - 10);
    ctx.fillStyle = '#2c695b'; ctx.fillRect(handleX, 44, 10, 32);
    ctx.fillStyle = '#fff'; ctx.fillRect(handleX + 4, 53, 2, 14);
  }
}
new ResizeObserver(drawWave).observe($('waveform'));
$('play-original').onclick = () => playSamples(source, sampleRate).catch(report);
$('preview').onclick = () => playSamples(trimSamples(source, sampleRate, range.start, range.end), sampleRate, $('preview')).catch(report);
$('save-form').onsubmit = async e => {
  e.preventDefault(); if (saveBusy || !source || recording || busy) return; const name = $('sound-name').value.trim(); if (!name) { $('sound-name').focus(); return; }
  saveBusy = true; $('save').disabled = true;
  try { const samples = trimSamples(source, sampleRate, range.start, range.end); await saveSounds([{ id: crypto.randomUUID(), name, createdAt: Date.now(), duration: samples.length / sampleRate, blob: encodeWav(samples, sampleRate) }]); await refreshLibrary(); $('step3').classList.add('current'); notify(`“${name}”已保存在这台设备`); }
  catch (error) { report(error); } finally { saveBusy = false; $('save').disabled = false; }
};
async function refreshLibrary() { library = await listSounds(); $('library-count').textContent = library.length; $('capacity').textContent = `${library.length} / ${LIMIT}`; renderLibrary(); }
function renderLibrary() {
  $('library').replaceChildren(); $('export').disabled = !library.length;
  if (!library.length) { const empty = document.createElement('div'); empty.className = 'library-empty'; empty.innerHTML = `<div class="empty-wave">${icon('wave')}</div><h3>第一份声音灵感，等你收藏</h3><p>录一段声音，挑出最喜欢的一声保存到这里。</p><button class="primary">${icon('mic')}去采集声音</button>`; empty.querySelector('button').onclick = () => setView('studio'); $('library').append(empty); return; }
  library.forEach((sound, index) => {
    const card = document.createElement('article'); card.className = 'sound-card';
    card.innerHTML = `<div class="sound-art tone-${index % 4}"><span>${icon('wave')}</span><button class="sound-play" aria-label="试听"></button></div><div class="sound-details"><h3></h3><p>${sound.duration.toFixed(3)} 秒 <span>·</span> ${new Date(sound.createdAt).toLocaleDateString('zh-CN')}</p><div class="sound-actions"><button class="rename text-button">${icon('edit')}命名</button><button class="download text-button">${icon('down')}导出 WAV</button><button class="delete text-button" aria-label="删除声音">${icon('trash')}</button></div></div>`;
    card.querySelector('h3').textContent = sound.name;
    const play = card.querySelector('.sound-play'); play.innerHTML = icon('play'); play.setAttribute('aria-label', `试听 ${sound.name}`);
    play.onclick = async () => { try { if (play.hasAttribute('data-playing')) { stopPlayback(); return; } const ctx = await getContext(); const buffer = await ctx.decodeAudioData(await sound.blob.arrayBuffer()); await playSamples(buffer.getChannelData(0), buffer.sampleRate, play); } catch (error) { report(error); } };
    card.querySelector('.rename').onclick = () => { renameId = sound.id; $('rename-input').value = sound.name; $('name-dialog').showModal(); };
    card.querySelector('.delete').onclick = () => { deleteId = sound.id; $('delete-dialog').showModal(); };
    card.querySelector('.download').onclick = () => download(sound.blob, sound.name.replace(/[\\/:*?"<>|]/g, '_') + '.wav'); $('library').append(card);
  });
}
$('name-dialog').onclose = async () => { if ($('name-dialog').returnValue !== 'save') return; const sound = library.find(s => s.id === renameId), name = $('rename-input').value.trim(); if (!sound || !name) return; try { await saveSounds([{ ...sound, name }]); await refreshLibrary(); notify('名称已更新'); } catch (e) { report(e); } };
$('delete-dialog').onclose = async () => { if ($('delete-dialog').returnValue !== 'delete') return; try { stopPlayback(); await deleteSound(deleteId); await refreshLibrary(); notify('声音已删除'); } catch (e) { report(e); } };
function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
function asDataURL(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
$('export').onclick = async () => { $('export').disabled = true; try { const sounds = await Promise.all(library.map(async ({ blob, ...item }) => ({ ...item, audio: await asDataURL(blob) }))); download(new Blob([JSON.stringify({ format: 'free-impro-sounds', version: 1, sounds })], { type: 'application/json' }), `free-impro-backup-${new Date().toISOString().slice(0, 10)}.json`); notify('备份已生成，请保存在设备本地。'); } catch (e) { report(e); } finally { $('export').disabled = !library.length; } };
$('restore').onclick = () => $('backup-file').click();
$('backup-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return; $('restore').disabled = true;
  try {
    if (file.size > 60 * 1024 * 1024) throw new Error('备份文件过大，请选择本应用导出的备份。');
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'free-impro-sounds' || backup.version !== 1 || !Array.isArray(backup.sounds) || backup.sounds.length > LIMIT) throw new Error('不是有效的声音库备份。');
    const ctx = await getContext(), items = [], ids = new Set();
    for (const item of backup.sounds) {
      if (typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 40 || !Number.isFinite(item.createdAt) || typeof item.audio !== 'string' || item.audio.length > 600000 || !/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/.test(item.audio)) throw new Error('备份包含无效作品，尚未导入任何内容。');
      ids.add(item.id); const bytes = Uint8Array.from(atob(item.audio.split(',')[1]), c => c.charCodeAt(0)); const buffer = await ctx.decodeAudioData(bytes.buffer);
      if (buffer.duration <= 0 || buffer.duration > 1.0001) throw new Error('备份中的声音超过 1 秒，未导入。');
      if (!library.some(s => s.id === item.id)) items.push({ id: item.id, name: item.name.trim(), createdAt: item.createdAt, duration: buffer.duration, blob: encodeWav(buffer.getChannelData(0), buffer.sampleRate) });
    }
    await saveSounds(items); await refreshLibrary(); notify(`已导入 ${items.length} 份声音，相同 ID 的已有作品已跳过。`);
  } catch (error) { notify(error instanceof SyntaxError ? '备份文件无法解析，未导入任何内容。' : error.message || '导入失败，原有作品未改变。', true); }
  finally { $('restore').disabled = false; }
};
refreshLibrary().catch(() => notify('无法打开本地声音库，请退出无痕模式或检查浏览器存储权限。', true));
