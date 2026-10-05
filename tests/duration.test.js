import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frac, add, sub, mul, cmp, eq, beatLength, measureLength, beatsLength, longer, shorter, beamCount, makeTuplet, toTicks } from '../js/model/duration.js';

test('fractions reduce and compare', () => {
  assert.deepEqual(frac(2, 4), { n: 1, d: 2 });
  assert.deepEqual(frac(0, 7), { n: 0, d: 1 });
  assert.deepEqual(add(frac(1, 4), frac(1, 8)), { n: 3, d: 8 });
  assert.deepEqual(sub(frac(1, 2), frac(1, 3)), { n: 1, d: 6 });
  assert.deepEqual(mul(frac(1, 8), frac(2, 3)), { n: 1, d: 12 });
  assert.equal(cmp(frac(1, 2), frac(2, 4)), 0);
  assert.equal(cmp(frac(1, 3), frac(1, 2)), -1);
  assert.ok(eq(frac(3, 9), frac(1, 3)));
  assert.throws(() => frac(1, 0));
});

test('beat lengths with dots and tuplets', () => {
  assert.deepEqual(beatLength({ duration: 'q' }), { n: 1, d: 4 });
  assert.deepEqual(beatLength({ duration: 'e', dots: 1 }), { n: 3, d: 16 });
  assert.deepEqual(beatLength({ duration: 'q', dots: 2 }), { n: 7, d: 16 });
  assert.deepEqual(beatLength({ duration: 'e', tuplet: makeTuplet(3) }), { n: 1, d: 12 });
  assert.deepEqual(beatLength({ duration: 's', tuplet: makeTuplet(7) }), { n: 1, d: 28 });
  assert.deepEqual(beatLength({ duration: 'e', tuplet: makeTuplet(13) }), { n: 1, d: 13 });
  assert.throws(() => makeTuplet(4));
});

test('measure fullness is exact for odd tuplets', () => {
  const beats = Array.from({ length: 7 }, () => ({ duration: 'e', tuplet: makeTuplet(7) }));
  assert.ok(eq(beatsLength(beats), frac(1, 2)));
  const triplets = Array.from({ length: 12 }, () => ({ duration: 'e', tuplet: makeTuplet(3) }));
  assert.ok(eq(beatsLength(triplets), measureLength({ num: 4, den: 4 })));
});

test('duration stepping and beams', () => {
  assert.equal(longer('q'), 'h');
  assert.equal(longer('w'), 'w');
  assert.equal(shorter('q'), 'e');
  assert.equal(shorter('x'), 'x');
  assert.equal(beamCount('q'), 0);
  assert.equal(beamCount('e'), 1);
  assert.equal(beamCount('x'), 4);
  assert.equal(toTicks(frac(1, 4)), 960);
  assert.equal(toTicks(frac(1, 8)), 480);
});
