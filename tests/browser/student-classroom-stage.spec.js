import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { encodeWav } from '../../src/audio.js';
import { useSilentAudioClock } from './audio-clock.js';

const headers = () => ({ Origin: process.env.TEST_APP_ORIGIN });
async function teacherRoom(page, background = '操场') {
  await page.request.post('/api/teacher/register', { headers: headers(), data: { username: 'stage_' + crypto.randomUUID().slice(0, 8), password: 'password123', role: 'teacher', name: '舞台教师' } });
  return (await (await page.request.post('/api/teacher/classrooms', { headers: headers(), data: { name: '同步操场课堂', capacity: 15, background } })).json()).classroom;
}
const rhythm = start => ({ bars: 1, steps: Array.from({ length: 16 }, (_, i) => i === start ? 4 : false) });

test('submitting a saved local rhythm sends all sustained notes with its sample and shows them in the teacher editor', async ({ page, context }) => {
  const room = await teacherRoom(page);
  await page.request.post('/api/student/enter-classroom', { headers: headers(), data: { name: '编创学生', code: room.code } });
  await page.goto('/');
  await page.evaluate(async () => {
    const { saveSounds } = await import('/src/storage.js'), { encodeWav } = await import('/src/audio.js');
    await saveSounds([0, 8].map((step, index) => ({ id: 'composed-' + index, name: index ? '更换的长音' : '编创的长音', createdAt: index, duration: .8, blob: encodeWav(new Float32Array(19200).fill(.2), 24000), rhythm: { bars: 1, steps: Array.from({ length: 16 }, (_, i) => i === step ? 4 : false) } })));
  });
  await page.reload(); await page.locator('#classroom-tab').click(); await page.locator('#open-my-classroom').click();
  await page.locator('#class-sound').selectOption('composed-0');
  await page.locator('#send-sound').click();
  const sent = page.waitForRequest(request => request.url().endsWith('/submit') && request.method() === 'POST');
  await page.locator('#submit-dialog button[value="submit"]').click();
  expect((await sent).postDataJSON().rhythm).toEqual(rhythm(0));
  await expect(page.locator('.student-submissions')).toContainText('编创的长音');
  let snapshot = (await (await page.request.get(`/api/teacher/classrooms/${room.id}`)).json()).classroom;
  expect(snapshot.submissions[0].rhythm).toEqual(rhythm(0));
  expect(snapshot.arrangement.tracks[0].steps).toEqual(rhythm(0).steps);
  const teacher = await context.newPage(); await teacher.goto('/teacher.html');
  await expect(teacher.locator('.rhythm-held')).toHaveCount(4);
  await page.locator('#class-sound').selectOption('composed-1'); await page.locator('#send-sound').click(); await page.locator('#submit-dialog button[value="submit"]').click();
  await expect(page.locator('.status-pill.pending')).toBeVisible();
  await teacher.locator('#refresh-class').click();
  await teacher.locator('.teacher-waiting').getByRole('button', { name: '接受更换', exact: true }).click();
  await expect(teacher.locator('.rhythm-step[data-step="8"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(teacher.locator('.rhythm-step[data-step="0"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(teacher.locator('.rhythm-held')).toHaveCount(4);
  snapshot = (await (await page.request.get(`/api/teacher/classrooms/${room.id}`)).json()).classroom;
  expect(snapshot.arrangement.tracks[0].steps).toEqual(rhythm(8).steps);
  await teacher.close();
});

test('students watch the same scene, hear the current loop and follow teacher changes without editing controls', async ({ page, browser }) => {
  const teacherContext = await browser.newContext(), teacher = await teacherContext.newPage();
  await useSilentAudioClock(teacher); await useSilentAudioClock(page);
  await page.addInitScript(() => {
    window.__stageVoices = [];
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = original.call(this), start = source.start.bind(source);
      source.start = (...args) => { window.__stageVoices.push(args); return start(...args); };
      return source;
    };
  });
  try {
    const room = await teacherRoom(teacher);
    const student = (await (await teacher.request.post('/api/student/enter-classroom', { headers: headers(), data: { name: '演奏同学', code: room.code } })).json()).user;
    const png = new PNG({ width: 16, height: 16 }); png.data.fill(180);
    const audio = Buffer.from(await encodeWav(new Float32Array(19200).fill(.2), 24000).arrayBuffer()).toString('base64');
    const submission = await teacher.request.post(`/api/student/classrooms/${room.id}/submit`, { headers: headers(), data: { name: '操场脚步', requestId: crypto.randomUUID(), audio, image: 'data:image/png;base64,' + PNG.sync.write(png).toString('base64'), imageKind: 'avatar', rhythm: rhythm(0) } });
    expect(submission.ok()).toBe(true);
    await page.request.post('/api/student/enter-classroom', { headers: headers(), data: { name: '观看同学', code: room.code } });
    await page.goto('/'); await page.locator('#classroom-tab').click(); await page.locator('#open-my-classroom').click();
    await expect(page.locator('.student-classroom-stage h3')).toHaveText('操场声音舞台');
    await expect(page.locator('[data-stage-position]')).toHaveText('等待教师播放');
    await page.locator('[data-stage-audio]').click();
    await teacher.goto('/teacher.html'); await teacher.locator('#performance-add-all').click(); await teacher.locator('#performance-play').click();
    await expect(teacher.locator('#performance-stop')).toBeEnabled();
    await expect(page.locator('[data-student-performer]')).toHaveCount(1);
    await expect(page.locator('[data-student-performer] img')).toHaveAttribute('src', /^blob:/);
    await expect(page.locator('[data-student-performer] img')).toHaveJSProperty('naturalWidth', 16);
    await expect(page.locator('[data-stage-position]')).toContainText('第 1 / 1 小节');
    await expect.poll(() => page.evaluate(() => window.__stageVoices.length)).toBeGreaterThan(0);
    await expect(page.locator('.student-classroom-stage button')).toHaveCount(1);
    await expect(page.locator('#performance-play, #performance-bpm, [data-track-volume]')).toHaveCount(0);
    await expect(page.locator('[data-student-performer]')).not.toHaveAttribute('draggable', 'true');
    const difference = async () => {
      const teacherProgress = await teacher.locator('#loop-progress').evaluate(el => el.value);
      const studentProgress = await page.locator('[data-stage-progress]').evaluate(el => el.value);
      return Math.min(Math.abs(teacherProgress - studentProgress), 1 - Math.abs(teacherProgress - studentProgress));
    };
    await expect.poll(difference).toBeLessThan(.07);
    await teacher.locator('#performance-swing').fill('50');
    await expect.poll(async () => (await (await page.request.get(`/api/student/classrooms/${room.id}/stage`)).json()).stage.performance.timeline?.swing).toBe(.5);
    await expect.poll(difference).toBeLessThan(.04);
    await teacher.locator('#performance-bpm').fill('160'); await teacher.locator('#performance-bpm').dispatchEvent('change');
    await expect.poll(async () => (await (await page.request.get(`/api/student/classrooms/${room.id}/stage`)).json()).stage.performance.timeline?.bpm).toBe(160);
    await expect.poll(difference).toBeLessThan(.07);
    const performer = teacher.locator(`[data-performer="${student.id}"]`);
    await performer.focus(); await performer.press('Shift+ArrowRight');
    const teacherLeft = await performer.evaluate(el => el.style.left);
    await expect.poll(() => page.locator('[data-student-performer]').evaluate(el => el.style.left)).toBe(teacherLeft);
    await page.screenshot({ path: 'output/classroom-fixes-2026-10-20/student-synced-stage.png', fullPage: true });
    await page.locator('#classroom-back').click();
    const voiceCount = await page.evaluate(() => window.__stageVoices.length);
    await page.waitForTimeout(350); expect(await page.evaluate(() => window.__stageVoices.length)).toBe(voiceCount);
    await page.locator('#open-my-classroom').click();
    await expect.poll(difference).toBeLessThan(.07);
    const record = await page.locator('#studio-tab').boundingBox();
    await page.mouse.move(record.x + record.width / 2, record.y + record.height / 2); await page.mouse.down();
    await expect(page.locator('#studio-tab')).toHaveClass(/recording/);
    const beforeCapture = await page.evaluate(() => window.__stageVoices.length);
    await page.waitForTimeout(750); expect(await page.evaluate(() => window.__stageVoices.length)).toBe(beforeCapture);
    await page.mouse.up();
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#classroom-tab').click(); await page.locator('#open-my-classroom').click();
    await expect.poll(difference).toBeLessThan(.07);
    await teacher.locator('#performance-stop').click();
    await expect(page.locator('[data-stage-position]')).toHaveText('等待教师播放');
    await expect(page.locator('[data-student-performer]')).toHaveCount(0);
    await expect(page.locator('[data-stage-progress]')).toHaveJSProperty('value', 0);
  } finally { await teacherContext.close(); }
});
