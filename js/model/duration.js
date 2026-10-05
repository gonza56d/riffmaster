// Exact rational durations measured in whole notes.
// A quarter note is frac(1, 4); a dotted eighth is frac(3, 16); a triplet eighth is frac(1, 12).

export const DURATIONS = ['w', 'h', 'q', 'e', 's', 't', 'x'];
export const DURATION_DIV = { w: 1, h: 2, q: 4, e: 8, s: 16, t: 32, x: 64 };
export const DURATION_NAMES = {
  w: 'Whole', h: 'Half', q: 'Quarter', e: 'Eighth', s: '16th', t: '32nd', x: '64th',
};
// GP5 tuplet ratios: n notes in the time of `in`.
export const TUPLET_IN = { 3: 2, 5: 4, 6: 4, 7: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8 };

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function frac(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`bad fraction ${n}/${d}`);
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
export const ZERO = Object.freeze(frac(0));

export const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
export const div = (a, b) => frac(a.n * b.d, a.d * b.n);
export const cmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const toNumber = (a) => a.n / a.d;
export const sum = (list) => list.reduce(add, ZERO);
export const fracStr = (a) => `${a.n}/${a.d}`;

/** Length of one beat as a fraction of a whole note. */
export function beatLength(beat) {
  const div = DURATION_DIV[beat.duration];
  if (!div) throw new Error(`unknown duration ${beat.duration}`);
  let len = frac(1, div);
  const dots = beat.dots | 0;
  if (dots > 0) len = mul(len, frac(2 ** (dots + 1) - 1, 2 ** dots));
  if (beat.tuplet) len = mul(len, frac(beat.tuplet.in, beat.tuplet.n));
  return len;
}

/** Plain length of a duration key without dots/tuplets. */
export const baseLength = (duration) => frac(1, DURATION_DIV[duration]);

export function measureLength(timeSig) {
  return frac(timeSig.num, timeSig.den);
}

export const beatsLength = (beats) => sum(beats.map(beatLength));

export function longer(duration) {
  const i = DURATIONS.indexOf(duration);
  return i > 0 ? DURATIONS[i - 1] : duration;
}
export function shorter(duration) {
  const i = DURATIONS.indexOf(duration);
  return i >= 0 && i < DURATIONS.length - 1 ? DURATIONS[i + 1] : duration;
}

/** Number of beams/flags for a duration (0 for quarter and longer). */
export function beamCount(duration) {
  const i = DURATIONS.indexOf(duration);
  return Math.max(0, i - 2);
}

export function makeTuplet(n) {
  const inN = TUPLET_IN[n];
  if (!inN) throw new Error(`unsupported tuplet ${n}`);
  return { n, in: inN };
}

/** Convert a fraction of a whole note to ticks (default 960 per quarter). May be non-integer for odd tuplets. */
export const toTicks = (a, tpq = 960) => (a.n * 4 * tpq) / a.d;
