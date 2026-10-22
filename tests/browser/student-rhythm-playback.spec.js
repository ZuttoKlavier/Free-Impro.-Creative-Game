import { test, expect } from '@playwright/test';
import { useSilentAudioClock } from './audio-clock.js';
import { setTempoTouch } from './rhythm-touch-controls.js';
test.use({ hasTouch: true });

// Drive the real sequencer with a controllable AudioContext. Scheduled sources
// keep their original buffers, offsets and playback cutoffs; UI rAF remains real.
async function controlledClock(page) {
  await page.addInitScript(() => {
    const buffer = (channels, length, sampleRate) => {
      const samples = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: index => samples[index] };
    };
    window.AudioContext = class {
      constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; this.sources = []; window.__rhythmClock = this; }
      createGain() { return { gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
      createBuffer(...args) { return buffer(...args); }
      createBufferSource() {
        const context = this;
        const source = { playbackRate: { value: 1 }, detune: { value: 0 }, connect() {}, disconnect() {}, start(time, offset, duration) { Object.assign(this, { time, offset, duration }); }, stop() { this.stoppedAt = context.currentTime; } };
        this.sources.push(source); return source;
      }
      async decodeAudioData() { if (window.__deferDecode) await new Promise(resolve => { window.__resumeDecode = resolve; }); return buffer(1, Math.round((window.__sampleDuration || .04) * 24000), 24000); }
      async resume() { this.state = 'running'; }
      async close() { this.state = 'closed'; }
    };
  });
}

async function openEditor(page, steps, bars = steps.length / 16, duration = .04) {
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto('/');
  await page.evaluate(async ({ steps, bars, duration }) => {
    const { saveSounds } = await import('/src/storage.js'), { encodeWav } = await import('/src/audio.js');
    const samples = Float32Array.from({ length: Math.round(duration * 24000) }, (_, i) => .15 * Math.sin(i * Math.PI / 24));
    await saveSounds([{ id: 'preview-follow', name: '试听跟随', createdAt: Date.now(), duration, blob: encodeWav(samples, 24000), rhythm: { bars, steps } }]);
  }, { steps, bars, duration });
  await page.reload(); await page.locator('#library-tab').click(); await page.locator('.sound-open').click();
  await page.evaluate(duration => { window.__sampleDuration = duration; }, duration);
  await page.getByRole('button', { name: '节奏编创', exact: true }).click();
  await setTempoTouch(page, 240);
  await page.evaluate(async () => {
    const { Sequencer } = await import('/src/sequencer.js'), play = Sequencer.prototype.play;
    Sequencer.prototype.play = async function () { window.__previewEngine = this; return play.call(this); };
  });
}
const activeSteps = page => page.locator('.student-rhythm-grid .is-playing').evaluateAll(cells => cells.map(cell => Number(cell.dataset.step)));
const selectedBar = page => page.locator('[data-pages] [aria-pressed="true"]').textContent();
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function advance(page, target) {
  await page.evaluate(async target => {
    const context = window.__rhythmClock, engine = window.__previewEngine;
    while (context.currentTime < target - 1e-9) { context.currentTime = Math.min(target, context.currentTime + .005); engine._pump(); }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, target + await page.evaluate(() => window.__previewBaseTime || 0));
}
async function play(page) {
  await page.getByRole('button', { name: '播放试听', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__previewEngine?.getState().playing)).toBe(true);
  await page.evaluate(() => { window.__previewBaseTime = window.__previewEngine._startTime - .025; });
}
async function savedSteps(page) { return page.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0].rhythm.steps); }
const pattern = (bars, notes) => Array.from({ length: bars * 16 }, (_, i) => notes[i] || false);

test('preview starts at bar one and follows audible boundaries rather than lookahead, including loop wrap', async ({ page }) => {
  await controlledClock(page); const steps = pattern(2, { 0: true, 16: true }); await openEditor(page, steps);
  await page.getByRole('button', { name: '第 2 小节', exact: true }).click(); await play(page);
  expect(await selectedBar(page)).toBe('1'); expect(await activeSteps(page)).toEqual([]);
  await advance(page, .024); expect(await activeSteps(page)).toEqual([]);
  expect(await page.evaluate(() => window.__rhythmClock.sources.some(source => source.time === .025))).toBe(true);
  await advance(page, .026); expect(await activeSteps(page)).toEqual([0]);
  await advance(page, 1.024); expect(await selectedBar(page)).toBe('1'); expect(await activeSteps(page)).toEqual([]);
  expect(await page.evaluate(() => window.__rhythmClock.sources.some(source => Math.abs(source.time - 1.025) < 1e-6))).toBe(true);
  await advance(page, 1.026); expect(await selectedBar(page)).toBe('2'); expect(await activeSteps(page)).toEqual([0]);
  await advance(page, 2.024); expect(await selectedBar(page)).toBe('2');
  await advance(page, 2.026); expect(await selectedBar(page)).toBe('1'); expect(await activeSteps(page)).toEqual([0]);
  await page.evaluate(() => { for (let i = 0; i < 12; i++) document.querySelector('[data-pages]').children[i % 2].click(); });
  await paint(page); expect(await selectedBar(page)).toBe('1');
  const keys = await page.locator('[data-water-shapes] [data-water-key]').evaluateAll(groups => groups.map(group => group.dataset.waterKey));
  expect(keys).toEqual(['0-0-0']); await expect(page.locator('[data-playback-shapes] [data-playing-step="0"]')).toHaveCount(1);
  expect(await savedSteps(page)).toEqual(steps);
  await page.getByRole('button', { name: '停止', exact: true }).click(); await page.getByRole('button', { name: '清空本小节', exact: true }).click();
  await play(page); await advance(page, 1.026); expect(await selectedBar(page)).toBe('2');
  await advance(page, 2.025); expect(await selectedBar(page)).toBe('1'); expect(await activeSteps(page)).toEqual([]);
});

test('held notes play the original recording once and leave the rest of their block silent and unlit', async ({ page }) => {
  await controlledClock(page); await openEditor(page, pattern(1, { 3: 5, 10: true })); await play(page);
  await advance(page, .15); expect(await activeSteps(page)).toEqual([]);
  await advance(page, .223); expect(await activeSteps(page)).toEqual([3, 4, 5, 6, 7]);
  await expect(page.locator('[data-water-shapes] .is-playing')).toHaveCount(1);
  await expect(page.locator('[data-playback-shapes] [data-playing-length="5"]')).toHaveCount(1);
  expect(await page.evaluate(() => {
    const source = window.__rhythmClock.sources.find(source => Math.abs(source.time - .2125) < 1e-6);
    return { bufferDuration: source.buffer.duration, offset: source.offset, duration: source.duration, rate: source.playbackRate.value, detune: source.detune.value };
  })).toEqual({ bufferDuration: .04, offset: 0, duration: .04, rate: 1, detune: 0 });
  await advance(page, .253); expect(await activeSteps(page)).toEqual([]);
  expect(await page.evaluate(() => window.__previewEngine.getState().step)).toBe(3);
  await advance(page, .35); expect(await activeSteps(page)).toEqual([]);
  await advance(page, .524); expect(await activeSteps(page)).toEqual([]);
  await advance(page, .526); expect(await activeSteps(page)).toEqual([]); await expect(page.locator('[data-playback-shapes] g')).toHaveCount(0);
  await advance(page, .66); expect(await activeSteps(page)).toEqual([10]);
  await advance(page, .691); expect(await activeSteps(page)).toEqual([]);
  expect(await page.evaluate(() => window.__previewEngine.getState().step)).toBe(10);
  await advance(page, .72); expect(await activeSteps(page)).toEqual([]);
});

test('edits highlight only the committed sounding pattern until the next loop and never change saved data during preview', async ({ page }) => {
  await controlledClock(page); const steps = pattern(1, { 0: 6 }); await openEditor(page, steps, 1, .4); await play(page); await advance(page, .05);
  await page.locator('[data-step="4"]').evaluate(cell => cell.click()); await paint(page);
  expect(await activeSteps(page)).toEqual([0, 1, 2, 3, 4, 5]);
  await expect(page.locator('[data-water-shapes] .is-playing')).toHaveCount(0);
  await expect(page.locator('[data-playback-shapes] [data-playing-length="6"]')).toHaveCount(1);
  expect(await savedSteps(page)).toEqual(steps);
  await advance(page, .401); expect(await activeSteps(page)).toEqual([]);
  await advance(page, 1.026); expect(await activeSteps(page)).toEqual([]);
  await advance(page, 1.28); expect(await activeSteps(page)).toEqual([4]);
  await expect(page.locator('[data-playback-shapes] [data-playing-length="1"]')).toHaveCount(1);
  await page.getByRole('button', { name: '停止', exact: true }).click(); await page.getByRole('button', { name: '保存节奏', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('节奏已保存'); expect(await savedSteps(page)).toEqual(pattern(1, { 4: true }));
});

test('single hits play only the original prefix and stop before later silent steps or hits', async ({ page }) => {
  await controlledClock(page); await openEditor(page, pattern(1, { 0: true, 2: true }), 1, .2); await play(page);
  await advance(page, .08); expect(await activeSteps(page)).toEqual([0]);
  expect(await page.evaluate(() => {
    const source = window.__rhythmClock.sources[0];
    return { bufferDuration: source.buffer.duration, offset: source.offset, duration: source.duration, rate: source.playbackRate.value };
  })).toEqual({ bufferDuration: .2, offset: 0, duration: .0625, rate: 1 });
  await advance(page, .089); expect(await activeSteps(page)).toEqual([]);
  expect(await page.evaluate(() => window.__previewEngine.getState().step)).toBe(1);
  await advance(page, .16); expect(await activeSteps(page)).toEqual([2]);
  await advance(page, .214); expect(await activeSteps(page)).toEqual([]);
  await advance(page, .351); expect(await activeSteps(page)).toEqual([]);
  await expect(page.locator('[data-playback-shapes] g')).toHaveCount(0);
});

test('stop, restart, background, pagehide, hidden document, portrait, and close clear every playback highlight', async ({ page }) => {
  await controlledClock(page); await openEditor(page, pattern(1, { 0: 8 }));
  const cleared = async () => { expect(await activeSteps(page)).toEqual([]); await expect(page.locator('[data-playback-shapes] g, [data-water-shapes] .is-playing')).toHaveCount(0); };
  const sounding = async () => { await play(page); expect(await activeSteps(page)).toEqual([]); await advance(page, .026); expect(await activeSteps(page)).toHaveLength(8); };
  await sounding(); await page.getByRole('button', { name: '停止', exact: true }).click(); await cleared();
  await sounding(); await page.evaluate(() => window.dispatchEvent(new Event('freeimpro-background'))); await cleared();
  await sounding(); await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await cleared();
  await sounding(); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; }); await cleared();
  await sounding(); await page.setViewportSize({ width: 390, height: 844 }); await expect(page.locator('.rhythm-rotate')).toBeVisible(); await cleared();
  await page.setViewportSize({ width: 844, height: 390 }); await cleared();
  await sounding(); await page.getByRole('button', { name: '返回声音库', exact: true }).click(); await expect(page.locator('.student-rhythm')).toBeHidden(); await cleared();
});

test('tempo changes leave an already sounding held block highlighted until its fixed audio end time', async ({ page }) => {
  await controlledClock(page); await openEditor(page, pattern(1, { 0: 8 }), 1, .8); await play(page); await advance(page, .05);
  await setTempoTouch(page, 40);
  await advance(page, .524); expect(await activeSteps(page)).toHaveLength(8);
  await advance(page, .526); expect(await activeSteps(page)).toEqual([]);
  expect(await page.evaluate(() => window.__previewEngine.getState().step)).toBeLessThan(8);
});

test('following a new bar waits for a captured drag to finish so a held edit stays in its original bar', async ({ page }) => {
  await controlledClock(page); await openEditor(page, pattern(2, { 0: true })); await play(page); await advance(page, .98);
  const boxes = await page.locator('[data-step="12"], [data-step="13"], [data-step="14"]').evaluateAll(cells => cells.map(cell => { const rect = cell.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; }));
  await page.mouse.move(boxes[0].x, boxes[0].y); await page.mouse.down(); await page.mouse.move(boxes[1].x, boxes[1].y, { steps: 4 });
  await page.locator('[data-step="13"]').evaluate(cell => cell.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 999, button: 0, bubbles: true })));
  await advance(page, 1.05); expect(await selectedBar(page)).toBe('1');
  await page.locator('[data-grid]').evaluate(grid => { for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) grid.dispatchEvent(new PointerEvent(type, { pointerId: 999, bubbles: true })); });
  expect(await selectedBar(page)).toBe('1');
  await page.mouse.move(boxes[2].x, boxes[2].y, { steps: 4 }); await page.mouse.up(); await paint(page);
  expect(await selectedBar(page)).toBe('2'); await expect(page.locator('[data-water-shapes] [data-water-key]')).toHaveCount(0);
  await page.getByRole('button', { name: '停止', exact: true }).click(); await page.getByRole('button', { name: '保存节奏', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('节奏已保存'); expect(await savedSteps(page)).toEqual(pattern(2, { 0: true, 12: 3 }));
});

test('editing during audio decoding keeps the latest draft without trying to update a missing track', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await controlledClock(page); await openEditor(page, pattern(1, {})); await page.evaluate(() => { window.__deferDecode = true; });
  await page.getByRole('button', { name: '播放试听', exact: true }).click(); await expect.poll(() => page.evaluate(() => typeof window.__resumeDecode)).toBe('function');
  await page.locator('[data-step="2"]').evaluate(cell => cell.click());
  await page.evaluate(() => window.__resumeDecode()); await expect.poll(() => page.evaluate(() => window.__previewEngine?.getState().playing)).toBe(true);
  await advance(page, .151); expect(await activeSteps(page)).toEqual([2]); expect(errors).toEqual([]);
});

test('saving a sounding rhythm keeps its preview and detail alive and can replay after stopping', async ({ page }) => {
  await controlledClock(page); const steps = pattern(2, { 0: true, 16: true }); await openEditor(page, steps);
  await play(page); await advance(page, .026); expect(await activeSteps(page)).toEqual([0]);
  await page.evaluate(() => { window.__contextBeforeSave = window.__rhythmClock; window.__detailBeforeSave = document.querySelector('.sound-play'); });
  await page.getByRole('button', { name: '保存节奏', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('节奏已保存');
  await expect(page.locator('.student-rhythm')).toBeVisible();
  await expect(page.getByRole('button', { name: '播放试听', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.__previewEngine.getState().playing)).toBe(true);
  expect(await page.evaluate(() => window.__detailBeforeSave === document.querySelector('.sound-play'))).toBe(true);
  expect(await savedSteps(page)).toEqual(steps);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await advance(page, 1.026); expect(await selectedBar(page)).toBe('2'); expect(await activeSteps(page)).toEqual([0]);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  expect(await page.evaluate(() => window.__contextBeforeSave.state)).toBe('running');
  await play(page); await advance(page, .026);
  expect(await page.evaluate(() => window.__rhythmClock === window.__contextBeforeSave)).toBe(true);
  expect(await selectedBar(page)).toBe('1'); expect(await activeSteps(page)).toEqual([0]);
  await page.getByRole('button', { name: '返回声音库', exact: true }).click();
  await expect(page.locator('.student-rhythm')).toBeHidden(); await expect(page.locator('#library-view')).toBeVisible();
  await page.locator('.sound-open').click(); await page.getByRole('button', { name: '节奏编创', exact: true }).click();
  await expect(page.locator('[data-bars]')).toHaveText('2');
  await expect(page.locator('[data-step="0"]')).toHaveAttribute('aria-pressed', 'true');
});

test('real silent audio rendering drives page following and whole-block highlighting', async ({ page }) => {
  await useSilentAudioClock(page); await openEditor(page, pattern(2, { 0: 8, 16: 8 }), 2, .8); await play(page);
  expect(await page.evaluate(() => ({ gain: window.__previewEngine._master.gain.value, limiter: Boolean(window.__previewEngine._limiter) }))).toEqual({ gain: 1, limiter: false });
  await expect.poll(() => activeSteps(page)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  await expect.poll(() => selectedBar(page)).toBe('2'); await expect.poll(() => activeSteps(page)).toHaveLength(8);
  await expect.poll(() => selectedBar(page)).toBe('1');
  await page.getByRole('button', { name: '停止', exact: true }).click(); expect(await activeSteps(page)).toEqual([]);
});

test('a scheduling stall recovers highlights for already sounding held audio without replaying missed notes', async ({ page }) => {
  await controlledClock(page); await openEditor(page, pattern(1, { 0: 4 }), 1, .4);
  await setTempoTouch(page, 100); await play(page);
  await page.evaluate(() => { window.__rhythmClock.currentTime = .25; window.__previewEngine._pump(); }); await paint(page);
  expect(await activeSteps(page)).toEqual([0, 1, 2, 3]);
  await expect(page.locator('[data-playback-shapes] [data-playing-length="4"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.__rhythmClock.sources.filter(source => source.stoppedAt === undefined).map(source => source.time))).toEqual([.025]);
  await advance(page, .426); expect(await activeSteps(page)).toEqual([]);
});

test('real audio rendering preserves recorded stereo samples and leaves silence after the original or slot end', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const { Sequencer } = await import('/src/sequencer.js');
    const results = [];
    for (const { note, duration, playedDuration } of [
      { note: 4, duration: .1, playedDuration: .1 },
      { note: 4, duration: .4, playedDuration: .25 },
      { note: true, duration: .4, playedDuration: .0625 },
    ]) {
      const sampleRate = 8000;
      const context = new OfflineAudioContext(2, sampleRate / 2, sampleRate);
      const recording = context.createBuffer(2, duration * sampleRate, sampleRate);
      for (let channel = 0; channel < 2; channel += 1) {
        const samples = recording.getChannelData(channel);
        for (let i = 0; i < samples.length; i += 1) samples[i] = .2 * Math.sin(i * .23 + channel) + .1 * Math.cos(i * .13);
      }
      const original = [recording.getChannelData(0).slice(), recording.getChannelData(1).slice()];
      const engine = new Sequencer({ context, autoSchedule: false, volume: 1, limiter: false });
      engine.setBpm(240);
      const steps = Array(16).fill(false); steps[0] = note;
      engine.upsertTrack({ id: 'original', submissionId: 'recording', buffer: recording, pattern: steps });
      engine.setActive('original', true);
      await engine.ready();
      engine._scheduleEvent(.025, 0, 0, engine._model, false);
      const rendered = await context.startRendering();
      const startFrame = Math.round(.025 * sampleRate), playedFrames = Math.round(playedDuration * sampleRate);
      let maxPrefixError = 0, maxSilence = 0, maxRecordingError = 0;
      for (let channel = 0; channel < 2; channel += 1) {
        const output = rendered.getChannelData(channel), input = recording.getChannelData(channel);
        for (let i = 0; i < output.length; i += 1) {
          const sourceFrame = i - startFrame;
          if (sourceFrame >= 0 && sourceFrame < playedFrames) maxPrefixError = Math.max(maxPrefixError, Math.abs(output[i] - original[channel][sourceFrame]));
          else maxSilence = Math.max(maxSilence, Math.abs(output[i]));
        }
        for (let i = 0; i < input.length; i += 1) maxRecordingError = Math.max(maxRecordingError, Math.abs(input[i] - original[channel][i]));
      }
      results.push({ note, maxPrefixError, maxSilence, maxRecordingError });
      engine.dispose();
    }
    return results;
  });
  expect(results).toHaveLength(3);
  for (const result of results) {
    expect(result.maxPrefixError).toBeLessThan(1e-7);
    expect(result.maxSilence).toBe(0);
    expect(result.maxRecordingError).toBe(0);
  }
});
