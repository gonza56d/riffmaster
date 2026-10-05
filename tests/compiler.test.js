import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSong } from '../js/model/song.js';
import { compileSong, unrollRepeats, buildTimeline, timeAt, posAt, beatIndexAt } from '../js/audio/compiler.js';

function fill(song, ti, mi, beats) {
  song.tracks[ti].measures[mi].beats = beats.map(([duration, notes, extra = {}]) => ({
    duration, dots: extra.dots || 0, tuplet: extra.tuplet || null, rest: notes.length === 0,
    notes: notes.map(([string, fret, more = {}]) => ({ string, fret, tie: false, ...more })),
  }));
}

test('events carry pitches, positions and durations; rests are skipped', () => {
  const song = createSong({ measures: 2, tracks: ['dist1', 'drums'] });
  fill(song, 0, 0, [['q', [[5, 0], [4, 2]]], ['q', []], ['h', [[0, 12]]]]);
  fill(song, 1, 0, [['e', [[0, 42], [5, 36]]], ['e', [[0, 42]]]]);
  const c = compileSong(song);
  assert.equal(c.measures.length, 2);
  assert.equal(c.total, 2);
  const guitar = c.events.filter((e) => e.ti === 0);
  assert.equal(guitar.length, 2);
  assert.deepEqual(guitar[0].notes.map((n) => n.midi).sort((a, b) => a - b), [40, 47]);
  assert.equal(guitar[1].pos, 0.5);
  assert.equal(guitar[1].notes[0].midi, 76);
  assert.equal(guitar[1].notes[0].duration, 0.5);
  const drums = c.events.filter((e) => e.ti === 1);
  assert.deepEqual(drums[0].notes.map((n) => n.midi), [42, 36]);
  assert.equal(c.clicks.length, 8);
  assert.equal(c.clicks[4].pos, 1);
  assert.ok(c.clicks[0].accent && !c.clicks[1].accent);
});

test('ties merge into one longer note', () => {
  const song = createSong({ measures: 2 });
  fill(song, 0, 0, [['h', [[0, 5]]], ['h', [[0, 5]]]]);
  fill(song, 0, 1, [['q', [[0, 5, { tie: true }]]], ['q', [[0, 7, { tie: true }]]], ['h', []]]);
  song.tracks[0].measures[0].beats[1].notes[0].tie = true;
  const c = compileSong(song);
  const ev = c.events.filter((e) => e.ti === 0);
  assert.equal(ev.length, 2, 'first three beats merge; the 4th has no matching open note');
  assert.equal(ev[0].notes[0].duration, 1.25);
  assert.equal(ev[1].pos, 1.25);
});

test('overfull measures extend the timeline; slides know their target', () => {
  const song = createSong({ measures: 2 });
  fill(song, 0, 0, [['w', [[0, 5, { effects: { slide: true } }]]], ['q', [[0, 7]]]]);
  const c = compileSong(song);
  assert.equal(c.measures[0].length, 1.25);
  assert.equal(c.measures[1].start, 1.25);
  assert.equal(c.events[0].notes[0].slideTo, 71);
});

test('repeats unroll', () => {
  const headers = [{ timeSig: { num: 4, den: 4 } }, { timeSig: { num: 4, den: 4 }, repeatOpen: true }, { timeSig: { num: 4, den: 4 }, repeatClose: { times: 1 } }, { timeSig: { num: 4, den: 4 } }];
  assert.deepEqual(unrollRepeats(headers), [0, 1, 2, 1, 2, 3]);
  assert.deepEqual(unrollRepeats([{ timeSig: { num: 4, den: 4 }, repeatClose: { times: 2 } }]), [0, 0, 0]);
});

test('timeline maps positions to seconds through tempo changes and speed', () => {
  const song = createSong({ measures: 3, tempo: 120 });
  song.measureHeaders[1].tempo = 60;
  const c = compileSong(song);
  const tl = buildTimeline(c.measures, 1);
  assert.equal(timeAt(tl, 0), 0);
  assert.equal(timeAt(tl, 1), 2, 'one 4/4 bar at 120 bpm lasts 2 s');
  assert.equal(timeAt(tl, 2), 6, 'the 60 bpm bar lasts 4 s');
  assert.equal(timeAt(tl, 2.5), 7);
  assert.equal(posAt(tl, 7), 2.5);
  assert.equal(posAt(tl, 1), 0.5);
  const fast = buildTimeline(c.measures, 2);
  assert.equal(timeAt(fast, 3), 4);
  assert.equal(posAt(fast, 4), 3);
});

test('beat lookup for the playhead', () => {
  const beats = [{ pos: 0 }, { pos: 0.25 }, { pos: 0.5 }, { pos: 1 }];
  assert.equal(beatIndexAt(beats, 0), 0);
  assert.equal(beatIndexAt(beats, 0.3), 1);
  assert.equal(beatIndexAt(beats, 0.5), 2);
  assert.equal(beatIndexAt(beats, 5), 3);
  assert.equal(beatIndexAt(beats, -1), -1);
});
