import { svgEl, f, esc } from './glyphs.js';
import { isDrums } from '../model/song.js';

export function drawTabLines(sys, layout) {
  let out = '';
  for (let i = 0; i < layout.strings; i++) {
    const y = sys.tabTop + i * layout.tabSpace;
    out += `<line x1="${f(sys.x)}" y1="${f(y)}" x2="${f(sys.right)}" y2="${f(y)}" class="tab-line"/>`;
  }
  return out;
}

export function drawTabClef(sys, layout) {
  const h = sys.tabBottom - sys.tabTop;
  const size = Math.min(14, Math.max(9, h / 3.2));
  const x = sys.x + 11;
  const cy = (sys.tabTop + sys.tabBottom) / 2;
  return ['T', 'A', 'B'].map((ch, i) => svgEl('text', {
    x: f(x), y: f(cy + (i - 1) * size * 1.05), class: 'tab-clef', 'font-size': f(size), 'text-anchor': 'middle', 'dominant-baseline': 'central',
  }, ch)).join('');
}

export function drawTabBeat(sys, b, layout) {
  if (b.rest) return '';
  let out = '';
  const drums = isDrums(layout.track);
  for (const it of b.notes) {
    const n = it.note;
    const y = sys.tabTop + n.string * layout.tabSpace;
    let label = n.effects?.dead ? 'X' : String(n.fret);
    if (n.tie) label = `(${label})`;
    out += svgEl('text', {
      x: f(b.x), y: f(y), class: `fret${drums ? ' drum' : ''}`, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    }, esc(label));
    if (n.effects) out += drawEffects(sys, b, n, y, layout);
  }
  return out;
}

function drawEffects(sys, b, n, y, layout) {
  let out = '';
  const e = n.effects;
  const w = Math.max(10, Math.min(b.w - 4, 26));
  if (e.vibrato) {
    // small wave above the number
    let d = `M ${f(b.x - w / 2)} ${f(y - 8)}`;
    const seg = 4;
    for (let x = -w / 2; x < w / 2; x += seg) d += ` q ${f(seg / 2)} -3 ${f(seg)} 0`;
    out += `<path d="${d}" class="ink-stroke" fill="none" stroke-width="1.1"/>`;
  }
  if (e.palmMute) out += svgEl('text', { x: f(b.x), y: f(sys.tabTop - 4), class: 'effect-label', 'text-anchor': 'middle' }, 'P.M.');
  if (e.hammer) out += svgEl('text', { x: f(b.x + b.w / 2), y: f(y - 7), class: 'effect-label', 'text-anchor': 'middle' }, 'H');
  if (e.slide) out += `<line x1="${f(b.x + 7)}" y1="${f(y + 4)}" x2="${f(b.x + b.w / 2 + 3)}" y2="${f(y - 4)}" class="ink-stroke" stroke-width="1.2"/>`;
  return out;
}
