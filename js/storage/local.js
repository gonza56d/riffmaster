import { toJSON, fromJSON } from '../model/serialize.js';

const SONG_KEY = 'riffmaster.song';
const CURSOR_KEY = 'riffmaster.cursor';

export function loadLocal() {
  try {
    const text = localStorage.getItem(SONG_KEY);
    if (!text) return null;
    const song = fromJSON(text);
    let cursor = null;
    try { cursor = JSON.parse(localStorage.getItem(CURSOR_KEY) || 'null'); } catch (e) { cursor = null; }
    return { song, cursor };
  } catch (e) {
    console.warn('Could not restore autosaved song:', e.message);
    return null;
  }
}

export function saveLocal(song, cursor) {
  try {
    localStorage.setItem(SONG_KEY, toJSON(song));
    localStorage.setItem(CURSOR_KEY, JSON.stringify(cursor));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearLocal() {
  try { localStorage.removeItem(SONG_KEY); localStorage.removeItem(CURSOR_KEY); } catch (e) { /* ignore */ }
}

export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  wrapped.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
  return wrapped;
}

const safeName = (s) => (s || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'song';

export function downloadJSON(song) {
  const blob = new Blob([toJSON(song, true)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(song.title)}.riffmaster.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file picker and resolves with the parsed song, or null if cancelled. Throws on invalid files. */
export function pickJSONFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      try {
        resolve(fromJSON(await file.text()));
      } catch (e) {
        reject(e);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
