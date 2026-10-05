// Assembles the full SVG for one track from the layout, plus cursor/playhead overlay markup.
import { svgEl, f, esc } from './glyphs.js';
import { drawStaff, drawClef, drawTimeSig, drawBeat, drawBeams, drawTuplets, drawTies, drawMeasureNumber } from './notation.js';
import { drawTabLines, drawTabClef, drawTabBeat } from './tab.js';

function barline(x, sys, { thick = false } = {}) {
  const w = thick ? 3 : 1;
  return `<line x1="${f(x)}" y1="${f(sys.staffTop)}" x2="${f(x)}" y2="${f(sys.staffBottom)}" class="barline" stroke-width="${w}"/>` +
    `<line x1="${f(x)}" y1="${f(sys.tabTop)}" x2="${f(x)}" y2="${f(sys.tabBottom)}" class="barline" stroke-width="${w}"/>`;
}

/** Repeat sign: thick + thin line with two dots on both staves. `dir` 1 = opening (dots to the right), -1 = closing. */
function repeatSign(x, sys, dir, layout) {
  const ss = layout.staffSpace;
  const thickX = x, thinX = x + dir * 4, dotX = x + dir * 8;
  let out = barline(thickX, sys, { thick: true }) + barline(thinX, sys);
  const mid = sys.staffTop + 2 * ss;
  out += `<circle cx="${f(dotX)}" cy="${f(mid - ss / 2)}" r="1.8" class="ink"/><circle cx="${f(dotX)}" cy="${f(mid + ss / 2)}" r="1.8" class="ink"/>`;
  const tmid = (sys.tabTop + sys.tabBottom) / 2;
  out += `<circle cx="${f(dotX)}" cy="${f(tmid - layout.tabSpace / 2)}" r="1.8" class="ink"/><circle cx="${f(dotX)}" cy="${f(tmid + layout.tabSpace / 2)}" r="1.8" class="ink"/>`;
  return out;
}

/** Finds the previous beat (searching backwards across measures) holding a note on `string`. */
function makePrevLookup(layout) {
  return (mi, bi, string) => {
    let m = mi, b = bi - 1;
    while (m >= 0) {
      const measure = layout.measures[m];
      while (b >= 0) {
        const beat = measure.beats[b];
        const it = beat.notes.find((n) => n.note.string === string);
        if (it) {
          const entry = layout.beatMap.get(`${m}:${b}`);
          return { system: entry.system, x: beat.x + (it.dx || 0), y: it.y };
        }
        b--;
      }
      m--;
      if (m >= 0) b = layout.measures[m].beats.length - 1;
    }
    return null;
  };
}

export function renderScoreSVG(layout, { lastMeasureIndex = layout.measures.length - 1 } = {}) {
  const prevLookup = makePrevLookup(layout);
  let body = '';
  for (const sys of layout.systems) {
    body += drawStaff(sys, layout) + drawTabLines(sys, layout) + drawClef(sys, layout) + drawTabClef(sys, layout);
    for (const m of sys.measures) {
      if (m.status === 'incomplete' || m.status === 'overfull') {
        body += svgEl('rect', { x: f(m.x), y: f(sys.staffTop - 2), width: f(m.width), height: f(sys.tabBottom - sys.staffTop + 4), class: 'measure-warn' }, null);
      }
      if (m.repeatOpen) body += repeatSign(m.x + m.headerWidth + 1, sys, 1, layout);
      body += barline(m.x, sys);
      if (m.marker) body += svgEl('text', { x: f(m.x + m.headerWidth + 2), y: f(sys.staffTop - 18), class: 'marker' }, esc(m.marker));
      if (m.showTimeSig) {
        const tx = m.x + (m.first ? layout.staffSpace * 3.6 + 8 : 0) + layout.staffSpace * 1.3 + 2;
        body += drawTimeSig(tx, sys.staffTop, sys.staffBottom, m.timeSig, layout.staffSpace);
        body += drawTimeSig(tx, sys.tabTop, sys.tabBottom, m.timeSig, Math.min(layout.staffSpace, (sys.tabBottom - sys.tabTop) / 4));
      }
      body += drawMeasureNumber(sys, m);
      for (const b of m.beats) body += drawBeat(sys, b, layout) + drawTabBeat(sys, b, layout);
      body += drawBeams(sys, m, layout) + drawTuplets(sys, m, layout) + drawTies(sys, m, layout, prevLookup);
    }
    for (const m of sys.measures) {
      if (!m.repeatClose) continue;
      const rx = m.x + m.width - 1;
      body += repeatSign(rx, sys, -1, layout);
      if (m.repeatClose > 1) body += svgEl('text', { x: f(rx - 2), y: f(sys.staffTop - 6), class: 'measure-number', 'text-anchor': 'end', 'font-size': 9 }, `x${m.repeatClose + 1}`);
    }
    const lastM = sys.measures[sys.measures.length - 1];
    if (!lastM.repeatClose) body += barline(sys.right, sys, { thick: lastM.mi === lastMeasureIndex });
  }
  return svgEl('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width: f(layout.width), height: f(layout.height),
    viewBox: `0 0 ${f(layout.width)} ${f(layout.height)}`, class: 'score-svg',
  }, `<g class="score-body">${body}</g><g class="playhead-layer"></g><g class="cursor-layer"></g>`);
}

/** Markup for the cursor overlay: a beat column on the tab plus the active string cell. */
export function cursorMarkup(layout, cursor) {
  const entry = layout.beatMap.get(`${cursor.measure}:${cursor.beat}`);
  if (!entry) return '';
  const { system: sys, beat: b } = entry;
  const w = Math.max(16, Math.min(b.w, 30));
  const y = sys.tabTop + cursor.string * layout.tabSpace;
  return svgEl('rect', { x: f(b.x - w / 2), y: f(sys.staffTop - 6), width: f(w), height: f(sys.tabBottom - sys.staffTop + 12), rx: 3, class: 'cursor-column' }, null) +
    svgEl('rect', { x: f(b.x - 9), y: f(y - layout.tabSpace / 2 + 0.5), width: 18, height: f(layout.tabSpace - 1), rx: 2, class: 'cursor-cell' }, null);
}

/** Shading behind a selected range of beats ({ from, to }): one band per system it touches. */
export function selectionMarkup(layout, range) {
  let out = '';
  for (const sys of layout.systems) {
    const beats = [];
    for (const m of sys.measures) {
      if (m.mi < range.from.measure || m.mi > range.to.measure) continue;
      for (const b of m.beats) {
        if (m.mi === range.from.measure && b.bi < range.from.beat) continue;
        if (m.mi === range.to.measure && b.bi > range.to.beat) continue;
        beats.push(b);
      }
    }
    if (!beats.length) continue;
    const first = beats[0], last = beats[beats.length - 1];
    const x1 = first.x - first.w / 2, x2 = last.x + last.w / 2;
    out += svgEl('rect', { x: f(x1), y: f(sys.staffTop - 6), width: f(x2 - x1), height: f(sys.tabBottom - sys.staffTop + 12), rx: 3, class: 'selection' }, null);
  }
  return out;
}

export function playheadMarkup(layout, mi, bi) {
  const entry = layout.beatMap.get(`${mi}:${bi}`);
  if (!entry) return '';
  const { system: sys, beat: b } = entry;
  const w = Math.max(14, Math.min(b.w, 28));
  return svgEl('rect', { x: f(b.x - w / 2), y: f(sys.staffTop - 8), width: f(w), height: f(sys.tabBottom - sys.staffTop + 16), rx: 3, class: 'playhead' }, null);
}

/** Bounding box of a beat for autoscroll. */
export function beatBox(layout, mi, bi) {
  const entry = layout.beatMap.get(`${mi}:${bi}`);
  if (!entry) return null;
  const { system: sys, beat: b } = entry;
  return { x: b.x, top: sys.top, bottom: sys.top + sys.height };
}
