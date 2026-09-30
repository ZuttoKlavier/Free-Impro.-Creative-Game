import { test, expect } from '@playwright/test';
import { encodeWav } from '../../src/audio.js';

const origin = process.env.TEST_APP_ORIGIN;
const headers = { Origin: origin };
const sample = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');

async function setup(page, playwright, names = ['小雨']) {
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

test('student tracks edit independently by click, paint, erase and keyboard, and persist on reload', async ({ page, playwright }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = await setup(page, playwright, ['小雨', '小林']);
  const [first, second] = fixture.students;
  try {
    await expect(row(page, first.id).locator('.rhythm-step')).toHaveCount(16);
    await saved(page, () => step(page, first.id, 0).click());
    await saved(page, () => drag(page, first.id, 4, 7));
    for (const index of [0, 4, 5, 6, 7]) await expect(step(page, first.id, index)).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, second.id).locator('[aria-pressed="true"]')).toHaveCount(0);
    await saved(page, () => drag(page, first.id, 5, 6));
    await expect(step(page, first.id, 5)).toHaveAttribute('aria-pressed', 'false');
    await expect(step(page, first.id, 6)).toHaveAttribute('aria-pressed', 'false');
    await step(page, second.id, 0).focus(); await step(page, second.id, 0).press('ArrowRight');
    await expect(step(page, second.id, 1)).toBeFocused();
    await saved(page, () => step(page, second.id, 1).press('Space'));
    await reloadClassroom(page);
    await expect(step(page, first.id, 0)).toHaveAttribute('aria-pressed', 'true');
    await expect(step(page, first.id, 4)).toHaveAttribute('aria-pressed', 'true');
    await expect(step(page, first.id, 5)).toHaveAttribute('aria-pressed', 'false');
    await expect(step(page, first.id, 6)).toHaveAttribute('aria-pressed', 'false');
    await expect(step(page, first.id, 7)).toHaveAttribute('aria-pressed', 'true');
    await expect(step(page, second.id, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(step(page, second.id, 0)).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#rhythm-toggle').click(); await expect(step(page, first.id, 0)).not.toBeVisible();
    await page.locator('#rhythm-toggle').click(); await expect(step(page, first.id, 0)).toBeVisible();
    await page.screenshot({ path: 'test-results/teacher-rhythm-editor.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally { await fixture.dispose(); }
});

test('bar navigation, copying and clearing are scoped, and shrinking permanently discards the tail', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), student = fixture.students[0];
  try {
    await saved(page, () => page.locator('#rhythm-bars').selectOption('3'));
    await saved(page, () => step(page, student.id, 0).click());
    await saved(page, () => row(page, student.id).locator('[data-copy-bar]').click());
    await page.locator('[data-rhythm-bar="1"]').click();
    await expect(step(page, student.id, 16)).toHaveAttribute('aria-pressed', 'true');
    await saved(page, () => row(page, student.id).locator('[data-clear-bar]').click());
    await expect(step(page, student.id, 16)).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-rhythm-bar="2"]').click();
    await expect(row(page, student.id).locator('[data-copy-bar]')).toBeDisabled();
    await saved(page, () => step(page, student.id, 47).click());
    await saved(page, () => page.locator('#rhythm-bars').selectOption('1'));
    await expect(page.locator('[data-rhythm-bar]')).toHaveCount(1);
    await expect(step(page, student.id, 0)).toHaveAttribute('aria-pressed', 'true');
    await saved(page, () => page.locator('#rhythm-bars').selectOption('3'));
    await page.locator('[data-rhythm-bar="2"]').click();
    await expect(row(page, student.id).locator('.rhythm-step[aria-pressed="true"]')).toHaveCount(0);
    await reloadClassroom(page); await expect(page.locator('#rhythm-bars')).toHaveValue('3');
    await page.locator('[data-rhythm-bar="0"]').click(); await expect(step(page, student.id, 0)).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-rhythm-bar="2"]').click(); await expect(step(page, student.id, 47)).toHaveAttribute('aria-pressed', 'false');
  } finally { await fixture.dispose(); }
});

test('accepting a replacement changes the sound while preserving its student rhythm', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), student = fixture.students[0];
  try {
    await saved(page, () => step(page, student.id, 8).click());
    const response = await submit(student, '新的木头声音'); expect(response.status()).toBe(201);
    const pending = (await response.json()).classroom.submissions.find(s => s.status === 'pending');
    await page.locator('#refresh-class').click();
    const accept = page.locator(`[data-decision="accept"][data-id="${pending.id}"]`);
    await expect(accept).toBeVisible(); await accept.click();
    await expect(page.locator(`[data-decision="accept"][data-id="${pending.id}"]`)).toHaveCount(0);
    await expect(row(page, student.id)).toContainText('新的木头声音');
    await expect(step(page, student.id, 8)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.rhythm-track')).toHaveCount(1);
    await reloadClassroom(page); await expect(step(page, student.id, 8)).toHaveAttribute('aria-pressed', 'true');
  } finally { await fixture.dispose(); }
});

test('failed autosave keeps local marks and retry persists them', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright), student = fixture.students[0];
  try {
    await page.route('**/api/teacher/classrooms/*/arrangement', route => route.fulfill({ status: 503, json: { error: '测试断线，请重试' } }));
    await step(page, student.id, 2).click();
    await expect(page.locator('#rhythm-retry')).toBeVisible();
    await expect(step(page, student.id, 2)).toHaveAttribute('aria-pressed', 'true');
    const remote = await page.request.get(`/api/teacher/classrooms/${fixture.roomId}`);
    expect((await remote.json()).classroom.arrangement.tracks.find(t => t.studentId === student.id).steps[2]).toBe(false);
    await page.unroute('**/api/teacher/classrooms/*/arrangement');
    await saved(page, () => page.locator('#rhythm-retry').click());
    await expect(page.locator('#rhythm-retry')).not.toBeVisible();
    await reloadClassroom(page); await expect(step(page, student.id, 2)).toHaveAttribute('aria-pressed', 'true');
  } finally { await fixture.dispose(); }
});

test('50-track classroom fixture and 16-bar navigation stay inside a tablet viewport', async ({ page, playwright }) => {
  const fixture = await setup(page, playwright);
  try {
    const response = await page.request.get(`/api/teacher/classrooms/${fixture.roomId}`), room = (await response.json()).classroom;
    const members = Array.from({ length: 50 }, (_, i) => ({ student_id: 'fixture-' + i, admitted: 1, slot: i + 1, name: '学生 ' + (i + 1) }));
    const largeRoom = { ...room, capacity: 50, memberCount: 50, members,
      layout: members.map((member, i) => ({ slot: member.slot, x: 0.05 + (i % 10) * 0.1, y: 0.1 + Math.floor(i / 10) * 0.2 })),
      submissions: members.map(member => ({ ...room.submissions[0], id: 'submission-' + member.student_id, student_id: member.student_id, name: '声音 ' + member.slot })),
      arrangement: { bars: 16, revision: 0, tracks: members.map(member => ({ studentId: member.student_id, steps: Array(256).fill(false) })) },
    };
    await page.route('**/api/teacher/classrooms', route => route.fulfill({ json: { classrooms: [largeRoom] } }));
    await page.setViewportSize({ width: 768, height: 1024 }); await page.locator('#refresh-class').click();
    await expect(page.locator('.rhythm-track')).toHaveCount(50);
    await expect(page.locator('[data-rhythm-bar]')).toHaveCount(16);
    await page.locator('[data-rhythm-bar="15"]').click();
    await expect(page.locator('.rhythm-track').last().locator('.rhythm-step')).toHaveCount(16);
    await expect(page.locator('.rhythm-track').last().locator('[data-step="255"]')).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.rhythm-editor').screenshot({ path: 'test-results/teacher-rhythm-50-tracks.png' });
  } finally { await fixture.dispose(); }
});
