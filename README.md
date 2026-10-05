# riffmaster

A Guitar Pro 5-like tab composer that runs entirely in the browser. Pure JavaScript, no build step,
no runtime dependencies. Hosted on GitHub Pages; Firebase (free tier) is optional and only used for
signing in and saving songs.

## Core business

Guitar Pro-like or Songsterr-like application but much more simpler and straightforward, focused on
composition rather than practicing or learning songs.

## Features

- Dual notation like GP5: standard staff on top, tablature below, for both stringed and percussion tracks.
- Instruments: distortion guitar (two tones, A and B), clean guitar, bass, drums. Sounds are synthesized with
  the Web Audio API (Karplus-Strong plucked strings into an amp chain, synthesized drum kit). No samples.
- Any number of tracks; stringed tracks have 4–8 strings with presets or custom tunings. Drum tracks use
  the GP5 percussion map (MIDI numbers in the tab, GP5 noteheads on the staff).
- Note values from whole to 64th, dots, tuplets (3, 5, 6, 7, 9, 10, 11, 12, 13), rests, ties.
- Time signatures per measure (4/4, 3/4, 6/8, 7/8…), with GP5-style beaming per meter.
- Tempo, playback speed (50–200% without changing the song tempo), metronome, count-in,
  solo/mute per track, repeat signs, section markers.
- Effects: vibrato, slide, hammer-on/pull-off, palm mute, dead notes.
- Keyboard-first editing like GP5, undo/redo, copy/paste of beats and measures.
- Dark and light theme.
- Autosave in the browser, JSON import/export, and optional cloud save with email/password accounts.

## Running it

It is static HTML. Any web server works (ES modules need `http://`, not `file://`):

```sh
npm run serve      # python3 -m http.server 8080
open http://localhost:8080
```

Run the unit tests (Node 20+, no dependencies):

```sh
npm test
```

## Keyboard shortcuts

Press `?` in the app for the full list. The essentials:

| Keys | Action |
|---|---|
| `←` `→` | Previous / next beat. `→` on the last beat of an incomplete measure adds a beat; on a complete measure it moves to the next one (creating it at the end of the song). |
| `↑` `↓` | Move between strings |
| `0`–`9` | Type a fret (two digits within half a second). On drums, type the MIDI number or click the legend. |
| `+` `−` | Shorter (faster) / longer (slower) note value, as in GP5 |
| `.` `T` `R` `L` | Dot · triplet · rest · tie |
| `V` `S` `H` `P` `X` | Vibrato · slide · hammer-on · palm mute · dead note |
| `Enter` / `Shift+Enter` | Insert beat / insert measure |
| `Delete` / `Shift+Delete` / `Ctrl+Delete` | Delete note / beat / measure |
| `Ctrl+C` `Ctrl+V` (+`Shift`) | Copy / paste beat (measure) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Space` | Play from the cursor / stop |

`Ctrl` is `⌘` on macOS.

## Firebase setup (optional)

Without a config the app runs fully offline (autosave + JSON files). To enable accounts and cloud saving:

1. Create a Firebase project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method**: enable *Email/Password*. Firebase stores passwords hashed (scrypt)
   and enforces unique emails.
3. **Firestore Database**: create a database (production mode), then paste the contents of
   [`firestore.rules`](firestore.rules) in the *Rules* tab and publish. Songs live under
   `users/{uid}/songs/{songId}` and are readable/writable only by their owner.
4. **Project settings → Your apps → Web app**: register an app and copy the config object into
   [`js/storage/firebase-config.js`](js/storage/firebase-config.js).
5. **Authentication → Settings → Authorized domains**: add your GitHub Pages domain
   (`<user>.github.io`). Optionally restrict the API key to that domain in Google Cloud console →
   *APIs & Services → Credentials*.

The SDK is loaded from Google's CDN only when a cloud button is used (or a previous session exists),
so the editor stays light for everyone else. Songs are stored gzip-compressed; documents over ~900 KB
are refused with a message (use JSON export for those).

## Deploying to GitHub Pages

The repository root is the site. In the repository settings choose **Pages → Deploy from a branch →
`master` / `/ (root)`**. All URLs are relative, so it works under `https://<user>.github.io/riffmaster/`.

## Project layout

```
index.html, css/            app shell and themes (CSS custom properties)
js/model/                   song model: rational durations, time signatures, tunings, drum map,
                            editing commands, undo history, serialization
js/render/                  hand-rolled SVG engraving: layout, beaming, accidentals, tab, percussion
js/audio/                   pure-JS synthesis (synth.js), Web Audio engine, song compiler, transport
js/ui/                      toolbar, track panel, keyboard bindings, dialogs, theme
js/storage/                 localStorage autosave, JSON files, optional Firebase module
tests/                      node:test suites for the pure modules
```

## Notes on the notation

- Guitars are written on the treble clef and basses on the bass clef, both an octave above sounding
  pitch, as in GP5. No key signature: accidentals are sharps, tracked per measure with naturals.
- New beats are empty (nothing drawn) until they get a note or a rest (`R`), as in GP5. A measure
  holding a single empty beat is drawn as a whole-measure rest. Incomplete or overfull measures are
  highlighted in red (like GP5) but still play at their true positions.
- The percussion map (`js/model/drumMap.js`) is a plain table; adjust positions or noteheads there if
  your conventions differ.
