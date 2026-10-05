// Pure DSP: renders instrument sounds into Float32Array sample buffers. No Web Audio dependency, so it is
// unit-testable in Node. Buffers are cached by the engine per (instrument, midi, variant).

export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Deterministic PRNG so renders are reproducible (and testable).
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** RBJ biquad; returns a function that filters a Float32Array in place. */
export function biquad(type, sampleRate, f0, Q = 0.707, gainDb = 0) {
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = sin / (2 * Q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass': b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'highpass': b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; break;
    default: throw new Error(`unknown filter ${type}`);
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  return (buf) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      buf[i] = y;
    }
    return buf;
  };
}

function normalize(buf, peak = 0.9) {
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
  if (max > 0) { const g = peak / max; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  return buf;
}

function fadeEdges(buf, sampleRate, attack = 0.002, release = 0.01) {
  const a = Math.floor(attack * sampleRate), r = Math.floor(release * sampleRate);
  for (let i = 0; i < a && i < buf.length; i++) buf[i] *= i / a;
  for (let i = 0; i < r && i < buf.length; i++) buf[buf.length - 1 - i] *= i / r;
  return buf;
}

/**
 * Extended Karplus-Strong plucked string.
 * opts: { t60 (seconds), brightness (0..1 pick softness), seconds (buffer length), damping (extra loop lowpass 0..1) }
 */
export function renderPluck(freq, sampleRate, { t60 = 2.5, brightness = 0.7, seconds = null, damping = 0, seed = 1234 } = {}) {
  const length = Math.floor((seconds ?? Math.min(t60 * 1.1 + 0.2, 4)) * sampleRate);
  const out = new Float32Array(length);
  const period = sampleRate / freq;
  const b = 0.5; // 2-point averaging loop filter
  // The averaging filter adds 0.5 samples of delay; the allpass supplies the fractional remainder.
  let N = Math.floor(period - 0.5);
  let frac = period - 0.5 - N;
  if (frac < 0.1) { N -= 1; frac += 1; } // keep the allpass coefficient well-conditioned
  const C = (1 - frac) / (1 + frac);
  const rho = Math.pow(10, -3 / (t60 * freq));
  const L = N + 2;
  const buf = new Float32Array(L);
  const rand = rng(seed + Math.round(freq * 100));
  // Excitation: one period of noise, lowpassed for pick softness.
  const exc = new Float32Array(Math.max(2, Math.round(period)));
  let lp = 0;
  const k = 0.15 + 0.8 * brightness;
  for (let i = 0; i < exc.length; i++) { const n = rand() * 2 - 1; lp += k * (n - lp); exc[i] = lp; }
  let mean = 0; for (const v of exc) mean += v; mean /= exc.length;
  for (let i = 0; i < exc.length; i++) exc[i] -= mean;
  let idx = 0, apX = 0, apY = 0, dampState = 0;
  for (let n = 0; n < length; n++) {
    const d0 = buf[(idx - N + L) % L];
    const d1 = buf[(idx - N - 1 + L) % L];
    let v = (1 - b) * d0 + b * d1;
    // first-order allpass for fractional delay
    const y = C * v + apX - C * apY;
    apX = v; apY = y; v = y;
    if (damping > 0) { dampState += (0.1 + 0.9 * (1 - damping)) * (v - dampState); v = dampState; }
    v *= rho;
    const x = n < exc.length ? exc[n] : 0;
    buf[idx] = x + v;
    out[n] = buf[idx];
    idx = (idx + 1) % L;
  }
  // Remove any DC drift and smooth the edges.
  biquad('highpass', sampleRate, 30, 0.707)(out);
  return fadeEdges(normalize(out, 0.85), sampleRate);
}

// --- percussion ----------------------------------------------------------------

function noise(length, rand) {
  const b = new Float32Array(length);
  for (let i = 0; i < length; i++) b[i] = rand() * 2 - 1;
  return b;
}
const expDecay = (buf, sampleRate, t60, start = 0) => {
  const k = Math.log(1000) / (t60 * sampleRate);
  for (let i = start; i < buf.length; i++) buf[i] *= Math.exp(-k * (i - start));
  return buf;
};
function mix(target, src, gain = 1, offset = 0) {
  for (let i = 0; i < src.length && i + offset < target.length; i++) target[i + offset] += src[i] * gain;
  return target;
}
function sineSweep(sampleRate, seconds, f0, f1, sweepTime, t60) {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f = f1 + (f0 - f1) * Math.exp(-t / sweepTime);
    phase += (2 * Math.PI * f) / sampleRate;
    out[i] = Math.sin(phase);
  }
  return expDecay(out, sampleRate, t60);
}
function metallic(sampleRate, seconds, freqs, rand) {
  // Sum of square-ish inharmonic partials ring-modulated with noise: the classic 808-style cymbal core.
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const f of freqs) v += Math.sign(Math.sin((2 * Math.PI * f * i) / sampleRate));
    out[i] = (v / freqs.length) * (0.6 + 0.4 * rand());
  }
  return out;
}
const CYMBAL_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800];

export function renderDrum(midi, sampleRate) {
  const rand = rng(99 + midi);
  let out;
  switch (midi) {
    case 35: case 36: { // kick
      out = sineSweep(sampleRate, 0.6, 170, 48, 0.035, 0.45);
      mix(out, expDecay(biquad('lowpass', sampleRate, 3000)(noise(Math.floor(0.01 * sampleRate), rand)), sampleRate, 0.01), 0.5);
      break;
    }
    case 38: case 40: { // snare
      out = sineSweep(sampleRate, 0.3, 240, 175, 0.02, 0.12);
      mix(out, sineSweep(sampleRate, 0.25, 420, 330, 0.02, 0.08), 0.5);
      const nz = expDecay(biquad('highpass', sampleRate, 1500)(noise(Math.floor(0.3 * sampleRate), rand)), sampleRate, 0.18);
      mix(out, nz, 0.9);
      break;
    }
    case 37: { // side stick
      out = sineSweep(sampleRate, 0.08, 900, 800, 0.01, 0.03);
      mix(out, expDecay(biquad('bandpass', sampleRate, 2500, 1.5)(noise(Math.floor(0.03 * sampleRate), rand)), sampleRate, 0.015), 1.2);
      break;
    }
    case 39: { // clap
      out = new Float32Array(Math.floor(0.3 * sampleRate));
      for (let k = 0; k < 3; k++) mix(out, expDecay(biquad('bandpass', sampleRate, 1800, 1)(noise(Math.floor(0.02 * sampleRate), rand)), sampleRate, 0.01), 1, Math.floor(k * 0.011 * sampleRate));
      mix(out, expDecay(biquad('bandpass', sampleRate, 1500, 0.8)(noise(Math.floor(0.25 * sampleRate), rand)), sampleRate, 0.12), 0.7, Math.floor(0.033 * sampleRate));
      break;
    }
    case 42: case 44: case 46: { // hi-hats: closed, pedal, open
      const len = midi === 46 ? 0.7 : midi === 44 ? 0.12 : 0.1;
      out = metallic(sampleRate, len, CYMBAL_FREQS, rand);
      biquad('highpass', sampleRate, 6500)(out);
      biquad('highpass', sampleRate, 6500)(out);
      expDecay(out, sampleRate, midi === 46 ? 0.45 : midi === 44 ? 0.05 : 0.045);
      if (midi === 44) normalize(out, 0.6);
      break;
    }
    case 49: case 57: case 55: case 52: { // crashes, splash, china
      const len = midi === 55 ? 0.8 : 2.2;
      out = metallic(sampleRate, len, CYMBAL_FREQS.map((f) => f * (midi === 52 ? 0.8 : midi === 57 ? 1.1 : 1)), rand);
      mix(out, noise(out.length, rand), 0.7);
      biquad('highpass', sampleRate, midi === 52 ? 2500 : 4000)(out);
      biquad('peaking', sampleRate, midi === 52 ? 3500 : 7000, 0.8, 6)(out);
      expDecay(out, sampleRate, midi === 55 ? 0.5 : 1.4);
      break;
    }
    case 51: case 59: { // ride
      out = metallic(sampleRate, 1.6, CYMBAL_FREQS.map((f) => f * 1.5), rand);
      mix(out, noise(out.length, rand), 0.35);
      biquad('highpass', sampleRate, 5000)(out);
      biquad('peaking', sampleRate, 9000, 1, 4)(out);
      expDecay(out, sampleRate, 1.1);
      mix(out, sineSweep(sampleRate, 0.5, 1800, 1750, 0.05, 0.3), 0.15);
      normalize(out, 0.7);
      break;
    }
    case 53: { // ride bell
      out = sineSweep(sampleRate, 1.0, 1250, 1250, 0.1, 0.7);
      mix(out, sineSweep(sampleRate, 1.0, 1870, 1870, 0.1, 0.5), 0.6);
      mix(out, sineSweep(sampleRate, 0.8, 2600, 2600, 0.1, 0.3), 0.4);
      mix(out, expDecay(biquad('highpass', sampleRate, 4000)(noise(Math.floor(0.05 * sampleRate), rand)), sampleRate, 0.02), 0.5);
      break;
    }
    case 54: { // tambourine
      out = new Float32Array(Math.floor(0.3 * sampleRate));
      for (let k = 0; k < 2; k++) mix(out, expDecay(biquad('highpass', sampleRate, 7000)(metallic(sampleRate, 0.2, CYMBAL_FREQS.map((f) => f * 2.3), rand)), sampleRate, 0.09), 0.8, Math.floor(k * 0.03 * sampleRate));
      break;
    }
    case 56: { // cowbell
      out = sineSweep(sampleRate, 0.35, 562, 562, 0.1, 0.18);
      mix(out, sineSweep(sampleRate, 0.35, 845, 845, 0.1, 0.14), 0.8);
      for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 3);
      biquad('bandpass', sampleRate, 700, 0.7)(out);
      break;
    }
    case 41: case 43: case 45: case 47: case 48: case 50: { // toms
      const base = { 41: 80, 43: 95, 45: 115, 47: 140, 48: 170, 50: 210 }[midi];
      out = sineSweep(sampleRate, 0.9, base * 1.6, base, 0.04, 0.5);
      mix(out, expDecay(biquad('lowpass', sampleRate, 2500)(noise(Math.floor(0.02 * sampleRate), rand)), sampleRate, 0.015), 0.6);
      break;
    }
    default: { // generic percussive click
      out = expDecay(biquad('bandpass', sampleRate, 1200, 1)(noise(Math.floor(0.15 * sampleRate), rand)), sampleRate, 0.08);
    }
  }
  return fadeEdges(normalize(out, 0.9), sampleRate, 0.0005, 0.01);
}

export function renderClick(sampleRate, accent = false) {
  const out = sineSweep(sampleRate, 0.06, accent ? 1800 : 1200, accent ? 1600 : 1000, 0.02, 0.025);
  return fadeEdges(normalize(out, accent ? 0.9 : 0.6), sampleRate, 0.0005, 0.01);
}

/** Estimate the fundamental via autocorrelation (used by tests and tuning sanity checks). */
export function estimatePitch(buf, sampleRate, { from = 0.05, window = 0.1, fmin = 40, fmax = 2500 } = {}) {
  const start = Math.floor(from * sampleRate);
  const n = Math.min(Math.floor(window * sampleRate), buf.length - start);
  const minLag = Math.floor(sampleRate / fmax), maxLag = Math.min(Math.floor(sampleRate / fmin), n - 1);
  let bestLag = minLag, best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += buf[start + i] * buf[start + i + lag];
    if (sum > best) { best = sum; bestLag = lag; }
  }
  // Parabolic interpolation around the peak for sub-sample accuracy.
  const ac = (lag) => { let s = 0; for (let i = 0; i < n - lag; i++) s += buf[start + i] * buf[start + i + lag]; return s; };
  const y0 = ac(bestLag - 1), y1 = best, y2 = ac(bestLag + 1);
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  return sampleRate / (bestLag + shift);
}
