import { test, expect } from '@playwright/test';
import { encodeWav } from '../../src/audio.js';
import { PNG } from 'pngjs';

async function account(page, role, name) {
  await page.goto('/');
  const response = await page.request.post('/api/register', { headers: { Origin: 'http://127.0.0.1:5173' }, data: { username: role + '_' + crypto.randomUUID().slice(0, 8), role, name, password: 'password123' } });
  expect(response.status()).toBe(200);
  await page.reload(); await page.locator('#classroom-tab').click(); await expect(page.locator('#signed-in')).toBeVisible();
}
async function create(page, capacity, background = '操场') {
  await account(page, 'teacher', '周老师');
  await page.locator('#class-name').fill('身边的声音'); await page.locator('#class-capacity').fill(String(capacity)); await page.locator('#class-background').selectOption(background);
  await page.locator('#create-form button').click(); await expect(page.locator('.place-marker')).toHaveCount(capacity);
  return page.locator('.room-code strong').textContent();
}
test('teacher receives one waiting character, drags a reserved place and preserves it through reload and expansion', async ({ page, browser }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const code = await create(page, 2);
  const studentContext = await browser.newContext(), student = await studentContext.newPage();
  try {
    await account(student, 'student', '小雨');
    const joined = await student.request.post('/api/join', { headers: { Origin: 'http://127.0.0.1:5173' }, data: { code } });
    const room = (await joined.json()).classroom;
    const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
    const png = new PNG({ width: 32, height: 32 }); png.data.fill(150);
    const response = await student.request.post(`/api/classrooms/${room.id}/submit`, { headers: { Origin: 'http://127.0.0.1:5173' }, data: { name: '杯子的声音', requestId: crypto.randomUUID(), audio, image: 'data:image/png;base64,' + PNG.sync.write(png).toString('base64'), imageKind: 'photo' } });
    expect(response.status()).toBe(201);
    await page.locator('#refresh-class').click(); await expect(page.locator('.teacher-waiting .member-card')).toContainText('小雨');
    await expect(page.locator('.teacher-waiting .submission-image')).toBeVisible(); await expect(page.locator('.teacher-waiting')).toContainText('照片草稿');
    await expect(page.locator('.teacher-summary>div').nth(1).locator('strong')).toHaveText('1');
    await expect(page.locator('.teacher-scene img')).toHaveCount(0);
    const marker = page.locator('[data-slot="1"]'); await marker.scrollIntoViewIfNeeded(); const before = await marker.getAttribute('style');
    const box = await marker.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 90, box.y + 65, { steps: 8 }); await page.mouse.up();
    await expect(page.locator('#layout-status')).toHaveText('位置已保存'); const saved = await marker.getAttribute('style'); expect(saved).not.toBe(before);
    await page.reload(); await page.locator('#classroom-tab').click(); await expect(marker).toHaveAttribute('style', saved);
    await page.locator('#increase-capacity').fill('3'); await page.locator('#capacity-form button').click(); await expect(page.locator('.place-marker')).toHaveCount(3); await expect(marker).toHaveAttribute('style', saved);
    await expect(page.locator('.member-place')).toHaveText('1');
    await page.screenshot({ path: 'test-results/teacher-preparation.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally { await studentContext.close(); }
});

test('failed position save restores old coordinates, then keyboard adjustment can retry', async ({ page }) => {
  await create(page, 1, '教室');
  const marker = page.locator('[data-slot="1"]'), before = await marker.getAttribute('style');
  await page.route('**/api/classrooms/*/layout', route => route.fulfill({ status: 503, json: { error: '暂时不可用' } }));
  await marker.focus(); await marker.press('ArrowRight'); await expect(page.locator('#layout-status')).toContainText('保存失败'); await expect(marker).toHaveAttribute('style', before);
  await page.unroute('**/api/classrooms/*/layout'); await marker.press('ArrowRight'); await expect(page.locator('#layout-status')).toHaveText('位置已保存');
  expect(await marker.getAttribute('style')).not.toBe(before);
});

test('50 places fit a narrow tablet scene without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 }); await create(page, 50, '厨房');
  await expect(page.locator('.teacher-scene')).toHaveClass(/kitchen/); await expect(page.locator('.place-marker')).toHaveCount(50);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/teacher-50-places.png', fullPage: true });
});
