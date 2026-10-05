import { createSong, isDrums, measureStatus, noteAt, stringCount } from './model/song.js';
import * as cmd from './model/commands.js';
import { History } from './model/history.js';
import { MAX_FRET } from './model/tuning.js';
import { drumInfo } from './model/drumMap.js';
import { ScoreView } from './ui/scoreView.js';
import { installKeyboard } from './ui/keyboard.js';
import { buildToolbar } from './ui/toolbar.js';
import { buildTrackPanel } from './ui/trackPanel.js';
import { promptDialog, confirmDialog, messageDialog, timeSigDialog, shortcutsDialog } from './ui/dialogs.js';
import { toggleTheme } from './ui/theme.js';
import { loadLocal, saveLocal, debounce, downloadJSON, pickJSONFile } from './storage/local.js';

const DIGIT_WINDOW_MS = 600;

function loadPref(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function savePref(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } }

class App {
  constructor() {
    const restored = loadLocal();
    this.song = restored?.song ?? createSong({ measures: 4 });
    this.cursor = cmd.clampCursor(this.song, restored?.cursor ?? { track: 0, measure: 0, beat: 0, string: 0 });
    this.history = new History(100);
    this.clipboard = { beat: null, range: null, measure: null };
    this.selAnchor = null; // { measure, beat } where a selection started; the cursor is its other end
    this.hearNotes = loadPref('riffmaster.hearNotes') === '1';
    this.speed = 1;
    this.metronomeOn = false;
    this.countIn = false;
    this.pending = null; // { digits, at, token }
    this.player = null;  // installed by audio module
    this.cloud = null;   // installed by storage/firebase module

    this.autosave = debounce(() => saveLocal(this.song, this.cursor), 400);
    this.wrap = document.getElementById('score-wrap');
    this.view = new ScoreView(this.wrap, document.getElementById('score'), {
      onClick: (hit, { extend = false } = {}) => this.nav(() => ({ ...this.cursor, measure: hit.mi, beat: hit.bi, string: hit.string }), { extend }),
      onAddTrack: (instrument) => { this.addTrack(instrument); this.focusScore(); },
    });
    this.toolbar = buildToolbar(document.getElementById('toolbar'), this);
    this.trackPanel = buildTrackPanel(document.getElementById('track-panel'), this);
    this.statusbar = document.getElementById('statusbar');
    installKeyboard(this);
    window.addEventListener('beforeunload', () => this.autosave.flush());
    this.render();
    this.wrap.focus();
  }

  // ---------- state helpers ----------
  get track() { return this.song.tracks[this.cursor.track]; }
  currentBeat() { return this.track?.measures[this.cursor.measure]?.beats[this.cursor.beat] ?? null; }
  currentNote() { const b = this.currentBeat(); return b ? noteAt(b, this.cursor.string) : null; }
  isPlaying() { return !!this.player?.playing; }
  focusScore() { this.wrap.focus({ preventScroll: true }); }

  /**
   * Apply an editing command with an undo snapshot. `fn(song, cursor)` may return a new cursor.
   * The selection is dropped unless the command keeps the beats it covers (`keepSelection`).
   */
  edit(fn, { token = null, keepSelection = false } = {}) {
    this.history.push(this.song, this.cursor, token);
    if (!keepSelection) this.selAnchor = null;
    const result = fn(this.song, this.cursor);
    const next = result && typeof result === 'object' && 'cursor' in result ? result.cursor : result;
    if (next && typeof next === 'object') this.cursor = next;
    this.cursor = cmd.clampCursor(this.song, this.cursor);
    this.render();
  }

  /** Move the cursor without touching the song. `extend` grows the selection instead of dropping it. */
  nav(fn, { extend = false } = {}) {
    this.cancelDigits();
    const from = this.cursor;
    this.cursor = cmd.clampCursor(this.song, fn(this.song, this.cursor));
    this.selAnchor = extend ? (this.selAnchor ?? { measure: from.measure, beat: from.beat }) : null;
    this.view.setCursor(this.cursor, { selection: this.selection() });
    this.afterCursor();
  }

  /** The selected beats of the current track as { from, to } (inclusive, in order), or null. */
  selection() {
    const a = this.selAnchor, c = this.cursor;
    if (!a || !this.track || (a.measure === c.measure && a.beat === c.beat)) return null;
    const head = { measure: c.measure, beat: c.beat };
    return a.measure < c.measure || (a.measure === c.measure && a.beat < c.beat) ? { from: a, to: head } : { from: head, to: a };
  }
  clearSelection() { if (this.selAnchor) { this.selAnchor = null; this.view.setCursor(this.cursor, { selection: null, scroll: false }); this.updateStatus(); } }
  selectAll() { this.selAnchor = { measure: 0, beat: 0 }; this.nav(cmd.toSongEnd, { extend: true }); }

  render() {
    this.view.render(this.song, this.cursor.track, this.cursor, this.selection());
    this.trackPanel.update();
    this.afterCursor();
    this.autosave();
    this.player?.songChanged?.();
  }

  afterCursor() {
    this.toolbar.update();
    this.trackPanel.updateMarkers();
    this.updateStatus();
    this.autosave();
  }

  updateStatus() {
    const { cursor, song } = this;
    const t = this.track;
    const status = t ? measureStatus(song, t, cursor.measure) : '';
    const note = this.currentNote();
    const noteInfo = note ? (isDrums(t) ? `${drumInfo(note.fret).name} (${note.fret})` : `fret ${note.fret}`) : '';
    const pending = this.pending ? ` · typing ${this.pending.digits}…` : '';
    const range = this.selection();
    const selected = range ? ` · ${cmd.beatsInRange(t, range).length} beats selected` : '';
    this.statusbar.innerHTML = `
      <span>${t ? `Bar ${cursor.measure + 1} · Beat ${cursor.beat + 1} · String ${cursor.string + 1}${noteInfo ? ' · ' + noteInfo : ''}${selected}${pending}` : ''}</span>
      <span style="color:var(--warn)">${status === 'incomplete' ? 'Measure incomplete' : status === 'overfull' ? 'Measure overfull' : ''}</span>
      <span class="right"><span>${this.player?.statusText?.() ?? ''}</span><span>Press ? for shortcuts</span></span>`;
  }

  loadSong(song, cursor = null) {
    this.stop();
    this.song = song;
    this.cursor = cmd.clampCursor(song, cursor ?? { track: 0, measure: 0, beat: 0, string: 0 });
    this.history.clear();
    this.cancelDigits();
    this.render();
  }

  // ---------- toolbar dispatch ----------
  dispatch(action, value) {
    const map = {
      new: () => this.newSong(),
      import: () => this.importJSON(),
      export: () => downloadJSON(this.song),
      play: () => this.togglePlay(),
      stop: () => this.stop(),
      metronome: () => { this.metronomeOn = !this.metronomeOn; this.player?.setMetronome?.(this.metronomeOn); this.toolbar.update(); },
      countin: () => { this.countIn = !this.countIn; this.toolbar.update(); },
      duration: () => this.setDuration(value),
      dot: () => this.dot(),
      triplet: () => this.tuplet(3),
      rest: () => this.rest(),
      tie: () => this.tie(),
      timesig: () => this.editTimeSig(),
      insertMeasure: () => this.insertMeasure(),
      repeatOpen: () => this.edit((s, c) => { cmd.toggleRepeatOpen(s, c.measure); }),
      repeatClose: () => this.edit((s, c) => { cmd.toggleRepeatClose(s, c.measure); }),
      marker: () => this.editMarker(),
      deleteMeasure: () => this.deleteMeasure(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      help: () => shortcutsDialog(),
      theme: () => { toggleTheme(); this.toolbar.update(); },
      save: () => this.save(),
      open: () => this.open(),
      account: () => this.cloud?.account?.(),
    };
    map[action]?.();
    if (!['timesig', 'help', 'new', 'import', 'marker'].includes(action)) this.focusScore();
  }

  // ---------- song-level ----------
  async newSong() {
    if (!(await confirmDialog({ title: 'New song', message: 'Discard the current song and start a new one? (Export first if you want to keep it.)', okText: 'New song' }))) return;
    this.loadSong(createSong({ measures: 4 }));
    this.cloud?.detach?.();
    this.focusScore();
  }

  async importJSON() {
    try {
      const song = await pickJSONFile();
      if (song) { this.loadSong(song); this.cloud?.detach?.(); }
    } catch (e) {
      messageDialog({ title: 'Import failed', message: e.message });
    }
    this.focusScore();
  }

  setTitle(title) { this.edit((s) => { cmd.setTitle(s, title); }); }
  setTempo(bpm) { if (Number.isFinite(bpm)) this.edit((s) => { cmd.setTempo(s, bpm); }); }
  setSpeed(speed) { this.speed = speed; this.player?.setSpeed?.(speed); this.toolbar.update(); }

  async editTimeSig() {
    const res = await timeSigDialog(this.song.measureHeaders[this.cursor.measure].timeSig);
    if (res) this.edit((s, c) => { cmd.setTimeSig(s, c.measure, res.timeSig, { following: res.following }); });
    this.focusScore();
  }

  async editMarker() {
    const header = this.song.measureHeaders[this.cursor.measure];
    const name = await promptDialog({ title: 'Section marker', label: 'Name (empty to remove)', value: header.marker || '', okText: 'Set' });
    if (name === null) return;
    this.edit((s, c) => { const h = s.measureHeaders[c.measure]; if (name.trim()) h.marker = name.trim().slice(0, 40); else delete h.marker; });
    this.focusScore();
  }

  save() { this.cloud ? this.cloud.save() : downloadJSON(this.song); }
  open() { this.cloud ? this.cloud.open() : this.importJSON(); }

  // ---------- undo ----------
  undo() {
    this.cancelDigits();
    const snap = this.history.undo(this.song, this.cursor);
    if (!snap) return;
    this.selAnchor = null;
    this.song = snap.song; this.cursor = cmd.clampCursor(this.song, snap.cursor); this.render();
  }
  redo() {
    this.cancelDigits();
    const snap = this.history.redo(this.song, this.cursor);
    if (!snap) return;
    this.selAnchor = null;
    this.song = snap.song; this.cursor = cmd.clampCursor(this.song, snap.cursor); this.render();
  }

  // ---------- fret entry ----------
  typeDigit(d) {
    const now = Date.now();
    const maxFret = isDrums(this.track) ? 127 : MAX_FRET;
    let digits = String(d);
    let token;
    if (this.pending && now - this.pending.at < DIGIT_WINDOW_MS && this.pending.cursorKey === this.cursorKey()) {
      const combined = this.pending.digits + d;
      if (Number(combined) <= maxFret) { digits = combined; token = this.pending.token; }
    }
    token ??= `fret:${this.cursorKey()}:${now}`;
    clearTimeout(this.pendingTimer);
    this.pending = { digits, at: now, token, cursorKey: this.cursorKey() };
    this.pendingTimer = setTimeout(() => { this.pending = null; this.history.seal(); this.updateStatus(); }, DIGIT_WINDOW_MS);
    this.edit((s, c) => cmd.setFret(s, c, Number(digits)), { token });
    this.previewNote();
  }
  cursorKey() { const c = this.cursor; return `${c.track}:${c.measure}:${c.beat}:${c.string}`; }
  cancelDigits() { if (this.pending) { this.pending = null; clearTimeout(this.pendingTimer); this.history.seal(); } }

  insertDrum(midi) {
    if (!isDrums(this.track)) return;
    const line = drumInfo(midi).tabLine;
    this.cancelDigits();
    this.edit((s, c) => cmd.setFret(s, { ...c, string: line }, midi));
    this.previewNote(line);
  }

  /** With "Hear notes" on, sound the note just entered (on the cursor's string unless told otherwise). */
  previewNote(string = this.cursor.string) {
    const beat = this.currentBeat();
    const note = beat && noteAt(beat, string);
    if (this.hearNotes && note) this.player?.preview?.(this.track, beat, note, this.cursor.measure);
  }
  setHearNotes(on) {
    this.hearNotes = on;
    savePref('riffmaster.hearNotes', on ? '1' : '0');
    this.toolbar.update();
  }

  // ---------- note / beat edits ----------
  // Rhythm commands act on every selected beat, or on the cursor's beat when nothing is selected.
  editBeats(fn) {
    this.cancelDigits();
    const range = this.selection();
    if (range) this.edit((s, c) => { cmd.forRange(s, c.track, range, fn); }, { keepSelection: true });
    else this.edit((s, c) => fn(s, c));
  }
  /** First selected beat, or the cursor's beat. */
  leadBeat() {
    const range = this.selection();
    return range ? this.track.measures[range.from.measure].beats[range.from.beat] : this.currentBeat();
  }

  deleteNote() {
    this.cancelDigits();
    const range = this.selection();
    if (range) { this.edit((s, c) => { cmd.clearRange(s, c.track, range); }, { keepSelection: true }); return; }
    const beat = this.currentBeat();
    if (!beat) return;
    if (noteAt(beat, this.cursor.string)) this.edit((s, c) => cmd.deleteNote(s, c).cursor);
    else if (beat.rest && this.track.measures[this.cursor.measure].beats.length > 1) this.deleteBeat();
  }
  deleteBeat() {
    this.cancelDigits();
    const range = this.selection();
    this.edit((s, c) => (range ? cmd.deleteRange(s, c.track, range) : cmd.deleteBeat(s, c)));
  }
  setDuration(d) { this.editBeats((s, c) => cmd.setDuration(s, c, d)); }
  longer() { this.editBeats((s, c) => cmd.changeDuration(s, c, 1)); }
  shorter() { this.editBeats((s, c) => cmd.changeDuration(s, c, -1)); }
  dot() { const dots = (this.leadBeat().dots + 1) % 3; this.editBeats((s, c) => cmd.setDots(s, c, dots)); }
  tuplet(n, { exact = false } = {}) {
    const target = exact || this.leadBeat().tuplet?.n !== n ? n : null;
    this.editBeats((s, c) => cmd.setTuplet(s, c, target));
  }
  rest() {
    const range = this.selection();
    if (!range) { this.editBeats((s, c) => cmd.toggleRest(s, c)); return; }
    const allRests = cmd.beatsInRange(this.track, range).every(({ beat }) => beat.rest && !beat.empty);
    this.editBeats((s, c) => cmd.setRest(s, c, !allRests));
  }
  tie() { this.cancelDigits(); if (cmd.canTie(this.song, this.cursor)) this.edit((s, c) => cmd.toggleTie(s, c)); }
  effect(key) { this.cancelDigits(); if (this.currentNote()) this.edit((s, c) => cmd.toggleEffect(s, c, key)); }
  insertBeat() { this.cancelDigits(); this.edit((s, c) => cmd.insertBeat(s, c)); }
  insertMeasure() { this.cancelDigits(); this.edit((s, c) => cmd.insertMeasure(s, c)); }
  async deleteMeasure() {
    this.cancelDigits();
    this.edit((s, c) => cmd.deleteMeasure(s, c));
  }

  copyBeat() {
    const range = this.selection();
    this.clipboard.range = range ? cmd.copyRange(this.song, this.cursor.track, range) : null;
    this.clipboard.beat = range ? null : cmd.copyBeat(this.song, this.cursor);
    this.updateStatus();
  }
  cut() { this.copyBeat(); this.deleteBeat(); }
  pasteBeat() {
    const { range, beat } = this.clipboard;
    if (range) {
      // The pasted beats come out selected, so they can be moved on or changed right away.
      this.edit((s, c) => { const r = cmd.pasteRange(s, c, range); this.selAnchor = r.from; return { ...c, ...r.to }; }, { keepSelection: true });
    } else if (beat) this.edit((s, c) => cmd.pasteBeat(s, c, beat));
  }
  copyMeasure() { this.clipboard.measure = cmd.copyMeasure(this.song, this.cursor); }
  pasteMeasure() { if (this.clipboard.measure) this.edit((s, c) => cmd.pasteMeasure(s, c, this.clipboard.measure)); }

  // ---------- navigation ----------
  moveLeft({ extend = false } = {}) { this.nav(cmd.moveLeft, { extend }); }
  moveRight({ extend = false } = {}) {
    if (extend) { this.nav(cmd.nextBeat, { extend }); return; }
    this.cancelDigits();
    if (cmd.moveRightEdits(this.song, this.cursor)) this.edit((s, c) => cmd.moveRight(s, c).cursor);
    else this.nav((s, c) => cmd.moveRight(s, c).cursor);
  }
  moveUp() { this.nav(cmd.moveUp); }
  moveDown() { this.nav(cmd.moveDown); }
  moveMeasure(dir) { this.nav((s, c) => cmd.moveMeasure(s, c, dir)); }
  toMeasureStart() { this.nav(cmd.toMeasureStart); }
  toMeasureEnd() { this.nav(cmd.toMeasureEnd); }
  toSongStart() { this.nav(cmd.toSongStart); }
  toSongEnd() { this.nav(cmd.toSongEnd); }
  goToMeasure(mi) { this.nav((s, c) => ({ ...c, measure: mi, beat: 0 })); }

  // ---------- tracks ----------
  selectTrack(ti) {
    if (ti === this.cursor.track) return;
    this.cancelDigits();
    this.selAnchor = null;
    this.cursor = cmd.selectTrack(this.song, this.cursor, ti);
    this.view.render(this.song, this.cursor.track, this.cursor);
    this.trackPanel.update();
    this.afterCursor();
  }
  nextTrack(dir) { this.selectTrack(Math.max(0, Math.min(this.song.tracks.length - 1, this.cursor.track + dir))); }
  addTrack(instrument) { this.edit((s) => { const ti = cmd.addTrack(s, instrument); return { ...this.cursor, track: ti, string: 0 }; }); }
  async removeTrack(ti) {
    if (!(await confirmDialog({ title: 'Remove track', message: `Remove "${this.song.tracks[ti].name}" and all its notes?`, okText: 'Remove', danger: true }))) return;
    this.edit((s, c) => { cmd.removeTrack(s, ti); return { ...c, track: Math.min(ti, s.tracks.length - 1) }; });
    this.focusScore();
  }
  renameTrack(ti, name) { this.edit((s) => { cmd.renameTrack(s, ti, name); }); }
  setInstrument(ti, inst) { this.edit((s) => { cmd.setInstrument(s, ti, inst); }); }
  setStringCount(ti, n) { this.edit((s, c) => { cmd.setStringCount(s, ti, n); return { ...c, string: Math.min(c.string, n - 1) }; }); }
  setTuning(ti, tuning) { this.edit((s) => { cmd.setTrackTuning(s, ti, tuning); }); }
  toggleMute(ti) { cmd.toggleMute(this.song, ti); this.trackPanel.updateList(); this.player?.mixChanged?.(); this.autosave(); }
  toggleSolo(ti) { cmd.toggleSolo(this.song, ti); this.trackPanel.updateList(); this.player?.mixChanged?.(); this.autosave(); }
  setVolume(ti, v) { cmd.setVolume(this.song, ti, v); this.player?.mixChanged?.(); this.autosave(); }

  // ---------- playback (wired by audio module) ----------
  togglePlay() { this.player?.toggle?.(); }
  stop() { this.player?.stop?.(); }
}

// Editing, navigation and playback need a track; with none (the "add an instrument" page) they do nothing.
for (const name of ['typeDigit', 'insertDrum', 'deleteNote', 'deleteBeat', 'setDuration', 'longer', 'shorter', 'dot', 'tuplet', 'rest',
  'tie', 'effect', 'insertBeat', 'insertMeasure', 'deleteMeasure', 'copyBeat', 'cut', 'pasteBeat', 'copyMeasure', 'pasteMeasure',
  'moveLeft', 'moveRight', 'moveUp', 'moveDown', 'moveMeasure', 'toMeasureStart', 'toMeasureEnd', 'toSongStart', 'toSongEnd',
  'goToMeasure', 'selectAll', 'editTimeSig', 'editMarker', 'togglePlay']) {
  const fn = App.prototype[name];
  App.prototype[name] = function (...args) { return this.track ? fn.apply(this, args) : undefined; };
}

const app = new App();
window.riffmaster = app;

// Optional modules load lazily so the editor is usable immediately.
import('./audio/player.js').then((m) => m.installPlayer(app)).catch((e) => console.warn('Audio unavailable:', e));
import('./storage/firebase.js').then((m) => m.installCloud(app)).catch((e) => console.warn('Cloud unavailable:', e));
