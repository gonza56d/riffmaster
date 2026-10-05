import { test } from 'node:test';
import assert from 'node:assert/strict';
import { midiName, pitchToStep, CLEF_BOTTOM_STEP, noteMidi, writtenMidi, resizeTuning, TUNING_PRESETS } from '../js/model/tuning.js';
import { drumInfo, DRUM_MAP, DRUM_LEGEND } from '../js/model/drumMap.js';

test('midi names', () => {
  assert.equal(midiName(60), 'C4');
  assert.equal(midiName(40), 'E2');
  assert.equal(midiName(61), 'C#4');
  assert.equal(midiName(0), 'C-1');
});

test('diatonic steps', () => {
  assert.deepEqual(pitchToStep(60), { step: 35, sharp: false, letter: 'C', octave: 4 });
  assert.deepEqual(pitchToStep(61), { step: 35, sharp: true, letter: 'C', octave: 4 });
  assert.equal(pitchToStep(64).step, CLEF_BOTTOM_STEP.treble);
  assert.equal(pitchToStep(43).step, CLEF_BOTTOM_STEP.bass);
  // Middle line of the treble staff is B4: 4 half-spaces above E4.
  assert.equal(pitchToStep(71).step - CLEF_BOTTOM_STEP.treble, 4);
  // Guitar open high E (64) is written an octave up: E5, 7 steps above E4 (top space).
  const track = { tuning: TUNING_PRESETS[0].tuning };
  assert.equal(noteMidi(track, { string: 0, fret: 0 }), 64);
  assert.equal(writtenMidi(track, { string: 0, fret: 0 }), 76);
  assert.equal(pitchToStep(76).step - CLEF_BOTTOM_STEP.treble, 7);
});

test('resize tuning keeps existing strings and adds low ones', () => {
  assert.deepEqual(resizeTuning([64, 59, 55, 50, 45, 40], 7), [64, 59, 55, 50, 45, 40, 35]);
  assert.deepEqual(resizeTuning([64, 59, 55, 50, 45, 40], 4), [64, 59, 55, 50]);
  assert.equal(resizeTuning([64, 59, 55, 50, 45, 40], 2).length, 4);
  assert.equal(resizeTuning([64, 59, 55, 50, 45, 40], 20).length, 8);
});

test('drum map', () => {
  assert.equal(drumInfo(36).name, 'Bass Drum');
  assert.equal(drumInfo(42).head, 'x');
  assert.equal(drumInfo(99).name, 'Percussion 99');
  for (const midi of DRUM_LEGEND) assert.ok(DRUM_MAP[midi], `legend entry ${midi} exists`);
  for (const [midi, info] of Object.entries(DRUM_MAP)) {
    assert.ok(info.tabLine >= 0 && info.tabLine < 6, `tab line for ${midi}`);
    assert.ok(['normal', 'x', 'circledX', 'diamond'].includes(info.head));
  }
});
