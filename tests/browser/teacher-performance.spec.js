import { test, expect } from '@playwright/test';
import { encodeWav } from '../../src/audio.js';
import { useSilentAudioClock } from './audio-clock.js';

const origin = process.env.TEST_APP_ORIGIN;
const headers = { Origin: origin };
const sample = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');

async function setup(page, playwright, names = ['小雨']) {
  await useSilentAudioClock(page);
  await page.goto('/teacher.html');
  const teacher = await page.request.post('/api/teacher/register', { headers, data: { username: 'rhythm_' + crypto.randomUUID().slice(0, 8), password: 'password123', name: '节奏老师', role: 'teacher' } });
  expect(teacher.status()).toBe(200);
  await page.reload(); await page.locator('#classroom-tab').click();
  await page.locator('#class-name').fill('声音节奏实验');
  await page.locator('#class-capacity').fill(String(names.length));
  await page.locator('#create-form button').click();
  await expect(page.locator('.place-marker')).toHaveCount(names.length);
  const code = await page.locator('.room-code strong').textContent();
  const students = [];
  for (const name of names) {
    const request = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: headers });
    const registered = await request.post('/api/student/register', { data: { username: 'student_' + crypto.randomUUID().slice(0, 8), password: 'password123', name, role: 'student' } });
    expect(registered.status()).toBe(200);
    const user = (await registered.json()).user;
    const joined = await request.post('/api/student/join', { data: { code } });
    expect(joined.status()).toBe(200);
    const room = (await joined.json()).classroom;
    const student = { request, id: user.id, roomId: room.id };
    const submitted = await submit(student, name + '的杯子');
    expect(submitted.status()).toBe(201);
    students.push(student);
  }
  await page.locator('#refresh-class').click();
  await expect(page.locator('.rhythm-track')).toHaveCount(names.length);
  return { students, roomId: students[0].roomId, dispose: () => Promise.all(students.map(s => s.request.dispose())) };
}

function submit(student, name) {
  return student.request.post(`/api/student/classrooms/${student.roomId}/submit`, { data: { name, audio: sample, requestId: crypto.randomUUID() } });
}
const row = (page, id) => page.locator(`.rhythm-track[data-student-id="${id}"]`);
const step = (page, id, index) => row(page, id).locator(`.rhythm-step[data-step="${index}"]`);
async function saved(page, action) {
  const response = page.waitForResponse(r => r.url().endsWith('/arrangement') && r.request().method() === 'POST' && r.ok());
  await action(); await response;
  await expect(page.locator('#rhythm-status')).toHaveText('编排已保存');
}
async function drag(page, id, start, end) {
  await step(page, id, start).scrollIntoViewIfNeeded();
  const from = await step(page, id, start).boundingBox(), to = await step(page, id, end).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: Math.abs(end - start) * 5 });
  await page.mouse.up();
}
async function reloadClassroom(page) {
  await page.reload(); await page.locator('#classroom-tab').click(); await expect(page.locator('.rhythm-editor')).toBeVisible();
}

const participant = (page, id) => page.locator(`[data-performance-member="${id}"]`);
const toggle = (page, id) => page.locator(`[data-perform-toggle="${id}"]`);
async function tempo(page, bpm) { await page.locator('#performance-bpm').fill(String(bpm)); await page.locator('#performance-bpm').press('Tab'); }

test('teacher Android background event stops playback and releases classroom control', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), student = fixture.students[0];
  try {
    await saved(page, () => step(page, student.id, 0).click());
    await toggle(page, student.id).click(); await page.locator('#performance-play').click();
    await expect(page.locator('#performance-stop')).toBeEnabled();
    await page.evaluate(() => window.dispatchEvent(new Event('freeimpro-teacher-background')));
    await expect(page.locator('#performance-stop')).toBeDisabled();
    await expect(page.locator('#loop-progress')).toHaveAttribute('value', '0');
    await expect.poll(async () => (await (await student.request.get(`/api/student/classrooms/${student.roomId}`)).json()).classroom.performance.playing).toBe(false);
  } finally { await fixture.dispose(); }
});

test('teacher selects voices, loops continuously, queues joining, exits immediately and stops at zero', async ({ page, playwright }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = await setup(page, playwright, ['小雨', '小林']);
  const [first, second] = fixture.students;
  try {
    await saved(page, () => step(page, first.id, 0).click());
    await saved(page, () => step(page, second.id, 4).click());
    await tempo(page, 120);
    await toggle(page, first.id).click(); await expect(participant(page, first.id)).toContainText('已选首轮');
    await page.locator('#performance-play').click();
    await expect(page.locator('#performance-stop')).toBeEnabled();
    await expect(page.locator('.performer')).toHaveCount(1);
    await expect(page.locator('#loop-position')).toContainText('第 1 遍');
    await expect(page.locator('#loop-number')).toHaveText('1');
    await expect(page.locator('#mix-count')).toHaveText('1');
    await expect(page.locator('#loop-countdown')).toContainText('距下一遍');
    await expect.poll(() => page.locator('.performance-progress').evaluate(el => Number(el.style.getPropertyValue('--loop-progress')))).toBeGreaterThan(0);
    await toggle(page, second.id).click(); await expect(participant(page, second.id)).toContainText('等待下一遍');
    await expect(page.locator('#loop-joining')).toContainText('1 位');
    await expect(page.locator('#mix-waiting')).toContainText('＋1');
    await expect(page.locator('.performer')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('#mix-count')).toHaveText('2');
    await expect(page.locator('#loop-position')).toContainText('第 2 遍');
    await expect.poll(() => page.locator('#loop-progress').evaluate(el => el.value)).toBeGreaterThan(.2);
    await page.locator('.teacher-performance').screenshot({ path: 'test-results/teacher-layer-preview.png', style: '#toast { visibility: hidden !important; }' });
    await expect(page.locator('.teacher-waiting [data-member-slot="2"]')).toBeHidden();
    await toggle(page, first.id).click(); await expect(page.locator(`[data-performer="${first.id}"]`)).toHaveCount(0);
    await expect(page.locator('.teacher-waiting [data-member-slot="1"]')).toBeVisible();
    await expect(page.locator('#loop-position')).toContainText('第 3 遍', { timeout: 5000 });
    await expect(page.locator('#performance-play')).toBeDisabled();
    await page.locator('.teacher-performance').screenshot({ path: 'test-results/teacher-performance.png' });
    await page.locator('#performance-stop').click();
    await expect(page.locator('#loop-progress')).toHaveAttribute('value', '0');
    await expect(page.locator('#loop-number')).toHaveText('—');
    await expect(page.locator('#loop-countdown')).toHaveText('等待播放');
    await expect(page.locator('.loop-beats .is-current')).toHaveCount(0);
    await expect(page.locator('.performer')).toHaveCount(0);
    await expect(participant(page, second.id)).toContainText('已选首轮');
    await page.locator('#performance-play').click(); await expect(page.locator('#loop-position')).toContainText('第 1 遍');
    await page.locator('#performance-stop').click();
    expect(errors).toEqual([]);
  } finally { await fixture.dispose(); }
});

test('group layers wait together, cancellation survives loading, and the meter adapts to 16 bars and a narrow screen', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright, ['小雨', '小林', '小何']);
  const [first, second, third] = fixture.students;
  try {
    for (const student of fixture.students) await saved(page, () => step(page, student.id, 0).click());
    await tempo(page, 60);
    await toggle(page, first.id).click();
    await expect(participant(page, first.id)).toContainText('已选首轮');
    await page.locator('#performance-play').click();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/teacher/submissions/*/audio', async route => { await gate; await route.continue(); });
    await page.locator('#performance-add-all').click();
    await expect(page.locator('#performance-add-all')).toHaveText('正在准备声音…');
    await toggle(page, second.id).click(); // Cancel this one while its sound loads.
    release();
    await expect(participant(page, third.id)).toContainText('等待下一遍');
    await expect(page.locator('#mix-waiting')).toHaveText('＋1 个等待加入');
    await expect(page.locator('.performer')).toHaveCount(2, { timeout: 5500 });
    await expect(participant(page, second.id)).toContainText('等待区');
    await page.locator('#performance-remove-all').click();
    await expect(page.locator('.performer')).toHaveCount(0);
    await expect(page.locator('#mix-count')).toHaveText('0');
    await expect(page.locator('#performance-play')).toBeDisabled(); // Empty mix still loops.
    await page.locator('#performance-stop').click();
    await saved(page, () => page.locator('#rhythm-bars').selectOption('16'));
    await expect(page.locator('[data-loop-bar]')).toHaveCount(16);
    await page.locator('#performance-add-all').click();
    await expect(page.locator('#mix-count')).toHaveText('3');
    await page.locator('#performance-play').click();
    await expect(page.locator('#loop-countdown')).toContainText('距下一遍');
    await expect(page.locator('.loop-beats .is-current')).toHaveCount(1);
    const countdown = await page.locator('#loop-countdown').textContent();
    expect(Number(countdown.match(/[\d.]+/)[0])).toBeGreaterThan(60);
    await page.locator('.performance-progress').screenshot({ path: 'test-results/teacher-loop-meter.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-loop-bar="15"]')).toBeVisible();
    await page.locator('.teacher-performance').screenshot({ path: 'test-results/teacher-performance-narrow.png' });
    expect(await page.locator('.teacher-performance').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('.performance-progress').screenshot({ path: 'test-results/teacher-loop-meter-narrow.png' });
    await page.locator('#performance-stop').click();
  } finally { await fixture.dispose(); }
});

test('all layers cancelled while downloading stay unselected after their downloads finish', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright, ['小雨', '小林']);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await page.route('**/api/teacher/submissions/*/audio', async route => { await gate; await route.continue(); });
    await page.locator('#performance-add-all').click();
    await expect(page.locator('#performance-add-all')).toHaveText('正在准备声音…');
    await expect(page.locator('#performance-play')).toBeDisabled();
    await page.locator('#performance-remove-all').click();
    release();
    for (const student of fixture.students) {
      await expect(participant(page, student.id).locator('[data-track-volume]')).toBeEnabled();
      await expect(toggle(page, student.id)).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(page.locator('#mix-count')).toHaveText('0');
    await expect(page.locator('#performance-play')).toBeEnabled();
    await page.locator('#performance-add-all').click();
    await expect(page.locator('#mix-count')).toHaveText('2');
    await expect(page.locator('#performance-stop')).toBeDisabled(); // Selection never auto-starts playback.
  } finally { release(); await fixture.dispose(); }
});

test('playing edits are pending, two-loop resize applies, live controls work, and stopping retains changes', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), student = fixture.students[0];
  try {
    await saved(page, () => step(page, student.id, 0).click());
    await tempo(page, 120); await toggle(page, student.id).click(); await expect(participant(page, student.id)).toContainText('已选首轮');
    await page.locator('#performance-play').click();
    await expect(page.locator('#performance-play')).toBeDisabled();
    await saved(page, () => step(page, student.id, 8).click());
    await expect(row(page, student.id)).toHaveClass(/pending-rhythm/);
    await expect(row(page, student.id)).not.toHaveClass(/pending-rhythm/, { timeout: 5000 });
    await saved(page, () => page.locator('#rhythm-bars').selectOption('3'));
    await expect(page.locator('#performance-message')).toContainText('两遍循环结束后改为 3 小节');
    await expect(page.locator('#loop-position')).toContainText('/ 3', { timeout: 6000 });
    await page.locator('#performance-swing').fill('30'); await page.locator('#performance-volume').fill('45');
    await expect(page.locator('#swing-value')).toHaveText('30%'); await expect(page.locator('#volume-value')).toHaveText('45%');
    await tempo(page, 180); await expect(page.locator('#performance-tempo')).toHaveValue('180');
    await page.locator('[data-track-volume]').fill('60');
    await page.locator('#performance-stop').click();
    await expect(page.locator('#rhythm-bars')).toHaveValue('3');
    await expect(step(page, student.id, 8)).toHaveAttribute('aria-pressed', 'true');
  } finally { await fixture.dispose(); }
});

test('approval during playback preserves the old sample until the next loop and keeps the voice active', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), student = fixture.students[0];
  try {
    await tempo(page, 60);
    await saved(page, () => step(page, student.id, 0).click());
    await toggle(page, student.id).click(); await expect(participant(page, student.id)).toContainText('已选首轮');
    await page.locator('#performance-play').click(); await expect(page.locator('.performer')).toHaveCount(1);
    await page.locator('#performance-fullscreen').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    const submitted = await submit(student, '新木头');
    const pending = (await submitted.json()).classroom.submissions.find(s => s.status === 'pending');
    // Fullscreen must receive the new request without rebuilding/exiting the stage.
    await expect(page.locator(`[data-performance-decision="accept"][data-submission="${pending.id}"]`)).toBeVisible({ timeout: 9000 });
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.locator(`[data-performance-decision="accept"][data-submission="${pending.id}"]`).click();
    const before = (await (await student.request.get(`/api/student/classrooms/${student.roomId}`)).json()).classroom;
    expect(before.submissions.find(s => s.id === pending.id).status).toBe('accepted');
    expect(before.submissions.find(s => s.status === 'current').name).not.toBe('新木头');
    await expect.poll(async () => (await (await student.request.get(`/api/student/classrooms/${student.roomId}`)).json()).classroom.submissions.find(s => s.id === pending.id)?.status, { timeout: 6500 }).toBe('current');
    await expect(page.locator('.performer')).toHaveCount(1);
    await expect(participant(page, student.id)).toContainText('正在演奏');
    await page.locator('#performance-stop').click();
    await page.locator('#performance-fullscreen').click();
    await expect(step(page, student.id, 0)).toHaveAttribute('aria-pressed', 'true');
  } finally { await fixture.dispose(); }
});

test('already loaded voices keep looping through an API outage and synchronize after recovery', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), student = fixture.students[0];
  try {
    await saved(page, () => step(page, student.id, 0).click());
    await tempo(page, 240); await toggle(page, student.id).click(); await expect(participant(page, student.id)).toContainText('已选首轮');
    await page.locator('#performance-play').click(); await expect(page.locator('.performer')).toHaveCount(1);
    await page.route('**/api/teacher/classrooms/*/performance', route => route.abort());
    await page.locator('#performance-volume').fill('55');
    await expect(page.locator('#performance-network')).toContainText('继续演奏');
    await expect(page.locator('#loop-position')).toContainText('第 3 遍', { timeout: 5000 });
    await expect(page.locator('#performance-play')).toBeDisabled();
    await page.unroute('**/api/teacher/classrooms/*/performance');
    await page.locator('#performance-stop').click();
    await expect.poll(async () => (await (await student.request.get(`/api/student/classrooms/${student.roomId}`)).json()).classroom.performance.playing).toBe(false);
    await expect(page.locator('#performance-network')).toHaveText('');
  } finally { await fixture.dispose(); }
});
