// Lookahead scheduler with an anchor (time, position) so tempo, speed and seeks re-anchor cleanly.
import { buildTimeline, timeAt, posAt, beatIndexAt } from './compiler.js';

const TICK_MS = 25;
const LOOKAHEAD = 0.15;
const LOOKAHEAD_HIDDEN = 1.5;

export class Transport {
  constructor(engine, callbacks = {}) {
    this.engine = engine;
    this.cb = callbacks;
    this.playing = false;
    this.speed = 1;
    this.metronome = false;
    this.compiled = null;
    this.song = null;
    this.viewTrack = 0;
    this.timer = null;
    this.raf = null;
    this.lastBeatKey = null;
    document.addEventListener('visibilitychange', () => { if (this.playing) this.tick(); });
  }

  get lookahead() { return document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD; }

  /** Supply a (re)compiled song. While playing, keeps the current position. */
  load(song, compiled) {
    this.song = song;
    this.compiled = compiled;
    if (this.playing) this.reanchor(this.currentPos());
  }

  timeFor(pos) { return this.anchorTime + (timeAt(this.timeline, pos) - this.anchorTimelineTime); }
  currentPos() {
    const t = this.engine.now;
    return posAt(this.timeline, this.anchorTimelineTime + (t - this.anchorTime));
  }

  play(fromPos = 0, { countIn = false } = {}) {
    if (!this.compiled) return;
    const ctx = this.engine.ensure();
    this.timeline = buildTimeline(this.compiled.measures, this.speed);
    const measure = this.compiled.measures.find((m) => fromPos < m.start + m.length) ?? this.compiled.measures[0];
    let lead = 0.08;
    if (countIn && measure) {
      const spw = 240 / (measure.tempo * this.speed);
      const unit = spw / measure.timeSig.den;
      for (let i = 0; i < measure.timeSig.num; i++) this.engine.click(ctx.currentTime + lead + i * unit, i === 0);
      lead += unit * measure.timeSig.num;
    }
    this.anchorTime = ctx.currentTime + lead;
    this.anchorTimelineTime = timeAt(this.timeline, fromPos);
    this.nextEvent = this.compiled.events.findIndex((e) => e.pos >= fromPos - 1e-9);
    if (this.nextEvent < 0) this.nextEvent = this.compiled.events.length;
    this.nextClick = this.compiled.clicks.findIndex((c) => c.pos >= fromPos - 1e-9);
    if (this.nextClick < 0) this.nextClick = this.compiled.clicks.length;
    this.playing = true;
    this.lastBeatKey = null;
    this.engine.setMix(this.song);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    const frame = () => { if (!this.playing) return; this.frame(); this.raf = requestAnimationFrame(frame); };
    this.raf = requestAnimationFrame(frame);
    this.cb.onStart?.();
    this.tick();
  }

  stop({ reason = 'user' } = {}) {
    if (!this.playing) return;
    const pos = this.currentPos();
    this.playing = false;
    clearInterval(this.timer); this.timer = null;
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = null;
    this.engine.stopAll();
    this.cb.onStop?.({ pos, reason, beat: this.beatAt(pos) });
  }

  /** Re-anchor at `pos` using the current speed/tempo map; future sources are rescheduled. */
  reanchor(pos) {
    const now = this.engine.now;
    this.engine.stopAll(now);
    this.timeline = buildTimeline(this.compiled.measures, this.speed);
    this.anchorTime = now;
    this.anchorTimelineTime = timeAt(this.timeline, pos);
    this.nextEvent = this.compiled.events.findIndex((e) => this.timeFor(e.pos) >= now);
    if (this.nextEvent < 0) this.nextEvent = this.compiled.events.length;
    this.nextClick = this.compiled.clicks.findIndex((c) => this.timeFor(c.pos) >= now);
    if (this.nextClick < 0) this.nextClick = this.compiled.clicks.length;
  }

  setSpeed(speed) {
    this.speed = speed;
    if (this.playing) reanchorKeepingPos(this);
  }

  setMetronome(on) { this.metronome = on; }

  tick() {
    if (!this.playing) return;
    const horizon = this.engine.now + this.lookahead;
    const { events, clicks } = this.compiled;
    while (this.nextEvent < events.length && this.timeFor(events[this.nextEvent].pos) < horizon) {
      const ev = events[this.nextEvent++];
      const track = this.song.tracks[ev.ti];
      if (!track) continue;
      const when = this.timeFor(ev.pos);
      for (const note of ev.notes) {
        const dur = this.timeFor(ev.pos + note.duration) - when;
        try { this.engine.playNote(track, note, when, dur); } catch (e) { console.error('Could not schedule note', note, e); }
      }
    }
    while (this.nextClick < clicks.length && this.timeFor(clicks[this.nextClick].pos) < horizon) {
      const c = clicks[this.nextClick++];
      if (this.metronome) this.engine.click(this.timeFor(c.pos), c.accent);
    }
    if (this.nextEvent >= events.length && this.engine.now > this.timeFor(this.compiled.total) + 0.25) {
      this.stop({ reason: 'end' });
    }
  }

  beatAt(pos) {
    const beats = this.compiled?.trackBeats[this.viewTrack];
    if (!beats || !beats.length) return null;
    const i = beatIndexAt(beats, pos);
    return i >= 0 ? beats[i] : null;
  }

  frame() {
    const pos = this.currentPos();
    const b = this.beatAt(pos);
    const key = b ? `${b.seq}:${b.bi}` : null;
    if (key !== this.lastBeatKey) {
      this.lastBeatKey = key;
      this.cb.onBeat?.(b);
    }
  }
}

function reanchorKeepingPos(t) {
  const pos = t.currentPos();
  t.reanchor(pos);
}
