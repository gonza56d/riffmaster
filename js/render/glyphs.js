// Hand-authored SVG glyphs. Paths are drawn for a staff space of 8px (staff from y=0 top line to y=32 bottom line)
// and scaled by the renderer when the staff space differs.

export const CLEF_PATHS = {
  // Stroked G clef. Origin: x=0 at the left of the glyph, y=0 at the top staff line.
  treble: 'M 7.5 39.5 C 7.5 42.5 12 42.5 12 39.5 C 12 37.5 10 36.5 9 37.5 M 9.5 38.5 C 12 36 13.5 32 13 27 L 11.5 2 C 11 -3 13 -9 15.5 -11.5 C 17.5 -9 17 -4 14.5 0 C 10 6 2.5 12 3 20 C 3.5 27 10 31 15 30 C 20 29 21 22 17 19 C 13 16 7 18 7 23 C 7 26.5 10 28 12.5 27',
  // Stroked F clef body; the renderer adds the head dot and the two dots.
  bass: 'M 3 30 C 9 27.5 14.5 21 14.5 12.5 C 14.5 6.5 11 3 7 3 C 4 3 1.6 5.4 1.6 8.2 C 1.6 10.4 3.2 12 5.2 12 C 7.2 12 8.6 10.4 8.6 8.6',
};

/** Up-stem flag, origin at the stem end; mirrored vertically for down stems. */
export const FLAG_PATH = 'M 0 0 C 0.5 5 6.8 7.5 6.8 15 C 6.8 10.5 4 8.5 0 7.5 Z';

/** Quarter rest, origin at the middle staff line. */
export const QUARTER_REST_PATH = 'M -2.4 -11.5 C 0.8 -8 3.6 -4.6 -1.4 -1.4 C 2.2 1.8 3.8 4.8 1.6 8.2 C -1 5.2 -4 4.6 -2.4 9.6 C -5.6 6.2 -4.2 1.8 -0.4 1.2 C -4 -1.8 -4.6 -5.4 -2.4 -11.5 Z';

export function svgEl(tag, attrs, children = '') {
  let s = `<${tag}`;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) s += ` ${k}="${v}"`;
  return children === null ? `${s}/>` : `${s}>${children}</${tag}>`;
}

export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const f = (n) => (Math.round(n * 100) / 100).toString();

export function notehead(x, y, { head = 'normal', hollow = false, whole = false } = {}) {
  switch (head) {
    case 'x':
      return svgEl('path', { d: `M ${f(x - 4)} ${f(y - 4)} L ${f(x + 4)} ${f(y + 4)} M ${f(x - 4)} ${f(y + 4)} L ${f(x + 4)} ${f(y - 4)}`, class: 'ink-stroke', 'stroke-width': 1.7 }, null);
    case 'circledX':
      return svgEl('path', { d: `M ${f(x - 4)} ${f(y - 4)} L ${f(x + 4)} ${f(y + 4)} M ${f(x - 4)} ${f(y + 4)} L ${f(x + 4)} ${f(y - 4)}`, class: 'ink-stroke', 'stroke-width': 1.7 }, null)
        + svgEl('circle', { cx: f(x), cy: f(y), r: 5.6, class: 'ink-stroke', fill: 'none', 'stroke-width': 1.2 }, null);
    case 'diamond':
      return svgEl('path', { d: `M ${f(x)} ${f(y - 4.6)} L ${f(x + 5.2)} ${f(y)} L ${f(x)} ${f(y + 4.6)} L ${f(x - 5.2)} ${f(y)} Z`, class: hollow ? 'ink-stroke' : 'ink', fill: hollow ? 'none' : undefined, 'stroke-width': hollow ? 1.5 : undefined }, null);
    default:
      if (whole) return svgEl('ellipse', { cx: f(x), cy: f(y), rx: 5.9, ry: 3.7, class: 'ink-stroke', fill: 'none', 'stroke-width': 2.4 }, null);
      if (hollow) return svgEl('ellipse', { cx: f(x), cy: f(y), rx: 5.2, ry: 3.6, transform: `rotate(-20 ${f(x)} ${f(y)})`, class: 'ink-stroke', fill: 'none', 'stroke-width': 1.9 }, null);
      return svgEl('ellipse', { cx: f(x), cy: f(y), rx: 5.3, ry: 3.7, transform: `rotate(-20 ${f(x)} ${f(y)})`, class: 'ink' }, null);
  }
}

export function sharp(x, y) {
  return svgEl('g', { class: 'ink-stroke', 'stroke-width': 1.1 },
    `<line x1="${f(x - 1.7)}" y1="${f(y - 6)}" x2="${f(x - 1.7)}" y2="${f(y + 6.5)}"/>` +
    `<line x1="${f(x + 1.7)}" y1="${f(y - 6.8)}" x2="${f(x + 1.7)}" y2="${f(y + 5.7)}"/>` +
    `<line x1="${f(x - 4.2)}" y1="${f(y - 1.2)}" x2="${f(x + 4.2)}" y2="${f(y - 3.2)}" stroke-width="2.3"/>` +
    `<line x1="${f(x - 4.2)}" y1="${f(y + 3.4)}" x2="${f(x + 4.2)}" y2="${f(y + 1.4)}" stroke-width="2.3"/>`);
}

export function natural(x, y) {
  return svgEl('g', { class: 'ink-stroke', 'stroke-width': 1.1 },
    `<line x1="${f(x - 1.9)}" y1="${f(y - 7)}" x2="${f(x - 1.9)}" y2="${f(y + 3)}"/>` +
    `<line x1="${f(x + 1.9)}" y1="${f(y - 3)}" x2="${f(x + 1.9)}" y2="${f(y + 7)}"/>` +
    `<line x1="${f(x - 1.9)}" y1="${f(y - 2.2)}" x2="${f(x + 1.9)}" y2="${f(y - 3.6)}" stroke-width="2.3"/>` +
    `<line x1="${f(x - 1.9)}" y1="${f(y + 3.4)}" x2="${f(x + 1.9)}" y2="${f(y + 2)}" stroke-width="2.3"/>`);
}

export function flags(x, y, count, dir, ss = 8) {
  const k = ss / 8;
  let out = '';
  for (let i = 0; i < count; i++) {
    const oy = y + dir * -1 * i * 6 * k; // stack toward the notehead
    const t = `translate(${f(x)} ${f(oy)}) scale(${f(k)} ${f(dir > 0 ? k : -k)})`;
    out += svgEl('path', { d: FLAG_PATH, class: 'ink', transform: t }, null);
  }
  return out;
}

/** Rest glyph for a duration, centered horizontally at x. `middleY` is the middle staff line. */
export function rest(x, middleY, duration, ss = 8) {
  const k = ss / 8;
  switch (duration) {
    case 'w':
      return svgEl('rect', { x: f(x - 5.5 * k), y: f(middleY - ss), width: f(11 * k), height: f(ss / 2), class: 'ink' }, null);
    case 'h':
      return svgEl('rect', { x: f(x - 5.5 * k), y: f(middleY - ss / 2), width: f(11 * k), height: f(ss / 2), class: 'ink' }, null);
    case 'q':
      return svgEl('path', { d: QUARTER_REST_PATH, class: 'ink', transform: `translate(${f(x)} ${f(middleY)}) scale(${f(k)})` }, null);
    default: {
      const n = { e: 1, s: 2, t: 3, x: 4 }[duration] ?? 1;
      const topY = -6 - (n > 2 ? (n - 2) * 3 : 0);
      const bottomY = 10 + (n - 1) * 4.5;
      const sx = (yy) => 3 - (5 * (yy + 6)) / 16;
      let d = `M ${f(sx(topY))} ${f(topY)} L ${f(sx(bottomY))} ${f(bottomY)}`;
      let dots = '';
      for (let i = 0; i < n; i++) {
        const py = topY + i * 6, px = sx(py);
        d += ` M ${f(px)} ${f(py)} C ${f(px - 1)} ${f(py + 3.2)} ${f(px - 4.6)} ${f(py + 3.4)} ${f(px - 5.6)} ${f(py + 1.2)}`;
        dots += svgEl('circle', { cx: f(px - 5.4), cy: f(py + 1.1), r: 1.8, class: 'ink' }, null);
      }
      return svgEl('g', { transform: `translate(${f(x)} ${f(middleY)}) scale(${f(k)})` },
        svgEl('path', { d, class: 'ink-stroke', fill: 'none', 'stroke-width': 1.5 }, null) + dots);
    }
  }
}

export function clef(kind, x, staffTop, ss = 8) {
  const k = ss / 8;
  const t = `translate(${f(x)} ${f(staffTop)}) scale(${f(k)})`;
  if (kind === 'treble') {
    return svgEl('path', { d: CLEF_PATHS.treble, class: 'ink-stroke', fill: 'none', 'stroke-width': 2.3, 'stroke-linecap': 'round', transform: t }, null);
  }
  if (kind === 'bass') {
    return svgEl('g', { transform: t },
      svgEl('path', { d: CLEF_PATHS.bass, class: 'ink-stroke', fill: 'none', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, null) +
      svgEl('circle', { cx: 5.2, cy: 8.2, r: 2.7, class: 'ink' }, null) +
      svgEl('circle', { cx: 19, cy: 4.5, r: 1.7, class: 'ink' }, null) +
      svgEl('circle', { cx: 19, cy: 11.5, r: 1.7, class: 'ink' }, null));
  }
  // percussion: two thick bars across the middle two spaces
  return svgEl('g', { transform: t },
    svgEl('rect', { x: 6, y: 8, width: 3.2, height: 16, class: 'ink' }, null) +
    svgEl('rect', { x: 12, y: 8, width: 3.2, height: 16, class: 'ink' }, null));
}

export { f };
