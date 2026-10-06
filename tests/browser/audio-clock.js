// Chrome's real silent sink renders and advances AudioContext.currentTime without
// depending on the host's speakers. Production audio routing is unchanged.
export async function useSilentAudioClock(page) {
  await page.addInitScript(() => {
    const Context = window.AudioContext;
    if (!Context || !('setSinkId' in Context.prototype)) return;
    window.AudioContext = class extends Context {
      constructor(options = {}) { super({ ...options, sinkId: { type: 'none' } }); }
    };
  });
}
