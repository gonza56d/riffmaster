import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beamGroups, groupBoundaries, groupIndexAt } from '../js/model/timesig.js';
import { frac } from '../js/model/duration.js';

const strs = (groups) => groups.map((g) => `${g.n}/${g.d}`);

test('simple meters group per quarter', () => {
  assert.deepEqual(strs(beamGroups({ num: 4, den: 4 })), ['1/4', '1/4', '1/4', '1/4']);
  assert.deepEqual(strs(beamGroups({ num: 3, den: 4 })), ['1/4', '1/4', '1/4']);
  assert.deepEqual(strs(beamGroups({ num: 2, den: 2 })), ['1/4', '1/4', '1/4', '1/4']);
  assert.deepEqual(strs(beamGroups({ num: 5, den: 4 })), ['1/4', '1/4', '1/4', '1/4', '1/4']);
});

test('compound and odd meters', () => {
  assert.deepEqual(strs(beamGroups({ num: 6, den: 8 })), ['3/8', '3/8']);
  assert.deepEqual(strs(beamGroups({ num: 12, den: 8 })), ['3/8', '3/8', '3/8', '3/8']);
  assert.deepEqual(strs(beamGroups({ num: 5, den: 8 })), ['3/8', '1/4']);
  assert.deepEqual(strs(beamGroups({ num: 7, den: 8 })), ['3/8', '1/4', '1/4']);
  assert.deepEqual(strs(beamGroups({ num: 7, den: 8 }, [2, 2, 3])), ['1/4', '1/4', '3/8']);
  assert.deepEqual(strs(beamGroups({ num: 7, den: 8 }, [2, 2])), ['3/8', '1/4', '1/4'], 'bad override ignored');
  assert.deepEqual(strs(beamGroups({ num: 7, den: 16 })), ['3/16', '1/8', '1/8']);
});

test('group boundaries and lookup', () => {
  const b = groupBoundaries({ num: 6, den: 8 });
  assert.deepEqual(strs(b), ['0/1', '3/8', '3/4']);
  assert.equal(groupIndexAt(b, frac(0)), 0);
  assert.equal(groupIndexAt(b, frac(1, 4)), 0);
  assert.equal(groupIndexAt(b, frac(3, 8)), 1);
  assert.equal(groupIndexAt(b, frac(3, 4)), -1);
});
