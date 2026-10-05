import { frac, add, ZERO, cmp } from './duration.js';

/**
 * Beam groups for a meter, as an array of group lengths (fractions of a whole note).
 * `override` is an optional array of counts in units of 1/den (e.g. [3,2,2] for 7/8).
 */
export function beamGroups(timeSig, override = null) {
  const { num, den } = timeSig;
  const unit = frac(1, den);
  let counts;
  if (Array.isArray(override) && override.length && override.reduce((a, b) => a + b, 0) === num) {
    counts = override;
  } else if (den <= 4) {
    // Simple meters: one group per quarter note.
    const quarters = (num * 4) / den;
    if (Number.isInteger(quarters)) return Array.from({ length: quarters }, () => frac(1, 4));
    counts = Array.from({ length: num }, () => 1);
  } else if (num % 3 === 0) {
    counts = Array.from({ length: num / 3 }, () => 3);
  } else if (num % 2 === 0) {
    counts = Array.from({ length: num / 2 }, () => 2);
  } else {
    counts = [3, ...Array.from({ length: (num - 3) / 2 }, () => 2)];
  }
  return counts.map((c) => frac(c * unit.n, unit.d));
}

/** Onsets (fractions) where each beam group starts, plus the measure end as last element. */
export function groupBoundaries(timeSig, override = null) {
  const out = [ZERO];
  let acc = ZERO;
  for (const g of beamGroups(timeSig, override)) {
    acc = add(acc, g);
    out.push(acc);
  }
  return out;
}

/** Index of the beam group containing a given onset, or -1 if beyond the measure. */
export function groupIndexAt(boundaries, onset) {
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (cmp(onset, boundaries[i]) >= 0 && cmp(onset, boundaries[i + 1]) < 0) return i;
  }
  return -1;
}

export const COMMON_TIME_SIGS = [
  { num: 4, den: 4 }, { num: 3, den: 4 }, { num: 2, den: 4 }, { num: 5, den: 4 }, { num: 7, den: 4 },
  { num: 6, den: 8 }, { num: 9, den: 8 }, { num: 12, den: 8 }, { num: 5, den: 8 }, { num: 7, den: 8 },
  { num: 2, den: 2 }, { num: 3, den: 2 },
];

export const timeSigEq = (a, b) => a.num === b.num && a.den === b.den;
