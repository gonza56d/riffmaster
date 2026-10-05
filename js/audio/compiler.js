// Pure: turns a song into a flat, time-ordered event list. Positions are in whole notes (floating point).
import { beatLength, beatsLength, measureLength, toNumber } from '../model/duration.js';
import { isDrums } from '../model/song.js';

/** Unroll repeat signs into a measure sequence. `repeatClose` may carry `times` (default 1 extra pass). */
export function unrollRepeats(headers) {
  const seq = [];
  let open = 0;
  const done = new Set();
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.repeatOpen) open = i;
    seq.push(i);
    if (h.repeatClose && !done.has(i)) {
      done.add(i);
      const times = Math.max(1, Math.min(8, h.repeatClose.times ?? 1));
      for (let k = 0; k < times; k++) for (let j = open; j <= i; j++) seq.push(j);
    }
  }
  return seq;
}

export function compileSong(song) {
  const sequence = unrollRepeats(song.measureHeaders);
  const measures = [];
  let pos = 0;
  sequence.forEach((mi, index) => {
    const header = song.measureHeaders[mi];
    const nominal = toNumber(measureLength(header.timeSig));
    let length = nominal;
    for (const t of song.tracks) length = Math.max(length, toNumber(beatsLength(t.measures[mi].beats)));
    measures.push({ index, mi, start: pos, length, nominal, tempo: header.tempo ?? song.tempo, timeSig: header.timeSig });
    pos += length;
  });
  const total = pos;

  const events = [];
  const trackBeats = song.tracks.map(() => []);
  song.tracks.forEach((track, ti) => {
    const drums = isDrums(track);
    const open = new Map(); // string -> { note, end } for tie extension
    for (const m of measures) {
      let onset = m.start;
      track.measures[m.mi].beats.forEach((beat, bi) => {
        const len = toNumber(beatLength(beat));
        trackBeats[ti].push({ pos: onset, mi: m.mi, bi, seq: m.index });
        if (!beat.rest && beat.notes.length) {
          const ev = { pos: onset, ti, trackId: track.id, instrument: track.instrument, duration: len, mi: m.mi, bi, notes: [] };
          for (const n of beat.notes) {
            const prev = open.get(n.string);
            if (n.tie && prev && prev.note.fret === n.fret && Math.abs(prev.end - onset) < 1e-9) {
              prev.note.duration += len;
              prev.end = onset + len;
              continue;
            }
            const note = {
              midi: drums ? n.fret : track.tuning[n.string] + n.fret,
              string: n.string, fret: n.fret, duration: len,
              effects: n.effects ? { ...n.effects } : null,
              velocity: n.effects?.hammer ? 0.75 : 1,
            };
            ev.notes.push(note);
            open.set(n.string, { note, end: onset + len });
          }
          if (ev.notes.length) events.push(ev);
        }
        onset += len;
      });
    }
    // Slides glide toward the next note on the same string.
    const trackEvents = events.filter((e) => e.ti === ti);
    for (let i = 0; i < trackEvents.length; i++) {
      for (const note of trackEvents[i].notes) {
        if (!note.effects?.slide) continue;
        for (let j = i + 1; j < trackEvents.length; j++) {
          const next = trackEvents[j].notes.find((x) => x.string === note.string);
          if (next) { note.slideTo = next.midi; break; }
        }
      }
    }
  });
  events.sort((a, b) => a.pos - b.pos || a.ti - b.ti);

  const clicks = [];
  for (const m of measures) {
    const unit = 1 / m.timeSig.den;
    for (let i = 0; i < m.timeSig.num; i++) clicks.push({ pos: m.start + i * unit, accent: i === 0 });
  }
  return { measures, events, trackBeats, clicks, total };
}

/** Timeline segments for mapping positions to seconds at a given playback speed. */
export function buildTimeline(measures, speed = 1) {
  let t = 0;
  return measures.map((m) => {
    const spw = 240 / (m.tempo * speed); // seconds per whole note
    const seg = { start: m.start, end: m.start + m.length, t0: t, spw };
    t += m.length * spw;
    return seg;
  });
}

export function timeAt(timeline, pos) {
  if (!timeline.length) return 0;
  let seg = timeline[timeline.length - 1];
  for (const s of timeline) if (pos < s.end) { seg = s; break; }
  return seg.t0 + (pos - seg.start) * seg.spw;
}

export function posAt(timeline, time) {
  if (!timeline.length) return 0;
  let seg = timeline[timeline.length - 1];
  for (const s of timeline) if (time < s.t0 + (s.end - s.start) * s.spw) { seg = s; break; }
  return seg.start + (time - seg.t0) / seg.spw;
}

/** Index of the last beat entry (sorted by pos) at or before `pos`, for the playhead. */
export function beatIndexAt(beats, pos) {
  let lo = 0, hi = beats.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid].pos <= pos + 1e-9) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
