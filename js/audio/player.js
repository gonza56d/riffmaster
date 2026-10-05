// Glue between the app and the audio engine/transport.
import { Engine } from './engine.js';
import { Transport } from './transport.js';
import { compileSong } from './compiler.js';
import { isDrums, tempoAt } from '../model/song.js';
import { beatLength, toNumber } from '../model/duration.js';

export function installPlayer(app) {
  const engine = new Engine();
  let compiled = null;
  let dirty = true;
  let lastPreview = null;

  const transport = new Transport(engine, {
    onBeat: (b) => { if (b) app.view.setPlayhead(b.mi, b.bi); },
    onStart: () => { app.toolbar.update(); app.updateStatus(); },
    onStop: ({ beat, reason }) => {
      app.view.setPlayhead(null);
      if (beat && reason === 'user') app.nav((song, c) => ({ ...c, measure: beat.mi, beat: beat.bi }));
      app.toolbar.update();
      app.updateStatus();
    },
  });

  const ensureCompiled = () => {
    if (dirty || !compiled) { compiled = compileSong(app.song); dirty = false; }
    transport.viewTrack = app.cursor.track;
    transport.load(app.song, compiled);
    return compiled;
  };

  /** Playback starts at the selection's first beat, else at the cursor. */
  const cursorPos = () => {
    const c = ensureCompiled();
    const at = app.selection()?.from ?? app.cursor;
    const beats = c.trackBeats[app.cursor.track] || [];
    const hit = beats.find((b) => b.mi === at.measure && b.bi === at.beat);
    return hit ? hit.pos : 0;
  };

  app.player = {
    get playing() { return transport.playing; },
    toggle() { transport.playing ? this.stop() : this.play(); },
    play() {
      engine.ensure();
      try { engine.warm(app.song); } catch (e) { console.warn('warm failed', e); }
      transport.setMetronome(app.metronomeOn);
      transport.speed = app.speed;
      transport.play(cursorPos(), { countIn: app.countIn });
    },
    stop() { transport.stop({ reason: 'user' }); },
    setSpeed(speed) { transport.setSpeed(speed); },
    setMetronome(on) { transport.setMetronome(on); },
    songChanged() {
      dirty = true;
      if (transport.playing) ensureCompiled();
      else transport.viewTrack = app.cursor.track;
    },
    mixChanged() { if (engine.ctx) engine.setMix(app.song); },
    /** Sound one note right away for its beat's length (0.3–1.5 s); a newer preview cuts the previous one. */
    preview(track, beat, note, mi) {
      engine.ensure();
      if (lastPreview) engine.cancel(lastPreview);
      const seconds = Math.min(1.5, Math.max(0.3, (toNumber(beatLength(beat)) * 240) / tempoAt(app.song, mi)));
      // You hear the track you are editing even if it is muted for playback.
      if (!transport.playing) engine.chain(track).volume.gain.setValueAtTime(track.volume, engine.now);
      const midi = isDrums(track) ? note.fret : track.tuning[note.string] + note.fret;
      lastPreview = engine.playNote(track, { midi, string: note.string, fret: note.fret, effects: note.effects ?? null }, engine.now + 0.005, seconds);
    },
    statusText() { return transport.playing ? `Playing · ${Math.round(app.speed * 100)}%` : ''; },
    engine, transport,
  };
}
