import { test, expect } from '@playwright/test';
import { useSilentAudioClock } from './audio-clock.js';
import { setBarsTouch, setTempoTouch, dragTempoTouch } from './rhythm-touch-controls.js';
test.use({ hasTouch: true });

async function openEditor(page) {
  await useSilentAudioClock(page); await page.setViewportSize({ width: 568, height: 320 }); await page.goto('/');
  await page.evaluate(async () => {
    const { saveSounds } = await import('/src/storage.js'), { encodeWav } = await import('/src/audio.js');
    await saveSounds([{ id: 'touch-controls', name: '触屏节奏', createdAt: Date.now(), duration: .04, blob: encodeWav(new Float32Array(960), 24000), rhythm: { bars: 1, steps: Array.from({ length: 16 }, (_, i) => i === 0 ? 16 : false) } }]);
  });
  await page.reload(); await page.locator('#library-tab').tap(); await page.locator('.sound-open').tap();
  await page.getByRole('button', { name: '节奏编创', exact: true }).tap();
  await page.evaluate(async () => {
    const { Sequencer } = await import('/src/sequencer.js'), play = Sequencer.prototype.play;
    Sequencer.prototype.play = async function () { window.__touchEngine = this; return play.call(this); };
  });
}

test('touch bar buttons reach both limits, retain the saved draft until save, and expose no keyboard input nodes', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByRole('button', { name: '减少小节', exact: true })).toBeDisabled();
  await setBarsTouch(page, 16); await expect(page.getByLabel('编创小节数')).toHaveText('16');
  await expect(page.locator('[data-pages] button')).toHaveCount(16);
  await expect(page.getByRole('button', { name: '增加小节', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '第 16 小节', exact: true }).tap(); await page.locator('[data-step="15"]').tap();
  await setBarsTouch(page, 1); await expect(page.getByLabel('编创小节数')).toHaveText('1');
  await expect(page.getByRole('button', { name: '减少小节', exact: true })).toBeDisabled();
  await expect(page.locator('[data-pages] button')).toHaveCount(1);
  const editable = await page.locator('.student-rhythm').evaluate(dialog => [...dialog.querySelectorAll('input, textarea, [contenteditable]')].map(node => ({ tag: node.tagName, type: node.type, inputMode: node.inputMode, editable: node.isContentEditable })));
  expect(editable).toEqual([{ tag: 'INPUT', type: 'range', inputMode: 'none', editable: false }]);
  await expect(page.locator('.student-rhythm input[type="number"], .student-rhythm input[type="text"], .student-rhythm textarea')).toHaveCount(0);
  const before = await page.evaluate(() => ({ height: innerHeight, visualHeight: visualViewport.height }));
  await setTempoTouch(page, 125); await page.getByRole('button', { name: '减慢试听速度', exact: true }).tap();
  expect(await page.evaluate(() => ({ height: innerHeight, visualHeight: visualViewport.height }))).toEqual(before);
  const saved = await page.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0].rhythm);
  expect(saved.bars).toBe(1); expect(saved.steps[0]).toBe(16);
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: '返回声音库', exact: true }).tap();
  await expect(page.locator('.student-rhythm')).toBeVisible();
  await page.getByRole('button', { name: '保存节奏', exact: true }).tap(); await expect(page.locator('[data-status]')).toContainText('节奏已保存');
  const afterSave = await page.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0].rhythm);
  expect(afterSave).toEqual(saved);
});

test('touch slider updates audition speed before release and speed buttons clamp at 40 and 240 without changing a sounding buffer', async ({ page }) => {
  await openEditor(page); await page.getByRole('button', { name: '播放试听', exact: true }).tap();
  await expect.poll(() => page.evaluate(() => window.__touchEngine?.getState().tracks[0]?.sounding.length)).toBe(1);
  const sounding = await page.evaluate(() => window.__touchEngine.getState().tracks[0].sounding[0]);
  await dragTempoTouch(page, 200, async () => {
    const value = Number(await page.getByRole('slider', { name: '试听速度', exact: true }).inputValue());
    expect(value).toBeGreaterThan(100); await expect(page.getByLabel('试听速度值')).toHaveText(String(value));
    expect(await page.evaluate(() => window.__touchEngine.getState().bpm)).toBe(value);
  });
  await setTempoTouch(page, 40); await expect(page.getByLabel('试听速度值')).toHaveText('40');
  await expect(page.getByRole('button', { name: '减慢试听速度', exact: true })).toBeDisabled();
  await setTempoTouch(page, 240); await expect(page.getByLabel('试听速度值')).toHaveText('240');
  await expect(page.getByRole('button', { name: '加快试听速度', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '减慢试听速度', exact: true }).tap(); await expect(page.getByLabel('试听速度值')).toHaveText('239');
  await page.getByRole('button', { name: '加快试听速度', exact: true }).tap(); await expect(page.getByLabel('试听速度值')).toHaveText('240');
  const current = await page.evaluate(time => window.__touchEngine.getState().tracks[0].sounding.find(note => note.time === time), sounding.time);
  expect(current?.duration).toBe(sounding.duration);
  await page.getByRole('button', { name: '停止', exact: true }).tap();
});

test('changing the bar count by touch stops preview, keeps the tempo, and saves the resized rhythm', async ({ page }) => {
  await openEditor(page); await setTempoTouch(page, 170); await page.getByRole('button', { name: '播放试听', exact: true }).tap();
  await expect.poll(() => page.locator('.student-rhythm-grid .is-playing').count()).toBe(16);
  await page.getByRole('button', { name: '增加小节', exact: true }).tap();
  await expect(page.getByLabel('编创小节数')).toHaveText('2'); await expect(page.getByLabel('试听速度值')).toHaveText('170');
  await expect(page.locator('.student-rhythm-grid .is-playing, [data-playback-shapes] g')).toHaveCount(0);
  expect(await page.locator('[data-progress]').evaluate(progress => progress.value)).toBe(0);
  await expect(page.getByRole('button', { name: '播放试听', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '保存节奏', exact: true }).tap(); await expect(page.locator('[data-status]')).toContainText('节奏已保存');
  const saved = await page.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0].rhythm);
  expect(saved.bars).toBe(2); expect(saved.steps).toHaveLength(32); expect(saved.steps[0]).toBe(16); expect(saved.steps.slice(16)).toEqual(Array(16).fill(false));
});

test('a concurrent touch cannot clear or copy a bar while the drawing pointer continues a held note', async ({ page }) => {
  await openEditor(page); await setBarsTouch(page, 2);
  await page.getByRole('button', { name: '清空本小节', exact: true }).tap();
  const center = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const start = await center(page.locator('[data-step="0"]')), next = await center(page.locator('[data-step="1"]')), end = await center(page.locator('[data-step="3"]'));
  const clear = await center(page.getByRole('button', { name: '清空本小节', exact: true })), copy = await center(page.getByRole('button', { name: '复制到下一小节', exact: true }));
  await page.evaluate(() => {
    window.__secondTouchClicks = [];
    for (const name of ['clear', 'copy']) document.querySelector(`[data-${name}]`).addEventListener('click', () => window.__secondTouchClicks.push(name));
  });
  // Chrome suppresses clicks from a second touch; keep a drawing pointer held while real touch taps reach the buttons.
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(next.x, next.y);
  await expect(page.locator('.student-rhythm-grid .held')).toHaveCount(2);
  for (const point of [clear, copy]) {
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.locator('.student-rhythm-grid .held')).toHaveCount(2);
  }
  expect(await page.evaluate(() => window.__secondTouchClicks)).toEqual(['clear', 'copy']);
  await page.mouse.move(end.x, end.y); await page.mouse.up();
  await expect(page.locator('.student-rhythm-grid .held')).toHaveCount(4);
  await page.getByRole('button', { name: '保存节奏', exact: true }).tap(); await expect(page.locator('[data-status]')).toContainText('节奏已保存');
  const saved = await page.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0].rhythm);
  expect(saved.steps[0]).toBe(4); expect(saved.steps.slice(16)).toEqual(Array(16).fill(false));
  await page.getByRole('button', { name: '复制到下一小节', exact: true }).tap();
  await page.getByRole('button', { name: '第 2 小节', exact: true }).tap(); await expect(page.locator('.student-rhythm-grid .held')).toHaveCount(4);
  await page.getByRole('button', { name: '清空本小节', exact: true }).tap(); await expect(page.locator('.student-rhythm-grid .held')).toHaveCount(0);
  await page.getByRole('button', { name: '第 1 小节', exact: true }).tap(); await expect(page.locator('.student-rhythm-grid .held')).toHaveCount(4);
});
