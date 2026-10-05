// Maps keyboard input to app actions. GP5-style, keyboard-first.

const isEditableTarget = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export function installKeyboard(app) {
  document.addEventListener('keydown', (ev) => {
    if (isEditableTarget(ev.target)) return;
    if (document.querySelector('dialog[open]')) return;
    const mod = ev.metaKey || ev.ctrlKey;
    const key = ev.key;
    let handled = true;

    if (mod && !ev.altKey) {
      switch (key.toLowerCase()) {
        case 'z': ev.shiftKey ? app.redo() : app.undo(); break;
        case 'y': app.redo(); break;
        case 'c': ev.shiftKey ? app.copyMeasure() : app.copyBeat(); break;
        case 'v': ev.shiftKey ? app.pasteMeasure() : app.pasteBeat(); break;
        case 'arrowleft': app.moveMeasure(-1); break;
        case 'arrowright': app.moveMeasure(1); break;
        case 'arrowup': app.nextTrack(-1); break;
        case 'arrowdown': app.nextTrack(1); break;
        case 'home': app.toSongStart(); break;
        case 'end': app.toSongEnd(); break;
        case 'delete': case 'backspace': app.deleteMeasure(); break;
        case 's': app.save(); break;
        case 'o': app.open(); break;
        default: handled = false;
      }
      if (handled) ev.preventDefault();
      return;
    }

    if (/^[0-9]$/.test(key)) { app.typeDigit(Number(key)); ev.preventDefault(); return; }

    switch (key) {
      case 'ArrowLeft': app.moveLeft(); break;
      case 'ArrowRight': app.moveRight(); break;
      case 'ArrowUp': app.moveUp(); break;
      case 'ArrowDown': app.moveDown(); break;
      case 'Home': app.toMeasureStart(); break;
      case 'End': app.toMeasureEnd(); break;
      case 'Enter': ev.shiftKey ? app.insertMeasure() : app.insertBeat(); break;
      case 'Insert': app.insertBeat(); break;
      case 'Delete': case 'Backspace': ev.shiftKey ? app.deleteBeat() : app.deleteNote(); break;
      case '+': case '=': app.longer(); break;
      case '-': case '_': app.shorter(); break;
      case '.': app.dot(); break;
      case ' ': app.togglePlay(); break;
      case '?': app.dispatch('help'); break;
      case 'Escape': app.cancelDigits(); app.stop(); break;
      default:
        switch (key.toLowerCase()) {
          case 't': app.tuplet(3); break;
          case 'r': app.rest(); break;
          case 'l': app.tie(); break;
          case 'v': app.effect('vibrato'); break;
          case 's': app.effect('slide'); break;
          case 'h': app.effect('hammer'); break;
          case 'p': app.effect('palmMute'); break;
          case 'x': app.effect('dead'); break;
          default: handled = false;
        }
    }
    if (handled) ev.preventDefault();
  });
}
