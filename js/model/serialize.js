import { SONG_VERSION, defaultTrackName, validateSong } from './song.js';

export function toJSON(song, pretty = false) {
  return JSON.stringify(song, null, pretty ? 2 : 0);
}

const MIGRATIONS = {
  // 0 -> 1: initial versioned format; nothing to do.
  0: (s) => ({ ...s, version: 1 }),
  // 1 -> 2: the distortion tones were "Distortion Guitar" and "Distortion Guitar 2", so a second
  // track of the first tone was also auto-named "Distortion Guitar 2". The tones are now A and B;
  // tracks still carrying a v1 auto-name get a fresh default name, custom names are kept.
  1: (s) => {
    const V1_AUTO = /^(Distortion Guitar|Distortion Guitar 2|Clean Guitar|Bass|Drums)( \d+)?$/;
    const auto = s.tracks.filter((t) => V1_AUTO.test(t.name ?? ''));
    for (const t of auto) t.name = '';
    for (const t of auto) t.name = defaultTrackName(s, t.instrument, t);
    return { ...s, version: 2 };
  },
  // 2 -> 3: beats gained `empty` (unfilled) as opposed to a rest entered on purpose. A lone rest was the
  // empty-measure placeholder; every other rest stays a rest.
  2: (s) => {
    for (const t of s.tracks) {
      for (const m of t.measures) {
        for (const b of m.beats) b.empty = m.beats.length === 1 && !!b.rest;
      }
    }
    return { ...s, version: 3 };
  },
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
        b.empty ??= false;
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
