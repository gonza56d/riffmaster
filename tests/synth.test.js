import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPluck, renderDrum, renderClick, estimatePitch, midiToFreq, biquad } from '../js/audio/synth.js';

const SR = 44100;

test('plucked strings are in tune across the guitar range', () => {
  for (const midi of [28, 40, 52, 64, 76, 86]) {
    const f = midiToFreq(midi);
    const buf = renderPluck(f, SR, { seconds: 0.5 });
    const est = estimatePitch(buf, SR, { from: 0.08, window: 0.15 });
    const cents = 1200 * Math.log2(est / f);
    assert.ok(Math.abs(cents) < 8, `midi ${midi}: expected ${f.toFixed(1)} Hz, got ${est.toFixed(1)} (${cents.toFixed(1)} cents)`);
  }
});

test('plucks decay, stay within range and are deterministic', () => {
  const a = renderPluck(220, SR, { t60: 1 });
  const b = renderPluck(220, SR, { t60: 1 });
  assert.deepEqual(Array.from(a.subarray(0, 50)), Array.from(b.subarray(0, 50)));
  let peakStart = 0, peakEnd = 0;
  for (let i = 0; i < SR * 0.05; i++) peakStart = Math.max(peakStart, Math.abs(a[i]));
  for (let i = a.length - SR * 0.05; i < a.length; i++) peakEnd = Math.max(peakEnd, Math.abs(a[i]));
  assert.ok(peakStart > 0.5 && peakStart <= 0.9);
  assert.ok(peakEnd < peakStart * 0.1, 'tail is much quieter than the attack');
  for (const v of a) assert.ok(Number.isFinite(v) && Math.abs(v) <= 1);
});

test('drums render for every mapped instrument without NaNs', () => {
  for (const midi of [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 59, 77]) {
    const buf = renderDrum(midi, SR);
    assert.ok(buf.length > SR * 0.03, `midi ${midi} has some length`);
    let peak = 0;
    for (const v of buf) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.3 && peak <= 1, `midi ${midi} peak ${peak}`);
  }
  assert.ok(renderDrum(46, SR).length > renderDrum(42, SR).length, 'open hat rings longer than closed');
  assert.ok(renderClick(SR, true).length > 0);
});

test('biquad lowpass attenuates high frequencies', () => {
  const n = 4096;
  const hi = new Float32Array(n), lo = new Float32Array(n);
  for (let i = 0; i < n; i++) { hi[i] = Math.sin((2 * Math.PI * 8000 * i) / SR); lo[i] = Math.sin((2 * Math.PI * 200 * i) / SR); }
  biquad('lowpass', SR, 1000)(hi); biquad('lowpass', SR, 1000)(lo);
  const rms = (b) => Math.sqrt(b.subarray(1000).reduce((s, v) => s + v * v, 0) / (n - 1000));
  assert.ok(rms(hi) < 0.05 && rms(lo) > 0.6);
});
