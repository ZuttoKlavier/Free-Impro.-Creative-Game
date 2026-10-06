import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRhythm, fitRhythm } from '../src/rhythm-data.js';

test('student rhythm validates backups and fits teacher bars without mutating the draft', () => {
  const draft = { bars: 1, steps: Array.from({ length: 16 }, (_, i) => i === 0) };
  const fitted = fitRhythm(draft, 3);
  assert.equal(fitted.length, 48); assert.equal(fitted[16], true); assert.equal(fitted[32], true);
  assert.equal(draft.steps.length, 16);
  assert.equal(fitRhythm({ bars: 3, steps: fitted }, 1).length, 16);
  for (const value of [null, { bars: 0, steps: [] }, { bars: 1, steps: [true] }, { bars: 1, steps: Array(16).fill(1) }]) assert.throws(() => validateRhythm(value));
});
