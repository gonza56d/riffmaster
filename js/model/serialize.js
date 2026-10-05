import { SONG_VERSION, validateSong } from './song.js';

export function toJSON(song, pretty = false) {
  return JSON.stringify(song, null, pretty ? 2 : 0);
}

const MIGRATIONS = {
  // 0 -> 1: initial versioned format; nothing to do.
  0: (s) => ({ ...s, version: 1 }),
};

export function migrate(song) {
  let v = song.version ?? 0;
  while (v < SONG_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`no migration from version ${v}`);
    song = step(song);
    v = song.version;
  }
  if (v > SONG_VERSION) throw new Error(`song version ${v} is newer than supported ${SONG_VERSION}`);
  return song;
}

/** Fill in optional fields older files may lack. */
export function normalize(song) {
  song.title ??= 'Untitled';
  song.tempo ??= 120;
  for (const h of song.measureHeaders) h.timeSig ??= { num: 4, den: 4 };
  for (const t of song.tracks) {
    t.volume ??= 1;
    t.mute ??= false;
    t.solo ??= false;
    for (const m of t.measures) {
      for (const b of m.beats) {
        b.dots ??= 0;
        b.tuplet ??= null;
        b.rest ??= b.notes.length === 0;
        for (const n of b.notes) n.tie ??= false;
      }
    }
  }
  return song;
}

export function fromJSON(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (e) {
    throw new Error('not valid JSON');
  }
  const song = normalize(migrate(data));
  validateSong(song);
  return song;
}
