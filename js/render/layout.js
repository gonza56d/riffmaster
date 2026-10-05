// Pure layout engine: turns one track of a song into geometry for the renderer.
// All coordinates are in CSS pixels relative to the top-left of the score SVG.

import { beatLength, beamCount, cmp, add, ZERO, toNumber, mul, frac, baseLength, eq } from '../model/duration.js';
import { groupBoundaries, groupIndexAt, timeSigEq } from '../model/timesig.js';
import { pitchToStep, writtenMidi, CLEF_BOTTOM_STEP } from '../model/tuning.js';
import { drumInfo } from '../model/drumMap.js';
import { INSTRUMENTS, isDrums, stringCount, measureStatus, timeSigAt } from '../model/song.js';
import { createAccidentalState, accidentalsForChord, accidentalColumns } from './accidentals.js';

export const DEFAULTS = {
  width: 900,
  staffSpace: 8,
  tabSpace: 10,
  headWidth: 10,
  marginX: 8,
  measureLead: 10,
  measureTail: 6,
  clefWidth: 28,
  timeSigWidth: 22,
  minBeat: 18,
  maxBeat: 90,
  stretchCap: 1.8,
  lastSystemFill: 0.6,
};

const QUARTER = 1 / 4;

export function rhythmWidth(lenNumber, o = DEFAULTS) {
  const w = 32 * Math.pow(lenNumber / QUARTER, 0.6);
  return Math.max(o.minBeat, Math.min(o.maxBeat, w));
}

const digitsOf = (n) => String(n).length;

/** Geometry for the notes of one beat on the staff: positions, accidentals, displacement. */
function engraveNotes(track, beat, accState, clef) {
  const drums = isDrums(track);
  const bottomStep = CLEF_BOTTOM_STEP[clef];
  const items = beat.notes.map((note) => {
    if (drums) {
      const info = drumInfo(note.fret);
      return { note, pos: info.pos, head: info.head, accidental: null, dx: 0, tied: !!note.tie };
    }
    const spelled = pitchToStep(writtenMidi(track, note));
    return { note, pos: spelled.step - bottomStep, head: 'normal', spelled: { ...spelled, tied: !!note.tie }, dx: 0, tied: !!note.tie };
  });
  if (!drums) {
    const acc = accidentalsForChord(accState, items.map((it) => it.spelled));
    items.forEach((it, i) => { it.accidental = acc[i]; });
  }
  items.sort((a, b) => a.pos - b.pos);
  const { columns, count } = accidentalColumns(items);
  items.forEach((it, i) => { it.accCol = columns[i] ?? 0; });
  return { items, accColumns: count };
}

function stemDirectionFor(items, drums) {
  if (drums) return 1;
  if (!items.length) return 0;
  const middle = 4;
  let extreme = items[0].pos;
  for (const it of items) if (Math.abs(it.pos - middle) > Math.abs(extreme - middle)) extreme = it.pos;
  return extreme > middle ? -1 : 1;
}

/**
 * Lay out one measure's beats: returns beat entries with relative x (from the measure's beat origin),
 * widths and engraving data. Beams and tuplets are resolved here too.
 */
function layoutMeasure(song, track, mi, o, clef) {
  const measure = track.measures[mi];
  const timeSig = timeSigAt(song, mi);
  const boundaries = groupBoundaries(timeSig, song.measureHeaders[mi].beamGroups);
  const accState = createAccidentalState();
  const drums = isDrums(track);
  const beats = [];
  let onset = ZERO;
  measure.beats.forEach((beat, bi) => {
    const len = beatLength(beat);
    const lenN = toNumber(len);
    const { items, accColumns } = beat.rest ? { items: [], accColumns: 0 } : engraveNotes(track, beat, accState, clef);
    const digits = beat.rest ? 1 : Math.max(1, ...beat.notes.map((n) => digitsOf(n.fret) + (n.tie ? 2 : 0)));
    const rhythm = rhythmWidth(lenN, o);
    const staffW = accColumns * 7 + o.headWidth + beat.dots * 4 + 6 + (items.some((it) => it.dx) ? o.headWidth : 0);
    const tabW = digits * 6.5 + 6;
    const width = Math.max(rhythm, staffW, tabW);
    beats.push({
      bi, beat, onset, len, lenN, rhythm, width,
      rest: beat.rest, empty: beat.empty, duration: beat.duration, dots: beat.dots, tuplet: beat.tuplet,
      notes: items, accColumns,
      beams: beamCount(beat.duration),
      group: groupIndexAt(boundaries, onset),
      stemDir: beat.rest ? 0 : stemDirectionFor(items, drums),
      beamed: false, flags: 0,
    });
    onset = add(onset, len);
  });
  resolveBeams(beats, drums);
  const tuplets = resolveTuplets(beats);
  const status = measureStatus(song, track, mi);
  if (status === 'empty') { beats[0].wholeRest = true; beats[0].width = Math.max(beats[0].width, 40); }
  return { mi, timeSig, beats, tuplets, status, used: onset };
}

/** Beam runs: consecutive beamable, non-rest beats within one beam group. */
function resolveBeams(beats, drums) {
  const runs = [];
  let run = [];
  const flush = () => { if (run.length >= 2) runs.push(run); else if (run.length === 1) run[0].flags = run[0].beams; run = []; };
  for (const b of beats) {
    const beamable = !b.rest && b.beams > 0 && b.group >= 0;
    if (!beamable) { flush(); if (!b.rest && b.beams > 0) b.flags = b.beams; continue; }
    if (run.length && run[run.length - 1].group !== b.group) flush();
    run.push(b);
  }
  flush();
  for (const r of runs) {
    // One stem direction per run: the note farthest from the middle decides.
    let dir = 1;
    if (!drums) {
      let extreme = 4, found = false;
      for (const b of r) for (const it of b.notes) {
        if (!found || Math.abs(it.pos - 4) > Math.abs(extreme - 4)) { extreme = it.pos; found = true; }
      }
      dir = extreme > 4 ? -1 : 1;
    }
    for (const b of r) { b.stemDir = dir; b.beamed = true; b.flags = 0; }
    const smallest = Math.min(...r.map((b) => b.lenN));
    const breakUnit = smallest * 4; // secondary beams break at multiples of 4x the smallest value
    const start = r[0].onset;
    const segments = [];
    const maxLevel = Math.max(...r.map((b) => b.beams));
    for (let level = 1; level <= maxLevel; level++) {
      let segStart = null;
      for (let i = 0; i < r.length; i++) {
        const has = r[i].beams >= level;
        const next = r[i + 1];
        const rel = next ? toNumber(next.onset) - toNumber(start) : 0;
        const connectsNext = !!next && has && next.beams >= level && (level === 1 || !isMultiple(rel, breakUnit));
        if (has && segStart === null) segStart = i;
        if (segStart !== null && !connectsNext) {
          if (i > segStart) segments.push({ level, from: r[segStart].bi, to: r[i].bi, partial: null });
          else if (level > 1) {
            // Lone note at this level: beamlet toward the note sharing its subdivision.
            const relSelf = toNumber(r[i].onset) - toNumber(start);
            const sub = r[i].lenN * 2;
            let side = isMultiple(relSelf, sub) ? 'right' : 'left';
            if (side === 'right' && !next) side = 'left';
            if (side === 'left' && i === 0) side = 'right';
            segments.push({ level, from: r[i].bi, to: r[i].bi, partial: side });
          }
          segStart = null;
        }
      }
    }
    const run = { from: r[0].bi, to: r[r.length - 1].bi, dir, segments, beats: r.map((b) => b.bi) };
    for (const b of r) b.beamRun = run;
    beats.beamRuns ??= [];
    beats.beamRuns.push(run);
  }
}

function isMultiple(value, unit) {
  const q = value / unit;
  return Math.abs(q - Math.round(q)) < 1e-9;
}

/** Group consecutive beats with the same tuplet ratio until they fill the tuplet's nominal length. */
function resolveTuplets(beats) {
  const out = [];
  let cur = null;
  const close = () => { if (cur) out.push(cur); cur = null; };
  for (const b of beats) {
    const t = b.tuplet;
    if (!t) { close(); continue; }
    if (cur && (cur.n !== t.n || cur.in !== t.in)) close();
    if (!cur) {
      // Target: `in` plain notes of this beat's base duration.
      const target = mul(baseLength(b.duration), frac(t.in, 1));
      cur = { n: t.n, in: t.in, from: b.bi, to: b.bi, acc: ZERO, target, beats: [] };
    }
    cur.to = b.bi;
    cur.beats.push(b.bi);
    cur.acc = add(cur.acc, b.len);
    if (cmp(cur.acc, cur.target) >= 0) close();
  }
  close();
  for (const t of out) {
    const members = t.beats.map((bi) => beats[bi]);
    const run = members[0].beamRun ?? null;
    t.beamed = !!run && members.every((m) => m.beamRun === run) && members.every((m) => m.beamed);
    t.dir = members.some((m) => m.stemDir !== 0) ? (members.find((m) => m.stemDir !== 0).stemDir) : 1;
    delete t.acc; delete t.target;
  }
  return out;
}

function headerWidth(showTimeSig, o) {
  return o.clefWidth + (showTimeSig ? o.timeSigWidth : 0) + 4;
}
const REPEAT_PAD = 10;

/**
 * Main entry: lay out `song.tracks[trackIndex]` into systems for a given container width.
 */
export function layoutTrack(song, trackIndex, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const track = song.tracks[trackIndex];
  const clef = INSTRUMENTS[track.instrument].clef;
  const drums = isDrums(track);
  const strings = stringCount(track);
  const ss = o.staffSpace;

  // 1. Per-measure content.
  const measures = song.measureHeaders.map((h, mi) => {
    const m = layoutMeasure(song, track, mi, o, clef);
    m.showTimeSig = mi === 0 || !timeSigEq(h.timeSig, song.measureHeaders[mi - 1].timeSig);
    m.repeatOpen = !!h.repeatOpen;
    m.repeatClose = h.repeatClose ? (h.repeatClose.times ?? 1) : 0;
    m.marker = h.marker || null;
    m.beatsWidth = m.beats.reduce((s, b) => s + b.width, 0);
    m.natural = o.measureLead + m.beatsWidth + o.measureTail + (m.repeatOpen ? REPEAT_PAD : 0) + (m.repeatClose ? REPEAT_PAD : 0);
    return m;
  });

  // 2. Greedy system fill.
  const available = o.width - 2 * o.marginX;
  const systems = [];
  let cur = null;
  for (const m of measures) {
    const asFirst = headerWidth(m.showTimeSig, o) + m.natural;
    if (!cur) { cur = { measures: [m], used: asFirst }; continue; }
    if (cur.used + m.natural <= available) { cur.measures.push(m); cur.used += m.natural; }
    else { systems.push(cur); cur = { measures: [m], used: asFirst }; }
  }
  if (cur) systems.push(cur);

  // 3. Horizontal placement with justification.
  const beatMap = new Map();
  systems.forEach((sys, si) => {
    const isLast = si === systems.length - 1;
    const extra = available - sys.used;
    const rhythmSum = sys.measures.reduce((s, m) => s + m.beats.reduce((a, b) => a + b.rhythm, 0), 0);
    let stretch = 0; // extra px per unit of rhythm width
    const fill = sys.used / available;
    if (extra > 0 && rhythmSum > 0 && (!isLast || fill >= o.lastSystemFill)) {
      stretch = Math.min(extra / rhythmSum, o.stretchCap - 1);
    }
    let x = o.marginX;
    sys.x = x;
    sys.measures.forEach((m, k) => {
      m.x = x;
      m.first = k === 0;
      m.headerWidth = k === 0 ? headerWidth(m.showTimeSig, o) : 0;
      let bx = x + m.headerWidth + o.measureLead + (m.repeatOpen ? REPEAT_PAD : 0);
      for (const b of m.beats) {
        const w = b.width + b.rhythm * stretch;
        b.x = bx + w / 2;
        b.w = w;
        bx += w;
      }
      m.width = (bx - x) + o.measureTail + (m.repeatClose ? REPEAT_PAD : 0);
      x += m.width;
    });
    sys.width = x - o.marginX;
    sys.right = x;
  });

  // 4. Vertical placement.
  let y = 0;
  for (const sys of systems) {
    let maxPos = 8, minPos = 0;
    for (const m of sys.measures) for (const b of m.beats) for (const it of b.notes) {
      if (it.pos > maxPos) maxPos = it.pos;
      if (it.pos < minPos) minPos = it.pos;
    }
    const above = ss * Math.max(3.5, Math.ceil((maxPos - 8) / 2) + 2.5);
    const below = ss * Math.max(5, Math.ceil(-minPos / 2) + 2.5);
    sys.top = y;
    sys.staffTop = y + above;
    sys.staffBottom = sys.staffTop + 4 * ss;
    sys.middleY = sys.staffTop + 2 * ss;
    sys.tabTop = sys.staffBottom + below;
    sys.tabBottom = sys.tabTop + (strings - 1) * o.tabSpace;
    sys.height = above + 4 * ss + below + (strings - 1) * o.tabSpace + 3 * ss;
    y += sys.height;
    engraveSystem(sys, o, drums);
    for (const m of sys.measures) for (const b of m.beats) beatMap.set(`${m.mi}:${b.bi}`, { system: sys, measure: m, beat: b });
  }

  return {
    width: o.width, height: y, track, trackIndex, clef, drums, strings, staffSpace: ss, tabSpace: o.tabSpace,
    headWidth: o.headWidth, systems, beatMap, measures,
  };
}

/** Absolute y for a staff position (half-spaces above the bottom line). */
export const posY = (sys, pos, ss) => sys.staffBottom - (pos * ss) / 2;

/** Resolve absolute note/stem/beam coordinates once system vertical placement is known. */
function engraveSystem(sys, o, drums) {
  const ss = o.staffSpace;
  const stemLen = 3.5 * ss;
  for (const m of sys.measures) {
    for (const b of m.beats) {
      if (b.rest) { b.restY = sys.middleY; continue; }
      for (const it of b.notes) it.y = posY(sys, it.pos, ss);
      // Chord seconds: displace the upper note of an adjacent pair to the other side of the stem.
      for (let i = 1; i < b.notes.length; i++) {
        const prev = b.notes[i - 1], it = b.notes[i];
        if (it.pos - prev.pos === 1 && !prev.dx) it.dx = b.stemDir >= 0 ? o.headWidth - 1 : -(o.headWidth - 1);
      }
      if (b.duration === 'w' && !drums) { b.stemDir = 0; continue; }
      const ys = b.notes.map((n) => n.y);
      const top = Math.min(...ys), bottom = Math.max(...ys);
      if (b.stemDir > 0) {
        b.stemX = b.x + o.headWidth / 2 - 0.6;
        b.stemBase = bottom;
        b.stemEnd = Math.min(top - stemLen, top < sys.staffTop ? sys.middleY : Infinity);
      } else {
        b.stemX = b.x - o.headWidth / 2 + 0.6;
        b.stemBase = top;
        b.stemEnd = Math.max(bottom + stemLen, bottom > sys.staffBottom ? sys.middleY : -Infinity);
      }
    }
    // Beam runs: a common horizontal beam at the farthest stem end; stems extend to it.
    for (const run of m.beats.beamRuns ?? []) {
      const members = run.beats.map((bi) => m.beats[bi]);
      run.y = run.dir > 0 ? Math.min(...members.map((b) => b.stemEnd)) : Math.max(...members.map((b) => b.stemEnd));
      for (const b of members) b.stemEnd = run.y;
      run.x1 = members[0].stemX;
      run.x2 = members[members.length - 1].stemX;
    }
    m.beamRuns = m.beats.beamRuns ?? [];
  }
}

/** Find the beat closest to an (x, y) point; returns { mi, bi, string } or null. */
export function hitTest(layout, x, y) {
  const sys = layout.systems.find((s) => y >= s.top && y < s.top + s.height) ?? layout.systems[layout.systems.length - 1];
  if (!sys) return null;
  let best = null, bestD = Infinity;
  for (const m of sys.measures) for (const b of m.beats) {
    const d = Math.abs(b.x - x);
    if (d < bestD) { bestD = d; best = { mi: m.mi, bi: b.bi }; }
  }
  if (!best) return null;
  const rel = (y - sys.tabTop) / layout.tabSpace;
  best.string = Math.max(0, Math.min(layout.strings - 1, Math.round(rel)));
  return best;
}

export { eq };
