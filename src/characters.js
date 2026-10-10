import { listSounds, updateSound } from './storage.js';
import { canvasBlob, normalizeGeneratedImage, toDataURL } from './images.js';
import './characters.css';
import { isStudentClient, capturePhoto } from './student-client.js';
import { classroomFetch, canUseClassroom } from './classroom-transport.js';

export function initCharacters({ show, notify, onSaved, imageWorkflow }) {
  const root = document.getElementById('characters-view');
  root.innerHTML = `<div class="class-heading"><div><div class="eyebrow">SOUND FRIENDS / 声音有了模样</div><h2>为你的声音，创造一个小伙伴</h2><p class="muted">拍下发出声音的物体，把它变成独一无二的动漫角色。</p></div><span class="pill teal">一个角色 · 一个声音</span></div>
    <p id="image-service-note" class="image-service-note" role="status">可先离线拍照、裁切并保存草稿。</p>
    <div id="character-controls"><section class="panel character-sound"><label for="character-sound">先选一个已保存的声音</label><select id="character-sound"><option value="">请选择声音</option></select><span id="character-sound-hint" class="muted">还没有声音？先去录制并保存一份。</span></section>
    <div class="character-grid"><section class="panel"><div class="panel-top"><span class="section-kicker">01 / 拍照与主体</span><span class="pill">照片仅裁切后上传</span></div><h2>找到声音的主人</h2><p class="muted">将想保留的主体放在画面中间，可拖动照片并调整大小。</p><div class="photo-actions"><button id="take-photo" class="primary">拍一张照片</button><button id="import-photo" class="secondary">从相册选择</button></div>
    <div id="photo-empty" class="photo-empty"><span>◎</span><strong>杯子、树叶、你的乐器…</strong><p>从一张照片开始，发现它的另一面。</p></div><div id="crop-editor" hidden><canvas id="photo-canvas" width="512" height="512" aria-label="拖动照片选择主体" aria-describedby="crop-help"></canvas><p id="crop-help" class="muted">拖动画面选择主体，也可用下方滑块微调。</p><label class="crop-slider">放大<input id="crop-zoom" type="range" min="1" max="4" step="0.01" value="1"></label><label class="crop-slider">左右<input id="crop-x" type="range" min="-1" max="1" step="0.01" value="0"></label><label class="crop-slider">上下<input id="crop-y" type="range" min="-1" max="1" step="0.01" value="0"></label><button id="reset-crop" class="text-button">重置裁切</button></div>
    <p class="muted">支持 JPG、PNG、WebP，最大 10 MB。照片选择后不会自动发送。</p></section>
    <section class="panel"><div class="panel-top"><span class="section-kicker">02 / 动漫小伙伴</span><span class="pill teal">统一 3D 动画风格</span></div><h2>听得见，也看得见</h2><div id="character-preview" class="character-preview"><span id="avatar-placeholder">✦<small>你的小伙伴即将在这里出现</small></span><img id="avatar-preview" alt="生成的动漫形象" hidden></div><p id="character-status" role="status" class="muted">生成前请在“我的”填写姓名和课堂码连接课堂。</p><button id="generate-character" class="primary" disabled>生成动漫形象</button><p class="muted generation-disclosure">注册学生账号后可以申请形象，每天一张。仅照片用于生成，声音不会发送。</p><div class="character-save"><button id="save-character" class="secondary" disabled>保存照片草稿</button><p class="muted">保存到当前声音作品，不占用额外作品名额。已有课堂作品需重新提交后才会更新。</p></div></section></div></div>
    <button id="cancel-generation" class="secondary" hidden>取消等待</button><input id="camera-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>`;
  const $ = id => root.querySelector('#' + id);
  const PROFILE = '__student_profile__';
  let serviceMode = '', serviceStatus = null;
  let pendingPreview = null;
  let soundId = '', bitmap = null, avatar = null, zoom = 1, panX = 0, panY = 0, avatarURL, working = false, photoLoading = false, controller, generation = 0, photoRevision = 0, editRevision = 0, configured = false, drag = null;
  async function refreshSounds() {
    const sounds = await listSounds(); const selected = soundId;
    $('character-sound').replaceChildren(new Option('请选择声音', ''));
    if (selected === PROFILE) $('character-sound').add(new Option('固定学生形象', PROFILE));
    for (const sound of sounds) $('character-sound').add(new Option(sound.name, sound.id));
    if (selected === PROFILE || sounds.some(s => s.id === selected)) $('character-sound').value = selected;
    else if (soundId) { soundId = ''; clearPhoto(); }
    $('character-sound-hint').hidden = sounds.length > 0; updateButtons();
  }
  function updateButtons() { const ready = serviceMode !== 'chatgpt-web' || (serviceStatus?.registered && serviceStatus.remaining > 0 && !serviceStatus.pendingJobId && (soundId === PROFILE || serviceStatus.hasAvatar)); $('generate-character').disabled = !bitmap || !soundId || working || photoLoading || !configured || !ready; $('save-character').hidden = soundId === PROFILE; $('save-character').disabled = !bitmap || !soundId || working || photoLoading; $('save-character').textContent = avatar ? '保存声音形象' : '保存照片草稿'; }
  function renderAvatar() {
    if (avatarURL) URL.revokeObjectURL(avatarURL); avatarURL = undefined;
    $('avatar-preview').hidden = !avatar; $('avatar-placeholder').hidden = !!avatar;
    if (avatar) { avatarURL = URL.createObjectURL(avatar); $('avatar-preview').src = avatarURL; }
    else $('avatar-preview').removeAttribute('src'); updateButtons();
  }
  function clearPhoto() { pendingPreview = null; photoRevision++; photoLoading = false; drag = null; bitmap?.close(); bitmap = null; avatar = null; zoom = 1; panX = panY = 0; $('photo-empty').hidden = false; $('crop-editor').hidden = true; renderAvatar(); }
  function cropChanged() { avatar = null; photoRevision++; photoLoading = false; renderAvatar(); $('character-status').textContent = '照片已调整，可生成新形象或先保存照片草稿。'; }
  function draw() {
    if (!bitmap) return; const c = $('photo-canvas'), ctx = c.getContext('2d'), scale = Math.max(512 / bitmap.width, 512 / bitmap.height) * zoom;
    const w = bitmap.width * scale, h = bitmap.height * scale;
    ctx.clearRect(0, 0, 512, 512); ctx.drawImage(bitmap, (512 - w) / 2 + panX * (w - 512) / 2, (512 - h) / 2 + panY * (h - 512) / 2, w, h);
    $('crop-zoom').value = zoom; $('crop-x').value = panX; $('crop-y').value = panY;
  }
  async function cropBlob() { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage($('photo-canvas'), 0, 0, 256, 256); return canvasBlob(c); }
  async function setPhoto(blob) {
    const revision = ++photoRevision, selectedSound = soundId;
    photoLoading = true; updateButtons();
    try {
      const next = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (revision !== photoRevision || selectedSound !== soundId) { next.close(); return false; }
      if (next.width * next.height > 40000000) { next.close(); throw new Error('照片分辨率过大，请选择较小的照片。'); }
      bitmap?.close(); bitmap = next; zoom = 1; panX = panY = 0; avatar = null;
      $('photo-empty').hidden = true; $('crop-editor').hidden = false; draw(); renderAvatar(); return true;
    } catch (error) {
      if (revision !== photoRevision || selectedSound !== soundId) return false;
      throw error;
    } finally {
      if (revision === photoRevision && selectedSound === soundId) { photoLoading = false; updateButtons(); }
    }
  }
  async function editSound(sound) {
    if (working) { notify('请先等待生成结束或取消等待。'); return; }
    const edit = ++editRevision;
    soundId = sound.id; $('character-sound').value = soundId; clearPhoto();
    const revision = photoRevision; show(); $('character-sound').disabled = false;
    root.querySelector('.class-heading h2').textContent = '为声音制作配图';
    await refreshSounds(); if (edit !== editRevision || revision !== photoRevision || soundId !== sound.id) return;
    try { if (sound.photo && !await setPhoto(sound.photo)) return; if (edit !== editRevision || soundId !== sound.id) return; avatar = sound.avatar || null; renderAvatar(); $('character-status').textContent = avatar ? '已载入保存的形象，可以重新生成。' : '选一张照片，开始制作声音形象。'; } catch { if (edit === editRevision) notify('已保存的图片暂时无法打开，请重新选择照片。', true); }
    if (sound.imageRequest) { pendingPreview = { jobId: sound.imageRequest.id, soundId, revision: photoRevision }; $('character-status').textContent = '图像生成中'; }
    if (serviceMode === 'chatgpt-web' && !serviceStatus?.hasAvatar) $('character-status').textContent = '请先在“我的”完成固定学生形象，再制作持物作品配图。';
    updateButtons();
  }
  async function editIdentity() {
    if (working) return;
    editRevision++; soundId = PROFILE; clearPhoto(); show();
    root.querySelector('.class-heading h2').textContent = '制作固定学生形象';
    $('character-sound').disabled = true;
    await refreshSounds(); await checkService();
    $('character-status').textContent = serviceStatus?.pendingJobId ? '图像生成中' : '拍摄或选择自己的正面照片，生成固定的 3D 动画风格形象图片。';
  }
  $('character-sound').onchange = async e => { const selected = e.target.value, sounds = await listSounds(); if (e.target.value !== selected) return; const sound = sounds.find(s => s.id === selected); if (sound) await editSound(sound); else { editRevision++; soundId = ''; clearPhoto(); } };
  $('take-photo').onclick = () => $('camera-file').click(); $('import-photo').onclick = () => $('photo-file').click();
  if (isStudentClient()) {
    $('import-photo').hidden = !window.webkit?.messageHandlers?.localFiles;
    $('take-photo').onclick = async () => { const selectedSound = soundId; try { const photo = await capturePhoto(); if (photo && soundId === selectedSound) await setPhoto(photo); } catch (error) { notify(error.message, true); } };
  }
  for (const id of ['camera-file', 'photo-file']) $(id).onchange = async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { notify('请选择 10 MB 以内的 JPG、PNG 或 WebP 照片。', true); return; }
    try { if (await setPhoto(file)) $('character-status').textContent = '拖动照片或缩放，让你想变成角色的主体清晰可见。'; } catch (e) { notify(e.message || '照片无法读取，请换一张试试。', true); }
  };
  for (const id of ['crop-zoom', 'crop-x', 'crop-y']) $(id).oninput = () => { zoom = Number($('crop-zoom').value); panX = Number($('crop-x').value); panY = Number($('crop-y').value); cropChanged(); draw(); };
  $('reset-crop').onclick = () => { zoom = 1; panX = panY = 0; cropChanged(); draw(); };
  $('photo-canvas').onpointerdown = event => { if (!bitmap || working || !event.isPrimary || event.button !== 0) return; event.preventDefault(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY }; $('photo-canvas').setPointerCapture(event.pointerId); };
  $('photo-canvas').onpointermove = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const scale = Math.max(512 / bitmap.width, 512 / bitmap.height) * zoom, width = bitmap.width * scale, height = bitmap.height * scale, factor = 512 / $('photo-canvas').getBoundingClientRect().width;
    panX = width > 512 ? Math.max(-1, Math.min(1, drag.panX + (event.clientX - drag.x) * factor * 2 / (width - 512))) : 0;
    panY = height > 512 ? Math.max(-1, Math.min(1, drag.panY + (event.clientY - drag.y) * factor * 2 / (height - 512))) : 0;
    cropChanged(); draw();
  };
  const endDrag = event => { if (drag?.id !== event.pointerId) return; drag = null; if ($('photo-canvas').hasPointerCapture(event.pointerId)) $('photo-canvas').releasePointerCapture(event.pointerId); };
  $('photo-canvas').onpointerup = endDrag; $('photo-canvas').onpointercancel = endDrag; $('photo-canvas').onlostpointercapture = endDrag;
  function setWorking(value) { working = value; $('character-controls').inert = value; $('cancel-generation').hidden = !value; updateButtons(); }
  $('generate-character').onclick = async () => {
    if (!bitmap || !soundId || working || photoLoading) return;
    const ticket = ++generation, revision = photoRevision, selectedSound = soundId;
    const current = () => ticket === generation && revision === photoRevision && selectedSound === soundId;
    controller = new AbortController(); setWorking(true); $('character-status').textContent = '正在生成动漫小伙伴…通常需要一些时间，请稍候。';
    try {
      const cropped = await cropBlob(), photo = await toDataURL(cropped);
      if (!current()) return;
      if (serviceMode === 'chatgpt-web') {
        const sound = (await listSounds()).find(s => s.id === selectedSound);
        if (!current()) return;
        const job = await imageWorkflow().request({ kind: selectedSound === PROFILE ? 'identity' : 'work', workId: sound?.id, workName: sound?.name, photo: cropped });
        if (current()) { pendingPreview = { jobId: job.id, soundId, revision: photoRevision }; $('character-status').textContent = job.status === 'rejected' ? '本次申请未完成，请联系老师。' : '图像生成中'; }
        return;
      }
      const response = await classroomFetch('/api/student/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(250000)]) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '生成失败，请稍后重试。');
      const image = await normalizeGeneratedImage(result.image); if (!current()) return;
      avatar = image; renderAvatar(); $('character-status').textContent = '小伙伴诞生了！满意就保存，也可以再生成一个。'; $('generate-character').textContent = '重新生成形象';
    } catch (e) { if (current()) { $('character-status').textContent = e.name === 'AbortError' ? '已取消等待，当前照片和形象保留。' : e.message || '无法连接生成服务，请检查网络。'; notify($('character-status').textContent, true); } }
    finally { if (ticket === generation) setWorking(false); }
  };
  $('cancel-generation').onclick = () => { controller?.abort(); generation++; setWorking(false); $('character-status').textContent = '已取消等待，当前照片和形象保留。生成服务可能已经处理了本次请求。'; };
  $('save-character').onclick = async () => {
    if (!soundId || !bitmap || working || photoLoading) return;
    const selectedSound = soundId, revision = photoRevision, savedAvatar = avatar;
    const requireCurrent = () => {
      if (selectedSound !== soundId || revision !== photoRevision) {
        const message = '声音或照片已更改，本次未保存，请确认后重新保存。';
        $('character-status').textContent = message; throw new Error(message);
      }
    };
    working = true; $('character-controls').inert = true; updateButtons();
    try {
      const sound = (await listSounds()).find(s => s.id === selectedSound); requireCurrent();
      if (!sound) throw new Error('这份声音已被删除，请重新选择。');
      const photo = await cropBlob(); requireCurrent();
      const saved = await updateSound(selectedSound, latest => { requireCurrent(); return { ...latest, photo, avatar: savedAvatar, imageRequest: null, imageUpdatedAt: Date.now() }; }); if (!saved) throw new Error('这份声音已被删除，本次未保存。'); await onSaved();
      notify(savedAvatar ? '声音形象已保存在本地作品库。' : '照片草稿已保存，可稍后继续生成形象。');
    }
    catch (e) { notify(e.message || '保存失败，请检查设备空间。', true); } finally { working = false; $('character-controls').inert = false; updateButtons(); }
  };
  async function checkService() {
    if (!canUseClassroom()) { configured = false; $('image-service-note').textContent = '可离线拍照、裁切并保存草稿；加入课堂后可使用联网形象生成。'; updateButtons(); return; }
    try { const response = await classroomFetch('/api/student/image-status'); const result = await response.json(); applyService(result); }
    catch { configured = false; $('image-service-note').textContent = '暂时连接不上图像服务，可以先保存照片草稿。'; } updateButtons();
  }
  function applyService(result) {
    serviceMode = result.mode || ''; serviceStatus = result; configured = result.configured === true;
    if (serviceMode === 'chatgpt-web') {
      $('image-service-note').textContent = result.registered ? `每天一张图片 · 今日剩余 ${result.remaining} 张` : '注册学生账号后才能生成图片；仍可离线拍照、裁切并保存草稿。';
      $('generate-character').textContent = '生成形象';
      root.querySelector('.generation-disclosure').textContent = '申请后，裁切照片将用于制作形象。仅照片用于生成，声音不会发送。请使用自己的照片或获准使用的物品照片。';
      if (result.pendingJobId) $('character-status').textContent = '图像生成中';
    } else $('image-service-note').textContent = configured ? '已配置 OpenAI 图像服务 · 连接课堂后可生成物品动漫形象' : '图像生成尚未启用。请教师配置服务器 API 密钥；你仍可拍照、裁切并保存草稿。';
    updateButtons();
  }
  window.addEventListener('freeimpro-image-status', event => applyService(event.detail));
  window.addEventListener('freeimpro-image-result', event => {
    const result = event.detail;
    if (result.kind === 'identity' && soundId === PROFILE || result.kind === 'work' && pendingPreview?.jobId === result.jobId && pendingPreview.soundId === soundId && pendingPreview.revision === photoRevision) {
      avatar = result.avatar; pendingPreview = null; renderAvatar(); $('character-status').textContent = '形象已保存在本地。';
    }
  });
  window.addEventListener('sounds-changed', () => refreshSounds()); window.addEventListener('online', checkService);
  window.addEventListener('freeimpro-classroom-connected', checkService);
  window.addEventListener('freeimpro-classroom-disconnected', () => { controller?.abort(); checkService(); });
  refreshSounds(); checkService();
  return { editSound, editIdentity, refresh: async () => { await refreshSounds(); await checkService(); } };
}
