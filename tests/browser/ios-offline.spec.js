import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildStudentDocument } from '../../scripts/ios-offline-build.js';

const html = await buildStudentDocument();
const bridge = readFileSync('ios/Bridge.js', 'utf8');
test.use({ userAgent: 'Mozilla/5.0 FreeImproStudent/1 iOS', viewport: { width: 390, height: 844 } });

async function openBundledApp(page, context, { failing = false } = {}) {
  const calls = [], webRequests = [];
  await page.exposeBinding('nativeRequest', async (_, body) => {
    if (body.action === 'cancel-request' || body.action === 'disconnect') return true;
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
  return { calls, webRequests };
}

test('bundled iOS app records, saves and reopens offline without requesting any server', async ({ page, context }) => {
  const { calls, webRequests } = await openBundledApp(page, context);
  await page.locator('#classroom-tab').click();
  await expect(page.locator('#auth-panel')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.locator('#library-tab').click();
  const button = await page.locator('#studio-tab').boundingBox();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down();
  await expect(page.locator('#capture-overlay')).toBeVisible(); await page.waitForTimeout(750); await page.mouse.up();
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
  await page.locator('#classroom-tab').click(); await page.locator('#auth-username').fill('测试学生'); await page.locator('#auth-password').fill(room.code); await page.locator('#auth-submit').click();
  await expect(page.locator('.room-title h2')).toHaveText('iOS 联网课堂');
  expect(calls[0].path).toBe('/api/student/enter-classroom');
  await page.locator('#send-sound').click(); await page.locator('#submit-dialog button[value="submit"]').click();
  await expect(page.locator('.submission-item strong')).toHaveText('离线作品');
  await expect(page.locator('.submission-item audio')).toHaveAttribute('src', /^blob:/);
  await page.locator('#logout').click(); await expect(page.locator('#auth-panel')).toBeVisible();
  const before = calls.length; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.reload();
  await expect(page.locator('#library-count')).toHaveText('1'); await page.locator('#classroom-tab').click(); await expect(page.locator('#auth-panel')).toBeVisible();
  expect(calls).toHaveLength(before); expect(webRequests).toEqual([]);
});

test('failed classroom login leaves offline creation available without exposing service links', async ({ page, context }) => {
  const { calls, webRequests } = await openBundledApp(page, context, { failing: true });
  await page.locator('#classroom-tab').click(); await page.locator('#auth-username').fill('测试学生'); await page.locator('#auth-password').fill('123456'); await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-error')).toContainText('可继续离线创作');
  await expect(page.locator('#auth-error')).not.toContainText('https://');
  await page.locator('#library-tab').click(); await page.locator('#demo').click(); await expect(page.locator('#editor')).toBeVisible();
  expect(calls.map(c => c.path)).toEqual(['/api/student/enter-classroom']); expect(webRequests).toEqual([]);
});
