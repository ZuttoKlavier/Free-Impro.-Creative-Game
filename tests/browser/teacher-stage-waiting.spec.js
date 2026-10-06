import { test, expect } from '@playwright/test';
import { encodeWav } from '../../src/audio.js';
import { useSilentAudioClock } from './audio-clock.js';

const origin = process.env.TEST_APP_ORIGIN;
const headers = { Origin: origin };
const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');

async function setup(page, playwright) {
  await useSilentAudioClock(page);
  await page.goto('/teacher.html');
  const registered = await page.request.post('/api/teacher/register', { headers, data: { username: 'stage_' + crypto.randomUUID().slice(0, 8), password: 'password123', name: '舞台老师', role: 'teacher' } });
  expect(registered.status()).toBe(200);
  await page.reload(); await page.locator('#classroom-tab').click();
  await page.locator('#class-name').fill('舞台旁的等待伙伴');
  await page.locator('#class-capacity').fill('3');
  await page.locator('#create-form button').click();
  await expect(page.locator('.place-marker')).toHaveCount(3);
  const code = await page.locator('.room-code strong').textContent(), students = [];
  async function addStudent(name) {
    const request = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: headers });
    const account = await request.post('/api/student/register', { data: { username: 'stage_student_' + crypto.randomUUID().slice(0, 8), password: 'password123', name, role: 'student' } });
    expect(account.status()).toBe(200);
    const user = (await account.json()).user;
    const joined = await request.post('/api/student/join', { data: { code } });
    expect(joined.status()).toBe(200);
    const room = (await joined.json()).classroom;
    const student = { id: user.id, request, roomId: room.id };
    const submitted = await request.post(`/api/student/classrooms/${room.id}/submit`, { data: { name: name + '的声音', audio, requestId: crypto.randomUUID() } });
    expect(submitted.status()).toBe(201);
    students.push(student);
    return student;
  }
  await addStudent('小雨'); await addStudent('小林');
  await page.locator('#refresh-class').click();
  await expect(page.locator('.rhythm-track')).toHaveCount(2);
  await page.locator('#performance-bpm').fill('60');
  await page.locator('#performance-bpm').press('Tab');
  return { students, addStudent, dispose: () => Promise.all(students.map(s => s.request.dispose())) };
}

const waitButton = (page, id) => page.locator(`[data-waiting-toggle="${id}"]`);
const card = (page, id) => waitButton(page, id).locator('..');
const exitButton = (page, id) => page.locator(`[data-perform-toggle="${id}"]`);

test('waiting works beside the live stage and receives new voices in fullscreen while reserved positions remain editable', async ({ page, playwright }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = await setup(page, playwright), [first, second] = fixture.students;
  try {
    const stage = await page.locator('.performance-stage').boundingBox(), waiting = await page.locator('.performance-waiting').boundingBox();
    expect(waiting.x).toBeGreaterThanOrEqual(stage.x + stage.width);
    expect(Math.abs(waiting.y - stage.y)).toBeLessThan(2);
    const marker = page.locator('[data-slot="1"]'), before = await marker.getAttribute('style');
    await marker.focus(); await marker.press('ArrowRight');
    await expect(page.locator('#layout-status')).toHaveText('位置已保存');
    expect(await marker.getAttribute('style')).not.toBe(before);
    await waitButton(page, first.id).click();
    await expect(card(page, first.id)).toContainText('已选首轮');
    await page.locator('#performance-play').click();
    await expect(card(page, first.id)).toBeHidden();
    await expect(card(page, second.id)).toBeVisible();
    await waitButton(page, second.id).click();
    await expect(waitButton(page, second.id)).toHaveText('取消等待');
    await waitButton(page, second.id).click();
    await expect(waitButton(page, second.id)).toHaveText('下一遍加入');
    await page.locator('#performance-fullscreen').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('teacher-performance'))).toBe(true);
    const third = await fixture.addStudent('小何');
    await expect(waitButton(page, third.id)).toBeVisible({ timeout: 10000 });
    await waitButton(page, third.id).click();
    await expect(waitButton(page, third.id)).toHaveText('取消等待');
    await expect(page.locator(`[data-performer="${third.id}"]`)).toBeVisible({ timeout: 6500 });
    await expect(card(page, third.id)).toBeHidden();
    await exitButton(page, third.id).click();
    await expect(page.locator(`[data-performer="${third.id}"]`)).toHaveCount(0);
    await expect(card(page, third.id)).toBeVisible();
    await expect(page.locator(`[data-performer="${first.id}"]`)).toBeVisible();
    await page.locator('.teacher-performance').screenshot({ path: 'test-results/teacher-stage-waiting-fullscreen.png' });
    await page.locator('#performance-stop').click();
    await page.locator('#performance-fullscreen').click();
    expect(errors).toEqual([]);
  } finally { await fixture.dispose(); }
});

test('narrow stage keeps waiting, joining, cancellation and immediate exit reachable without horizontal overflow', async ({ page, playwright }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await setup(page, playwright), [first, second] = fixture.students;
  try {
    const stage = await page.locator('.performance-stage').boundingBox(), waiting = await page.locator('.performance-waiting').boundingBox();
    expect(waiting.y).toBeGreaterThanOrEqual(stage.y + stage.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await waitButton(page, first.id).click();
    await page.locator('#performance-play').click();
    await waitButton(page, second.id).click();
    await expect(waitButton(page, second.id)).toHaveText('取消等待');
    await waitButton(page, second.id).click();
    await expect(waitButton(page, second.id)).toHaveText('下一遍加入');
    await exitButton(page, first.id).click();
    await expect(page.locator('.performer')).toHaveCount(0);
    await expect(card(page, first.id)).toBeVisible();
    await expect(page.locator('#performance-play')).toBeDisabled();
    await waitButton(page, second.id).click();
    await expect(page.locator(`[data-performer="${second.id}"]`)).toBeVisible({ timeout: 6500 });
    await page.locator('.teacher-performance').screenshot({ path: 'test-results/teacher-stage-waiting-narrow.png' });
    await page.locator('#performance-stop').click();
  } finally { await fixture.dispose(); }
});

test('a cancelled start cannot revive while the next fullscreen start is awaiting its own server reply', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), [first] = fixture.students;
  const gates = [], reached = [], arrivals = [];
  for (let i = 0; i < 2; i++) {
    gates.push(new Promise(resolve => { arrivals[i] = resolve; }));
    reached.push(Promise.withResolvers());
  }
  let starts = 0;
  try {
    await waitButton(page, first.id).click();
    await expect(card(page, first.id)).toContainText('已选首轮');
    await page.locator('#performance-fullscreen').click();
    await page.route('**/api/teacher/classrooms/*/performance', async route => {
      const body = route.request().postDataJSON();
      const index = body.playing ? starts++ : -1;
      if (index < 0 || index > 1) { await route.continue(); return; }
      const response = await route.fetch();
      reached[index].resolve();
      await gates[index];
      await route.fulfill({ response });
    });
    await page.locator('#performance-play').click(); await reached[0].promise;
    await page.locator('#performance-stop').click();
    await page.locator('#performance-play').click();
    arrivals[0](); await reached[1].promise;
    await expect(page.locator('#performance-play')).toHaveText('正在准备…');
    await expect(page.locator('.performer')).toHaveCount(0);
    await expect(page.locator('#loop-number')).toHaveText('—');
    arrivals[1]();
    await expect(page.locator(`[data-performer="${first.id}"]`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('teacher-performance'))).toBe(true);
    await page.locator('#performance-stop').click();
    await expect.poll(async () => (await (await first.request.get(`/api/student/classrooms/${first.roomId}`)).json()).classroom.performance.playing).toBe(false);
    await page.locator('#performance-fullscreen').click();
  } finally { arrivals.forEach(resolve => resolve()); await fixture.dispose(); }
});

test('waiting and layer approval buttons stay locked together across fullscreen polling and commit one replacement', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), [first, second] = fixture.students;
  const gate = Promise.withResolvers(), reached = Promise.withResolvers();
  let approvals = 0;
  try {
    await waitButton(page, first.id).click();
    await page.locator('#performance-play').click();
    await page.locator('#performance-fullscreen').click();
    const submitted = await second.request.post(`/api/student/classrooms/${second.roomId}/submit`, { data: { name: '小林的新声音', audio, requestId: crypto.randomUUID() } });
    expect(submitted.status()).toBe(201);
    const pending = (await submitted.json()).classroom.submissions.find(s => s.status === 'pending');
    const waitingAccept = page.locator(`[data-decision="accept"][data-id="${pending.id}"]`);
    const layerAccept = page.locator(`[data-performance-decision="accept"][data-submission="${pending.id}"]`);
    await expect(waitingAccept).toBeVisible({ timeout: 10000 });
    await page.route(`**/api/teacher/submissions/${pending.id}/accept`, async route => {
      approvals++; reached.resolve(); await gate.promise; await route.continue();
    });
    await waitingAccept.click(); await reached.promise;
    await expect(layerAccept).toBeDisabled();
    const third = await fixture.addStudent('刷新中的小何');
    await expect(waitButton(page, third.id)).toBeVisible({ timeout: 10000 });
    await expect(waitingAccept).toBeDisabled(); await expect(layerAccept).toBeDisabled();
    await expect(page.locator(`[data-decision="reject"][data-id="${pending.id}"]`)).toBeDisabled();
    // Even an already queued click on the other copy must not send another approval.
    await layerAccept.dispatchEvent('click');
    gate.resolve();
    await expect.poll(async () => (await (await second.request.get(`/api/student/classrooms/${second.roomId}`)).json()).classroom.submissions.find(s => s.id === pending.id)?.status, { timeout: 6500 }).toBe('current');
    expect(approvals).toBe(1);
    await expect(page.locator(`[data-performer="${first.id}"]`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.locator('#performance-stop').click(); await page.locator('#performance-fullscreen').click();
  } finally { gate.resolve(); await fixture.dispose(); }
});

test('a delayed fullscreen acceptance reply preserves a newer pending replacement already received by polling', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), [first, second] = fixture.students;
  const gate = Promise.withResolvers(), reached = Promise.withResolvers();
  try {
    await waitButton(page, first.id).click();
    await page.locator('#performance-play').click(); await page.locator('#performance-fullscreen').click();
    const submit = name => second.request.post(`/api/student/classrooms/${second.roomId}/submit`, { data: { name, audio, requestId: crypto.randomUUID() } });
    const firstRequest = await submit('已接受但回包未到');
    const pending = (await firstRequest.json()).classroom.submissions.find(s => s.status === 'pending');
    const accept = page.locator(`[data-decision="accept"][data-id="${pending.id}"]`);
    await expect(accept).toBeVisible({ timeout: 10000 });
    await page.route(`**/api/teacher/submissions/${pending.id}/accept`, async route => {
      const response = await route.fetch(); reached.resolve(); await gate.promise; await route.fulfill({ response });
    });
    await accept.click(); await reached.promise;
    const latestRequest = await submit('后来提交的最新声音');
    const latest = (await latestRequest.json()).classroom.submissions.find(s => s.status === 'pending');
    const latestAccept = page.locator(`[data-decision="accept"][data-id="${latest.id}"]`);
    await expect(latestAccept).toBeVisible({ timeout: 10000 });
    // Keep a teacher GET reply pending to observe the UI after the old POST
    // arrives but before any normal poll could repair a rollback.
    const refreshGate = Promise.withResolvers(), refreshReached = Promise.withResolvers();
    await page.route(`**/api/teacher/classrooms/${second.roomId}`, async route => {
      refreshReached.resolve(); await refreshGate.promise; await route.continue();
    });
    gate.resolve();
    try {
      await refreshReached.promise;
      await expect(latestAccept).toBeVisible();
      await expect(page.locator(`[data-performance-decision="accept"][data-submission="${latest.id}"]`)).toBeVisible();
    } finally { refreshGate.resolve(); }
    await expect(accept).toHaveCount(0);
    await expect(latestAccept).toBeVisible();
    await expect(page.locator(`[data-performer="${first.id}"]`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.locator('#performance-stop').click(); await page.locator('#performance-fullscreen').click();
  } finally { gate.resolve(); await fixture.dispose(); }
});
