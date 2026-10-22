import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const userId = '1a2b3c4d-1234-4567-890a-123456789abc';
const classId = '2a2b3c4d-1234-4567-890a-123456789abc';
const workId = '3a2b3c4d-1234-4567-890a-123456789abc';
function image(r, g, b) {
  const png = new PNG({ width: 32, height: 32 });
  for (let index = 0; index < png.data.length; index += 4) png.data.set([r, g, b, 255], index);
  return PNG.sync.write(png);
}
const photo = image(120, 90, 60), resultImage = image(20, 160, 80);

async function fixture(page, { registered = true, hasAvatar = true, statusError = 0, avatarError = 0, completeOnPost = false } = {}) {
  const status = { mode: 'chatgpt-web', configured: registered, registered, hasAvatar, userId, classId, remaining: 1 };
  const jobs = []; let registerCalls = 0;
  await page.route('**/api/student/me', route => route.fulfill({ json: { user: { id: userId, name: '测试同学', role: 'student' } } }));
  await page.route('**/api/student/classrooms', route => route.fulfill({ json: { classrooms: [] } }));
  await page.route('**/api/student/image-status', route => route.fulfill(statusError ? { status: statusError, json: { error: '测试状态读取失败' } } : { json: status }));
  await page.route('**/api/student/image-profile/register', route => {
    registerCalls++; status.registered = status.configured = true;
    return route.fulfill({ json: status });
  });
  await page.route('**/api/student/image-profile/avatar', route => route.fulfill(avatarError ? { status: avatarError, json: { error: '固定形象暂时无法下载' } } : { contentType: 'image/png', body: resultImage }));
  await page.route('**/api/student/image-jobs', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { jobs } });
    const body = route.request().postDataJSON();
    const job = { id: body.requestId, kind: body.kind, workId: body.workId, status: 'pending' };
    jobs.push(job); status.remaining = 0; status.pendingJobId = job.id; status.pendingStatus = 'pending';
    const reply = { ...job };
    if (completeOnPost) { job.status = 'completed'; delete status.pendingJobId; delete status.pendingStatus; }
    return route.fulfill({ status: 201, json: { job: reply } });
  });
  await page.route('**/api/student/image-jobs/*/result', route => route.fulfill({ contentType: 'image/png', body: resultImage }));
  await page.goto('/');
  await page.evaluate(async ({ workId }) => {
    const { saveSounds } = await import('/src/storage.js'), { encodeWav } = await import('/src/audio.js');
    await saveSounds([{ id: workId, name: '等待配图的声音', createdAt: 1, duration: 0.1, blob: encodeWav(new Float32Array(2400), 24000) }]);
  }, { workId });
  await page.reload();
  await page.evaluate(userId => window.dispatchEvent(new CustomEvent('freeimpro-student-session', { detail: { user: { id: userId, name: '测试同学', role: 'student' } } })), userId);
  await page.locator('.sound-open').click(); await page.locator('.character-edit').click();
  return {
    status, jobs,
    get registerCalls() { return registerCalls; },
    complete() { jobs[0].status = 'completed'; delete status.pendingJobId; delete status.pendingStatus; },
    processing() { jobs[0].status = 'processing'; status.pendingStatus = 'processing'; },
  };
}
async function submit(page) {
  await page.locator('#photo-file').setInputFiles({ name: 'synthetic-photo.png', mimeType: 'image/png', buffer: photo });
  await expect(page.locator('#generate-character')).toBeEnabled(); await page.locator('#generate-character').click();
  await expect(page.locator('#character-status')).toContainText('等待老师处理');
  await expect(page.locator('#save-character')).toBeEnabled();
}
async function stored(page) {
  return page.evaluate(async () => {
    const sound = (await (await import('/src/storage.js')).listSounds())[0];
    return { requestId: sound.imageRequest?.id || null, hasAvatar: Boolean(sound.avatar), hasPhoto: Boolean(sound.photo), imageUpdatedAt: sound.imageUpdatedAt };
  });
}
const refresh = page => page.evaluate(() => window.dispatchEvent(new Event('online')));

test('saving an unchanged pending photo draft preserves its request and receives the completed work image', async ({ page }) => {
  const workflow = await fixture(page); await submit(page); const requestId = (await stored(page)).requestId;
  expect(requestId).toBe(workflow.jobs[0].id);
  await page.locator('#save-character').click(); await expect(page.locator('#toast')).toContainText('照片草稿已保存');
  expect((await stored(page)).requestId).toBe(requestId);
  workflow.complete(); await refresh(page);
  await expect.poll(async () => (await stored(page)).hasAvatar).toBe(true);
  expect((await stored(page)).requestId).toBeNull(); await expect(page.locator('#avatar-preview')).toBeVisible();
  expect(workflow.status.remaining).toBe(0);
});

test('an image completed during pending draft encoding survives the final local save', async ({ page }) => {
  const workflow = await fixture(page); await submit(page);
  await page.evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toBlob; let deferred = false;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...options) {
      if (!deferred && this.width === 256 && this.height === 256) {
        deferred = true; window.__draftEncoding = true; window.__finishDraftEncoding = () => encode.call(this, callback, ...options);
      } else encode.call(this, callback, ...options);
    };
  });
  await page.locator('#save-character').click(); await expect.poll(() => page.evaluate(() => window.__draftEncoding)).toBe(true);
  workflow.complete(); await refresh(page); await expect.poll(async () => (await stored(page)).hasAvatar).toBe(true);
  const completed = await stored(page);
  await page.evaluate(() => window.__finishDraftEncoding()); await expect(page.locator('#save-character')).toBeEnabled();
  expect(await stored(page)).toEqual(completed);
});

test('saving a changed crop invalidates the old image binding while retaining the used daily allowance', async ({ page }) => {
  const workflow = await fixture(page); await submit(page);
  await page.locator('#crop-zoom').evaluate(input => { input.value = '2'; input.dispatchEvent(new Event('input')); });
  await page.locator('#save-character').click(); await expect(page.locator('#toast')).toContainText('照片草稿已保存');
  expect((await stored(page)).requestId).toBeNull();
  workflow.complete(); await refresh(page);
  await expect(page.locator('#character-status')).toContainText('今天的图片额度已使用');
  expect((await stored(page)).hasAvatar).toBe(false); expect(workflow.status.remaining).toBe(0);
});

test('a grey generation button offers explicit registration and then the fixed-identity step', async ({ page }) => {
  const workflow = await fixture(page, { registered: false, hasAvatar: false });
  await expect(page.locator('#generate-character')).toBeDisabled();
  await expect(page.locator('#image-next-action')).toHaveText('注册生图账号'); expect(workflow.registerCalls).toBe(0);
  await page.locator('#image-next-action').click(); await expect.poll(() => workflow.registerCalls).toBe(1);
  await expect(page.locator('#image-next-action')).toHaveText('先制作固定形象');
  await page.locator('#image-next-action').click();
  await expect(page.locator('#character-sound')).toHaveValue('__student_profile__');
  await expect(page.locator('#character-status')).toContainText('请先拍照');
  await page.locator('#photo-file').setInputFiles({ name: 'synthetic-face.png', mimeType: 'image/png', buffer: photo });
  await expect(page.locator('#generate-character')).toBeEnabled();
});

for (const statusError of [401, 503]) {
  test(`image status ${statusError} explains the connection problem instead of requesting an API key`, async ({ page }) => {
    await fixture(page, { statusError });
    await expect(page.locator('#generate-character')).toBeDisabled();
    await expect(page.locator('#image-next-action')).toHaveText('去连接课堂');
    await expect(page.locator('#character-status')).toContainText(statusError === 401 ? '课堂登录已失效' : '暂时无法读取图片状态');
    await expect(page.locator('#image-service-note')).not.toContainText('API 密钥');
    await page.evaluate(() => window.addEventListener('freeimpro-open-image-account', () => { window.__connectImages = true; }));
    await page.locator('#image-next-action').click(); await expect.poll(() => page.evaluate(() => window.__connectImages)).toBe(true);
  });
}

test('pending requests show teacher waiting and claimed requests show generation without enabling another request', async ({ page }) => {
  const workflow = await fixture(page); await submit(page);
  await expect(page.locator('#generate-character')).toBeDisabled(); workflow.processing(); await refresh(page);
  await expect(page.locator('#character-status')).toContainText('老师正在生成图像');
  await expect(page.locator('#generate-character')).toBeDisabled(); expect(workflow.jobs).toHaveLength(1);
});

test('an optional fixed-avatar download failure does not block an authenticated work-image request', async ({ page }) => {
  const workflow = await fixture(page, { avatarError: 503 }); await submit(page);
  expect(workflow.jobs).toHaveLength(1); expect(workflow.jobs[0].kind).toBe('work');
  expect((await stored(page)).requestId).toBe(workflow.jobs[0].id);
  await expect(page.locator('#character-status')).toContainText('等待老师处理');
});

test('a result received during request synchronization is shown immediately and does not revert to waiting', async ({ page }) => {
  const workflow = await fixture(page, { completeOnPost: true });
  await page.locator('#photo-file').setInputFiles({ name: 'synthetic-photo.png', mimeType: 'image/png', buffer: photo });
  await expect(page.locator('#generate-character')).toBeEnabled(); await page.locator('#generate-character').click();
  await expect(page.locator('#avatar-preview')).toBeVisible();
  await expect(page.locator('#character-status')).toContainText('形象已保存在本地');
  await expect(page.locator('#character-status')).not.toContainText('等待老师处理');
  expect((await stored(page)).hasAvatar).toBe(true); expect(workflow.jobs[0].status).toBe('completed');
});

test('generation gives separate recovery reasons for a missing photo and a missing saved sound', async ({ page }) => {
  await fixture(page); await expect(page.locator('#character-status')).toContainText('请先拍照');
  await page.locator('#character-sound').selectOption('');
  await expect(page.locator('#character-status')).toContainText('请先选择一份已命名并保存的声音');
  await expect(page.locator('#generate-character')).toBeDisabled();
});
