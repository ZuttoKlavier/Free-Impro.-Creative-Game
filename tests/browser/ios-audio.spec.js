import { test, expect } from '@playwright/test';

test.use({ userAgent: 'Mozilla/5.0 FreeImproStudent/1 iOS', viewport: { width: 390, height: 844 } });

const diagnostics = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = []; diagnostics.set(page, errors);
  page.on('pageerror', error => errors.push({ action: 'page-error', message: error.message }));
  page.on('console', async message => {
    if (message.type() !== 'error') return;
    const details = await Promise.allSettled(message.args().map(arg => arg.evaluate(value => value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : String(value))));
    errors.push({ action: 'console-error', message: message.text(), details });
  });
});
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const audio = await page.evaluate(() => ({
    events: window.__iosAudioTest?.events,
    tracks: window.__iosAudioTest?.tracks.map(track => track.readyState),
    toast: document.querySelector('#toast')?.textContent,
  })).catch(error => ({ message: error.message }));
  await testInfo.attach('iOS audio diagnostics', { body: JSON.stringify({ errors: diagnostics.get(page), audio }, null, 2), contentType: 'application/json' });
});

// Keep the browser's real microphone encoder and PCM decoder. Only the device
// route and iOS interruption are simulated, so saving a file alone cannot pass.
async function installMicrophone(page, amplitude) {
  await page.addInitScript(({ amplitude }) => {
    const NativeContext = window.AudioContext;
    const NativeRecorder = window.MediaRecorder;
    const events = [], contexts = [], tracks = [], captureContexts = [];
    let sessionType = 'auto', nativeType = 'auto';
    const audioSession = {
      get type() { return sessionType; },
      set type(type) {
        sessionType = type;
        events.push({ action: 'session', type, tracks: tracks.map(track => track.readyState) });
      },
    };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: audioSession });
    window.FreeImproAudio = {
      async prepare(type) {
        nativeType = type;
        events.push({ action: 'native', type, tracks: tracks.map(track => track.readyState) });
        return true;
      },
    };
    window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); contexts.push(this); }
      get state() { return this.testInterrupted ? 'interrupted' : super.state; }
      async resume() {
        events.push({ action: 'resume', state: this.state });
        await super.resume(); this.testInterrupted = false;
      }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => {
          events.push({ action: 'play', state: this.state, type: sessionType, nativeType });
          return start(...args);
        };
        return source;
      }
    };
    window.MediaRecorder = class extends NativeRecorder {
      constructor(...args) {
        super(...args);
        this.addEventListener('dataavailable', event => events.push({ action: 'encoded-data', size: event.data.size, mime: event.data.type }));
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      events.push({ action: 'microphone', type: sessionType, nativeType });
      const capture = new NativeContext(), oscillator = capture.createOscillator();
      const gain = capture.createGain(), destination = capture.createMediaStreamDestination();
      captureContexts.push(capture);
      oscillator.frequency.value = 440; gain.gain.value = amplitude;
      oscillator.connect(gain); gain.connect(destination); oscillator.start();
      await capture.resume();
      for (const track of destination.stream.getTracks()) {
        tracks.push(track);
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); events.push({ action: 'track-stop', state: track.readyState }); };
      }
      for (const context of contexts) context.testInterrupted = true;
      events.push({ action: 'interruption' });
      return destination.stream;
    };
    window.__iosAudioTest = { events, tracks, captureContexts };
    window.__decodeSavedSound = async () => {
      const { listSounds } = await import('/src/storage.js');
      const sound = (await listSounds())[0];
      if (!sound) return null;
      const decoder = new NativeContext();
      try {
        const buffer = await decoder.decodeAudioData(await sound.blob.arrayBuffer());
        const samples = buffer.getChannelData(0);
        let peak = 0, energy = 0;
        for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); energy += sample ** 2; }
        return { peak, rms: Math.sqrt(energy / samples.length), duration: buffer.duration, mime: sound.blob.type };
      } finally { await decoder.close(); }
    };
  }, { amplitude });
}

async function record(page) {
  const bounds = await page.locator('#studio-tab').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(page.locator('#studio-tab')).toHaveClass(/recording/);
  await page.waitForTimeout(1200);
  // Recorder initialization can lag behind its start on a busy browser. Keep
  // holding until the real encoder has produced data rather than guessing.
  await expect.poll(() => page.evaluate(() => window.__iosAudioTest.events.some(event => event.action === 'encoded-data' && event.size > 0))).toBe(true);
  await page.mouse.up();
  await expect(page.locator('#capture-overlay')).toBeHidden();
}

test('iOS microphone interruption recovers, saved WAV contains sound, and preview uses playback routing', async ({ page }) => {
  await installMicrophone(page, 0.2); await page.goto('/');
  await record(page); await expect(page.locator('#editor')).toBeVisible();
  await page.locator('#sound-name').fill('真机音频回归'); await page.locator('#save').click();
  await expect(page.locator('#library-count')).toHaveText('1');
  const decoded = await page.evaluate(() => window.__decodeSavedSound());
  expect(decoded.mime).toBe('audio/wav');
  expect(decoded.duration).toBeGreaterThan(0.1); expect(decoded.duration).toBeLessThanOrEqual(1);
  expect(decoded.peak).toBeGreaterThan(0.1); expect(decoded.peak).toBeLessThan(0.4);
  expect(decoded.rms).toBeGreaterThan(0.05);
  await page.locator('#preview').click();
  const { events, ended } = await page.evaluate(() => ({
    events: window.__iosAudioTest.events,
    ended: window.__iosAudioTest.tracks.every(track => track.readyState === 'ended'),
  }));
  expect(ended).toBe(true);
  const microphone = events.find(event => event.action === 'microphone');
  expect(microphone).toMatchObject({ type: 'play-and-record', nativeType: 'play-and-record' });
  const interruptedAt = events.findIndex(event => event.action === 'interruption');
  expect(events.slice(interruptedAt + 1)).toContainEqual({ action: 'resume', state: 'interrupted' });
  const routes = events.filter(event => ['session', 'native'].includes(event.action) && event.type === 'playback');
  expect(routes.some(event => event.action === 'session')).toBe(true);
  expect(routes.some(event => event.action === 'native')).toBe(true);
  for (const route of routes) expect(route.tracks.every(state => state === 'ended')).toBe(true);
  expect(events.filter(event => event.action === 'play')).toContainEqual({ action: 'play', state: 'running', type: 'playback', nativeType: 'playback' });
});

test('a real silent microphone stream cannot become an editable or saved recording', async ({ page }) => {
  await installMicrophone(page, 0); await page.goto('/'); await record(page);
  await expect(page.locator('#toast')).toContainText('没有录到有效声音');
  await expect(page.locator('#studio-view')).toBeHidden();
  await expect(page.locator('#editor')).toBeHidden();
  await expect(page.locator('#library-count')).toHaveText('0');
  expect(await page.evaluate(() => window.__decodeSavedSound())).toBeNull();
  expect(await page.evaluate(() => window.__iosAudioTest.tracks.every(track => track.readyState === 'ended'))).toBe(true);
});
