import { test, expect } from '@playwright/test';

test.use({ userAgent: 'Mozilla/5.0 FreeImproStudent/1 iOS', viewport: { width: 844, height: 390 } });

const errors = new WeakMap();
test.beforeEach(({ page }) => {
  const entries = []; errors.set(page, entries);
  page.on('pageerror', error => entries.push(error.message));
  page.on('console', message => { if (message.type() === 'error') entries.push(message.text()); });
});
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const native = await page.evaluate(() => ({ calls: window.__nativeRhythm?.calls, active: window.__nativeRhythm?.activeId, toast: document.querySelector('#toast')?.textContent })).catch(() => null);
  await info.attach('native rhythm diagnostics', { body: JSON.stringify({ errors: errors.get(page), native }, null, 2), contentType: 'application/json' });
});

async function installNativeRhythm(page) {
  await page.addInitScript(() => {
    const calls = [], sessions = new Map(), encoding = [];
    let clock = 100, activeId = null, deferEncode = false, finishedEncodes = 0;
    function wav(seconds) {
      const rate = 24000, frames = Math.round(rate * seconds), bytes = new Uint8Array(44 + frames * 2), view = new DataView(bytes.buffer);
      const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, frames * 2, true);
      for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.round(0.15 * Math.sin(2 * Math.PI * 440 * i / rate) * 32767), true);
      return bytes;
    }
    function recipe(encoded, bars, bpm, revision) {
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0)), view = new DataView(bytes.buffer);
      const samples = new Float32Array((bytes.length - 44) / 2), sampleRate = view.getUint32(24, true);
      let peak = 0;
      for (let i = 0; i < samples.length; i++) { samples[i] = view.getInt16(44 + i * 2, true) / 32768; peak = Math.max(peak, Math.abs(samples[i])); }
      return { bars, bpm, revision, samples, sampleRate, frames: samples.length, duration: samples.length / sampleRate, peak, format: String.fromCharCode(...bytes.subarray(0, 4)) + ' ' + String.fromCharCode(...bytes.subarray(8, 12)) };
    }
    function sync(session) {
      if (!session?.active) return;
      if (session.pending && clock >= session.loopStartedAt + session.duration) {
        session.loopStartedAt += session.duration; session.loop++;
        Object.assign(session, session.pending); session.pending = null;
      }
      const loops = Math.floor((clock - session.loopStartedAt) / session.duration);
      session.loop += loops; session.loopStartedAt += loops * session.duration;
    }
    function state(id) {
      const session = sessions.get(id); sync(session);
      if (!session) return { active: false, id };
      return { active: session.active, id, revision: session.revision, bars: session.bars, bpm: session.bpm, loop: session.loop, position: clock - session.loopStartedAt, duration: session.duration, deviceTime: clock, startDeviceTime: session.startDeviceTime };
    }
    window.FreeImproAudio = {
      async playRhythm(id, encoded, bars, bpm, revision) {
        const rendered = recipe(encoded, bars, bpm, revision);
        calls.push({ action: 'play', id, bars, bpm, revision, format: rendered.format, peak: rendered.peak, frames: rendered.frames, duration: rendered.duration });
        if (activeId) sessions.get(activeId).active = false;
        sessions.set(id, { ...rendered, id, active: true, pending: null, startDeviceTime: clock, loopStartedAt: clock, loop: 0 }); activeId = id;
        return true;
      },
      async queueRhythm(id, encoded, bars, bpm, revision) {
        const rendered = recipe(encoded, bars, bpm, revision), session = sessions.get(id); sync(session);
        calls.push({ action: 'queue', id, bars, bpm, revision, peak: rendered.peak, frames: rendered.frames, duration: rendered.duration });
        if (!session?.active || revision <= session.revision) return false;
        session.pending = rendered; return true;
      },
      async rhythmState(id) { calls.push({ action: 'state', id }); return state(id); },
      async stopPlayback(id) {
        calls.push({ action: 'stop', id });
        const session = sessions.get(id); if (session) session.active = false;
        if (activeId === id) activeId = null;
        return true;
      },
    };
    window.AudioContext = window.webkitAudioContext = class {
      constructor() { calls.push({ action: 'web-audio' }); throw new Error('Native rhythm must not create an AudioContext'); }
    };
    navigator.mediaDevices.getUserMedia = async () => { calls.push({ action: 'web-microphone' }); throw new Error('Rhythm preview must not request a microphone'); };
    const arrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      if (!deferEncode || this.type !== 'audio/wav' || this.size < 10000) return arrayBuffer.call(this);
      return new Promise(resolve => encoding.push(async () => { const bytes = await arrayBuffer.call(this); finishedEncodes++; resolve(bytes); }));
    };
    window.__nativeRhythm = {
      calls,
      get activeId() { return activeId; },
      get pendingEncodes() { return encoding.length; },
      get finishedEncodes() { return finishedEncodes; },
      deferEncoding() { deferEncode = true; },
      async finishEncoding() { deferEncode = false; await Promise.all(encoding.splice(0).map(finish => finish())); },
      state,
      advance(seconds) { clock += seconds; },
      ended(id) { window.dispatchEvent(new CustomEvent('freeimpro-audio-ended', { detail: { id, failed: false } })); },
      energy(id, start, end, pending = false) {
        const session = sessions.get(id), rendered = pending ? session.pending : session;
        const samples = rendered.samples.subarray(Math.round(start * rendered.sampleRate), Math.round(end * rendered.sampleRate));
        return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
      },
      compareOriginal(id, steps, seconds = 0.1) {
        const rendered = sessions.get(id), expected = new Float32Array(rendered.frames);
        const recording = wav(seconds);
        const view = new DataView(recording.buffer), source = Float32Array.from({ length: (recording.length - 44) / 2 }, (_, index) => view.getInt16(44 + index * 2, true) / 32768);
        const stepFrames = 60 / rendered.bpm / 4 * rendered.sampleRate;
        steps.forEach((value, step) => {
          if (!value) return;
          const start = Math.round(step * stepFrames), end = Math.round((step + (typeof value === 'number' ? value : 1)) * stepFrames);
          expected.set(source.subarray(0, Math.min(source.length, end - start)), start);
        });
        let mismatches = 0;
        for (let index = 0; index < expected.length; index++) if (rendered.samples[index] !== expected[index]) mismatches++;
        return { mismatches, sourceFrames: source.length };
      },
      async seed({ seconds = 0.1, steps = Array.from({ length: 16 }, (_, step) => step === 0) } = {}) {
        const { saveSounds } = await import('/src/storage.js');
        const recording = wav(seconds);
        await saveSounds([{ id: 'native-rhythm-sound', name: '原生节奏声音', createdAt: 1, duration: seconds, blob: new Blob([recording], { type: 'audio/wav' }), rhythm: { bars: steps.length / 16, steps } }]);
      },
    };
  });
}

async function openEditor(page, options) {
  await installNativeRhythm(page); await page.goto('/'); await page.evaluate(options => window.__nativeRhythm.seed(options), options); await page.reload();
  await page.locator('.sound-open').click(); await page.getByRole('button', { name: '节奏编创', exact: true }).click();
  await expect(page.locator('.rhythm-landscape-content')).toBeVisible();
}
async function play(page, count) {
  await page.getByRole('button', { name: '播放试听', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__nativeRhythm.calls.filter(call => call.action === 'play').length)).toBe(count);
  await expect(page.locator('[data-play]')).toBeEnabled();
  return page.evaluate(() => window.__nativeRhythm.activeId);
}
async function expectNativeOnly(page) {
  expect(await page.evaluate(() => window.__nativeRhythm.calls.filter(call => ['web-audio', 'web-microphone'].includes(call.action)))).toEqual([]);
}

test('saving a playing rhythm keeps the native loop audible, and stop then replay uses a new valid session', async ({ page }) => {
  await openEditor(page); const first = await play(page, 1);
  await page.getByRole('button', { name: '保存节奏', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('节奏已保存'); await expect(page.locator('[data-save]')).toBeEnabled();
  expect(await page.evaluate(id => window.__nativeRhythm.state(id).active, first)).toBe(true);
  expect(await page.evaluate(id => window.__nativeRhythm.calls.some(call => call.action === 'stop' && call.id === id), first)).toBe(false);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect.poll(() => page.evaluate(id => window.__nativeRhythm.state(id).active, first)).toBe(false);
  const second = await play(page, 2); expect(second).not.toBe(first);
  const played = await page.evaluate(() => window.__nativeRhythm.calls.filter(call => call.action === 'play'));
  for (const rendered of played) {
    expect(rendered.format).toBe('RIFF WAVE'); expect(rendered.frames).toBe(57600);
    expect(rendered.duration).toBeCloseTo(2.4); expect(rendered.peak).toBeGreaterThan(0.1);
  }
  await expectNativeOnly(page);
});

test('a longer native block plays the unchanged recording once, then stays silent and stops highlighting', async ({ page }) => {
  const steps = Array.from({ length: 16 }, (_, step) => step === 0 ? 4 : false);
  await openEditor(page, { seconds: 0.1, steps });
  const id = await play(page, 1);
  expect(await page.evaluate(({ id, steps }) => window.__nativeRhythm.compareOriginal(id, steps), { id, steps })).toEqual({ mismatches: 0, sourceFrames: 2400 });
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 0.11, 0.59), id)).toBe(0);
  await expect(page.locator('.student-rhythm-grid .is-playing')).toHaveCount(4);
  await page.evaluate(() => window.__nativeRhythm.advance(0.12));
  await expect(page.locator('.student-rhythm-grid .is-playing')).toHaveCount(0);
  await expect(page.locator('[data-water-shapes] .is-playing')).toHaveCount(0);
  await expectNativeOnly(page);
});

test('short native slots play only the original prefix and never carry a tail past their boundaries', async ({ page }) => {
  const steps = Array.from({ length: 16 }, (_, step) => step === 0 || step === 15 ? true : step === 4 ? 2 : false);
  await openEditor(page, { seconds: 0.8, steps });
  const id = await play(page, 1);
  expect(await page.evaluate(({ id, steps }) => window.__nativeRhythm.compareOriginal(id, steps, 0.8), { id, steps })).toEqual({ mismatches: 0, sourceFrames: 19200 });
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 0.15, 0.59), id)).toBe(0);
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 0.9, 2.24), id)).toBe(0);
  await page.evaluate(() => window.__nativeRhythm.advance(0.16));
  await expect(page.locator('.student-rhythm-grid .is-playing')).toHaveCount(0);
  await page.evaluate(() => window.__nativeRhythm.advance(2.1));
  await expect(page.locator('[data-step="15"]')).toHaveClass(/is-playing/);
  await page.evaluate(() => window.__nativeRhythm.advance(0.3));
  await expect(page.locator('.student-rhythm-grid .is-playing')).toHaveCount(0);
  await expectNativeOnly(page);
});

test('a second and third edit can replay natively with attacks at the latest selected steps', async ({ page }) => {
  await openEditor(page); const first = await play(page, 1);
  await page.locator('[data-step="0"]').click(); await page.locator('[data-step="4"]').click();
  const second = await play(page, 2); expect(second).not.toBe(first);
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 0.005, 0.075), second)).toBe(0);
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 0.605, 0.675), second)).toBeGreaterThan(0.03);
  await page.locator('[data-step="4"]').click(); await page.locator('[data-step="8"]').click();
  const third = await play(page, 3); expect(third).not.toBe(second);
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 0.605, 0.675), third)).toBe(0);
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 1.205, 1.275), third)).toBeGreaterThan(0.03);
  expect(await page.evaluate(() => window.__nativeRhythm.state(window.__nativeRhythm.activeId).active)).toBe(true);
  await expectNativeOnly(page);
});

test('playing edits commit at the next native loop boundary and an old ended callback cannot stop the current session', async ({ page }) => {
  await openEditor(page); const first = await play(page, 1); const current = await play(page, 2);
  const revision = await page.evaluate(id => window.__nativeRhythm.state(id).revision, current);
  await page.locator('[data-step="0"]').click(); await page.locator('[data-step="4"]').click();
  await expect.poll(() => page.evaluate(() => window.__nativeRhythm.calls.filter(call => call.action === 'queue').length)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(id => window.__nativeRhythm.energy(id, 0.605, 0.675, true), current)).toBeGreaterThan(0.03);
  expect(await page.evaluate(id => window.__nativeRhythm.state(id).revision, current)).toBe(revision);
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 0.005, 0.075), current)).toBeGreaterThan(0.03);
  const queued = await page.evaluate(() => window.__nativeRhythm.calls.filter(call => call.action === 'queue').at(-1));
  await page.evaluate(() => window.__nativeRhythm.advance(2.415));
  await expect.poll(() => page.evaluate(id => window.__nativeRhythm.state(id).revision, current)).toBe(queued.revision);
  expect(await page.evaluate(id => window.__nativeRhythm.energy(id, 0.005, 0.075), current)).toBe(0);
  await page.evaluate(() => window.__nativeRhythm.advance(0.6));
  await expect(page.locator('[data-step="4"]')).toHaveClass(/is-playing/);
  await expect(page.locator('[data-step="0"]')).not.toHaveClass(/is-playing/);
  await page.evaluate(id => window.__nativeRhythm.ended(id), first);
  await expect(page.locator('[data-play]')).toBeEnabled();
  expect(await page.evaluate(id => window.__nativeRhythm.state(id).active, current)).toBe(true);
  expect(await page.evaluate(() => window.__nativeRhythm.activeId)).toBe(current); await expectNativeOnly(page);
});

for (const exit of ['background', 'close']) {
  test(`${exit} cancels a native loop whose encoding is still pending, and a late result cannot revive it`, async ({ page }) => {
    await openEditor(page); await page.evaluate(() => window.__nativeRhythm.deferEncoding());
    await page.getByRole('button', { name: '播放试听', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__nativeRhythm.pendingEncodes)).toBe(1);
    if (exit === 'background') await page.evaluate(() => window.dispatchEvent(new Event('freeimpro-background')));
    else {
      const refreshed = page.evaluate(() => new Promise(resolve => window.addEventListener('sounds-changed', () => resolve(), { once: true })));
      await page.getByRole('button', { name: '返回声音库', exact: true }).click(); await refreshed;
    }
    await page.evaluate(() => window.__nativeRhythm.finishEncoding());
    await expect.poll(() => page.evaluate(() => window.__nativeRhythm.finishedEncodes)).toBe(1);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => window.__nativeRhythm.calls.filter(call => call.action === 'play'))).toEqual([]);
    expect(await page.evaluate(() => window.__nativeRhythm.activeId)).toBeNull();
    if (exit === 'close') { await expect(page.locator('.student-rhythm')).toBeHidden(); await page.locator('.sound-open').click(); await page.getByRole('button', { name: '节奏编创', exact: true }).click(); }
    await play(page, 1); await expectNativeOnly(page);
  });
}
