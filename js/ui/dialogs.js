// Minimal <dialog>-based prompts. Every function returns a Promise.
import { esc } from '../render/glyphs.js';

function openDialog(html, { onOpen } = {}) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dlg.showModal();
  onOpen?.(dlg);
  return dlg;
}

function closeDialog(dlg) {
  if (dlg.open) dlg.close();
  dlg.remove();
}

export function promptDialog({ title, label = '', value = '', okText = 'OK', type = 'text', placeholder = '' }) {
  return new Promise((resolve) => {
    const dlg = openDialog(`
      <h2>${esc(title)}</h2>
      <form method="dialog">
        ${label ? `<label>${esc(label)}</label>` : ''}
        <input name="value" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus>
        <div class="actions"><button type="button" class="cancel">Cancel</button><button type="submit" class="primary">${esc(okText)}</button></div>
      </form>`);
    const input = dlg.querySelector('input');
    input.select();
    dlg.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = input.value; closeDialog(dlg); resolve(v); };
    dlg.querySelector('.cancel').onclick = () => { closeDialog(dlg); resolve(null); };
    dlg.oncancel = () => { closeDialog(dlg); resolve(null); };
  });
}

export function confirmDialog({ title, message = '', okText = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const dlg = openDialog(`
      <h2>${esc(title)}</h2>
      ${message ? `<p>${esc(message)}</p>` : ''}
      <div class="actions"><button type="button" class="cancel">Cancel</button><button type="button" class="ok ${danger ? 'danger' : ''}" autofocus>${esc(okText)}</button></div>`);
    dlg.querySelector('.ok').onclick = () => { closeDialog(dlg); resolve(true); };
    dlg.querySelector('.cancel').onclick = () => { closeDialog(dlg); resolve(false); };
    dlg.oncancel = () => { closeDialog(dlg); resolve(false); };
  });
}

export function messageDialog({ title, message }) {
  return new Promise((resolve) => {
    const dlg = openDialog(`<h2>${esc(title)}</h2><p>${esc(message)}</p><div class="actions"><button type="button" class="ok" autofocus>OK</button></div>`);
    dlg.querySelector('.ok').onclick = () => { closeDialog(dlg); resolve(); };
    dlg.oncancel = () => { closeDialog(dlg); resolve(); };
  });
}

/** Generic dialog with custom body; `setup(dlg, close)` wires it. */
export function customDialog(html, setup) {
  return new Promise((resolve) => {
    const dlg = openDialog(html);
    const close = (value) => { closeDialog(dlg); resolve(value); };
    dlg.oncancel = (e) => { e.preventDefault(); close(null); };
    setup(dlg, close);
  });
}

export function timeSigDialog(current) {
  return customDialog(`
    <h2>Time signature</h2>
    <form method="dialog">
      <div style="display:flex;gap:8px;align-items:center">
        <input name="num" type="number" min="1" max="32" value="${current.num}" style="width:70px"> <span>/</span>
        <select name="den">${[1, 2, 4, 8, 16, 32].map((d) => `<option ${d === current.den ? 'selected' : ''}>${d}</option>`).join('')}</select>
      </div>
      <label><input type="checkbox" name="following" checked> Apply to following measures with the same signature</label>
      <div class="actions"><button type="button" class="cancel">Cancel</button><button type="submit">Apply</button></div>
    </form>`, (dlg, close) => {
    const form = dlg.querySelector('form');
    form.onsubmit = (e) => {
      e.preventDefault();
      const num = Math.max(1, Math.min(32, parseInt(form.num.value, 10) || 4));
      close({ timeSig: { num, den: parseInt(form.den.value, 10) }, following: form.following.checked });
    };
    dlg.querySelector('.cancel').onclick = () => close(null);
  });
}

export function shortcutsDialog() {
  const rows = [
    ['← →', 'Previous / next beat (→ appends a beat in an incomplete measure)'],
    ['Drag · Shift ← → · Shift click', 'Select beats (Ctrl A selects everything, Esc clears)'],
    ['↑ ↓', 'Move between strings'],
    ['Ctrl ← →', 'Previous / next measure'],
    ['Ctrl ↑ ↓', 'Previous / next track'],
    ['0–9', 'Type a fret (two digits within half a second). Drums: MIDI number'],
    ['+ / −', 'Shorter (faster) / longer (slower) note value'],
    ['.', 'Cycle dots'],
    ['T', 'Triplet on / off (→ keeps entering triplets)'],
    ['R', 'Rest on / off for the beat'],
    ['L', 'Tie to the previous note'],
    ['V S H P X', 'Vibrato, slide, hammer-on/pull-off, palm mute, dead note'],
    ['Enter / Insert', 'Insert a beat after the cursor'],
    ['Shift Enter', 'Insert a measure after the current one'],
    ['Delete / Backspace', 'Delete the note under the cursor (with a selection: clear it)'],
    ['Shift Delete', 'Delete the beat (or the selected beats)'],
    ['Ctrl Delete', 'Delete the measure'],
    ['Ctrl C / X / V', 'Copy / cut / paste the beat or the selection'],
    ['Ctrl Shift C / V', 'Copy / paste measure'],
    ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'],
    ['Space', 'Play from the cursor (or the selection) / stop'],
    ['Home / End', 'First / last beat of the measure'],
    ['Ctrl Home / End', 'Start / end of the song'],
    ['Escape', 'Cancel pending fret entry, stop, clear the selection'],
  ];
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? '⌘' : 'Ctrl';
  return customDialog(`
    <h2>Keyboard shortcuts</h2>
    <table>${rows.map(([k, d]) => `<tr><td><kbd>${esc(k.replace(/Ctrl/g, mod))}</kbd></td><td>${esc(d)}</td></tr>`).join('')}</table>
    <div class="actions"><button type="button" class="ok" autofocus>Close</button></div>`, (dlg, close) => {
    dlg.querySelector('.ok').onclick = () => close(true);
  });
}
