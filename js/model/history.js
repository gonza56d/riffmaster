/** Snapshot-based undo/redo. Each entry stores a deep clone of the song plus the cursor at that time. */
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.lastToken = null;
  }

  /**
   * Record state *before* an edit. If `token` equals the previous push's token the push is skipped,
   * so rapid related edits (two-digit fret entry) collapse into one undo step.
   */
  push(song, cursor, token = null) {
    if (token !== null && token === this.lastToken) return false;
    this.lastToken = token;
    this.undoStack.push({ song: structuredClone(song), cursor: { ...cursor } });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    return true;
  }

  /** Breaks coalescing so the next push with the same token still records. */
  seal() { this.lastToken = null; }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo(currentSong, currentCursor) {
    if (!this.canUndo()) return null;
    this.redoStack.push({ song: structuredClone(currentSong), cursor: { ...currentCursor } });
    this.lastToken = null;
    return this.undoStack.pop();
  }

  redo(currentSong, currentCursor) {
    if (!this.canRedo()) return null;
    this.undoStack.push({ song: structuredClone(currentSong), cursor: { ...currentCursor } });
    this.lastToken = null;
    return this.redoStack.pop();
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.lastToken = null;
  }
}
