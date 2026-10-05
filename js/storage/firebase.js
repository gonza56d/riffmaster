// Optional cloud features: email/password auth and per-user song storage in Firestore.
// The SDK is loaded lazily from Google's CDN so the editor stays light for users who never sign in.
import { firebaseConfig } from './firebase-config.js';
import { toJSON, fromJSON } from '../model/serialize.js';
import { customDialog, promptDialog, confirmDialog, messageDialog } from '../ui/dialogs.js';
import { esc } from '../render/glyphs.js';

export const FIREBASE_VERSION = '12.19.0';
const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const MAX_BYTES = 900 * 1024;
const SESSION_FLAG = 'riffmaster.cloud';

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-login-credentials': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'That email address does not look valid.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};
const authMessage = (e) => AUTH_ERRORS[e?.code] || e?.message || 'Something went wrong.';

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export function installCloud(app) {
  if (!firebaseConfig || !firebaseConfig.apiKey) return;
  const slot = app.toolbar.cloudSlot;
  slot.innerHTML = `
    <button data-cloud="open" title="Open a song from your account (Ctrl+O)">Open</button>
    <button data-cloud="save" title="Save to your account (Ctrl+S)">Save</button>
    <button data-cloud="saveAs" title="Save a copy under a new name">Save as</button>
    <button data-cloud="account" title="Sign in or sign up"></button>`;
  const accountBtn = slot.querySelector('[data-cloud=account]');

  let sdk = null;    // { app, auth, db, mods }
  let user = null;
  let doc = null;    // { id, name } of the song currently attached to the cloud
  let loading = null;

  const updateUI = () => {
    accountBtn.textContent = user ? `${user.email} · Log out` : 'Log in';
    slot.querySelector('[data-cloud=save]').title = doc ? `Save "${doc.name}" (Ctrl+S)` : 'Save to your account (Ctrl+S)';
    app.updateStatus();
  };

  async function load() {
    if (sdk) return sdk;
    if (loading) return loading;
    loading = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`${BASE}/firebase-app.js`),
        import(`${BASE}/firebase-auth.js`),
        import(`${BASE}/firebase-firestore-lite.js`),
      ]);
      const fbApp = appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(fbApp);
      const db = fsMod.getFirestore(fbApp);
      await new Promise((resolve) => {
        const unsub = authMod.onAuthStateChanged(auth, (u) => { user = u; updateUI(); resolve(); unsub(); });
      });
      authMod.onAuthStateChanged(auth, (u) => { user = u; if (!u) doc = null; updateUI(); });
      sdk = { app: fbApp, auth, db, authMod, fsMod };
      return sdk;
    })();
    try { return await loading; } finally { loading = null; }
  }

  // Restore a previous session silently (the SDK persists it in IndexedDB).
  try { if (localStorage.getItem(SESSION_FLAG)) load().catch(() => {}); } catch (e) { /* ignore */ }

  async function requireUser() {
    await load();
    if (user) return user;
    await authDialog();
    return user;
  }

  function authDialog() {
    return customDialog(`
      <h2>Sign in</h2>
      <form>
        <label>Email</label><input name="email" type="email" autocomplete="username" required autofocus>
        <label>Password</label><input name="password" type="password" autocomplete="current-password" minlength="6" required>
        <div class="error"></div>
        <div class="actions">
          <button type="button" class="cancel">Cancel</button>
          <button type="button" class="signup">Create account</button>
          <button type="submit">Sign in</button>
        </div>
      </form>`, (dlg, close) => {
      const form = dlg.querySelector('form');
      const err = dlg.querySelector('.error');
      const busy = (on) => { for (const b of dlg.querySelectorAll('button')) b.disabled = on; };
      const run = async (fn) => {
        err.textContent = '';
        if (!form.reportValidity()) return;
        busy(true);
        try {
          await fn(sdk.auth, form.email.value.trim(), form.password.value);
          try { localStorage.setItem(SESSION_FLAG, '1'); } catch (e) { /* ignore */ }
          close(true);
        } catch (e) {
          err.textContent = authMessage(e);
          busy(false);
        }
      };
      form.onsubmit = (e) => { e.preventDefault(); run(sdk.authMod.signInWithEmailAndPassword); };
      dlg.querySelector('.signup').onclick = () => run(sdk.authMod.createUserWithEmailAndPassword);
      dlg.querySelector('.cancel').onclick = () => close(false);
    });
  }

  const col = () => sdk.fsMod.collection(sdk.db, 'users', user.uid, 'songs');

  async function encode(song) {
    const json = toJSON(song);
    const { fsMod } = sdk;
    if (typeof CompressionStream === 'function') {
      const bytes = await gzip(json);
      if (bytes.length > MAX_BYTES) throw new Error(`This song is too large to save (${Math.round(bytes.length / 1024)} KB compressed). Export it as JSON instead.`);
      return { data: fsMod.Bytes.fromUint8Array(bytes) };
    }
    if (json.length > MAX_BYTES) throw new Error('This song is too large to save. Export it as JSON instead.');
    return { json };
  }

  async function decode(data) {
    if (data.data) return fromJSON(await gunzip(data.data.toUint8Array()));
    if (data.json) return fromJSON(data.json);
    throw new Error('Song document has no data');
  }

  async function writeSong(name, existingId = null) {
    const { fsMod } = sdk;
    const payload = { name, updatedAt: fsMod.serverTimestamp(), version: app.song.version, ...(await encode(app.song)) };
    if (existingId) {
      await fsMod.setDoc(fsMod.doc(col(), existingId), payload);
      return existingId;
    }
    const ref = await fsMod.addDoc(col(), { ...payload, createdAt: fsMod.serverTimestamp() });
    return ref.id;
  }

  async function saveAs() {
    try {
      if (!(await requireUser())) return;
      const name = await promptDialog({ title: 'Save song', label: 'Song name', value: app.song.title || 'Untitled', okText: 'Save' });
      if (name === null) return;
      const trimmed = name.trim().slice(0, 200) || 'Untitled';
      if (trimmed !== app.song.title) app.setTitle(trimmed);
      const id = await writeSong(trimmed);
      doc = { id, name: trimmed };
      updateUI();
      flash(`Saved "${trimmed}"`);
    } catch (e) {
      messageDialog({ title: 'Save failed', message: authMessage(e) });
    } finally { app.focusScore(); }
  }

  async function save() {
    if (!doc) return saveAs();
    try {
      if (!(await requireUser())) return;
      await writeSong(doc.name, doc.id);
      flash(`Saved "${doc.name}"`);
    } catch (e) {
      messageDialog({ title: 'Save failed', message: authMessage(e) });
    } finally { app.focusScore(); }
  }

  async function listSongs() {
    const { fsMod } = sdk;
    const snap = await fsMod.getDocs(fsMod.query(col(), fsMod.orderBy('updatedAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, name: d.data().name, updatedAt: d.data().updatedAt?.toDate?.() ?? null, raw: d }));
  }

  async function open() {
    try {
      if (!(await requireUser())) return;
      let songs = await listSongs();
      await customDialog(`<h2>Your songs</h2><div class="song-list"></div><div class="actions"><button type="button" class="cancel">Close</button></div>`, (dlg, close) => {
        const list = dlg.querySelector('.song-list');
        const render = () => {
          list.innerHTML = songs.length ? songs.map((s) => `
            <div class="song-row" data-id="${s.id}">
              <div><div>${esc(s.name)}</div><div class="meta">${s.updatedAt ? s.updatedAt.toLocaleString() : ''}</div></div>
              <div><button data-act="open">Open</button> <button data-act="rename">Rename</button> <button data-act="delete">Delete</button></div>
            </div>`).join('') : '<p>No saved songs yet.</p>';
        };
        render();
        list.onclick = async (ev) => {
          const btn = ev.target.closest('button[data-act]');
          const row = ev.target.closest('.song-row');
          if (!btn || !row) return;
          const s = songs.find((x) => x.id === row.dataset.id);
          try {
            if (btn.dataset.act === 'open') {
              const song = await decode(s.raw.data());
              app.loadSong(song);
              doc = { id: s.id, name: s.name };
              updateUI();
              close(true);
            } else if (btn.dataset.act === 'rename') {
              const name = await promptDialog({ title: 'Rename song', value: s.name, okText: 'Rename' });
              if (name === null) return;
              const trimmed = name.trim().slice(0, 200) || s.name;
              await sdk.fsMod.updateDoc(sdk.fsMod.doc(col(), s.id), { name: trimmed });
              s.name = trimmed;
              if (doc?.id === s.id) { doc.name = trimmed; updateUI(); }
              render();
            } else if (btn.dataset.act === 'delete') {
              if (!(await confirmDialog({ title: 'Delete song', message: `Delete "${s.name}" permanently?`, okText: 'Delete', danger: true }))) return;
              await sdk.fsMod.deleteDoc(sdk.fsMod.doc(col(), s.id));
              songs = songs.filter((x) => x.id !== s.id);
              if (doc?.id === s.id) { doc = null; updateUI(); }
              render();
            }
          } catch (e) {
            messageDialog({ title: 'Error', message: authMessage(e) });
          }
        };
        dlg.querySelector('.cancel').onclick = () => close(false);
      });
    } catch (e) {
      messageDialog({ title: 'Could not open', message: authMessage(e) });
    } finally { app.focusScore(); }
  }

  async function account() {
    try {
      await load();
      if (user) {
        if (await confirmDialog({ title: 'Log out', message: `Log out ${user.email}?`, okText: 'Log out' })) {
          await sdk.authMod.signOut(sdk.auth);
          try { localStorage.removeItem(SESSION_FLAG); } catch (e) { /* ignore */ }
          doc = null;
          updateUI();
        }
      } else {
        await authDialog();
      }
    } catch (e) {
      messageDialog({ title: 'Account', message: authMessage(e) });
    } finally { app.focusScore(); }
  }

  function flash(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 1800);
  }

  slot.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-cloud]');
    if (!btn) return;
    ({ open, save, saveAs, account })[btn.dataset.cloud]?.();
  });

  app.cloud = {
    save, saveAs, open, account,
    detach() { doc = null; updateUI(); },
    get doc() { return doc; },
    get user() { return user; },
  };
  updateUI();
}
