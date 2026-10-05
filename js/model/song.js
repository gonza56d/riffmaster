import { beatsLength, measureLength, cmp } from './duration.js';
import { TUNING_PRESETS } from './tuning.js';
import { DRUM_TAB_LINES } from './drumMap.js';

export const SONG_VERSION = 3;

export const INSTRUMENTS = {
  dist1: { name: 'Distortion Guitar A', family: 'guitar', clef: 'treble', color: 'dist1' },
  dist2: { name: 'Distortion Guitar B', family: 'guitar', clef: 'treble', color: 'dist2' },
  clean: { name: 'Clean Guitar', family: 'guitar', clef: 'treble', color: 'clean' },
  bass: { name: 'Bass', family: 'bass', clef: 'bass', color: 'bass' },
  drums: { name: 'Drums', family: 'drums', clef: 'percussion', color: 'drums' },
};

let idCounter = 0;
export function uid(prefix = 't') {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function createNote(string, fret, extra = {}) {
  return { string, fret, tie: false, ...extra };
}

/**
 * `rest` means the beat is silent. `empty` marks a silent beat nobody has filled yet: it takes up its
 * duration but draws nothing, like a GP5 empty beat. A rest entered with R is `rest && !empty`.
 */
export function createBeat({ duration = 'q', dots = 0, tuplet = null, rest = true, empty = rest, notes = [] } = {}) {
  return { duration, dots, tuplet, rest, empty, notes };
}

export function createMeasure() {
  return { beats: [createBeat()] };
}

export function defaultTuning(instrument) {
  const family = INSTRUMENTS[instrument].family;
  if (family === 'drums') return Array.from({ length: DRUM_TAB_LINES }, () => 0);
  return TUNING_PRESETS.find((p) => p.family === family).tuning.slice();
}

export function createTrack(instrument, measureCount, { name, tuning } = {}) {
  if (!INSTRUMENTS[instrument]) throw new Error(`unknown instrument ${instrument}`);
  return {
    id: uid(),
    name: name || INSTRUMENTS[instrument].name,
    instrument,
    tuning: tuning ? tuning.slice() : defaultTuning(instrument),
    volume: 1,
    mute: false,
    solo: false,
    measures: Array.from({ length: measureCount }, createMeasure),
  };
}

/** Unused default name for a track of `instrument`: the instrument name, then "Name 2", "Name 3"… */
export function defaultTrackName(song, instrument, except = null) {
  const base = INSTRUMENTS[instrument].name;
  const taken = new Set(song.tracks.filter((t) => t !== except).map((t) => t.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function isDefaultTrackName(name, instrument) {
  const base = INSTRUMENTS[instrument].name;
  return name === base || (name.startsWith(base) && /^ \d+$/.test(name.slice(base.length)));
}

export function createSong({ title = 'Untitled', tempo = 120, timeSig = { num: 4, den: 4 }, measures = 4, tracks = ['dist1'] } = {}) {
  const song = {
    version: SONG_VERSION,
    title,
    tempo,
    measureHeaders: Array.from({ length: measures }, () => ({ timeSig: { ...timeSig } })),
    tracks: [],
  };
  for (const inst of tracks) song.tracks.push(createTrack(inst, measures));
  return song;
}

export const isDrums = (track) => INSTRUMENTS[track.instrument].family === 'drums';
export const stringCount = (track) => track.tuning.length;
export const measureCount = (song) => song.measureHeaders.length;
export const timeSigAt = (song, mi) => song.measureHeaders[mi].timeSig;
export const tempoAt = (song, mi) => song.measureHeaders[mi]?.tempo ?? song.tempo;

/** True when the measure holds nothing but a single empty beat (rendered as a whole-measure rest). */
export function isEmptyMeasure(measure) {
  return measure.beats.length === 1 && measure.beats[0].rest && measure.beats[0].empty;
}

/** 'empty' | 'complete' | 'incomplete' | 'overfull' */
export function measureStatus(song, track, mi) {
  if (isEmptyMeasure(track.measures[mi])) return 'empty';
  const used = beatsLength(track.measures[mi].beats);
  const c = cmp(used, measureLength(timeSigAt(song, mi)));
  return c === 0 ? 'complete' : c < 0 ? 'incomplete' : 'overfull';
}

export function noteAt(beat, string) {
  return beat.notes.find((n) => n.string === string) || null;
}

/** Throws if the song violates structural invariants. Used by tests and import. */
export function validateSong(song) {
  if (!song || typeof song !== 'object') throw new Error('song is not an object');
  if (!Array.isArray(song.measureHeaders) || !Array.isArray(song.tracks)) throw new Error('missing headers/tracks');
  if (typeof song.tempo !== 'number' || song.tempo <= 0) throw new Error('bad tempo');
  const n = song.measureHeaders.length;
  if (n < 1) throw new Error('song needs at least one measure');
  for (const h of song.measureHeaders) {
    if (!h.timeSig || !(h.timeSig.num > 0) || ![1, 2, 4, 8, 16, 32].includes(h.timeSig.den)) throw new Error('bad time signature');
  }
  for (const t of song.tracks) {
    if (!INSTRUMENTS[t.instrument]) throw new Error(`unknown instrument ${t.instrument}`);
    if (!Array.isArray(t.tuning) || t.tuning.length < 1) throw new Error('bad tuning');
    if (!Array.isArray(t.measures) || t.measures.length !== n) throw new Error(`track ${t.name} has ${t.measures?.length} measures, expected ${n}`);
    for (const m of t.measures) {
      if (!Array.isArray(m.beats) || m.beats.length < 1) throw new Error('measure needs at least one beat');
      for (const b of m.beats) {
        if (!(b.duration in { w: 1, h: 1, q: 1, e: 1, s: 1, t: 1, x: 1 })) throw new Error(`bad duration ${b.duration}`);
        if (!Array.isArray(b.notes)) throw new Error('beat.notes missing');
        for (const note of b.notes) {
          if (!Number.isInteger(note.string) || note.string < 0 || note.string >= t.tuning.length) throw new Error('note string out of range');
          if (!Number.isInteger(note.fret) || note.fret < 0) throw new Error('bad fret');
        }
      }
    }
  }
  return true;
}
