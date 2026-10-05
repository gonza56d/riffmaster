// Owns the score container: renders the current track, positions overlays, maps clicks to the cursor.
import { layoutTrack, hitTest } from '../render/layout.js';
import { renderScoreSVG, cursorMarkup, playheadMarkup, beatBox } from '../render/score.js';

export class ScoreView {
  constructor(wrap, inner, { onClick }) {
    this.wrap = wrap;
    this.inner = inner;
    this.onClick = onClick;
    this.layout = null;
    this.song = null;
    this.trackIndex = 0;
    this.cursor = null;
    this.playhead = null;
    inner.addEventListener('mousedown', (ev) => this.handleClick(ev));
    this.resize = new ResizeObserver(() => { if (this.song) this.render(this.song, this.trackIndex, this.cursor); });
    this.resize.observe(wrap);
  }

  width() {
    return Math.max(420, this.wrap.clientWidth - 16);
  }

  render(song, trackIndex, cursor) {
    this.song = song;
    this.trackIndex = trackIndex;
    this.cursor = cursor;
    const width = this.width();
    if (!song.tracks.length) { this.inner.innerHTML = ''; this.layout = null; return; }
    this.layout = layoutTrack(song, trackIndex, { width });
    this.inner.innerHTML = renderScoreSVG(this.layout);
    this.svg = this.inner.querySelector('svg');
    this.cursorLayer = this.svg.querySelector('.cursor-layer');
    this.playheadLayer = this.svg.querySelector('.playhead-layer');
    this.setCursor(cursor);
    if (this.playhead) this.setPlayhead(this.playhead.mi, this.playhead.bi, false);
  }

  setCursor(cursor, { scroll = true } = {}) {
    this.cursor = cursor;
    if (!this.layout || !this.cursorLayer) return;
    this.cursorLayer.innerHTML = cursor ? cursorMarkup(this.layout, cursor) : '';
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

  handleClick(ev) {
    if (!this.layout || ev.button !== 0) return;
    const rect = this.svg.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const hit = hitTest(this.layout, x, y);
    if (hit) this.onClick(hit);
    this.wrap.focus({ preventScroll: true });
    ev.preventDefault();
  }
}
