import { INSTRUMENTS, isDrums, stringCount } from '../model/song.js';
import { TUNING_PRESETS, midiName, MIN_STRINGS, MAX_STRINGS } from '../model/tuning.js';
import { DRUM_LEGEND, drumInfo } from '../model/drumMap.js';
import { esc } from '../render/glyphs.js';

export function buildTrackPanel(el, app) {
  el.innerHTML = `
    <header><span>Tracks</span>
      <select data-field="add" title="Add a track">
        <option value="">+ Add…</option>
        ${Object.entries(INSTRUMENTS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}
      </select>
    </header>
    <div class="track-list"></div>
    <div class="track-details"></div>
    <div class="drum-legend hidden"></div>`;

  const list = el.querySelector('.track-list');
  const details = el.querySelector('.track-details');
  const legend = el.querySelector('.drum-legend');
  const add = el.querySelector('[data-field=add]');
  add.addEventListener('change', () => { if (add.value) app.addTrack(add.value); add.value = ''; app.focusScore(); });

  list.addEventListener('click', (ev) => {
    const item = ev.target.closest('.track-item');
    if (!item) return;
    const ti = Number(item.dataset.index);
    const btn = ev.target.closest('button');
    if (btn?.classList.contains('mute')) app.toggleMute(ti);
    else if (btn?.classList.contains('solo')) app.toggleSolo(ti);
    else app.selectTrack(ti);
    app.focusScore();
  });

  details.addEventListener('change', (ev) => {
    const t = ev.target;
    const ti = app.cursor.track;
    if (t.dataset.field === 'name') app.renameTrack(ti, t.value);
    else if (t.dataset.field === 'instrument') app.setInstrument(ti, t.value);
    else if (t.dataset.field === 'strings') app.setStringCount(ti, Number(t.value));
    else if (t.dataset.field === 'preset') { if (t.value !== '') app.setTuning(ti, TUNING_PRESETS[Number(t.value)].tuning); }
    else if (t.dataset.field === 'volume') app.setVolume(ti, Number(t.value) / 100);
    if (t.dataset.field !== 'name') app.focusScore();
  });
  details.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const ti = app.cursor.track;
    if (btn.dataset.action === 'tune') {
      const tuning = app.song.tracks[ti].tuning.slice();
      const i = Number(btn.dataset.string);
      tuning[i] = Math.max(12, Math.min(96, tuning[i] + Number(btn.dataset.delta)));
      app.setTuning(ti, tuning);
    } else if (btn.dataset.action === 'remove') {
      app.removeTrack(ti);
    }
    app.focusScore();
  });
  details.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.dataset.field === 'name') { ev.target.blur(); app.focusScore(); } });

  legend.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-midi]');
    if (!btn) return;
    app.insertDrum(Number(btn.dataset.midi));
    app.focusScore();
  });

  function renderList() {
    const { song, cursor } = app;
    list.innerHTML = song.tracks.map((t, i) => `
      <div class="track-item ${i === cursor.track ? 'selected' : ''}" data-index="${i}">
        <div class="swatch" style="background:var(--${INSTRUMENTS[t.instrument].color})"></div>
        <div><div class="name">${esc(t.name)}</div><div class="sub">${esc(INSTRUMENTS[t.instrument].name)}${isDrums(t) ? '' : ` · ${stringCount(t)} str`}</div></div>
        <button class="solo ${t.solo ? 'on' : ''}" title="Solo">S</button>
        <button class="mute ${t.mute ? 'on' : ''}" title="Mute">M</button>
      </div>`).join('');
  }

  function renderDetails() {
    const { song, cursor } = app;
    const t = song.tracks[cursor.track];
    if (!t) { details.innerHTML = ''; return; }
    const drums = isDrums(t);
    const family = INSTRUMENTS[t.instrument].family;
    const presets = TUNING_PRESETS.map((p, i) => ({ ...p, i })).filter((p) => p.family === family);
    const presetIdx = presets.find((p) => p.tuning.length === t.tuning.length && p.tuning.every((m, i) => m === t.tuning[i]))?.i ?? '';
    details.innerHTML = `
      <div class="row"><label>Name</label><input type="text" data-field="name" value="${esc(t.name)}" style="flex:1;min-width:0"></div>
      <div class="row"><label>Instrument</label>
        <select data-field="instrument">${Object.entries(INSTRUMENTS).map(([k, v]) => `<option value="${k}" ${k === t.instrument ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
      </div>
      <div class="row"><label>Volume</label><input type="range" data-field="volume" min="0" max="100" value="${Math.round(t.volume * 100)}" style="flex:1"></div>
      ${drums ? '' : `
      <div class="row"><label>Strings</label>
        <select data-field="strings">${Array.from({ length: MAX_STRINGS - MIN_STRINGS + 1 }, (_, k) => k + MIN_STRINGS).map((n) => `<option ${n === t.tuning.length ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select data-field="preset" title="Tuning preset"><option value="">Custom…</option>${presets.map((p) => `<option value="${p.i}" ${p.i === presetIdx ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      </div>
      <div class="tuning-editor">${t.tuning.map((m, i) => `
        <div class="string"><button data-action="tune" data-string="${i}" data-delta="1" title="Up a semitone">+</button><span class="note">${midiName(m)}</span><button data-action="tune" data-string="${i}" data-delta="-1" title="Down a semitone">−</button></div>`).join('')}
      </div>`}
      <div class="row"><button data-action="remove" ${song.tracks.length <= 1 ? 'disabled' : ''}>Remove track</button></div>`;
    legend.classList.toggle('hidden', !drums);
    if (drums) {
      legend.innerHTML = DRUM_LEGEND.map((midi) => `<button data-midi="${midi}" title="Insert ${esc(drumInfo(midi).name)} (${midi})">${midi} ${esc(drumInfo(midi).name)}</button>`).join('');
    }
  }

  return {
    update() { renderList(); renderDetails(); },
    updateList() { renderList(); },
  };
}
