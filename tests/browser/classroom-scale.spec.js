import { test, expect } from '@playwright/test';

test('50 actual Web Audio voices render together at the boundary and 25 immediate exits preserve the other voices', async ({ page }) => {
  await page.goto('/teacher.html');
  const result = await page.evaluate(async () => {
    const { Sequencer } = await import('/src/sequencer.js');
    const rate = 24000, offline = new OfflineAudioContext(1, Math.ceil(rate * 2.2), rate);
    let now = 0;
    const context = {
      get currentTime() { return now; }, state: 'running', destination: offline.destination,
      createGain: () => offline.createGain(),
      createBufferSource() {
        const source = offline.createBufferSource(), stop = source.stop.bind(source);
        source.stop = () => stop(now); source.disconnect = () => {};
        return source;
      },
    };
    const engine = new Sequencer({ context, autoSchedule: false }), pattern = Array(16).fill(false); pattern[0] = true;
    const ids = Array.from({ length: 50 }, (_, i) => `voice-${i}`);
    ids.forEach(id => { const buffer = offline.createBuffer(1, 2400, rate); buffer.getChannelData(0).fill(.002); engine.upsertTrack({ id, submissionId: id, buffer, pattern, volume: 1 }); });
    const advance = target => { while (now < target - 1e-9) { now = Math.min(target, now + .01); engine._pump(); } };
    engine.setVolume(1); engine.setBpm(240); engine.setActive(ids[0], true); await engine.play();
    advance(.2); engine.setActiveMany(ids.slice(1), true);
    advance(1.075); engine.setActiveMany(ids.slice(25), false);
    advance(2.07);
    const rendered = (await offline.startRendering()).getChannelData(0);
    const levels = [.04, .99, 1.04, 1.09, 2.04].map(time => rendered[Math.round(time * rate)]);
    engine.dispose(); return { levels, finite: rendered.every(Number.isFinite), peak: rendered.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0) };
  });
  expect(result.levels[0]).toBeCloseTo(.002, 6);
  expect(result.levels[1]).toBeCloseTo(0, 6);
  expect(result.levels[2]).toBeCloseTo(.1, 6);
  expect(result.levels[3]).toBeCloseTo(.05, 6);
  expect(result.levels[4]).toBeCloseTo(.05, 6);
  expect(result.finite).toBe(true); expect(result.peak).toBeLessThan(.101);
});
