import { test, expect } from '@playwright/test';

test('real Web Audio sums layers at the next loop and removes one without cutting the other', async ({ page }) => {
  await page.goto('/teacher.html');
  const samples = await page.evaluate(async () => {
    const { Sequencer } = await import('/src/sequencer.js');
    const offline = new OfflineAudioContext(1, 24000 * 2.2, 24000);
    let now = 0;
    // Render the actual Web Audio gain graph deterministically. Scheduling time
    // is controlled here; no speakers, wall-clock waiting or fake buffer mixing.
    const context = {
      get currentTime() { return now; }, state: 'running', destination: offline.destination,
      createGain: () => offline.createGain(),
      createBufferSource() {
        const source = offline.createBufferSource();
        const stop = source.stop.bind(source);
        source.stop = () => stop(now);
        // Rendering happens afterwards: keep past audio in the graph. Timed
        // stop still removes the layer at the simulated immediate-exit time.
        source.disconnect = () => {};
        return source;
      },
    };
    const engine = new Sequencer({ context, autoSchedule: false });
    const pattern = Array(16).fill(false); pattern[0] = true;
    for (const [id, amplitude, volume] of [['a', .1, 1], ['b', .2, .5]]) {
      const buffer = offline.createBuffer(1, 2400, 24000);
      buffer.getChannelData(0).fill(amplitude);
      engine.upsertTrack({ id, submissionId: id, buffer, pattern, volume });
    }
    const advance = target => {
      while (now < target - 1e-9) { now = Math.min(target, now + .01); engine._pump(); }
    };
    engine.setVolume(1); engine.setBpm(240); engine.setActive('a', true);
    await engine.play();
    advance(.2); engine.setActiveMany(['b'], true);
    advance(1.075); engine.setActive('b', false);
    advance(2.07);
    const rendered = (await offline.startRendering()).getChannelData(0);
    const values = [.04, .99, 1.04, 1.09, 2.04].map(time => rendered[Math.round(time * 24000)]);
    engine.dispose();
    return values;
  });
  expect(samples[0]).toBeCloseTo(.1, 5); // The first layer alone.
  expect(samples[1]).toBeCloseTo(0, 5); // Waiting layer cannot sound early.
  expect(samples[2]).toBeCloseTo(.2, 5); // a + b at its independent 50% gain.
  expect(samples[3]).toBeCloseTo(.1, 5); // Exiting b leaves a's sample intact.
  expect(samples[4]).toBeCloseTo(.1, 5); // Existing layer continues next loop.
});
