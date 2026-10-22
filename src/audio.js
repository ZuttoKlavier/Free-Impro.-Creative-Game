export const MAX_RECORDING = 15;
export const MAX_SAMPLE = 1;

export function audioLevel(samples) {
  let peak = 0, energy = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
    energy += value * value;
  }
  return { peak, rms: Math.sqrt(energy / (samples.length || 1)) };
}

// AVAudioRecorder WAVs can contain padding/metadata chunks before PCM data.
// Decode locally without activating WebKit's hardware audio session.
export function decodePcmWav(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const fail = () => { throw new Error('录音 WAV 数据无效，请重新录制。'); };
  const tag = at => String.fromCharCode(...data.subarray(at, at + 4));
  if (data.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== data.length) fail();
  let format, pcm, offset = 12;
  while (offset + 8 <= data.length) {
    const size = view.getUint32(offset + 4, true), start = offset + 8;
    if (size > data.length - start) fail();
    if (tag(offset) === 'fmt ') {
      if (format || size < 16) fail();
      format = { code: view.getUint16(start, true), channels: view.getUint16(start + 2, true), rate: view.getUint32(start + 4, true), bytesPerSecond: view.getUint32(start + 8, true), align: view.getUint16(start + 12, true), bits: view.getUint16(start + 14, true) };
    } else if (tag(offset) === 'data') {
      if (pcm) fail();
      pcm = { start, size };
    }
    offset = start + size + size % 2;
  }
  if (offset !== data.length || !format || !pcm || !pcm.size || format.code !== 1 || format.bits !== 16 || format.channels !== 1 || format.align !== 2 || format.rate < 8000 || format.rate > 192000 || format.bytesPerSecond !== format.rate * 2 || pcm.size % 2) fail();
  const duration = pcm.size / 2 / format.rate;
  if (duration > MAX_RECORDING + 0.01) fail();
  const samples = new Float32Array(Math.min(pcm.size / 2, Math.floor(format.rate * MAX_RECORDING)));
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(pcm.start + i * 2, true) / 32768;
  return { samples, sampleRate: format.rate };
}

// Energy rises identify separate attacks, including another hit in a decaying tail.
export function detectSlices(samples, sampleRate, sensitivity = 0.5) {
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const energy = [];
  for (let i = 0; i < samples.length; i += hop) {
    let sum = 0;
    for (let j = i; j < Math.min(i + hop, samples.length); j++) sum += samples[j] ** 2;
    energy.push(Math.sqrt(sum / Math.min(hop, samples.length - i)));
  }
  const peak = energy.reduce((a, b) => Math.max(a, b), 0);
  if (peak < 0.004) return [];
  const sorted = [...energy].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const threshold = Math.max(0.004, floor * 2.8, peak * (0.19 - sensitivity * 0.13));
  const attacks = [];
  let last = -100, wasQuiet = true;
  for (let i = 0; i < energy.length; i++) {
    const previous = energy.slice(Math.max(0, i - 5), i);
    const baseline = previous.reduce((a, b) => a + b, 0) / (previous.length || 1);
    const rising = energy[i] > baseline * (2.5 - sensitivity) && energy[i] - baseline > threshold * 0.5;
    if (energy[i] > threshold && i - last >= 10 && (wasQuiet || rising)) {
      attacks.push(i); last = i;
    }
    wasQuiet = energy[i] < threshold * 0.5;
  }
  const duration = samples.length / sampleRate;
  return attacks.map((frame, index) => {
    const start = Math.max(0, frame * hop / sampleRate - 0.012);
    const next = index + 1 < attacks.length ? Math.max(start, attacks[index + 1] * hop / sampleRate - 0.012) : duration;
    let end = Math.min(duration, next, start + MAX_SAMPLE);
    let quiet = 0;
    for (let j = frame + 3; j * hop / sampleRate < end; j++) {
      quiet = energy[j] < Math.max(0.002, threshold * 0.35) ? quiet + 1 : 0;
      if (quiet >= 6) { end = Math.min(end, (j - 3) * hop / sampleRate); break; }
    }
    return { start, end: Math.min(duration, next, Math.max(start + 0.02, end)) };
  }).filter(s => s.end > s.start);
}

export function mono(buffer) {
  const output = new Float32Array(Math.min(buffer.length, Math.floor(buffer.sampleRate * MAX_RECORDING)));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const input = buffer.getChannelData(c);
    for (let i = 0; i < output.length; i++) output[i] += input[i] / buffer.numberOfChannels;
  }
  return output;
}

export function trimSamples(samples, sampleRate, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > MAX_SAMPLE + 1e-8 || end > samples.length / sampleRate + 1e-8) throw new Error('采样范围无效，每个声音需为 0–1 秒。');
  const result = samples.slice(Math.round(start * sampleRate), Math.min(samples.length, Math.round(end * sampleRate)));
  if (!result.length) throw new Error('请保留一段有效声音。');
  return result;
}

export function encodeWav(samples, sampleRate) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const str = (offset, value) => [...value].forEach((v, i) => view.setUint8(offset + i, v.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(s * 32768))), true));
  return new Blob([bytes], { type: 'audio/wav' });
}

export function demoAudio(sampleRate = 24000) {
  const samples = new Float32Array(sampleRate * 3);
  [0.35, 1.15, 2.1].forEach((start, index) => {
    for (let i = 0; i < sampleRate * 0.3; i++) {
      const t = i / sampleRate;
      samples[Math.floor(start * sampleRate) + i] = (Math.sin(2 * Math.PI * (400 + index * 170) * t) + 0.25 * Math.sin(2 * Math.PI * 1300 * t)) * Math.exp(-t * 28) * 0.65;
    }
  });
  return { samples, sampleRate };
}
