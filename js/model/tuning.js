export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STEP_OF_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C D E F G A B
const SHARP_OF_PC = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Tunings are listed from highest string (index 0) to lowest, matching GP string numbering. */
export const TUNING_PRESETS = [
  { name: 'Guitar Standard E', family: 'guitar', tuning: [64, 59, 55, 50, 45, 40] },
  { name: 'Guitar Drop D', family: 'guitar', tuning: [64, 59, 55, 50, 45, 38] },
  { name: 'Guitar Eb Standard', family: 'guitar', tuning: [63, 58, 54, 49, 44, 39] },
  { name: 'Guitar D Standard', family: 'guitar', tuning: [62, 57, 53, 48, 43, 38] },
  { name: 'Guitar Drop C', family: 'guitar', tuning: [62, 57, 53, 48, 43, 36] },
  { name: 'Guitar 7-string B', family: 'guitar', tuning: [64, 59, 55, 50, 45, 40, 35] },
  { name: 'Guitar 7-string Drop A', family: 'guitar', tuning: [64, 59, 55, 50, 45, 40, 33] },
  { name: 'Guitar 8-string F#', family: 'guitar', tuning: [64, 59, 55, 50, 45, 40, 35, 30] },
  { name: 'Bass Standard E', family: 'bass', tuning: [43, 38, 33, 28] },
  { name: 'Bass Drop D', family: 'bass', tuning: [43, 38, 33, 26] },
  { name: 'Bass 5-string B', family: 'bass', tuning: [43, 38, 33, 28, 23] },
  { name: 'Bass 6-string', family: 'bass', tuning: [48, 43, 38, 33, 28, 23] },
];

export const MIN_STRINGS = 4;
export const MAX_STRINGS = 8;
export const MAX_FRET = 30;

export function midiName(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

/**
 * Diatonic spelling of a MIDI pitch using sharps.
 * step: absolute diatonic index (C-1 = 0, so C4 = 35, E4 = 37). sharp: whether an accidental sharp applies.
 */
export function pitchToStep(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    step: (octave + 1) * 7 + STEP_OF_PC[pc],
    sharp: SHARP_OF_PC[pc] === 1,
    letter: LETTERS[STEP_OF_PC[pc]],
    octave,
  };
}

/** Bottom-line diatonic step per clef (E4 for treble, G2 for bass). Percussion reuses treble positions. */
export const CLEF_BOTTOM_STEP = {
  treble: pitchToStep(64).step,
  bass: pitchToStep(43).step,
  percussion: pitchToStep(64).step,
};

/** Sounding MIDI of a note on a track. */
export function noteMidi(track, note) {
  return track.tuning[note.string] + note.fret;
}

/** Written MIDI (guitar and bass are notated an octave above sounding pitch). */
export function writtenMidi(track, note) {
  return noteMidi(track, note) + 12;
}

/** Change string count by adding/removing from the low end, keeping existing strings. */
export function resizeTuning(tuning, count) {
  count = Math.max(MIN_STRINGS, Math.min(MAX_STRINGS, count));
  const out = tuning.slice(0, count);
  while (out.length < count) {
    const last = out[out.length - 1];
    // Default new low string a fourth below the current lowest.
    out.push(last - 5);
  }
  return out;
}
