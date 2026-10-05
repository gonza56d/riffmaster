// Glue between the app and the audio engine/transport.
import { Engine } from './engine.js';
import { Transport } from './transport.js';
import { compileSong } from './compiler.js';

export function installPlayer(app) {
  const engine = new Engine();
  let compiled = null;
  let dirty = true;

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

  const cursorPos = () => {
    const c = ensureCompiled();
    const beats = c.trackBeats[app.cursor.track] || [];
    const hit = beats.find((b) => b.mi === app.cursor.measure && b.bi === app.cursor.beat);
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
    statusText() { return transport.playing ? `Playing · ${Math.round(app.speed * 100)}%` : ''; },
    engine, transport,
  };
}
