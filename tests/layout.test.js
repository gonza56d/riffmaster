import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSong } from '../js/model/song.js';
import { layoutTrack, rhythmWidth, hitTest } from '../js/render/layout.js';
import { createAccidentalState, accidentalFor, accidentalsForChord, accidentalColumns } from '../js/render/accidentals.js';
import { pitchToStep } from '../js/model/tuning.js';
import { renderScoreSVG, cursorMarkup } from '../js/render/score.js';

function fill(song, ti, mi, beats) {
  song.tracks[ti].measures[mi].beats = beats.map(([duration, notes, extra = {}]) => ({
    duration, dots: extra.dots || 0, tuplet: extra.tuplet || null, rest: notes.length === 0,
    notes: notes.map(([string, fret, more = {}]) => ({ string, fret, tie: false, ...more })),
  }));
}
const T3 = { n: 3, in: 2 };

test('rhythm width is sub-linear and clamped', () => {
  assert.equal(rhythmWidth(1 / 4), 32);
  assert.ok(rhythmWidth(1 / 8) < 32 && rhythmWidth(1 / 8) > 18);
  assert.equal(rhythmWidth(1 / 64), 18);
  assert.ok(rhythmWidth(1) < 90 + 1e-9);
});

test('beams break at group boundaries, rests and quarter notes', () => {
  const song = createSong({ measures: 1 });
  fill(song, 0, 0, [['e', [[5, 0]]], ['e', [[5, 0]]], ['e', [[5, 0]]], ['e', []], ['q', [[5, 0]]], ['e', [[5, 0]]], ['e', [[5, 0]]]]);
  const lay = layoutTrack(song, 0, { width: 800 });
  const m = lay.systems[0].measures[0];
  assert.deepEqual(m.beamRuns.map((r) => r.beats), [[0, 1], [5, 6]]);
  assert.equal(m.beats[2].flags, 1, 'lone eighth before a rest gets a flag');
  assert.equal(m.beats[4].flags, 0);
});

test('secondary beams: four 16ths fully connected, eight 32nds split at the eighth', () => {
  const song = createSong({ measures: 1 });
  fill(song, 0, 0, [
    ['s', [[5, 0]]], ['s', [[5, 0]]], ['s', [[5, 0]]], ['s', [[5, 0]]],
    ['t', [[5, 0]]], ['t', [[5, 0]]], ['t', [[5, 0]]], ['t', [[5, 0]]], ['t', [[5, 0]]], ['t', [[5, 0]]], ['t', [[5, 0]]], ['t', [[5, 0]]],
  ]);
  const lay = layoutTrack(song, 0, { width: 800 });
  const [r1, r2] = lay.systems[0].measures[0].beamRuns;
  assert.deepEqual(r1.segments, [{ level: 1, from: 0, to: 3, partial: null }, { level: 2, from: 0, to: 3, partial: null }]);
  const lvl2 = r2.segments.filter((s) => s.level === 2).map((s) => [s.from, s.to]);
  const lvl3 = r2.segments.filter((s) => s.level === 3).map((s) => [s.from, s.to]);
  assert.deepEqual(lvl2, [[4, 7], [8, 11]]);
  assert.deepEqual(lvl3, [[4, 7], [8, 11]]);
});

test('dotted eighth + sixteenth gets a left-pointing beamlet', () => {
  const song = createSong({ measures: 1 });
  fill(song, 0, 0, [['e', [[5, 0]], { dots: 1 }], ['s', [[5, 0]]]]);
  const run = layoutTrack(song, 0, { width: 800 }).systems[0].measures[0].beamRuns[0];
  assert.deepEqual(run.segments, [{ level: 1, from: 0, to: 1, partial: null }, { level: 2, from: 1, to: 1, partial: 'left' }]);
});

test('stem direction follows the note farthest from the middle line; drums always up', () => {
  const song = createSong({ measures: 1, tracks: ['dist1', 'drums'] });
  fill(song, 0, 0, [['q', [[5, 0]]], ['q', [[0, 12]]], ['e', [[5, 0]]], ['e', [[0, 12]]]]);
  fill(song, 1, 0, [['e', [[0, 42], [5, 36]]], ['e', [[0, 42]]]]);
  const g = layoutTrack(song, 0, { width: 800 }).systems[0].measures[0];
  assert.equal(g.beats[0].stemDir, 1);
  assert.equal(g.beats[1].stemDir, -1);
  assert.equal(g.beats[2].stemDir, 1, 'low E is farther from the middle than the high E');
  assert.equal(g.beats[3].stemDir, 1, 'beamed run shares one direction');
  const d = layoutTrack(song, 1, { width: 800 }).systems[0].measures[0];
  assert.ok(d.beats.every((b) => b.stemDir === 1));
  assert.equal(d.beats[0].notes.find((n) => n.note.fret === 42).head, 'x');
});

test('tuplets group by nominal length and know whether they are beamed', () => {
  const song = createSong({ measures: 1 });
  fill(song, 0, 0, [
    ['e', [[2, 0]], { tuplet: T3 }], ['e', [[2, 0]], { tuplet: T3 }], ['e', [[2, 0]], { tuplet: T3 }],
    ['q', [[2, 0]], { tuplet: T3 }], ['q', [[2, 0]], { tuplet: T3 }], ['q', [[2, 0]], { tuplet: T3 }],
  ]);
  const m = layoutTrack(song, 0, { width: 800 }).systems[0].measures[0];
  assert.equal(m.tuplets.length, 2);
  assert.deepEqual(m.tuplets[0].beats, [0, 1, 2]);
  assert.equal(m.tuplets[0].beamed, true);
  assert.deepEqual(m.tuplets[1].beats, [3, 4, 5]);
  assert.equal(m.tuplets[1].beamed, false);
  assert.equal(m.status, 'incomplete', '1/4 + 1/2 of a 4/4 bar');
});

test('accidental state machine', () => {
  const st = createAccidentalState();
  const cs4 = pitchToStep(61), c4 = pitchToStep(60), cs5 = pitchToStep(73);
  assert.equal(accidentalFor(st, cs4), '#');
  assert.equal(accidentalFor(st, cs4), null, 'already sharp');
  assert.equal(accidentalFor(st, cs5), '#', 'other octave tracked separately');
  assert.equal(accidentalFor(st, c4), 'n');
  assert.equal(accidentalFor(st, c4), null);
  assert.equal(accidentalFor(st, cs4, { tied: true }), null, 'tied notes draw nothing');
  assert.equal(accidentalFor(st, cs4), '#', 'and leave state untouched');
  const st2 = createAccidentalState();
  assert.deepEqual(accidentalsForChord(st2, [{ ...pitchToStep(61) }, { ...pitchToStep(66) }, { ...pitchToStep(64) }]), ['#', '#', null]);
  const cols = accidentalColumns([{ pos: 0, accidental: '#' }, { pos: 2, accidental: '#' }, { pos: 9, accidental: '#' }, { pos: 4, accidental: null }]);
  assert.equal(cols.count, 2);
  assert.notEqual(cols.columns[0], cols.columns[1]);
});

test('systems wrap to the container width and justify', () => {
  const song = createSong({ measures: 12 });
  for (let mi = 0; mi < 12; mi++) fill(song, 0, mi, [['q', [[5, 0]]], ['q', [[5, 0]]], ['q', [[5, 0]]], ['q', [[5, 0]]]]);
  const lay = layoutTrack(song, 0, { width: 600 });
  assert.ok(lay.systems.length >= 2);
  for (const sys of lay.systems.slice(0, -1)) assert.ok(Math.abs(sys.right - (600 - 8)) < 0.01, 'full systems reach the right margin');
  assert.equal(lay.measures.length, 12);
  assert.equal(lay.beatMap.size, 48);
  assert.ok(lay.systems[0].measures[0].showTimeSig);
  assert.ok(!lay.systems[0].measures[1].showTimeSig);
  const narrow = layoutTrack(song, 0, { width: 100 });
  assert.equal(narrow.systems.length, 12, 'oversized measures get their own system');
});

test('vertical room grows with ledger lines', () => {
  const low = createSong({ measures: 1 });
  fill(low, 0, 0, [['q', [[5, 0]]]]);
  const high = createSong({ measures: 1 });
  fill(high, 0, 0, [['q', [[0, 22]]]]);
  const a = layoutTrack(low, 0, { width: 400 }), b = layoutTrack(high, 0, { width: 400 });
  assert.ok(b.systems[0].staffTop > a.systems[0].staffTop);
});

test('hit testing maps clicks to beats and strings', () => {
  const song = createSong({ measures: 1 });
  fill(song, 0, 0, [['q', [[5, 0]]], ['q', [[5, 0]]], ['q', [[5, 0]]], ['q', [[5, 0]]]]);
  const lay = layoutTrack(song, 0, { width: 600 });
  const sys = lay.systems[0];
  const b2 = sys.measures[0].beats[2];
  assert.deepEqual(hitTest(lay, b2.x + 2, sys.tabTop + lay.tabSpace * 3), { mi: 0, bi: 2, string: 3 });
  assert.deepEqual(hitTest(lay, b2.x, sys.tabTop - 100).string, 0);
});

test('score renders valid-looking SVG with overlay layers', () => {
  const song = createSong({ measures: 2, tracks: ['dist1', 'bass', 'drums'] });
  fill(song, 0, 0, [['e', [[0, 12, { tie: false }]]], ['e', [[0, 12, { tie: true }]]], ['q', [[1, 1], [2, 1]]], ['h', []]]);
  fill(song, 2, 0, [['q', [[0, 42], [5, 36]]], ['q', [[1, 49]]]]);
  for (let t = 0; t < 3; t++) {
    const svg = renderScoreSVG(layoutTrack(song, t, { width: 700 }));
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('class="cursor-layer"'));
    assert.ok(!svg.includes('NaN'), 'no NaN coordinates');
    assert.ok(!svg.includes('undefined'));
  }
  const lay = layoutTrack(song, 0, { width: 700 });
  assert.ok(cursorMarkup(lay, { measure: 0, beat: 1, string: 2 }).includes('cursor-cell'));
  assert.equal(cursorMarkup(lay, { measure: 9, beat: 0, string: 0 }), '');
});

test('repeat signs reserve width and render', () => {
  const song = createSong({ measures: 3 });
  song.measureHeaders[1].repeatOpen = true;
  song.measureHeaders[2].repeatClose = { times: 2 };
  song.measureHeaders[1].marker = 'Chorus';
  const lay = layoutTrack(song, 0, { width: 700 });
  const plain = layoutTrack(createSong({ measures: 3 }), 0, { width: 700 });
  assert.ok(lay.systems[0].measures[1].natural > plain.systems[0].measures[1].natural);
  const svg = renderScoreSVG(lay);
  assert.ok(svg.includes('Chorus'));
  assert.ok(svg.includes('x3'));
});
