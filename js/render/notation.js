// Standard-notation drawing for one system. Produces SVG markup strings from layout data.
import { svgEl, notehead, sharp, natural, flags, rest, clef, f, esc } from './glyphs.js';
import { posY } from './layout.js';

const BEAM_THICK = 0.5; // staff spaces
const BEAM_GAP = 0.75;

export function drawStaff(sys, layout) {
  const ss = layout.staffSpace;
  let out = '';
  for (let i = 0; i < 5; i++) {
    const y = sys.staffTop + i * ss;
    out += `<line x1="${f(sys.x)}" y1="${f(y)}" x2="${f(sys.right)}" y2="${f(y)}" class="staff-line"/>`;
  }
  return out;
}

export function drawClef(sys, layout) {
  return clef(layout.clef, sys.x + 3, sys.staffTop, layout.staffSpace);
}

export function drawTimeSig(x, topY, bottomY, timeSig, ss) {
  const size = 2.15 * ss;
  const mid = (topY + bottomY) / 2;
  return svgEl('text', { x: f(x), y: f(mid - 1), class: 'timesig', 'font-size': f(size), 'text-anchor': 'middle' }, timeSig.num) +
    svgEl('text', { x: f(x), y: f(bottomY - 1), class: 'timesig', 'font-size': f(size), 'text-anchor': 'middle' }, timeSig.den);
}

function ledgerLines(sys, b, layout) {
  const ss = layout.staffSpace;
  let out = '';
  const xs = new Set();
  for (const it of b.notes) xs.add(it.dx || 0);
  const positions = new Set();
  for (const it of b.notes) {
    if (it.pos >= 10) for (let p = 10; p <= it.pos; p += 2) positions.add(p);
    if (it.pos <= -2) for (let p = -2; p >= it.pos; p -= 2) positions.add(p);
  }
  for (const p of positions) {
    const y = posY(sys, p, ss);
    const hasDx = b.notes.some((it) => it.pos === p && it.dx) || b.notes.some((it) => it.dx && ((p >= 10 && it.pos >= p) || (p <= -2 && it.pos <= p)));
    const x1 = b.x - layout.headWidth / 2 - 3 + (hasDx && b.stemDir < 0 ? Math.min(0, ...b.notes.map((it) => it.dx)) : 0);
    const x2 = b.x + layout.headWidth / 2 + 3 + (hasDx && b.stemDir > 0 ? Math.max(0, ...b.notes.map((it) => it.dx)) : 0);
    out += `<line x1="${f(x1)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y)}" class="ink-stroke" stroke-width="1.1"/>`;
  }
  return out;
}

function dotsFor(b, x, y, pos, ss, count) {
  let out = '';
  const dy = pos % 2 === 0 ? -ss / 2 : 0;
  for (let i = 0; i < count; i++) {
    out += svgEl('circle', { cx: f(x + i * 4.5), cy: f(y + dy), r: 1.7, class: 'ink' }, null);
  }
  return out;
}

export function drawBeat(sys, b, layout) {
  const ss = layout.staffSpace;
  const hw = layout.headWidth;
  let out = '';
  if (b.rest) {
    if (b.wholeRest) return rest(b.x, b.restY, 'w', ss);
    out += rest(b.x, b.restY, b.duration, ss);
    if (b.dots) out += dotsFor(b, b.x + hw / 2 + 3, b.restY, 1, ss, b.dots);
    return out;
  }
  out += ledgerLines(sys, b, layout);
  const hollow = b.duration === 'h';
  const whole = b.duration === 'w';
  for (const it of b.notes) {
    const x = b.x + (it.dx || 0);
    out += notehead(x, it.y, { head: it.head, hollow: hollow || whole, whole: whole && it.head === 'normal' });
    if (it.accidental) {
      const ax = b.x - hw / 2 - 5 - it.accCol * 7 + Math.min(0, it.dx || 0);
      out += it.accidental === '#' ? sharp(ax, it.y) : natural(ax, it.y);
    }
    if (b.dots) out += dotsFor(b, b.x + hw / 2 + 4 + Math.max(0, it.dx || 0), it.y, it.pos, ss, b.dots);
  }
  if (b.stemDir !== 0 && b.stemX !== undefined) {
    out += `<line x1="${f(b.stemX)}" y1="${f(b.stemBase)}" x2="${f(b.stemX)}" y2="${f(b.stemEnd)}" class="ink-stroke" stroke-width="1.3"/>`;
    if (b.flags > 0) out += flags(b.stemX + (b.stemDir > 0 ? -0.6 : 0.6), b.stemEnd, b.flags, b.stemDir, ss);
  }
  return out;
}

export function drawBeams(sys, m, layout) {
  const ss = layout.staffSpace;
  const thick = BEAM_THICK * ss;
  const gap = BEAM_GAP * ss;
  let out = '';
  for (const run of m.beamRuns) {
    for (const seg of run.segments) {
      const from = m.beats[seg.from], to = m.beats[seg.to];
      // Beams stack toward the noteheads from the stem end.
      const offset = (seg.level - 1) * (thick + gap) * (run.dir > 0 ? 1 : -1);
      const yTop = run.dir > 0 ? run.y + offset : run.y + offset - thick;
      let x1 = from.stemX, x2 = to.stemX;
      if (seg.partial === 'right') x2 = x1 + ss * 1.3;
      else if (seg.partial === 'left') x1 = x2 - ss * 1.3;
      const half = 0.65;
      out += svgEl('rect', { x: f(x1 - half), y: f(yTop), width: f(x2 - x1 + 2 * half), height: f(thick), class: 'ink' }, null);
    }
  }
  return out;
}

export function drawTuplets(sys, m, layout) {
  const ss = layout.staffSpace;
  let out = '';
  for (const t of m.tuplets) {
    const beats = t.beats.map((bi) => m.beats[bi]);
    const first = beats[0], last = beats[beats.length - 1];
    const x1 = first.x - 5, x2 = last.x + 5;
    const xm = (x1 + x2) / 2;
    const up = t.dir >= 0;
    let yRef;
    if (t.beamed) {
      const run = first.beamRun;
      yRef = up ? run.y - 4 : run.y + 4;
    } else {
      const ends = beats.map((b) => (b.rest ? b.restY : b.stemDir === 0 ? (up ? Math.min(...b.notes.map((n) => n.y)) : Math.max(...b.notes.map((n) => n.y))) : b.stemEnd));
      yRef = up ? Math.min(...ends) - 6 : Math.max(...ends) + 6;
      const hook = up ? 4 : -4;
      out += `<path d="M ${f(x1)} ${f(yRef + hook)} L ${f(x1)} ${f(yRef)} L ${f(xm - 7)} ${f(yRef)} M ${f(xm + 7)} ${f(yRef)} L ${f(x2)} ${f(yRef)} L ${f(x2)} ${f(yRef + hook)}" class="ink-stroke" fill="none" stroke-width="1.1"/>`;
    }
    const ty = up ? yRef - 2 : yRef + 9;
    out += svgEl('text', { x: f(xm), y: f(ty), class: 'tuplet', 'text-anchor': 'middle', 'font-size': f(ss * 1.25) }, t.n);
  }
  return out;
}

/** Ties into notes whose `tie` flag is set, drawn from the previous beat holding the same string. */
export function drawTies(sys, m, layout, prevLookup) {
  const ss = layout.staffSpace;
  let out = '';
  for (const b of m.beats) {
    if (b.rest) continue;
    for (const it of b.notes) {
      if (!it.note.tie) continue;
      const prev = prevLookup(m.mi, b.bi, it.note.string);
      const x2 = b.x + (it.dx || 0);
      const x1 = prev && prev.system === sys ? prev.x : sys.x + layout.headWidth * 2.5;
      const bow = b.stemDir > 0 ? ss * 0.9 : -ss * 0.9; // bow away from the stem
      const y = it.y + (b.stemDir > 0 ? 3 : -3);
      out += `<path d="M ${f(x1 + 4)} ${f(y)} Q ${f((x1 + x2) / 2)} ${f(y + bow)} ${f(x2 - 4)} ${f(y)}" class="ink-stroke" fill="none" stroke-width="1.4"/>`;
    }
  }
  return out;
}

export function drawMeasureNumber(sys, m) {
  return svgEl('text', { x: f(m.x + 2), y: f(sys.staffTop - 6), class: `measure-number${m.status === 'incomplete' || m.status === 'overfull' ? ' warn' : ''}`, 'font-size': 9 }, m.mi + 1);
}

export { esc };
