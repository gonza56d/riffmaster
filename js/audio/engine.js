// Web Audio engine: AudioContext lifecycle, cached synthesized buffers, per-track effect chains, master limiter.
import { renderPluck, renderDrum, renderClick, midiToFreq } from './synth.js';
import { INSTRUMENTS } from '../model/song.js';

function tanhCurve(drive, n = 2048) {
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

const PLUCK = {
  clean: (midi) => ({ t60: clamp(3.4 - (midi - 40) / 28, 1.2, 3.4), brightness: 0.75 }),
  dist1: (midi) => ({ t60: clamp(4.2 - (midi - 40) / 24, 1.6, 4.2), brightness: 0.85 }),
  dist2: (midi) => ({ t60: clamp(4.2 - (midi - 40) / 24, 1.6, 4.2), brightness: 0.9 }),
  bass: (midi) => ({ t60: clamp(3.6 - (midi - 28) / 24, 1.4, 3.6), brightness: 0.45, damping: 0.25 }),
};
const VARIANTS = {
  palmMute: { t60: 0.35, brightness: 0.4, damping: 0.6 },
  dead: { t60: 0.06, brightness: 1, damping: 0 },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Engine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.chains = new Map();
    this.active = new Set();
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.limiter = ctx.createDynamicsCompressor();
      Object.assign(this.limiter, {});
      this.limiter.threshold.value = -8; this.limiter.knee.value = 6; this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003; this.limiter.release.value = 0.12;
      this.master.connect(this.limiter).connect(ctx.destination);
      this.clickGain = ctx.createGain();
      this.clickGain.gain.value = 0.8;
      this.clickGain.connect(this.limiter);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  buffer(instrument, midi, variant = null) {
    const key = `${instrument}:${midi}:${variant || ''}`;
    let buf = this.buffers.get(key);
    if (buf) return buf;
    const ctx = this.ensure();
    let samples;
    if (instrument === 'drums') samples = renderDrum(midi, ctx.sampleRate);
    else if (instrument === 'click') samples = renderClick(ctx.sampleRate, midi === 1);
    else {
      const params = variant && VARIANTS[variant] ? VARIANTS[variant] : PLUCK[instrument](midi);
      samples = renderPluck(midiToFreq(midi), ctx.sampleRate, params);
    }
    buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(samples, 0);
    this.buffers.set(key, buf);
    return buf;
  }

  /** Pre-render common buffers for a song so first playback does not stutter. */
  warm(song) {
    for (const t of song.tracks) {
      const seen = new Set();
      for (const m of t.measures) for (const b of m.beats) for (const n of b.notes) {
        const midi = t.instrument === 'drums' ? n.fret : t.tuning[n.string] + n.fret;
        const variant = n.effects?.dead ? 'dead' : n.effects?.palmMute ? 'palmMute' : null;
        const key = `${midi}:${variant}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.buffer(t.instrument, midi, variant);
      }
    }
    this.buffer('click', 0); this.buffer('click', 1);
  }

  chain(track) {
    let c = this.chains.get(track.id);
    if (c && c.instrument === track.instrument) return c;
    if (c) { try { c.volume.disconnect(); } catch (e) { /* ignore */ } }
    const ctx = this.ensure();
    const input = ctx.createGain();
    const volume = ctx.createGain();
    volume.gain.value = 1;
    let node = input;
    const connect = (n) => { node.connect(n); node = n; return n; };
    switch (INSTRUMENTS[track.instrument].family) {
      case 'guitar': {
        if (track.instrument === 'clean') {
          input.gain.value = 0.9;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; connect(lp);
          const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; connect(comp);
        } else {
          const second = track.instrument === 'dist2';
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = second ? 110 : 85; connect(hp);
          const pre = ctx.createGain(); pre.gain.value = second ? 9 : 6; connect(pre);
          const shaper = ctx.createWaveShaper(); shaper.curve = tanhCurve(second ? 2.5 : 2); shaper.oversample = '4x'; connect(shaper);
          const post = ctx.createGain(); post.gain.value = 0.32; connect(post);
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = second ? 5200 : 4200; lp.Q.value = 0.8; connect(lp);
          const tone = ctx.createBiquadFilter(); tone.type = 'peaking'; tone.frequency.value = second ? 1200 : 600; tone.gain.value = second ? 3 : -4; tone.Q.value = 0.9; connect(tone);
          const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = second ? 3200 : 2600; presence.gain.value = 2; presence.Q.value = 1; connect(presence);
          const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15; connect(comp);
        }
        break;
      }
      case 'bass': {
        const pre = ctx.createGain(); pre.gain.value = 1.8; connect(pre);
        const shaper = ctx.createWaveShaper(); shaper.curve = tanhCurve(1.2); shaper.oversample = '2x'; connect(shaper);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; connect(lp);
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; connect(comp);
        const post = ctx.createGain(); post.gain.value = 1.1; connect(post);
        break;
      }
      default: { // drums
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3; connect(comp);
      }
    }
    connect(volume);
    volume.connect(this.master);
    c = { input, volume, instrument: track.instrument };
    this.chains.set(track.id, c);
    return c;
  }

  /** Apply mute/solo/volume for all tracks. */
  setMix(song) {
    if (!this.ctx) return;
    const anySolo = song.tracks.some((t) => t.solo);
    for (const t of song.tracks) {
      const enabled = anySolo ? t.solo : !t.mute;
      const c = this.chain(t);
      c.volume.gain.setTargetAtTime(enabled ? t.volume : 0, this.ctx.currentTime, 0.01);
    }
  }

  /**
   * Schedule one note. `durationSec` is the time until the note is cut (ignored for drums, which ring fully).
   * Returns a handle usable with cancel().
   */
  playNote(track, note, when, durationSec) {
    const ctx = this.ensure();
    const chain = this.chain(track);
    const drums = track.instrument === 'drums';
    const variant = drums ? null : note.effects?.dead ? 'dead' : note.effects?.palmMute ? 'palmMute' : null;
    const buffer = this.buffer(track.instrument, note.midi, variant);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(note.velocity ?? 1, when);
    src.connect(gain).connect(chain.input);
    const handles = [src];
    src.start(when);
    if (!drums) {
      const end = when + Math.max(0.03, durationSec);
      const release = 0.03;
      gain.gain.setValueAtTime(note.velocity ?? 1, Math.max(when, end - release));
      gain.gain.linearRampToValueAtTime(0, end);
      src.stop(end + 0.01);
      if (note.effects?.vibrato) {
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
        const depth = ctx.createGain(); depth.gain.value = 0.014;
        lfo.connect(depth).connect(src.playbackRate);
        lfo.start(when); lfo.stop(end + 0.01);
        handles.push(lfo);
      }
      if (note.slideTo !== undefined && note.slideTo !== note.midi) {
        const ratio = Math.pow(2, (note.slideTo - note.midi) / 12);
        const glideStart = when + Math.max(0, durationSec * 0.55);
        src.playbackRate.setValueAtTime(1, glideStart);
        src.playbackRate.exponentialRampToValueAtTime(ratio, Math.max(glideStart + 0.02, end - 0.02));
      }
    }
    const handle = { start: when, nodes: handles };
    this.active.add(handle);
    src.onended = () => this.active.delete(handle);
    return handle;
  }

  click(when, accent) {
    const ctx = this.ensure();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer('click', accent ? 1 : 0);
    src.connect(this.clickGain);
    src.start(when);
    const handle = { start: when, nodes: [src] };
    this.active.add(handle);
    src.onended = () => this.active.delete(handle);
    return handle;
  }

  cancel(handle) {
    for (const n of handle.nodes) { try { n.stop(0); } catch (e) { /* already stopped */ } }
    this.active.delete(handle);
  }

  /** Stop sources starting after `fromTime` (all of them when omitted). */
  stopAll(fromTime = -Infinity) {
    for (const h of Array.from(this.active)) if (h.start >= fromTime) this.cancel(h);
  }
}
