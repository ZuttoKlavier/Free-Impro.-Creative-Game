import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildStudentDocument } from '../../scripts/ios-offline-build.js';
import { encodeWav } from '../../src/audio.js';

const html = await buildStudentDocument();
const bridge = readFileSync('ios/Bridge.js', 'utf8');
test.use({ userAgent: 'Mozilla/5.0 FreeImproStudent/1 iOS', viewport: { width: 390, height: 844 } });

async function openBundledApp(page, context, { failing = false, nativeLogout = false } = {}) {
  const calls = [], webRequests = [];
  const recordings = new Map();
  await page.exposeBinding('nativeRequest', async (_, body) => {
    if (body.action === 'audio-record-start') { recordings.set(body.id, Date.now()); return true; }
    if (body.action === 'audio-record-level') return { id: body.id, active: recordings.has(body.id), duration: (Date.now() - recordings.get(body.id)) / 1000, rms: 0.14, peak: 0.2 };
    if (body.action === 'audio-record-stop') {
      const began = recordings.get(body.id); recordings.delete(body.id); if (!began) return null;
      const duration = Math.min(15, (Date.now() - began) / 1000), rate = 24000;
      const samples = Float32Array.from({ length: Math.round(duration * rate) }, (_, i) => 0.2 * Math.sin(i * 2 * Math.PI * 440 / rate));
      return { id: body.id, duration, mime: 'audio/wav', encoded: Buffer.from(await encodeWav(samples, rate).arrayBuffer()).toString('base64') };
    }
    if (body.action === 'audio-record-cancel') { recordings.delete(body.id); return true; }
    if (body.action === 'audio-play' || body.action === 'audio-play-stop') return true;
    if (body.action === 'disconnect' && nativeLogout) {
      await context.request.post('/api/student/logout', { data: {}, headers: { Origin: process.env.TEST_APP_ORIGIN, 'User-Agent': 'FreeImproStudent/1 iOS' } });
      return true;
    }
    if (body.action === 'cancel-request' || body.action === 'disconnect' || body.action === 'audio-session') return true;
    if (body.action !== 'classroom-request') throw new Error('Unexpected native action');
    calls.push(body);
    if (failing) throw new Error('暂时无法连接课堂，可继续离线创作。');
    const response = await context.request.fetch(body.path, { method: body.method, data: body.body, headers: { Origin: process.env.TEST_APP_ORIGIN, 'Content-Type': 'application/json', 'User-Agent': 'FreeImproStudent/1 iOS' } });
    return { status: response.status(), type: response.headers()['content-type'], encoded: (await response.body()).toString('base64') };
  });
  await page.addInitScript(() => { window.webkit = { messageHandlers: { localFiles: { postMessage: body => window.nativeRequest(body) } } }; });
  await page.addInitScript({ content: bridge });
  await page.route('**/*', route => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html });
    webRequests.push(route.request().url()); return route.abort();
  });
  await page.goto('/ios-bundled');
  await expect(page.locator('#library-view')).toBeVisible();
  await expect(page.getByRole('button', { name: '连接设置', exact: true })).toHaveCount(0);
  return { calls, webRequests };
}

test('bundled iOS app records, saves and reopens offline without requesting any server', async ({ page, context }) => {
  const { calls, webRequests } = await openBundledApp(page, context);
  await page.locator('#classroom-tab').click(); await page.locator('#open-my-classroom').click();
  await expect(page.locator('#auth-panel')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.locator('#library-tab').click();
  const button = await page.locator('#studio-tab').boundingBox();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down();
  await expect(page.locator('#capture-overlay')).toBeVisible();
  // The overlay also covers permission setup; measure the held recording only after capture starts.
  await expect(page.locator('#studio-tab')).toHaveClass(/recording/);
  await page.waitForTimeout(750); await page.mouse.up();
  await expect(page.locator('#editor')).toBeVisible();
  await page.locator('#sound-name').fill('离线录音'); await page.locator('#save').click();
  await expect(page.locator('#library-count')).toHaveText('1'); await page.locator('#library-tab').click();
  await page.locator('.sound-open').click(); await page.locator('.character-edit').click();
  await expect(page.locator('#image-service-note')).toContainText('可离线拍照');
  await expect(page.locator('#generate-character')).toBeDisabled();
  await page.reload(); await expect(page.locator('#library-count')).toHaveText('1');
  await expect(page.locator('#create-form')).toHaveCount(0); await expect(page.locator('#mode-register')).toBeHidden();
  expect(calls).toEqual([]); expect(webRequests).toEqual([]);
});

test('only explicit classroom entry connects; student upload and media use native requests', async ({ page, context }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const headers = { Origin: process.env.TEST_APP_ORIGIN, 'User-Agent': 'FreeImproTeacher/1' };
  const teacher = await context.request.post('/api/teacher/register', { headers, data: { name: '离线测试教师', username: 'ios' + suffix, password: 'password123', role: 'teacher' } }); expect(teacher.ok()).toBe(true);
  const created = await context.request.post('/api/teacher/classrooms', { headers, data: { name: 'iOS 联网课堂', capacity: 15, background: '教室' } });
  const room = (await created.json()).classroom;
  const { calls, webRequests } = await openBundledApp(page, context);
  expect(calls).toHaveLength(0);
  await page.locator('#demo').click(); await page.locator('#sound-name').fill('离线作品'); await page.locator('#save').click();
  await page.locator('#classroom-tab').click(); await page.locator('#open-my-classroom').click(); await page.locator('#auth-username').fill('测试学生'); await page.locator('#auth-password').fill(room.code); await page.locator('#auth-submit').click();
  await expect(page.locator('.room-title h2')).toHaveText('iOS 联网课堂');
  expect(calls[0].path).toBe('/api/student/enter-classroom');
  await page.locator('#send-sound').click(); await page.locator('#submit-dialog button[value="submit"]').click();
  await expect(page.locator('.submission-item strong')).toHaveText('离线作品');
  await expect(page.locator('.submission-item audio')).toHaveAttribute('src', /^blob:/);
  await page.locator('#logout').click(); await expect(page.locator('#student-classroom-home')).toBeVisible(); await page.locator('#open-my-classroom').click(); await expect(page.locator('#auth-panel')).toBeVisible();
  const before = calls.length; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.reload();
  await expect(page.locator('#library-count')).toHaveText('1'); await page.locator('#classroom-tab').click(); await page.locator('#open-my-classroom').click(); await expect(page.locator('#auth-panel')).toBeVisible();
  expect(calls).toHaveLength(before); expect(webRequests).toEqual([]);
});

test('failed classroom login leaves offline creation available without exposing service links', async ({ page, context }) => {
  const { calls, webRequests } = await openBundledApp(page, context, { failing: true });
  await page.locator('#classroom-tab').click(); await page.locator('#open-my-classroom').click(); await page.locator('#auth-username').fill('测试学生'); await page.locator('#auth-password').fill('123456'); await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-error')).toContainText('可继续离线创作');
  await expect(page.locator('#auth-error')).not.toContainText('https://');
  await page.locator('#library-tab').click(); await page.locator('#demo').click(); await expect(page.locator('#editor')).toBeVisible();
  expect(calls.map(c => c.path)).toEqual(['/api/student/enter-classroom']); expect(webRequests).toEqual([]);
});

test('bundled iOS account registration and login connect only after explicit successful authentication', async ({ page, context }) => {
  const { calls, webRequests } = await openBundledApp(page, context, { nativeLogout: true });
  const username = 'ios_auth_' + crypto.randomUUID().slice(0, 8), password = 'synthetic-native-password-123';
  expect(calls).toEqual([]);
  await page.locator('#classroom-tab').click();
  expect(calls).toEqual([]);
  await page.locator('#open-student-account').click();
  await expect(page.locator('#student-account-password-submit')).toBeEnabled();
  expect(calls.map(call => call.path)).toEqual(['/api/student/account/options']);
  expect(await page.evaluate(() => window.FreeImproClassroom.connected)).toBe(false);
  await expect(page.locator('#student-account-wechat')).toBeDisabled();
  await expect(page.locator('#student-account-apple')).toBeVisible();
  await expect(page.locator('#student-account-apple')).toBeDisabled();
  await page.locator('#student-account-register-mode').click();
  await page.locator('#student-account-name').fill('原生账号测试学生');
  await page.locator('#student-account-username').fill(username);
  await page.locator('#student-account-password').fill(password);
  await page.locator('#student-account-password-submit').click();
  await expect(page.locator('#student-account-signed-in')).toBeVisible();
  expect(calls.some(call => call.path === '/api/student/account/register')).toBe(true);
  expect(await page.evaluate(() => window.FreeImproClassroom.connected)).toBe(true);
  const registered = (await (await context.request.get('/api/student/me')).json()).user;
  await page.locator('#student-account-logout').click();
  await expect(page.locator('#student-account-signed-in')).toBeHidden();
  expect(await page.evaluate(() => window.FreeImproClassroom.connected)).toBe(false);
  expect((await context.request.get('/api/student/me')).status()).toBe(401);
  const before = calls.length;
  await page.reload();
  await page.locator('#classroom-tab').click();
  expect(calls).toHaveLength(before);
  await page.locator('#open-student-account').click();
  await expect(page.locator('#student-account-password-submit')).toBeEnabled();
  expect(await page.evaluate(() => window.FreeImproClassroom.connected)).toBe(false);
  await page.locator('#student-account-username').fill(username);
  await page.locator('#student-account-password').fill('synthetic-wrong-password');
  await page.locator('#student-account-password-submit').click();
  await expect(page.locator('#student-account-error')).toContainText('账号或密码不正确');
  expect(await page.evaluate(() => window.FreeImproClassroom.connected)).toBe(false);
  await page.locator('#student-account-password').fill(password);
  await page.locator('#student-account-password-submit').click();
  await expect(page.locator('#student-account-signed-in')).toBeVisible();
  expect(await page.evaluate(() => window.FreeImproClassroom.connected)).toBe(true);
  expect((await (await context.request.get('/api/student/me')).json()).user.id).toBe(registered.id);
  expect(webRequests).toEqual([]);
});
