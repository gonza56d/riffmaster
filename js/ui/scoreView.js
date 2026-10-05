// Owns the score container: renders the current track, positions overlays, maps clicks to the cursor.
import { layoutTrack, hitTest } from '../render/layout.js';
import { renderScoreSVG, cursorMarkup, selectionMarkup, playheadMarkup, beatBox } from '../render/score.js';
import { INSTRUMENTS } from '../model/song.js';
import { esc } from '../render/glyphs.js';

const EMPTY_STATE = `
  <div class="empty-state">
    <p>Start by adding an instrument</p>
    <div class="actions">${Object.entries(INSTRUMENTS).map(([k, v]) => `<button data-instrument="${k}">${esc(v.name)}</button>`).join('')}</div>
  </div>`;

export class ScoreView {
  constructor(wrap, inner, { onClick, onAddTrack }) {
    this.wrap = wrap;
    this.inner = inner;
    this.onClick = onClick;
    this.layout = null;
    this.song = null;
    this.trackIndex = 0;
    this.cursor = null;
    this.selection = null;
    this.playhead = null;
    inner.addEventListener('mousedown', (ev) => this.handleMouseDown(ev));
    inner.addEventListener('click', (ev) => { const btn = ev.target.closest('[data-instrument]'); if (btn) onAddTrack(btn.dataset.instrument); });
    this.resize = new ResizeObserver(() => { if (this.song) this.render(this.song, this.trackIndex, this.cursor, this.selection); });
    this.resize.observe(wrap);
  }

  width() {
    return Math.max(420, this.wrap.clientWidth - 16);
  }

  render(song, trackIndex, cursor, selection = null) {
    this.song = song;
    this.trackIndex = trackIndex;
    this.cursor = cursor;
    this.selection = selection;
    const width = this.width();
    if (!song.tracks.length) { this.inner.innerHTML = EMPTY_STATE; this.layout = null; this.svg = this.cursorLayer = this.playheadLayer = null; return; }
    this.layout = layoutTrack(song, trackIndex, { width });
    this.inner.innerHTML = renderScoreSVG(this.layout);
    this.svg = this.inner.querySelector('svg');
    this.cursorLayer = this.svg.querySelector('.cursor-layer');
    this.playheadLayer = this.svg.querySelector('.playhead-layer');
    this.setCursor(cursor);
    if (this.playhead) this.setPlayhead(this.playhead.mi, this.playhead.bi, false);
  }

  setCursor(cursor, { scroll = true, selection = this.selection } = {}) {
    this.cursor = cursor;
    this.selection = selection;
    if (!this.layout || !this.cursorLayer) return;
    this.cursorLayer.innerHTML = (selection ? selectionMarkup(this.layout, selection) : '') + (cursor ? cursorMarkup(this.layout, cursor) : '');
    if (cursor && scroll) this.scrollTo(cursor.measure, cursor.beat);
  }

  setPlayhead(mi, bi, scroll = true) {
    if (mi === null || mi === undefined) {
      this.playhead = null;
      if (this.playheadLayer) this.playheadLayer.innerHTML = '';
      return;
    }
    this.playhead = { mi, bi };
    if (!this.layout || !this.playheadLayer) return;
    this.playheadLayer.innerHTML = playheadMarkup(this.layout, mi, bi);
    if (scroll) this.scrollTo(mi, bi);
  }

  scrollTo(mi, bi) {
    const box = this.layout && beatBox(this.layout, mi, bi);
    if (!box) return;
    const pad = 12; // .score-inner padding-top
    const top = box.top + pad, bottom = box.bottom + pad;
    const { scrollTop, clientHeight } = this.wrap;
    if (top < scrollTop + 10) this.wrap.scrollTop = Math.max(0, top - 10);
    else if (bottom > scrollTop + clientHeight - 10) this.wrap.scrollTop = bottom - clientHeight + 10;
  }

  hitAt(ev) {
    const rect = this.svg.getBoundingClientRect();
    return hitTest(this.layout, ev.clientX - rect.left, ev.clientY - rect.top);
  }

  /** Click moves the cursor (Shift+click extends the selection); dragging selects the beats passed over. */
  handleMouseDown(ev) {
    if (!this.layout || ev.button !== 0) return;
    const hit = this.hitAt(ev);
    if (hit) this.onClick(hit, { extend: ev.shiftKey });
    this.wrap.focus({ preventScroll: true });
    ev.preventDefault();
    const move = (e) => {
      const h = this.layout && this.hitAt(e);
      if (h && (h.mi !== this.cursor.measure || h.bi !== this.cursor.beat)) this.onClick(h, { extend: true });
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
}
