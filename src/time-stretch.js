// Waveform-aligned overlap/add: copy samples at their original rate, varying
// only the spacing of overlapping source windows. Channels share alignment.
const cache = new WeakMap();
export function stretchBuffer(context, input, seconds) {
  if (!input.getChannelData || !context.createBuffer) return input;
  const size = Math.max(1, Math.round(seconds * input.sampleRate));
  if (size === input.length) return input;
  let entries = cache.get(input);
  if (!entries) { entries = new Map(); cache.set(input, entries); }
  if (entries.has(size)) return entries.get(size);
  const output = context.createBuffer(input.numberOfChannels, size, input.sampleRate);
  const frame = Math.min(input.length, Math.max(8, Math.round(input.sampleRate * .04)));
  const hop = Math.max(1, Math.floor(frame / 2));
  const search = Math.round(input.sampleRate * .006);
  const weight = new Float32Array(size);
  const source = Array.from({ length: input.numberOfChannels }, (_, c) => input.getChannelData(c));
  const target = Array.from({ length: input.numberOfChannels }, (_, c) => output.getChannelData(c));
  let previous = 0;
  for (let position = 0; position < size; position += hop) {
    const expected = Math.round(position / Math.max(1, size - frame) * Math.max(0, input.length - frame));
    let offset = Math.min(expected, input.length - frame);
    if (position && input.length > frame) {
      let best = -Infinity;
      for (let candidate = Math.max(0, expected - search); candidate <= Math.min(input.length - frame, expected + search); candidate += 2) {
        let dot = 0, a2 = 0, b2 = 0;
        for (let j = 0; j < hop; j += 8) {
          const a = source[0][previous + hop + j] || 0, b = source[0][candidate + j] || 0;
          dot += a * b; a2 += a * a; b2 += b * b;
        }
        const score = dot / Math.sqrt(a2 * b2 + 1e-20) - Math.abs(candidate - expected) * 1e-7;
        if (score > best) { best = score; offset = candidate; }
      }
    }
    for (let j = 0; j < frame && position + j < size; j++) {
      const w = Math.sin(Math.PI * (j + .5) / frame) ** 2;
      weight[position + j] += w;
      for (let c = 0; c < source.length; c++) target[c][position + j] += source[c][offset + j] * w;
    }
    previous = offset;
  }
  const fade = Math.min(Math.round(input.sampleRate * .003), Math.floor(size / 2));
  for (let i = 0; i < size; i++) for (const channel of target) {
    channel[i] = weight[i] ? channel[i] / weight[i] : 0;
    channel[i] *= Math.min(1, i / Math.max(1, fade), (size - 1 - i) / Math.max(1, fade));
  }
  if (entries.size >= 8) entries.delete(entries.keys().next().value);
  entries.set(size, output);
  return output;
}
