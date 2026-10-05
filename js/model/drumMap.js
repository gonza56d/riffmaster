// GP5-style percussion map. `pos` is the staff position in half-spaces from the bottom line of a
// 5-line percussion staff (0 = bottom line, 1 = first space, 8 = top line, 9 = space above, 10 = first ledger).
// `tabLine` is the default 6-line tab line (0 = top) used when inserting from the legend.
// Heads: 'normal' | 'x' | 'circledX' | 'diamond'.
export const DRUM_MAP = {
  35: { name: 'Acoustic Bass Drum', pos: 1, head: 'normal', tabLine: 5 },
  36: { name: 'Bass Drum', pos: 1, head: 'normal', tabLine: 5 },
  37: { name: 'Side Stick', pos: 5, head: 'x', tabLine: 2 },
  38: { name: 'Snare', pos: 5, head: 'normal', tabLine: 2 },
  39: { name: 'Hand Clap', pos: 5, head: 'diamond', tabLine: 2 },
  40: { name: 'Electric Snare', pos: 5, head: 'normal', tabLine: 2 },
  41: { name: 'Low Floor Tom', pos: 0, head: 'normal', tabLine: 4 },
  42: { name: 'Closed Hi-Hat', pos: 9, head: 'x', tabLine: 0 },
  43: { name: 'High Floor Tom', pos: 2, head: 'normal', tabLine: 4 },
  44: { name: 'Pedal Hi-Hat', pos: -1, head: 'x', tabLine: 0 },
  45: { name: 'Low Tom', pos: 3, head: 'normal', tabLine: 4 },
  46: { name: 'Open Hi-Hat', pos: 9, head: 'circledX', tabLine: 0 },
  47: { name: 'Low-Mid Tom', pos: 4, head: 'normal', tabLine: 3 },
  48: { name: 'Hi-Mid Tom', pos: 6, head: 'normal', tabLine: 3 },
  49: { name: 'Crash 1', pos: 10, head: 'x', tabLine: 1 },
  50: { name: 'High Tom', pos: 7, head: 'normal', tabLine: 3 },
  51: { name: 'Ride', pos: 8, head: 'x', tabLine: 1 },
  52: { name: 'China', pos: 11, head: 'x', tabLine: 1 },
  53: { name: 'Ride Bell', pos: 8, head: 'diamond', tabLine: 1 },
  54: { name: 'Tambourine', pos: 9, head: 'diamond', tabLine: 1 },
  55: { name: 'Splash', pos: 10, head: 'x', tabLine: 1 },
  56: { name: 'Cowbell', pos: 7, head: 'x', tabLine: 1 },
  57: { name: 'Crash 2', pos: 11, head: 'x', tabLine: 1 },
  59: { name: 'Ride 2', pos: 6, head: 'x', tabLine: 1 },
};

export const DRUM_TAB_LINES = 6;
const UNKNOWN = { name: 'Percussion', pos: 5, head: 'normal', tabLine: 2 };

export function drumInfo(midi) {
  return DRUM_MAP[midi] || { ...UNKNOWN, name: `Percussion ${midi}` };
}

/** Legend order shown in the UI: top of kit to bottom. */
export const DRUM_LEGEND = [42, 46, 44, 49, 57, 55, 52, 51, 53, 38, 37, 50, 48, 47, 45, 43, 41, 36];
