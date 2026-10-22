import { test, expect } from '@playwright/test';

test.use({ userAgent: 'Mozilla/5.0 FreeImproStudent/1 iOS', viewport: { width: 390, height: 844 } });

async function installNativeAudio(page, { amplitude = 0.2, delayedStart = false } = {}) {
  await page.addInitScript(({ amplitude, delayedStart }) => {
    const calls = [], requests = new Map();
    let recordingId = null, playbackId = null;
    const sampleRate = 24000;
    function wav(duration) {
      const length = Math.max(1, Math.round(duration * sampleRate));
      const data = new ArrayBuffer(44 + length * 2), view = new DataView(data);
      const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, length * 2, true);
      for (let i = 0; i < length; i++) view.setInt16(44 + i * 2, Math.round(amplitude * Math.sin(i * 2 * Math.PI * 440 / sampleRate) * 32767), true);
      return new Uint8Array(data);
    }
    function encode(bytes) {
      const chunks = [];
      for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
      return btoa(chunks.join(''));
    }
    function describe(bytes) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const format = String.fromCharCode(...bytes.subarray(0, 4)) + ' ' + String.fromCharCode(...bytes.subarray(8, 12));
      const rate = view.getUint32(24, true), channels = view.getUint16(22, true), bits = view.getUint16(34, true);
      let peak = 0, energy = 0, length = 0;
      for (let offset = 44; offset + 1 < bytes.length; offset += 2) {
        const sample = view.getInt16(offset, true) / 32768;
        peak = Math.max(peak, Math.abs(sample)); energy += sample ** 2; length++;
      }
      return { format, channels, bits, peak, rms: Math.sqrt(energy / length), duration: length / channels / rate };
    }
    function activate(id) {
      const request = requests.get(id);
      if (!request || request.cancelled) return;
      recordingId = id; request.startedAt = performance.now(); request.active = true;
    }
    window.FreeImproAudio = {
      async prepare(type) { calls.push({ action: 'prepare', type }); return true; },
      startRecording(id) {
        calls.push({ action: 'start', id });
        const request = { cancelled: false, active: false }; requests.set(id, request);
        if (!delayedStart) { activate(id); return Promise.resolve(true); }
        return new Promise(resolve => { request.resolve = resolve; });
      },
      async recordingLevel(id) {
        calls.push({ action: 'level', id });
        const request = requests.get(id);
        return { id, active: Boolean(request?.active), duration: request?.duration ?? (request?.startedAt ? Math.min(15, (performance.now() - request.startedAt) / 1000) : 0), rms: amplitude / Math.sqrt(2), peak: amplitude };
      },
      async stopRecording(id) {
        calls.push({ action: 'stop', id });
        const request = requests.get(id);
        if (!request || request.cancelled || !request.startedAt) return null;
        request.active = false;
        if (recordingId === id) recordingId = null;
        const duration = request.duration ?? Math.min(15, (performance.now() - request.startedAt) / 1000);
        return { id, encoded: encode(wav(duration)), mime: 'audio/wav', duration };
      },
      async cancelRecording(id) {
        calls.push({ action: 'cancel', id });
        const request = requests.get(id);
        if (request) { request.cancelled = true; request.active = false; }
        if (recordingId === id) recordingId = null;
        return true;
      },
      async play(id, encoded, mime) {
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        calls.push({ action: 'play', id, mime, ...describe(bytes) }); playbackId = id;
        return true;
      },
      async stopPlayback(id) {
        calls.push({ action: 'stop-playback', id });
        if (playbackId === id) playbackId = null;
        return true;
      },
    };
    navigator.mediaDevices.getUserMedia = async () => { calls.push({ action: 'web-microphone' }); throw new Error('The native app must not use getUserMedia'); };
    window.AudioContext = window.webkitAudioContext = class {
      constructor() { calls.push({ action: 'web-audio' }); throw new Error('Native recording and preview must not create an AudioContext'); }
    };
    window.__nativeAudio = {
      calls,
      get recordingId() { return recordingId; },
      get playbackId() { return playbackId; },
      grant(id) {
        activate(id);
        // A stale bridge acknowledgement is deliberately allowed through:
        // the page must still discard a reply to its cancelled request.
        requests.get(id)?.resolve(true);
      },
      finishRecording(id) {
        const request = requests.get(id); request.active = false; request.duration = 15;
        window.dispatchEvent(new CustomEvent('freeimpro-recording-ended', { detail: { id } }));
      },
      finishPlayback(id) {
        if (playbackId === id) playbackId = null;
        window.dispatchEvent(new CustomEvent('freeimpro-audio-ended', { detail: { id, failed: false } }));
      },
      async readSaved() {
        const { listSounds } = await import('/src/storage.js');
        const sounds = await listSounds();
        return Promise.all(sounds.map(async sound => ({ name: sound.name, mime: sound.blob.type, ...describe(new Uint8Array(await sound.blob.arrayBuffer())) })));
      },
      async seedSounds() {
        const { saveSounds } = await import('/src/storage.js');
        await saveSounds(['声音甲', '声音乙'].map((name, index) => ({ id: 'native-fixture-' + index, name, createdAt: index + 1, duration: 0.8, blob: new Blob([wav(0.8)], { type: 'audio/wav' }) })));
      },
    };
  }, { amplitude, delayedStart });
}

async function holdRecord(page) {
  const bounds = await page.locator('#studio-tab').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
}
async function record(page) {
  await holdRecord(page); await expect(page.locator('#studio-tab')).toHaveClass(/recording/);
  await page.waitForTimeout(650); await page.mouse.up();
  await expect(page.locator('#capture-overlay')).toBeHidden();
}
async function lastPlayback(page) {
  return page.evaluate(() => window.__nativeAudio.calls.filter(call => call.action === 'play').at(-1)?.id);
}
async function expectNativeOnly(page) {
  expect(await page.evaluate(() => window.__nativeAudio.calls.filter(call => ['web-audio', 'web-microphone'].includes(call.action)))).toEqual([]);
}

test('native microphone produces audible saved PCM and every single-sound preview resets when playback ends', async ({ page }) => {
  await installNativeAudio(page); await page.goto('/'); await record(page);
  await expect(page.locator('#editor')).toBeVisible();
  expect(await page.evaluate(() => window.__nativeAudio.calls.some(call => call.action === 'level'))).toBe(true);
  await page.locator('#sound-name').fill('原生录音'); await page.locator('#save').click();
  await expect(page.locator('#library-count')).toHaveText('1');
  const [sound] = await page.evaluate(() => window.__nativeAudio.readSaved());
  expect(sound).toMatchObject({ name: '原生录音', mime: 'audio/wav', format: 'RIFF WAVE', channels: 1, bits: 16 });
  expect(sound.duration).toBeGreaterThan(0.1); expect(sound.duration).toBeLessThanOrEqual(1);
  expect(sound.peak).toBeGreaterThan(0.1); expect(sound.rms).toBeGreaterThan(0.05);
  await page.locator('#play-original').click();
  await expect.poll(() => lastPlayback(page)).toBeTruthy();
  await page.evaluate(id => window.__nativeAudio.finishPlayback(id), await lastPlayback(page));
  await page.locator('#preview').click(); await expect(page.locator('#preview')).toHaveAttribute('data-playing', '');
  await page.evaluate(id => window.__nativeAudio.finishPlayback(id), await lastPlayback(page));
  await expect(page.locator('#preview')).not.toHaveAttribute('data-playing');
  await expect(page.locator('#preview')).toHaveText('试听选中声音');
  await page.locator('#library-tab').click(); await page.locator('.sound-open').click();
  await page.locator('.sound-play').click(); await expect(page.locator('.sound-play')).toHaveAttribute('data-playing', '');
  await page.evaluate(id => window.__nativeAudio.finishPlayback(id), await lastPlayback(page));
  await expect(page.locator('.sound-play')).not.toHaveAttribute('data-playing');
  const played = await page.evaluate(() => window.__nativeAudio.calls.filter(call => call.action === 'play'));
  expect(played).toHaveLength(3);
  for (const clip of played) { expect(clip.mime).toBe('audio/wav'); expect(clip.peak).toBeGreaterThan(0.1); }
  await expectNativeOnly(page);
});

test('switching sounds stops the previous native player and ignores its late ended callback', async ({ page }) => {
  await installNativeAudio(page); await page.goto('/'); await page.evaluate(() => window.__nativeAudio.seedSounds()); await page.reload();
  await expect(page.locator('#library-count')).toHaveText('2');
  await page.locator('.sound-open').first().click(); await page.locator('.sound-play').click();
  await expect(page.locator('.sound-play')).toHaveAttribute('data-playing', ''); const first = await lastPlayback(page);
  await page.locator('#library-tab').click(); await page.locator('.sound-open').last().click(); await page.locator('.sound-play').click();
  await expect(page.locator('.sound-play')).toHaveAttribute('data-playing', ''); const second = await lastPlayback(page);
  expect(second).not.toBe(first);
  expect(await page.evaluate(id => window.__nativeAudio.calls.some(call => call.action === 'stop-playback' && call.id === id), first)).toBe(true);
  await page.evaluate(id => window.__nativeAudio.finishPlayback(id), first);
  await expect(page.locator('.sound-play')).toHaveAttribute('data-playing', '');
  expect(await page.evaluate(() => window.__nativeAudio.playbackId)).toBe(second);
  await page.evaluate(id => window.__nativeAudio.finishPlayback(id), second);
  await expect(page.locator('.sound-play')).not.toHaveAttribute('data-playing'); await expectNativeOnly(page);
});

for (const event of ['freeimpro-background', 'pagehide']) {
  test(`a cancelled native permission reply after ${event} cannot revive a recording or cancel the next request`, async ({ page }) => {
    await installNativeAudio(page, { delayedStart: true }); await page.goto('/'); await page.locator('#studio-tab').focus();
    await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => window.__nativeAudio.calls.filter(call => call.action === 'start').length)).toBe(1);
    const first = await page.evaluate(() => window.__nativeAudio.calls.find(call => call.action === 'start').id);
    await page.evaluate(event => window.dispatchEvent(new Event(event)), event);
    await expect.poll(() => page.evaluate(id => window.__nativeAudio.calls.some(call => call.action === 'cancel' && call.id === id), first)).toBe(true);
    await expect(page.locator('#record')).toBeEnabled();
    await page.keyboard.up('Space'); await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => window.__nativeAudio.calls.filter(call => call.action === 'start').length)).toBe(2);
    const second = await page.evaluate(() => window.__nativeAudio.calls.filter(call => call.action === 'start').at(-1).id);
    expect(second).not.toBe(first);
    await page.evaluate(id => window.__nativeAudio.grant(id), first);
    await expect(page.locator('#record')).toBeDisabled(); await expect(page.locator('#studio-tab')).not.toHaveClass(/recording/);
    await page.evaluate(id => window.__nativeAudio.grant(id), second);
    await expect(page.locator('#studio-tab')).toHaveClass(/recording/);
    expect(await page.evaluate(() => window.__nativeAudio.recordingId)).toBe(second);
    await page.waitForTimeout(650); await page.keyboard.up('Space'); await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#capture-overlay')).toBeHidden(); await expectNativeOnly(page);
  });
}

test('the native fifteen-second completion opens the editor while the record button is still held', async ({ page }) => {
  await installNativeAudio(page); await page.goto('/'); await holdRecord(page);
  await expect(page.locator('#studio-tab')).toHaveClass(/recording/);
  const id = await page.evaluate(() => window.__nativeAudio.recordingId);
  await page.evaluate(id => window.__nativeAudio.finishRecording(id), id);
  await expect(page.locator('#editor')).toBeVisible(); await expect(page.locator('#source-duration')).toHaveText('15.00s');
  await expect(page.locator('#capture-overlay')).toBeHidden(); await expect(page.locator('#studio-tab')).not.toHaveClass(/recording/);
  await page.mouse.up(); await expect(page.locator('#editor')).toBeVisible(); await expect(page.locator('#library-count')).toHaveText('0');
  await expectNativeOnly(page);
});

test('native silence is rejected without opening the editor or saving an empty sound', async ({ page }) => {
  await installNativeAudio(page, { amplitude: 0 }); await page.goto('/'); await record(page);
  await expect(page.locator('#toast')).toContainText('没有录到有效声音');
  await expect(page.locator('#studio-view')).toBeHidden(); await expect(page.locator('#editor')).toBeHidden();
  await expect(page.locator('#library-count')).toHaveText('0'); expect(await page.evaluate(() => window.__nativeAudio.readSaved())).toEqual([]);
  await expectNativeOnly(page);
});

test('three consecutive native recordings release their previous request and can all be previewed', async ({ page }) => {
  await installNativeAudio(page); await page.goto('/');
  const ids = [];
  for (let i = 0; i < 3; i++) {
    await record(page); await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#record')).toBeEnabled();
    ids.push(await page.evaluate(() => window.__nativeAudio.calls.filter(call => call.action === 'start').at(-1).id));
    await page.locator('#preview').click(); await expect(page.locator('#preview')).toHaveAttribute('data-playing', '');
    await page.evaluate(id => window.__nativeAudio.finishPlayback(id), await lastPlayback(page));
    await expect(page.locator('#preview')).not.toHaveAttribute('data-playing');
    await page.locator('#sound-name').fill('连续录音' + i); await page.locator('#save').click();
    await expect(page.locator('#library-count')).toHaveText(String(i + 1));
  }
  expect(new Set(ids).size).toBe(3);
  for (const id of ids) expect(await page.evaluate(id => window.__nativeAudio.calls.filter(call => call.action === 'stop' && call.id === id).length, id)).toBe(1);
  await expectNativeOnly(page);
});
