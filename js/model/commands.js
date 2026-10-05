// Editing commands. They mutate `song` in place and return the new cursor.
// Cursor shape: { track, measure, beat, string }.
// History snapshots are taken by the caller before invoking an editing command.

import {
  DURATIONS, DURATION_DIV, beatLength, beatsLength, measureLength, baseLength, cmp, sub, ZERO,
  longer, shorter, makeTuplet,
} from './duration.js';
import { createBeat, createMeasure, createNote, createTrack, defaultTrackName, defaultTuning, INSTRUMENTS, isDefaultTrackName, isDrums, isEmptyMeasure, noteAt, stringCount, timeSigAt } from './song.js';
import { resizeTuning, MAX_FRET } from './tuning.js';
import { drumInfo } from './drumMap.js';

const trackOf = (song, c) => song.tracks[c.track];
const measureOf = (song, c) => trackOf(song, c).measures[c.measure];
const beatOf = (song, c) => measureOf(song, c).beats[c.beat];

export function clampCursor(song, cursor) {
  const c = { ...cursor };
  if (song.tracks.length === 0) return { track: 0, measure: 0, beat: 0, string: 0 };
  c.track = Math.max(0, Math.min(song.tracks.length - 1, c.track | 0));
  const track = song.tracks[c.track];
  c.measure = Math.max(0, Math.min(track.measures.length - 1, c.measure | 0));
  c.beat = Math.max(0, Math.min(track.measures[c.measure].beats.length - 1, c.beat | 0));
  c.string = Math.max(0, Math.min(stringCount(track) - 1, c.string | 0));
  return c;
}

// ---------- notes ----------

export function setFret(song, cursor, fret) {
  const track = trackOf(song, cursor);
  const beat = beatOf(song, cursor);
  fret = Math.max(0, Math.min(isDrums(track) ? 127 : MAX_FRET, fret | 0));
  beat.rest = false;
  beat.empty = false;
  if (isDrums(track)) {
    // One instance of a percussion instrument per beat: drop the same MIDI number on other lines.
    beat.notes = beat.notes.filter((n) => n.fret !== fret || n.string === cursor.string);
  }
  const existing = noteAt(beat, cursor.string);
  if (existing) existing.fret = fret;
  else beat.notes.push(createNote(cursor.string, fret));
  beat.notes.sort((a, b) => a.string - b.string);
  return cursor;
}

export function deleteNote(song, cursor) {
  const beat = beatOf(song, cursor);
  const before = beat.notes.length;
  beat.notes = beat.notes.filter((n) => n.string !== cursor.string);
  if (beat.notes.length === 0) { beat.rest = true; beat.empty = true; }
  return { cursor, changed: before !== beat.notes.length };
}

export function toggleTie(song, cursor) {
  const note = noteAt(beatOf(song, cursor), cursor.string);
  if (note) note.tie = !note.tie;
  return cursor;
}

export function toggleEffect(song, cursor, key) {
  const note = noteAt(beatOf(song, cursor), cursor.string);
  if (!note) return cursor;
  note.effects ??= {};
  if (note.effects[key]) delete note.effects[key];
  else note.effects[key] = true;
  if (Object.keys(note.effects).length === 0) delete note.effects;
  return cursor;
}

// ---------- beat rhythm ----------

export function setDuration(song, cursor, duration) {
  if (!DURATION_DIV[duration]) throw new Error(`bad duration ${duration}`);
  beatOf(song, cursor).duration = duration;
  return cursor;
}

export function changeDuration(song, cursor, dir) {
  const beat = beatOf(song, cursor);
  beat.duration = dir > 0 ? longer(beat.duration) : shorter(beat.duration);
  return cursor;
}

export function cycleDots(song, cursor) {
  const beat = beatOf(song, cursor);
  beat.dots = (beat.dots + 1) % 3;
  return cursor;
}

export function setDots(song, cursor, dots) {
  beatOf(song, cursor).dots = dots;
  return cursor;
}

export function setTuplet(song, cursor, n) {
  const beat = beatOf(song, cursor);
  beat.tuplet = n ? makeTuplet(n) : null;
  return cursor;
}

export function toggleTuplet(song, cursor, n = 3) {
  const beat = beatOf(song, cursor);
  beat.tuplet = beat.tuplet && beat.tuplet.n === n ? null : makeTuplet(n);
  return cursor;
}

/** GP5 R: an empty beat or a beat with notes becomes a rest; a rest becomes an empty beat again. */
export function toggleRest(song, cursor) {
  const beat = beatOf(song, cursor);
  beat.empty = beat.rest && !beat.empty;
  beat.rest = true;
  beat.notes = [];
  return cursor;
}

/** `on`: make the beat a rest (dropping its notes). Off: a rest goes back to an empty beat. */
export function setRest(song, cursor, on) {
  const beat = beatOf(song, cursor);
  if (on) Object.assign(beat, { rest: true, empty: false, notes: [] });
  else if (beat.rest) beat.empty = true;
  return cursor;
}

// ---------- beats ----------

/** Largest plain duration that fits in `remaining`, or the shortest duration. */
function fittingDuration(preferred, remaining) {
  if (cmp(baseLength(preferred), remaining) <= 0) return preferred;
  for (const d of DURATIONS) if (cmp(baseLength(d), remaining) <= 0) return d;
  return DURATIONS[DURATIONS.length - 1];
}

export function insertBeat(song, cursor) {
  const measure = measureOf(song, cursor);
  const current = measure.beats[cursor.beat];
  const beat = createBeat({ duration: current.duration, dots: current.dots, tuplet: current.tuplet ? { ...current.tuplet } : null });
  measure.beats.splice(cursor.beat + 1, 0, beat);
  return { ...cursor, beat: cursor.beat + 1 };
}

export function deleteBeat(song, cursor) {
  const measure = measureOf(song, cursor);
  measure.beats.splice(cursor.beat, 1);
  if (measure.beats.length === 0) measure.beats.push(createBeat());
  return clampCursor(song, cursor);
}

// ---------- measures ----------

export function insertMeasure(song, cursor, after = true) {
  const at = after ? cursor.measure + 1 : cursor.measure;
  const header = { timeSig: { ...timeSigAt(song, cursor.measure) } };
  song.measureHeaders.splice(at, 0, header);
  for (const t of song.tracks) t.measures.splice(at, 0, createMeasure());
  return { ...cursor, measure: at, beat: 0 };
}

export function appendMeasure(song) {
  const last = song.measureHeaders.length - 1;
  const header = { timeSig: { ...timeSigAt(song, last) } };
  song.measureHeaders.push(header);
  for (const t of song.tracks) t.measures.push(createMeasure());
  return song.measureHeaders.length - 1;
}

export function deleteMeasure(song, cursor) {
  if (song.measureHeaders.length === 1) {
    for (const t of song.tracks) t.measures[0] = createMeasure();
    return { ...cursor, measure: 0, beat: 0 };
  }
  song.measureHeaders.splice(cursor.measure, 1);
  for (const t of song.tracks) t.measures.splice(cursor.measure, 1);
  return clampCursor(song, { ...cursor, beat: 0 });
}

/** Set the time signature from measure `mi` onward (until a measure with a different signature, like GP5) or just one. */
export function setTimeSig(song, mi, timeSig, { following = true } = {}) {
  const old = { ...timeSigAt(song, mi) };
  song.measureHeaders[mi].timeSig = { ...timeSig };
  if (following) {
    for (let i = mi + 1; i < song.measureHeaders.length; i++) {
      const ts = song.measureHeaders[i].timeSig;
      if (ts.num !== old.num || ts.den !== old.den) break;
      song.measureHeaders[i].timeSig = { ...timeSig };
    }
  }
  return song;
}

export function toggleRepeatOpen(song, mi) {
  const h = song.measureHeaders[mi];
  if (h.repeatOpen) delete h.repeatOpen; else h.repeatOpen = true;
}

export function toggleRepeatClose(song, mi, times = 1) {
  const h = song.measureHeaders[mi];
  if (h.repeatClose) delete h.repeatClose; else h.repeatClose = { times };
}

export function setTempo(song, bpm) {
  song.tempo = Math.max(20, Math.min(400, Math.round(bpm) || song.tempo));
  return song;
}

export function setTitle(song, title) {
  song.title = String(title ?? '').slice(0, 200) || 'Untitled';
  return song;
}

// ---------- tracks ----------

export function addTrack(song, instrument) {
  const t = createTrack(instrument, song.measureHeaders.length, { name: defaultTrackName(song, instrument) });
  song.tracks.push(t);
  return song.tracks.length - 1;
}

export function removeTrack(song, ti) {
  song.tracks.splice(ti, 1);
}

export function renameTrack(song, ti, name) {
  song.tracks[ti].name = String(name).slice(0, 60) || song.tracks[ti].name;
}

export function setInstrument(song, ti, instrument) {
  const t = song.tracks[ti];
  if (t.instrument === instrument) return;
  const oldFamily = INSTRUMENTS[t.instrument].family;
  const renamed = isDefaultTrackName(t.name, t.instrument);
  t.instrument = instrument;
  // A track still carrying its auto-generated name follows the new instrument; custom names are kept.
  if (renamed) t.name = defaultTrackName(song, instrument, t);
  if (INSTRUMENTS[instrument].family !== oldFamily) setTrackTuning(song, ti, defaultTuning(instrument));
}

/** Replace the tuning; notes on strings that no longer exist are dropped. */
export function setTrackTuning(song, ti, tuning) {
  const t = song.tracks[ti];
  t.tuning = tuning.slice();
  for (const m of t.measures) {
    for (const b of m.beats) {
      b.notes = b.notes.filter((n) => n.string < tuning.length);
      if (b.notes.length === 0 && !b.rest) { b.rest = true; b.empty = true; }
    }
  }
}

export function setStringCount(song, ti, count) {
  setTrackTuning(song, ti, resizeTuning(song.tracks[ti].tuning, count));
}

export function toggleMute(song, ti) { song.tracks[ti].mute = !song.tracks[ti].mute; }
export function toggleSolo(song, ti) { song.tracks[ti].solo = !song.tracks[ti].solo; }
export function setVolume(song, ti, v) { song.tracks[ti].volume = Math.max(0, Math.min(1, +v)); }

// ---------- clipboard ----------

export const copyBeat = (song, cursor) => structuredClone(beatOf(song, cursor));
export const copyMeasure = (song, cursor) => structuredClone(measureOf(song, cursor));

export function pasteBeat(song, cursor, beat) {
  const track = trackOf(song, cursor);
  const clone = structuredClone(beat);
  clone.notes = clone.notes.filter((n) => n.string < stringCount(track));
  if (clone.notes.length === 0 && !clone.rest) { clone.rest = true; clone.empty = true; }
  measureOf(song, cursor).beats[cursor.beat] = clone;
  return cursor;
}

export function pasteMeasure(song, cursor, measure) {
  const track = trackOf(song, cursor);
  const clone = structuredClone(measure);
  for (const b of clone.beats) {
    b.notes = b.notes.filter((n) => n.string < stringCount(track));
    if (b.notes.length === 0 && !b.rest) { b.rest = true; b.empty = true; }
  }
  track.measures[cursor.measure] = clone;
  return clampCursor(song, { ...cursor, beat: 0 });
}

// ---------- selections ----------
// A selection is a run of beats on one track: { from: { measure, beat }, to: { measure, beat } }, inclusive and in order.

/** Every beat of `track` inside `range`, as { mi, bi, beat }. */
export function beatsInRange(track, range) {
  const out = [];
  for (let mi = range.from.measure; mi <= range.to.measure; mi++) {
    const beats = track.measures[mi].beats;
    const last = mi === range.to.measure ? range.to.beat : beats.length - 1;
    for (let bi = mi === range.from.measure ? range.from.beat : 0; bi <= last; bi++) out.push({ mi, bi, beat: beats[bi] });
  }
  return out;
}

/** Apply a beat-level command (setDuration, cycleDots, toggleRest…) to every beat of the range. */
export function forRange(song, ti, range, fn) {
  for (const { mi, bi } of beatsInRange(song.tracks[ti], range)) fn(song, { track: ti, measure: mi, beat: bi, string: 0 });
}

export function clearRange(song, ti, range) {
  for (const { beat } of beatsInRange(song.tracks[ti], range)) Object.assign(beat, { rest: true, empty: true, notes: [] });
}

/** Remove the beats of the range; a measure left without beats gets one empty beat. Returns the cursor. */
export function deleteRange(song, ti, range) {
  const track = song.tracks[ti];
  for (let mi = range.to.measure; mi >= range.from.measure; mi--) {
    const measure = track.measures[mi];
    const first = mi === range.from.measure ? range.from.beat : 0;
    const last = mi === range.to.measure ? range.to.beat : measure.beats.length - 1;
    measure.beats.splice(first, last - first + 1);
    if (measure.beats.length === 0) measure.beats.push(createBeat());
  }
  return clampCursor(song, { track: ti, measure: range.from.measure, beat: range.from.beat, string: 0 });
}

/** Clipboard form of a range: beats grouped per measure; `whole` when it covers entire measures. */
export function copyRange(song, ti, range) {
  const track = song.tracks[ti];
  const measures = [];
  for (const { mi, beat } of beatsInRange(track, range)) (measures[mi - range.from.measure] ??= []).push(structuredClone(beat));
  const whole = range.from.beat === 0 && range.to.beat === track.measures[range.to.measure].beats.length - 1;
  return { measures, whole };
}

/**
 * Paste a copied range at the cursor, one copied measure per target measure (appending measures at the end).
 * Whole measures replace the targets; partial ones are inserted at the cursor (later measures at their start),
 * taking the place of an empty beat there. Returns the range that was pasted.
 */
export function pasteRange(song, cursor, clip) {
  const track = trackOf(song, cursor);
  let last = null;
  clip.measures.forEach((copied, i) => {
    const mi = cursor.measure + i;
    while (mi >= song.measureHeaders.length) appendMeasure(song);
    const measure = track.measures[mi];
    const beats = copied.map((b) => {
      const clone = structuredClone(b);
      clone.notes = clone.notes.filter((n) => n.string < stringCount(track));
      if (clone.notes.length === 0 && !clone.rest) { clone.rest = true; clone.empty = true; }
      return clone;
    });
    let at = 0;
    if (clip.whole || isEmptyMeasure(measure)) measure.beats = beats;
    else {
      at = i === 0 ? cursor.beat : 0;
      measure.beats.splice(at, measure.beats[at]?.empty ? 1 : 0, ...beats);
    }
    last = { measure: mi, beat: at + beats.length - 1 };
  });
  return { from: { measure: cursor.measure, beat: clip.whole ? 0 : cursor.beat }, to: last };
}

// ---------- navigation ----------

export function moveLeft(song, cursor) {
  if (cursor.beat > 0) return { ...cursor, beat: cursor.beat - 1 };
  if (cursor.measure > 0) {
    const m = cursor.measure - 1;
    return { ...cursor, measure: m, beat: trackOf(song, cursor).measures[m].beats.length - 1 };
  }
  return cursor;
}

/**
 * GP5 semantics: inside a measure move to the next beat. At the last beat of an incomplete measure
 * append a beat (an edit). At the last beat of a complete measure go to the next measure, creating one
 * at the end of the song. Returns { cursor, edited }.
 */
export function moveRight(song, cursor) {
  const track = trackOf(song, cursor);
  const measure = track.measures[cursor.measure];
  if (cursor.beat < measure.beats.length - 1) return { cursor: { ...cursor, beat: cursor.beat + 1 }, edited: false };
  const remaining = sub(measureLength(timeSigAt(song, cursor.measure)), beatsLength(measure.beats));
  if (cmp(remaining, ZERO) > 0) {
    const current = measure.beats[cursor.beat];
    // Keep entering tuplets like GP5: the new beat copies the tuplet while one more fits.
    const tuplet = current.tuplet && cmp(beatLength({ duration: current.duration, dots: 0, tuplet: current.tuplet }), remaining) <= 0 ? { ...current.tuplet } : null;
    const beat = createBeat({ duration: tuplet ? current.duration : fittingDuration(current.duration, remaining), tuplet });
    measure.beats.push(beat);
    return { cursor: { ...cursor, beat: measure.beats.length - 1 }, edited: true };
  }
  if (cursor.measure < track.measures.length - 1) {
    return { cursor: { ...cursor, measure: cursor.measure + 1, beat: 0 }, edited: false };
  }
  const mi = appendMeasure(song);
  return { cursor: { ...cursor, measure: mi, beat: 0 }, edited: true };
}

/** True when moveRight would modify the song (lets the caller snapshot history first). */
export function moveRightEdits(song, cursor) {
  const track = trackOf(song, cursor);
  const measure = track.measures[cursor.measure];
  if (cursor.beat < measure.beats.length - 1) return false;
  if (cmp(sub(measureLength(timeSigAt(song, cursor.measure)), beatsLength(measure.beats)), ZERO) > 0) return true;
  return cursor.measure === track.measures.length - 1;
}

export function moveUp(song, cursor) {
  return { ...cursor, string: Math.max(0, cursor.string - 1) };
}
export function moveDown(song, cursor) {
  return { ...cursor, string: Math.min(stringCount(trackOf(song, cursor)) - 1, cursor.string + 1) };
}

export function moveMeasure(song, cursor, dir) {
  const n = song.measureHeaders.length;
  const m = Math.max(0, Math.min(n - 1, cursor.measure + dir));
  return { ...cursor, measure: m, beat: 0 };
}

/** Next beat without creating anything (selection extension); stays put at the end of the song. */
export function nextBeat(song, cursor) {
  const track = trackOf(song, cursor);
  if (cursor.beat < track.measures[cursor.measure].beats.length - 1) return { ...cursor, beat: cursor.beat + 1 };
  if (cursor.measure < track.measures.length - 1) return { ...cursor, measure: cursor.measure + 1, beat: 0 };
  return cursor;
}

export const toMeasureStart = (song, cursor) => ({ ...cursor, beat: 0 });
export const toMeasureEnd = (song, cursor) => ({ ...cursor, beat: measureOf(song, cursor).beats.length - 1 });
export const toSongStart = (song, cursor) => ({ ...cursor, measure: 0, beat: 0 });
export function toSongEnd(song, cursor) {
  const m = song.measureHeaders.length - 1;
  return { ...cursor, measure: m, beat: trackOf(song, cursor).measures[m].beats.length - 1 };
}

export function selectTrack(song, cursor, ti) {
  return clampCursor(song, { ...cursor, track: ti });
}

/** Position (fraction of a whole note) of a beat inside its measure. */
export function beatOnset(measure, beatIndex) {
  return beatsLength(measure.beats.slice(0, beatIndex));
}

export { beatLength, drumInfo };
