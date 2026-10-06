import { test, expect } from '@playwright/test';
import { encodeWav } from '../../src/audio.js';

test('student queues rhythm offline, teacher accepts and receives the pattern', async ({ page, context }) => {
  const teacher = await context.newPage(), headers = { Origin: process.env.TEST_APP_ORIGIN };
  for (const role of ['teacher', 'student']) {
    const response = await page.request.post('/api/' + role + '/register', { headers, data: { username: role + crypto.randomUUID().slice(0, 8), password: 'password123', name: role, role } }); expect(response.status()).toBe(200);
  }
  const created = await page.request.post('/api/teacher/classrooms', { headers, data: { name: '学生编创测试', capacity: 15, background: '教室' } });
  const room = (await created.json()).classroom;
  await page.request.post('/api/student/join', { headers, data: { code: room.code } });
  const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
  await page.request.post(`/api/student/classrooms/${room.id}/submit`, { headers, data: { name: '课堂声音', audio, requestId: crypto.randomUUID() } });
  await page.goto('/');
  await page.evaluate(async () => {
    const { saveSounds } = await import('/src/storage.js'), { encodeWav } = await import('/src/audio.js');
    await saveSounds([{ id: 'rhythm-work', name: '我的节奏', createdAt: Date.now(), duration: .1, blob: encodeWav(new Float32Array(2400), 24000), rhythm: { bars: 1, steps: Array.from({ length: 16 }, (_, i) => i === 3 ? 4 : false) } }]);
  });
  await page.reload(); await page.locator('#classroom-tab').click(); await expect(page.locator('#send-rhythm')).toBeEnabled();
  await page.route('**/api/student/**', route => route.abort()); await page.locator('#send-rhythm').click();
  await expect(page.locator('#outbox-panel')).toContainText('我的节奏');
  await page.unroute('**/api/student/**'); await page.locator('#retry-queue').click();
  await expect(page.locator('.classroom-rhythm')).toContainText('待教师接受');
  await teacher.goto('/teacher.html'); await expect(teacher.locator('[data-rhythm-accept]')).toBeVisible();
  const step = teacher.locator('.rhythm-step[data-step="3"]'); await expect(step).toHaveAttribute('aria-pressed', 'false');
  await teacher.locator('[data-rhythm-accept]').click(); await expect(step).toHaveAttribute('aria-pressed', 'true');
  await expect(teacher.locator('.rhythm-held')).toHaveCount(4);
  await page.locator('#refresh-class').click(); await expect(page.locator('.classroom-rhythm')).toContainText('教师已接受');
});

test('phone rhythm editor persists a draft and preserves it through backup restore', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: '试试示例声音' }).click();
  await page.locator('#sound-name').fill('手机节奏'); await page.locator('#save').click();
  await expect(page.locator('#library-count')).toHaveText('1'); await page.locator('#library-tab').click();
  await page.locator('.sound-open').click(); await page.getByRole('button', { name: '节奏编创', exact: true }).click();
  await expect(page.locator('.rhythm-rotate')).toBeVisible();
  await expect(page.locator('.rhythm-landscape-content')).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.rhythm-rotate')).toBeHidden();
  const start = await page.getByRole('button', { name: '第 1 小节第 1 格', exact: true }).boundingBox();
  const end = await page.getByRole('button', { name: '第 1 小节第 4 格', exact: true }).boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.student-rhythm .held')).toHaveCount(4);
  await page.getByLabel('编创小节数').fill('2'); await page.getByLabel('编创小节数').press('Tab');
  await page.getByRole('button', { name: '复制到下一小节' }).click();
  await page.getByRole('button', { name: '第 2 小节', exact: true }).click();
  await expect(page.getByRole('button', { name: '第 2 小节第 1 格', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '播放试听', exact: true }).click();
  await expect.poll(() => page.locator('.student-rhythm progress').evaluate(el => el.value)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('button', { name: '保存节奏', exact: true }).click();
  await expect(page.locator('.student-rhythm [data-status]')).toContainText('节奏已保存');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const download = page.waitForEvent('download'); await page.locator('#export').click(); const backup = await (await download).path();
  await page.locator('.sound-open').click(); await page.getByRole('button', { name: '删除声音', exact: true }).click(); await page.locator('#delete-dialog').getByRole('button', { name: '删除声音', exact: true }).click();
  await expect(page.locator('#library-count')).toHaveText('0'); await page.locator('#backup-file').setInputFiles(backup);
  await expect(page.locator('#library-count')).toHaveText('1'); await page.locator('.sound-open').click(); await page.getByRole('button', { name: '节奏编创', exact: true }).click();
  await expect(page.getByLabel('编创小节数')).toHaveValue('2');
  await expect(page.getByRole('button', { name: '第 1 小节第 1 格', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.student-rhythm').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.locator('.student-rhythm .held')).toHaveCount(4);
});
