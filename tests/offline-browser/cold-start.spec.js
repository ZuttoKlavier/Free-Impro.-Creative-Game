import { test, expect } from '@playwright/test';

test('production app cold-opens offline, restores works and known classroom records, and queues new submissions', async ({ page, context, playwright }) => {
  const origin = process.env.TEST_APP_ORIGIN, headers = { Origin: origin };
  const teacher = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: headers });
  try {
    const username = 'offline_' + crypto.randomUUID().slice(0, 8);
    expect((await teacher.post('/api/register', { data: { username: username + '_t', role: 'teacher', name: '离线老师', password: 'password123' } })).status()).toBe(200);
    const created = await teacher.post('/api/classrooms', { data: { name: '离线声音课堂', capacity: 1, background: '厨房' } });
    const room = (await created.json()).classroom;
    await page.goto('/');
    await expect(page.locator('#offline-ready')).toHaveText('已准备离线创作');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect((await page.request.post('/api/student/register', { headers, data: { username: username + '_s', role: 'student', name: '离线学生', password: 'password123' } })).status()).toBe(200);
    expect((await page.request.post('/api/student/join', { headers, data: { code: room.code } })).status()).toBe(200);
    await page.reload(); await page.locator('#classroom-tab').click();
    await expect(page.locator('#room-detail')).toContainText('离线声音课堂');
    await page.locator('#studio-tab').click(); await page.locator('#demo').click();
    await page.getByLabel('给声音起个名字').fill('离线保留的杯子'); await page.getByRole('button', { name: '存入声音库' }).click();
    await expect(page.locator('#library-count')).toHaveText('1');
    const cachedPaths = await page.evaluate(async () => {
      const paths = [];
      for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) paths.push(new URL(request.url).pathname);
      return paths;
    });
    expect(cachedPaths).toContain('/index.html'); expect(cachedPaths.some(path => path.startsWith('/api/'))).toBe(false);
    await context.setOffline(true); await page.close();
    const cold = await context.newPage();
    await cold.goto('/?class=' + room.code);
    await expect(cold.locator('#room-detail')).toContainText('离线声音课堂');
    await expect(cold.locator('#connection-note')).toContainText('连接中断');
    await cold.locator('#join-form button').click();
    await expect(cold.locator('#toast')).toContainText('本地课堂记录');
    await cold.locator('#library-tab').click(); await expect(cold.locator('.sound-card h3')).toHaveText('离线保留的杯子');
    await cold.locator('.submit-sound').click(); await cold.locator('#submit-dialog button[value="submit"]').click();
    await expect(cold.locator('#outbox-panel')).toContainText('待发送作品');
    await cold.locator('#studio-tab').click(); await cold.locator('#demo').click();
    await cold.getByLabel('给声音起个名字').fill('离线新声音'); await cold.getByRole('button', { name: '存入声音库' }).click();
    await expect(cold.locator('#library-count')).toHaveText('2');
    await context.setOffline(false); await cold.locator('#classroom-tab').click();
    await cold.locator('#refresh-class').click();
    await expect(cold.locator('.student-submissions')).toContainText('离线保留的杯子');
    await expect(cold.locator('#outbox-panel')).toBeEmpty();
  } finally { await context.setOffline(false); await teacher.dispose(); }
});
