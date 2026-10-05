import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSong, createTrack, measureStatus, validateSong, stringCount, isDrums } from '../js/model/song.js';
import { toJSON, fromJSON } from '../js/model/serialize.js';
import { History } from '../js/model/history.js';
import * as cmd from '../js/model/commands.js';

const cursor0 = { track: 0, measure: 0, beat: 0, string: 0 };

test('createSong builds consistent structure', () => {
  const song = createSong({ measures: 3, tracks: ['dist1', 'bass', 'drums'] });
  assert.equal(song.measureHeaders.length, 3);
  assert.equal(song.tracks.length, 3);
  for (const t of song.tracks) assert.equal(t.measures.length, 3);
  assert.equal(stringCount(song.tracks[1]), 4);
  assert.ok(isDrums(song.tracks[2]));
  assert.equal(stringCount(song.tracks[2]), 6);
  validateSong(song);
  assert.equal(measureStatus(song, song.tracks[0], 0), 'empty');
  song.tracks[0].measures[0].beats[0].rest = false;
  song.tracks[0].measures[0].beats[0].notes.push({ string: 0, fret: 0, tie: false });
  assert.equal(measureStatus(song, song.tracks[0], 0), 'incomplete');
});

test('serialize round trip and validation', () => {
  const song = createSong({ title: 'Riff', measures: 2 });
  cmd.setFret(song, cursor0, 5);
  const back = fromJSON(toJSON(song));
  assert.deepEqual(back, song);
  assert.throws(() => fromJSON('{nope'));
  assert.throws(() => fromJSON('{"version":1,"tempo":120,"measureHeaders":[{"timeSig":{"num":4,"den":4}}],"tracks":[{"instrument":"dist1","tuning":[64],"measures":[]}]}'));
  assert.throws(() => fromJSON(JSON.stringify({ ...song, version: 99 })));
});

test('setFret, deleteNote, rest handling', () => {
  const song = createSong();
  const beat = song.tracks[0].measures[0].beats[0];
  assert.equal(beat.rest, true);
  cmd.setFret(song, cursor0, 7);
  assert.equal(beat.rest, false);
  assert.deepEqual(beat.notes, [{ string: 0, fret: 7, tie: false }]);
  cmd.setFret(song, { ...cursor0, string: 2 }, 9);
  cmd.setFret(song, cursor0, 12);
  assert.deepEqual(beat.notes.map((n) => [n.string, n.fret]), [[0, 12], [2, 9]]);
  cmd.deleteNote(song, cursor0);
  assert.equal(beat.notes.length, 1);
  cmd.deleteNote(song, { ...cursor0, string: 2 });
  assert.equal(beat.rest, true);
});

test('drum fret entry dedupes the same instrument', () => {
  const song = createSong({ tracks: ['drums'] });
  cmd.setFret(song, { ...cursor0, string: 5 }, 36);
  cmd.setFret(song, { ...cursor0, string: 0 }, 42);
  cmd.setFret(song, { ...cursor0, string: 4 }, 36);
  const beat = song.tracks[0].measures[0].beats[0];
  assert.deepEqual(beat.notes.map((n) => [n.string, n.fret]), [[0, 42], [4, 36]]);
});

test('moveRight appends beats until the measure is complete, then creates measures', () => {
  const song = createSong({ measures: 1 });
  let c = cursor0;
  let r;
  for (let i = 0; i < 3; i++) {
    assert.equal(cmd.moveRightEdits(song, c), true);
    r = cmd.moveRight(song, c);
    assert.equal(r.edited, true);
    c = r.cursor;
  }
  assert.equal(song.tracks[0].measures[0].beats.length, 4);
  assert.equal(measureStatus(song, song.tracks[0], 0), 'complete');
  assert.equal(c.beat, 3);
  r = cmd.moveRight(song, c);
  assert.equal(r.edited, true, 'new measure created at song end');
  assert.equal(song.measureHeaders.length, 2);
  assert.deepEqual(r.cursor, { ...cursor0, measure: 1, beat: 0 });
  // Leftwards goes back to the last beat of the previous measure.
  assert.deepEqual(cmd.moveLeft(song, r.cursor), { ...cursor0, measure: 0, beat: 3 });
});

test('moveRight picks a duration that fits the remaining space', () => {
  const song = createSong({ measures: 1 });
  cmd.setDuration(song, cursor0, 'h');
  let { cursor } = cmd.moveRight(song, cursor0);
  cmd.setDuration(song, cursor, 'q');
  ({ cursor } = cmd.moveRight(song, cursor));
  cmd.setDuration(song, cursor, 'e');
  ({ cursor } = cmd.moveRight(song, cursor));
  // remaining is 1/8, preferred 'e' fits
  assert.equal(song.tracks[0].measures[0].beats[3].duration, 'e');
  const song2 = createSong({ measures: 1 });
  cmd.setDuration(song2, cursor0, 'h');
  cmd.cycleDots(song2, cursor0); // dotted half: 3/4 used, 1/4 left; preferred 'h' does not fit
  const r = cmd.moveRight(song2, cursor0);
  assert.equal(song2.tracks[0].measures[0].beats[1].duration, 'q');
  assert.equal(r.cursor.beat, 1);
});

test('insert/delete beats and measures keep invariants', () => {
  const song = createSong({ measures: 2, tracks: ['dist1', 'bass'] });
  let c = cmd.insertBeat(song, cursor0);
  assert.equal(c.beat, 1);
  assert.equal(song.tracks[0].measures[0].beats.length, 2);
  c = cmd.deleteBeat(song, c);
  c = cmd.deleteBeat(song, c);
  assert.equal(song.tracks[0].measures[0].beats.length, 1, 'measure never empty');
  c = cmd.insertMeasure(song, cursor0);
  assert.equal(song.measureHeaders.length, 3);
  for (const t of song.tracks) assert.equal(t.measures.length, 3);
  assert.deepEqual(c, { ...cursor0, measure: 1 });
  c = cmd.deleteMeasure(song, c);
  c = cmd.deleteMeasure(song, c);
  c = cmd.deleteMeasure(song, c);
  assert.equal(song.measureHeaders.length, 1, 'last measure is cleared not removed');
  validateSong(song);
});

test('time signature applies forward until a change', () => {
  const song = createSong({ measures: 4 });
  cmd.setTimeSig(song, 2, { num: 3, den: 4 });
  cmd.setTimeSig(song, 0, { num: 6, den: 8 });
  assert.deepEqual(song.measureHeaders.map((h) => `${h.timeSig.num}/${h.timeSig.den}`), ['6/8', '6/8', '3/4', '3/4']);
  cmd.setTimeSig(song, 3, { num: 7, den: 8 }, { following: false });
  assert.equal(song.measureHeaders[3].timeSig.num, 7);
});

test('tracks: add/remove/tuning/string count', () => {
  const song = createSong({ measures: 2 });
  const ti = cmd.addTrack(song, 'dist1');
  assert.equal(song.tracks[ti].name, 'Distortion Guitar A 2');
  assert.equal(song.tracks[ti].measures.length, 2);
  cmd.setFret(song, { track: 0, measure: 0, beat: 0, string: 5 }, 3);
  cmd.setStringCount(song, 0, 4);
  assert.equal(song.tracks[0].tuning.length, 4);
  assert.equal(song.tracks[0].measures[0].beats[0].rest, true, 'note on removed string dropped');
  cmd.setStringCount(song, 0, 7);
  assert.equal(song.tracks[0].tuning.length, 7);
  cmd.setInstrument(song, 0, 'bass');
  assert.equal(song.tracks[0].tuning.length, 4);
  cmd.removeTrack(song, 1);
  cmd.removeTrack(song, 0);
  assert.equal(song.tracks.length, 0, 'the last track can be removed');
  validateSong(song);
  assert.deepEqual(cmd.clampCursor(song, { track: 3, measure: 1, beat: 2, string: 4 }), { track: 0, measure: 0, beat: 0, string: 0 });
  assert.equal(song.tracks[cmd.addTrack(song, 'bass')].measures.length, 2);
  validateSong(song);
});

test('tracks: any mix of guitar tones gets distinct names', () => {
  const song = createSong({ measures: 1, tracks: ['dist2'] });
  for (const inst of ['dist1', 'dist2', 'dist1', 'dist1', 'dist2']) cmd.addTrack(song, inst);
  assert.deepEqual(song.tracks.map((t) => [t.instrument, t.name]), [
    ['dist2', 'Distortion Guitar B'],
    ['dist1', 'Distortion Guitar A'],
    ['dist2', 'Distortion Guitar B 2'],
    ['dist1', 'Distortion Guitar A 2'],
    ['dist1', 'Distortion Guitar A 3'],
    ['dist2', 'Distortion Guitar B 3'],
  ]);
  cmd.removeTrack(song, 3);
  assert.equal(song.tracks[cmd.addTrack(song, 'dist1')].name, 'Distortion Guitar A 2', 'freed name is reused');
  cmd.setInstrument(song, 1, 'dist2');
  assert.equal(song.tracks[1].name, 'Distortion Guitar B 4', 'default name follows the tone');
  cmd.renameTrack(song, 0, 'Rhythm L');
  cmd.setInstrument(song, 0, 'dist1');
  assert.equal(song.tracks[0].name, 'Rhythm L', 'custom name is kept');
  validateSong(song);
});

test('v1 songs: colliding auto-named tracks are renamed, custom names kept', () => {
  const v1 = createSong({ measures: 1, tracks: ['dist1', 'dist1', 'dist1', 'dist1', 'dist2', 'bass', 'bass', 'drums', 'clean'] });
  const names = ['Distortion Guitar 2', 'Distortion Guitar 2', 'Distortion Guitar 3', 'Distortion Guitar 4', 'Distortion Guitar 2', 'Bass', 'Bass 2', 'Drums', 'My Clean'];
  v1.tracks.forEach((t, i) => { t.name = names[i]; });
  const song = fromJSON(JSON.stringify({ ...v1, version: 1 }));
  assert.equal(song.version, 3);
  assert.deepEqual(song.tracks.map((t) => t.name), [
    'Distortion Guitar A', 'Distortion Guitar A 2', 'Distortion Guitar A 3', 'Distortion Guitar A 4',
    'Distortion Guitar B', 'Bass', 'Bass 2', 'Drums', 'My Clean',
  ]);
});

test('R: empty beat -> rest -> empty; notes -> rest; deleting the last note leaves an empty beat', () => {
  const song = createSong({ measures: 1 });
  const beat = () => song.tracks[0].measures[0].beats[0];
  assert.equal(measureStatus(song, song.tracks[0], 0), 'empty');
  cmd.toggleRest(song, cursor0);
  assert.deepEqual([beat().rest, beat().empty], [true, false]);
  assert.equal(measureStatus(song, song.tracks[0], 0), 'incomplete', 'a lone quarter rest is a real rest');
  cmd.toggleRest(song, cursor0);
  assert.deepEqual([beat().rest, beat().empty], [true, true]);
  cmd.setFret(song, cursor0, 5);
  assert.deepEqual([beat().rest, beat().empty], [false, false]);
  cmd.toggleRest(song, cursor0);
  assert.deepEqual([beat().rest, beat().empty, beat().notes.length], [true, false, 0]);
  cmd.setFret(song, cursor0, 7);
  cmd.deleteNote(song, cursor0);
  assert.deepEqual([beat().rest, beat().empty], [true, true]);
});

test('v2 songs: lone rests become empty measures, other rests stay rests', () => {
  const v2 = createSong({ measures: 2 });
  for (const m of v2.tracks[0].measures) for (const b of m.beats) delete b.empty;
  v2.tracks[0].measures[1].beats.push({ duration: 'q', dots: 0, tuplet: null, rest: true, notes: [] });
  const song = fromJSON(JSON.stringify({ ...v2, version: 2 }));
  assert.equal(song.version, 3);
  assert.equal(measureStatus(song, song.tracks[0], 0), 'empty');
  assert.deepEqual(song.tracks[0].measures[1].beats.map((b) => b.empty), [false, false]);
});

test('→ keeps the tuplet of the current beat while it fits', () => {
  const song = createSong({ measures: 1, timeSig: { num: 2, den: 4 } });
  let c = cursor0;
  cmd.setDuration(song, c, 'e');
  cmd.toggleTuplet(song, c, 3);
  for (let i = 0; i < 5; i++) c = cmd.moveRight(song, c).cursor;
  const beats = song.tracks[0].measures[0].beats;
  assert.deepEqual(beats.map((b) => `${b.duration}${b.tuplet ? '/' + b.tuplet.n : ''}`), ['e/3', 'e/3', 'e/3', 'e/3', 'e/3', 'e/3']);
  assert.equal(measureStatus(song, song.tracks[0], 0), 'complete', 'six triplet eighths fill 2/4');
  const plain = createSong({ measures: 1 });
  cmd.setDuration(plain, cursor0, 'e');
  cmd.moveRight(plain, cursor0);
  assert.equal(plain.tracks[0].measures[0].beats[1].tuplet, null, 'plain beats stay plain');
});

test('selections: apply, clear, delete, copy and paste ranges', () => {
  const song = createSong({ measures: 3 });
  const frets = (mi) => song.tracks[0].measures[mi].beats.map((b) => (b.notes.length ? b.notes[0].fret : b.empty ? '_' : 'r'));
  let c = cursor0;
  for (const f of [1, 2, 3, 4, 5, 6]) { cmd.setFret(song, c, f); c = cmd.moveRight(song, c).cursor; }
  assert.deepEqual([frets(0), frets(1)], [[1, 2, 3, 4], [5, 6, '_']]);
  const range = { from: { measure: 0, beat: 2 }, to: { measure: 1, beat: 1 } };
  assert.deepEqual(cmd.beatsInRange(song.tracks[0], range).map((x) => x.beat.notes[0].fret), [3, 4, 5, 6]);

  cmd.forRange(song, 0, range, (s, at) => cmd.setDuration(s, at, 'e'));
  assert.deepEqual(song.tracks[0].measures[1].beats.map((b) => b.duration), ['e', 'e', 'q']);

  const clip = cmd.copyRange(song, 0, range);
  assert.equal(clip.whole, false);
  const pasted = cmd.pasteRange(song, { ...cursor0, measure: 2 }, clip);
  assert.deepEqual([frets(2), frets(3)], [[3, 4], [5, 6]], 'partial copy keeps its bar split and replaces empty bars');
  assert.deepEqual(pasted, { from: { measure: 2, beat: 0 }, to: { measure: 3, beat: 1 } });

  const whole = cmd.copyRange(song, 0, { from: { measure: 0, beat: 0 }, to: { measure: 0, beat: 3 } });
  assert.equal(whole.whole, true);
  cmd.pasteRange(song, { ...cursor0, measure: 2, beat: 1 }, whole);
  assert.deepEqual(frets(2), [1, 2, 3, 4], 'whole measures replace the target measure');

  cmd.clearRange(song, 0, range);
  assert.deepEqual([frets(0), frets(1)], [[1, 2, '_', '_'], ['_', '_', '_']]);
  const at = cmd.deleteRange(song, 0, { from: { measure: 0, beat: 1 }, to: { measure: 1, beat: 2 } });
  assert.deepEqual([frets(0), frets(1)], [[1], ['_']], 'an emptied measure keeps one empty beat');
  assert.deepEqual([at.measure, at.beat], [0, 0], 'cursor clamps into what is left');
  validateSong(song);
});

test('clipboard paste clamps to string count', () => {
  const song = createSong({ measures: 1, tracks: ['dist1', 'bass'] });
  cmd.setFret(song, { ...cursor0, string: 5 }, 3);
  cmd.setFret(song, { ...cursor0, string: 1 }, 2);
  const beat = cmd.copyBeat(song, cursor0);
  cmd.pasteBeat(song, { ...cursor0, track: 1 }, beat);
  assert.deepEqual(song.tracks[1].measures[0].beats[0].notes.map((n) => n.string), [1]);
  validateSong(song);
});

test('history snapshots, coalescing and redo', () => {
  const song = createSong();
  const h = new History(3);
  assert.equal(h.push(song, cursor0, 'fret:a'), true);
  cmd.setFret(song, cursor0, 1);
  assert.equal(h.push(song, cursor0, 'fret:a'), false, 'same token coalesces');
  cmd.setFret(song, cursor0, 12);
  h.seal();
  assert.equal(h.push(song, cursor0, 'fret:a'), true);
  cmd.setFret(song, cursor0, 5);
  let s = h.undo(song, cursor0);
  assert.equal(s.song.tracks[0].measures[0].beats[0].notes[0].fret, 12);
  s = h.undo(s.song, s.cursor);
  assert.equal(s.song.tracks[0].measures[0].beats[0].rest, true);
  assert.equal(h.canUndo(), false);
  s = h.redo(s.song, s.cursor);
  assert.equal(s.song.tracks[0].measures[0].beats[0].notes[0].fret, 12);
  for (let i = 0; i < 5; i++) h.push(song, cursor0);
  assert.equal(h.undoStack.length, 3, 'limit enforced');
  assert.equal(h.canRedo(), false, 'redo cleared on push');
});

test('clampCursor repairs out-of-range cursors', () => {
  const song = createSong({ measures: 2 });
  assert.deepEqual(cmd.clampCursor(song, { track: 5, measure: 9, beat: 9, string: 9 }), { track: 0, measure: 1, beat: 0, string: 5 });
});
