// Swing alternates long/short durations within each adjacent pair of cells.
// The 0–50% control ranges from 1:1 to 2:1, preserving every pair's duration.
const swingOffset = swing => Math.min(.5, Math.max(0, Number(swing) || 0)) * 2 / 3;

export function stepDuration(step, bpm, swing = 0) {
  const offset = swingOffset(swing);
  return 60 / bpm / 4 * (step % 2 === 0 ? 1 + offset : 1 - offset);
}

export function stepTime(step, bpm, swing = 0) {
  return (Math.floor(step / 2) * 2 + step % 2 * (1 + swingOffset(swing))) * 60 / bpm / 4;
}
