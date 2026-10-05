// Maps keyboard input to app actions. GP5-style, keyboard-first.

// Only fields you type into keep their keys. On any other control (buttons, menus, checkboxes, sliders) the
// app's shortcuts win, so Space plays instead of pressing the last button clicked, arrows move the cursor, etc.
const TEXT_TYPES = new Set(['text', 'number', 'search', 'email', 'password', 'url', 'tel']);
const isTextEntry = (el) => el && ((el.tagName === 'INPUT' && TEXT_TYPES.has(el.type)) || el.tagName === 'TEXTAREA' || el.isContentEditable);

export function installKeyboard(app) {
  // Buttons never take focus on click, so keys keep going to the score.
  document.addEventListener('mousedown', (ev) => { if (ev.target.closest('button') && !ev.target.closest('dialog')) ev.preventDefault(); });
  // A control focused when the key went down must not activate when it comes up.
  document.addEventListener('keyup', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && !isTextEntry(ev.target) && !document.querySelector('dialog[open]')) ev.preventDefault(); });

  document.addEventListener('keydown', (ev) => {
    if (document.querySelector('dialog[open]')) return;
    if (isTextEntry(ev.target)) {
      if (ev.key === 'Escape') { ev.target.blur(); app.focusScore(); }
      return;
    }
    const mod = ev.metaKey || ev.ctrlKey;
    const key = ev.key;
    let handled = true;

    if (mod && !ev.altKey) {
      switch (key.toLowerCase()) {
        case 'z': ev.shiftKey ? app.redo() : app.undo(); break;
        case 'y': app.redo(); break;
        case 'c': ev.shiftKey ? app.copyMeasure() : app.copyBeat(); break;
        case 'x': app.cut(); break;
        case 'v': ev.shiftKey ? app.pasteMeasure() : app.pasteBeat(); break;
        case 'a': app.selectAll(); break;
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
      if (handled) { ev.preventDefault(); claimFocus(ev, app); }
      return;
    }

    if (/^[0-9]$/.test(key)) { app.typeDigit(Number(key)); ev.preventDefault(); claimFocus(ev, app); return; }

    switch (key) {
      case 'ArrowLeft': app.moveLeft({ extend: ev.shiftKey }); break;
      case 'ArrowRight': app.moveRight({ extend: ev.shiftKey }); break;
      case 'ArrowUp': app.moveUp(); break;
      case 'ArrowDown': app.moveDown(); break;
      case 'Home': app.toMeasureStart(); break;
      case 'End': app.toMeasureEnd(); break;
      case 'Enter': ev.shiftKey ? app.insertMeasure() : app.insertBeat(); break;
      case 'Insert': app.insertBeat(); break;
      case 'Delete': case 'Backspace': ev.shiftKey ? app.deleteBeat() : app.deleteNote(); break;
      case '+': case '=': app.shorter(); break; // GP5: + is the next faster note value
      case '-': case '_': app.longer(); break;
      case '.': app.dot(); break;
      case ' ': app.togglePlay(); break;
      case '?': app.dispatch('help'); break;
      case 'Escape': app.cancelDigits(); app.stop(); app.clearSelection(); break;
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
    if (handled) { ev.preventDefault(); claimFocus(ev, app); }
  });
}

/** After a shortcut fired while some control had focus, hand focus back to the score. */
function claimFocus(ev, app) {
  if (ev.target !== app.wrap && ev.target !== document.body) app.focusScore();
}
