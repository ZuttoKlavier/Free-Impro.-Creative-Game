import WaveSurfer from 'wavesurfer.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.esm.js';

// Render decoded samples locally. The app owns the 1-second limit and touch hit areas.
export function createWaveform(container, onError) {
  const regions = Regions.create();
  const wave = WaveSurfer.create({ container, height: 120, waveColor: '#adb1ad', progressColor: '#adb1ad', cursorWidth: 0, barWidth: 2, barGap: 1, interact: false, plugins: [regions] });
  let samples, rate, region, pendingRange, revision = 0;
  function updateRegion() {
    if (!wave.getDuration() || !pendingRange) return;
    if (!region) region = regions.addRegion({ ...pendingRange, drag: false, resize: false, color: 'rgba(90,105,95,.16)' });
    else region.setOptions(pendingRange);
  }
  return {
    update(nextSamples, nextRate, range) {
      pendingRange = { start: range.start, end: range.end };
      if (samples === nextSamples && rate === nextRate) { updateRegion(); return; }
      samples = nextSamples; rate = nextRate; const ticket = ++revision;
      region?.remove(); region = null;
      wave.load('', [samples], samples.length / rate).then(() => { if (ticket === revision) updateRegion(); }).catch(error => { if (ticket === revision) onError(error); });
    },
    destroy() { revision++; wave.destroy(); },
  };
}
