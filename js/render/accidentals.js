// Per-measure accidental state for a no-key-signature, sharps-only spelling.
// Steps are absolute diatonic indices (per octave), so C#4 and C#5 are tracked separately.

export function createAccidentalState() {
  return new Map(); // step -> 'sharp' | 'natural'
}

/**
 * Decide which accidental glyph a note needs and update the state.
 * `spelled` is { step, sharp } from tuning.pitchToStep. Tied continuations draw nothing and leave state alone.
 * Returns '#' | 'n' | null.
 */
export function accidentalFor(state, spelled, { tied = false } = {}) {
  if (tied) return null;
  const current = state.get(spelled.step);
  if (spelled.sharp) {
    if (current === 'sharp') return null;
    state.set(spelled.step, 'sharp');
    return '#';
  }
  if (current === 'sharp') {
    state.set(spelled.step, 'natural');
    return 'n';
  }
  return null;
}

/**
 * Resolve accidentals for all notes of a chord at once (evaluated against the state at beat start),
 * then commit. Returns an array aligned with `spelledNotes`.
 */
export function accidentalsForChord(state, spelledNotes) {
  const snapshot = new Map(state);
  const out = spelledNotes.map((s) => accidentalFor(snapshot, s, { tied: s.tied }));
  for (const [k, v] of snapshot) state.set(k, v);
  return out;
}

/**
 * Assign accidentals to columns so glyphs close together vertically do not overlap.
 * `items`: [{ pos, accidental }] (pos in half-spaces). Returns column index per item (0 = nearest the notehead).
 */
export function accidentalColumns(items) {
  const cols = [];
  const placed = []; // { pos, col }
  const sorted = items.map((it, i) => ({ ...it, i })).filter((it) => it.accidental).sort((a, b) => b.pos - a.pos);
  for (const it of sorted) {
    let col = 0;
    while (placed.some((p) => p.col === col && Math.abs(p.pos - it.pos) < 6)) col++;
    placed.push({ pos: it.pos, col });
    cols[it.i] = col;
  }
  return { columns: cols, count: placed.length ? Math.max(...placed.map((p) => p.col)) + 1 : 0 };
}
