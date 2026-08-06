/* =====================================================================
   SFX — procedural sound for the terminal
   ---------------------------------------------------------------------
   No sample files. Every sound is synthesised from oscillators and
   filtered noise, for two reasons: the build ships from file:// under
   Electron (where fetching audio is a fight), and a bank of one-shot
   <audio> tags cannot overlap — the tilt maze needs a dozen impacts a
   second, each pitched by how hard the ball actually hit.

   Everything routes through one master gain so the settings slider that
   already controls the theme controls these too.

     SFX.play(name, opts)   opts: { v } 0..1 intensity where a sound uses it
     SFX.setVolume(0..100)  SFX.setEnabled(bool)  SFX.unlock()

   Unknown names are ignored on purpose: a call site can name a sound
   before it exists without breaking the scene it lives in.
   ===================================================================== */
window.SFX = (function () {
  'use strict';

  let ctx = null, master = null;
  let enabled = true, vol = 0.7;

  /* Browsers hand out a suspended AudioContext until the user has touched
     the page. Build it lazily and resume on any gesture, so nothing has to
     remember to initialise us. */
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = vol;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });
    return ctx;
  }
  ['pointerdown', 'keydown'].forEach(e =>
    addEventListener(e, () => { if (enabled) ensure(); }, { passive: true }));

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function now() { return ctx.currentTime; }

  /* ---- the two primitives everything is made of ---- */

  /** a pitched blip: optional glide, always an envelope (no clicks) */
  function tone(o) {
    const t0 = now() + (o.at || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.d);
    const peak = Math.max(0.0001, o.g === undefined ? 0.25 : o.g);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, o.d * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lp;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + o.d + 0.02);
  }

  /** a burst of filtered noise: impacts, hiss, servo air */
  function noise(o) {
    const t0 = now() + (o.at || 0);
    const len = Math.max(0.02, o.d);
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 900, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + len);
    f.Q.value = o.q === undefined ? 1.2 : o.q;
    const g = ctx.createGain();
    const peak = Math.max(0.0001, o.g === undefined ? 0.2 : o.g);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, len * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + len + 0.02);
  }

  /* ---- the vocabulary ----------------------------------------------------
     Two families, deliberately kept apart so the player can tell where they
     are with their eyes shut:
       the LAB and its menus are warm, low, mechanical — a room and a device;
       the TILT MAZE is glass and metal — bright, short, physical. */
  const BANK = {
    /* ---------- terminal / lab ---------- */
    hover: () => tone({ f: 1180, d: 0.045, type: 'triangle', g: 0.045 }),
    click: () => { tone({ f: 520, to: 760, d: 0.07, type: 'square', g: 0.055, lp: 2400 }); },
    back: () => tone({ f: 620, to: 380, d: 0.09, type: 'square', g: 0.05, lp: 2000 }),
    open: () => {                       // a panel slides up out of the desk
      tone({ f: 240, to: 520, d: 0.16, type: 'triangle', g: 0.09 });
      noise({ f: 700, to: 2200, d: 0.18, g: 0.05, q: 0.8 });
    },
    close: () => {
      tone({ f: 480, to: 200, d: 0.14, type: 'triangle', g: 0.08 });
      noise({ f: 1800, to: 500, d: 0.14, g: 0.04, q: 0.8 });
    },
    wake: () => {                       // the capsule lets you go
      tone({ f: 55, to: 120, d: 1.5, type: 'sine', g: 0.16 });
      tone({ f: 82, to: 165, d: 1.7, type: 'sine', g: 0.08, at: 0.12 });
      noise({ f: 300, to: 1600, d: 1.2, g: 0.035, q: 0.5, at: 0.3 });
    },
    door: () => {                       // the hatch ring arms, then releases
      tone({ f: 130, to: 300, d: 0.3, type: 'sawtooth', g: 0.07, lp: 900 });
      noise({ f: 380, to: 140, d: 0.7, g: 0.09, q: 0.7, at: 0.16 });
      tone({ f: 900, d: 0.05, type: 'square', g: 0.05, at: 0.14 });
    },
    pickup: () => {                     // tools, cube, letter: something in hand
      noise({ f: 1500, to: 600, d: 0.12, g: 0.09, q: 0.9 });
      tone({ f: 300, to: 220, d: 0.1, type: 'triangle', g: 0.06 });
    },
    denied: () => {                     // no 時段 left — a flat, closed sound
      tone({ f: 190, d: 0.11, type: 'square', g: 0.06, lp: 900 });
      tone({ f: 150, d: 0.14, type: 'square', g: 0.05, lp: 800, at: 0.1 });
    },
    sleep: () => tone({ f: 300, to: 70, d: 0.9, type: 'sine', g: 0.12 }),

    /* ---------- gather ---------- */
    'g.tick': () => tone({ f: 2100, d: 0.02, type: 'square', g: 0.02 }),
    'g.stop': () => noise({ f: 2600, to: 800, d: 0.07, g: 0.11, q: 1.6 }),
    'g.perfect': () => {                // the only three-note flourish in the game
      [0, 0.07, 0.15].forEach((at, i) =>
        tone({ f: [784, 1046, 1568][i], d: 0.2, type: 'triangle', g: 0.11, at }));
    },
    'g.hit': () => { tone({ f: 660, d: 0.09, type: 'triangle', g: 0.09 }); tone({ f: 990, d: 0.1, type: 'sine', g: 0.06, at: 0.05 }); },
    'g.miss': () => tone({ f: 260, to: 180, d: 0.18, type: 'sawtooth', g: 0.055, lp: 700 }),
    'g.done': () => {
      tone({ f: 392, d: 0.22, type: 'triangle', g: 0.09 });
      tone({ f: 523, d: 0.3, type: 'triangle', g: 0.08, at: 0.1 });
      noise({ f: 900, to: 300, d: 0.35, g: 0.04, q: 0.6, at: 0.1 });
    },

    /* ---------- tilt maze ----------
       These carry intensity: `v` is how hard the thing happened, so a nudge
       and a slam are the same sound at two different weights. */
    't.tilt': (o) => {                  // the plane leans: servo air, no pitch
      const v = clamp(o.v === undefined ? 1 : o.v, 0, 1);
      noise({ f: 260, to: 1100, d: 0.13, g: 0.035 + v * 0.03, q: 0.6 });
      tone({ f: 90, to: 150, d: 0.12, type: 'sine', g: 0.05 });
    },
    't.level': () => noise({ f: 900, to: 260, d: 0.12, g: 0.03, q: 0.6 }),
    't.bounce': (o) => {                // glass wall: pitch and level ride impact
      const v = clamp(o.v === undefined ? 0.5 : o.v, 0.05, 1);
      tone({ f: 320 + v * 520, to: 180 + v * 220, d: 0.05 + v * 0.05, type: 'triangle', g: 0.03 + v * 0.1 });
      noise({ f: 1800 + v * 2600, to: 700, d: 0.04 + v * 0.04, g: 0.02 + v * 0.07, q: 2.2 });
    },
    't.knock': (o) => {                 // ball against ball: woodier, no glass
      const v = clamp(o.v === undefined ? 0.5 : o.v, 0.05, 1);
      tone({ f: 240 + v * 260, to: 150, d: 0.07, type: 'sine', g: 0.04 + v * 0.1 });
      noise({ f: 1200, to: 400, d: 0.05, g: 0.02 + v * 0.04, q: 1.6 });
    },
    't.ice': () => noise({ f: 5200, to: 2600, d: 0.22, g: 0.028, q: 0.9 }),
    't.goo': () => noise({ f: 320, to: 160, d: 0.26, g: 0.05, q: 1.1, type: 'lowpass' }),
    't.switch': () => {                 // the latch: a real mechanism throwing
      tone({ f: 1500, d: 0.04, type: 'square', g: 0.07 });
      tone({ f: 700, to: 1100, d: 0.14, type: 'triangle', g: 0.07, at: 0.03 });
      noise({ f: 2400, to: 900, d: 0.08, g: 0.05, q: 1.8 });
    },
    't.near': () => tone({ f: 1320, d: 0.05, type: 'sine', g: 0.03 }),
    't.sink': () => {                   // the thought lands
      tone({ f: 880, to: 1760, d: 0.18, type: 'sine', g: 0.12 });
      tone({ f: 1320, to: 2640, d: 0.22, type: 'sine', g: 0.06, at: 0.04 });
      noise({ f: 3000, to: 600, d: 0.3, g: 0.03, q: 0.7, at: 0.05 });
    },
    't.win': () => {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ f, d: 0.28, type: 'triangle', g: 0.1, at: i * 0.075 }));
    },
    't.fail': () => {
      [392, 330, 262].forEach((f, i) =>
        tone({ f, d: 0.3, type: 'sawtooth', g: 0.07, lp: 1100, at: i * 0.11 }));
    },
    't.warn': () => tone({ f: 1000, d: 0.06, type: 'square', g: 0.045 }),
    't.start': () => {
      tone({ f: 200, to: 400, d: 0.2, type: 'triangle', g: 0.08 });
      tone({ f: 600, d: 0.08, type: 'square', g: 0.05, at: 0.18 });
    }
  };

  function play(name, opts) {
    if (!enabled) return;
    const fn = BANK[name];
    if (!fn) return;
    if (!ensure() || ctx.state !== 'running') return;
    try { fn(opts || {}); } catch (e) { /* a dropped sound must never stop the game */ }
  }

  return {
    play,
    setEnabled(on) {
      enabled = !!on;
      if (!enabled && ctx) master.gain.value = 0;
      else if (ctx) master.gain.value = vol;
    },
    setVolume(v) {
      vol = clamp(Number(v) / 100, 0, 1);
      if (ctx && enabled) master.gain.value = vol;
    },
    unlock() { if (enabled) ensure(); },
    get enabled() { return enabled; },
    // for the console: whether the browser has actually let us make noise yet
    get state() { return ctx ? ctx.state : 'none'; }
  };
})();
