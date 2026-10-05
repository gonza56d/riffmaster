import { DURATIONS, DURATION_NAMES } from '../model/duration.js';
import { COMMON_TIME_SIGS } from '../model/timesig.js';
import { esc } from '../render/glyphs.js';
import { currentTheme } from './theme.js';

import { notehead, flags, rest } from '../render/glyphs.js';

function durationIcon(d) {
  const flagCount = { e: 1, s: 2, t: 3, x: 4 }[d] || 0;
  const y = 19, x = 8;
  let body = notehead(x, y, { hollow: d === 'h', whole: d === 'w' });
  if (d !== 'w') body += `<line x1="${x + 4.4}" y1="${y}" x2="${x + 4.4}" y2="${y - 15}" class="ink-stroke" stroke-width="1.3"/>`;
  if (flagCount) body += flags(x + 3.8, y - 15, flagCount, 1, 8);
  return `<svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true">${body}</svg>`;
}
const restIcon = () => `<svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true">${rest(11, 12, 'q', 8)}</svg>`;
const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2];

export function buildToolbar(el, app) {
  el.innerHTML = `
    <div class="group file">
      <button data-action="new" title="New song">New</button>
      <button data-action="import" title="Import a .json song file">Import</button>
      <button data-action="export" title="Download the song as .json">Export</button>
      <span class="cloud"></span>
    </div>
    <div class="sep"></div>
    <input class="title-input" type="text" data-field="title" placeholder="Song title" title="Song title">
    <div class="sep"></div>
    <div class="group transport">
      <button data-action="play" class="icon" title="Play / stop (Space)">▶</button>
      <button data-action="stop" class="icon" title="Stop (Escape)">■</button>
      <label>Tempo</label><input type="number" data-field="tempo" min="20" max="400" title="Song tempo (BPM)">
      <label>Speed</label>
      <select data-field="speed" title="Playback speed without changing the song tempo">
        ${SPEEDS.map((s) => `<option value="${s}">${Math.round(s * 100)}%</option>`).join('')}
      </select>
      <button data-action="metronome" title="Metronome">Metro</button>
      <button data-action="countin" title="One measure count-in before playing">Count-in</button>
    </div>
    <div class="sep"></div>
    <div class="group rhythm">
      ${DURATIONS.map((d) => `<button data-action="duration" data-value="${d}" class="icon dur" title="${DURATION_NAMES[d]}">${durationIcon(d)}</button>`).join('')}
      <button data-action="dot" class="icon" title="Dot (.)">•</button>
      <select data-field="tuplet" title="Tuplet (T toggles triplet)">
        <option value="">—</option>
        ${[3, 5, 6, 7, 9, 10, 11, 12, 13].map((n) => `<option value="${n}">${n}:${n <= 3 ? 2 : n <= 7 ? 4 : 8}</option>`).join('')}
      </select>
      <button data-action="rest" class="icon" title="Rest (R)">${restIcon()}</button>
      <button data-action="tie" class="icon" title="Tie (L)">⌒</button>
    </div>
    <div class="sep"></div>
    <div class="group measure">
      <button data-action="timesig" title="Time signature of the current measure"></button>
      <button data-action="insertMeasure" title="Insert measure after (Shift+Enter)">+ Bar</button>
      <button data-action="deleteMeasure" title="Delete measure (Ctrl+Delete)">− Bar</button>
      <button data-action="repeatOpen" class="icon" title="Toggle repeat start on this measure"><b>|:</b></button>
      <button data-action="repeatClose" class="icon" title="Toggle repeat end on this measure"><b>:|</b></button>
      <button data-action="marker" title="Section marker for this measure">Marker</button>
    </div>
    <div class="sep"></div>
    <div class="group edit">
      <button data-action="undo" class="icon" title="Undo">↶</button>
      <button data-action="redo" class="icon" title="Redo">↷</button>
    </div>
    <div class="group right" style="margin-left:auto">
      <button data-action="help" title="Keyboard shortcuts">?</button>
      <button data-action="theme" class="icon" title="Toggle dark / light theme"></button>
    </div>`;

  el.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    app.dispatch(btn.dataset.action, btn.dataset.value);
  });
  const title = el.querySelector('[data-field=title]');
  title.addEventListener('change', () => app.setTitle(title.value));
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { title.blur(); app.focusScore(); } });
  const tempo = el.querySelector('[data-field=tempo]');
  tempo.addEventListener('change', () => { app.setTempo(Number(tempo.value)); app.focusScore(); });
  const speed = el.querySelector('[data-field=speed]');
  speed.addEventListener('change', () => { app.setSpeed(Number(speed.value)); app.focusScore(); });
  const tuplet = el.querySelector('[data-field=tuplet]');
  tuplet.addEventListener('change', () => { app.tuplet(tuplet.value ? Number(tuplet.value) : null, { exact: true }); app.focusScore(); });

  return {
    update() {
      const { song, cursor } = app;
      const beat = app.currentBeat();
      title.value = song.title;
      if (document.activeElement !== tempo) tempo.value = song.tempo;
      speed.value = String(app.speed);
      for (const b of el.querySelectorAll('.dur')) b.classList.toggle('active', !!beat && beat.duration === b.dataset.value);
      el.querySelector('[data-action=dot]').classList.toggle('active', !!beat && beat.dots > 0);
      el.querySelector('[data-action=dot]').textContent = beat && beat.dots === 2 ? '••' : '•';
      tuplet.value = beat && beat.tuplet ? String(beat.tuplet.n) : '';
      el.querySelector('[data-action=rest]').classList.toggle('active', !!beat && beat.rest);
      const note = app.currentNote();
      el.querySelector('[data-action=tie]').classList.toggle('active', !!note && note.tie);
      const ts = song.measureHeaders[cursor.measure].timeSig;
      el.querySelector('[data-action=timesig]').textContent = `${ts.num}/${ts.den}`;
      const header = song.measureHeaders[cursor.measure];
      el.querySelector('[data-action=repeatOpen]').classList.toggle('active', !!header.repeatOpen);
      el.querySelector('[data-action=repeatClose]').classList.toggle('active', !!header.repeatClose);
      el.querySelector('[data-action=marker]').classList.toggle('active', !!header.marker);
      el.querySelector('[data-action=undo]').disabled = !app.history.canUndo();
      el.querySelector('[data-action=redo]').disabled = !app.history.canRedo();
      el.querySelector('[data-action=play]').textContent = app.isPlaying() ? '❚❚' : '▶';
      el.querySelector('[data-action=play]').classList.toggle('active', app.isPlaying());
      el.querySelector('[data-action=metronome]').classList.toggle('active', app.metronomeOn);
      el.querySelector('[data-action=countin]').classList.toggle('active', app.countIn);
      for (const c of el.querySelectorAll('.rhythm button, .rhythm select, .measure button, [data-action=play]')) c.disabled = !app.track;
      el.querySelector('[data-action=theme]').textContent = currentTheme() === 'dark' ? '☀' : '☾';
    },
    cloudSlot: el.querySelector('.cloud'),
  };
}

export { COMMON_TIME_SIGS, esc };
