export const validStep = s => typeof s === 'boolean' || (Number.isInteger(s) && s >= 2 && s <= 16);
export const resizeSteps = (steps, length) => Array.from({ length }, (_, i) => typeof steps[i] === 'number' ? Math.min(steps[i], 16 - i % 16, length - i) : steps[i] === true);
export function validateRhythm(value) {
  if (!value || !Number.isInteger(value.bars) || value.bars < 1 || value.bars > 16 ||
      !Array.isArray(value.steps) || value.steps.length !== value.bars * 16 || !value.steps.every(validStep)) {
    throw new Error('节奏必须为 1–16 小节，每小节 16 个开关。');
  }
  for (let i = 0; i < value.steps.length; i++) if (typeof value.steps[i] === 'number') {
    if (value.steps[i] > 16 - i % 16 || value.steps.slice(i + 1, i + value.steps[i]).some(Boolean)) throw new Error('延长声音不能重叠或跨过本小节。');
  }
  return { bars: value.bars, steps: [...value.steps] };
}

// Classroom length belongs to the teacher: shorter drafts repeat, longer drafts crop.
export function fitRhythm(value, bars) {
  const rhythm = validateRhythm(value);
  if (!Number.isInteger(bars) || bars < 1 || bars > 16) throw new Error('课堂小节数无效。');
  return Array.from({ length: bars * 16 }, (_, index) => rhythm.steps[index % rhythm.steps.length]);
}
