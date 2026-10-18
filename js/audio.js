'use strict';
(function (PB) {
  // Fully synthesized audio: every sound effect and the music are generated with WebAudio.
  const A = (PB.Audio = { ctx: null, ready: false, last: {}, voices: 0 });
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    buildGraph(A.ctx);
    A.ready = true;
    A.applyVolumes();
    Music.init();
  };


  function buildGraph(ctx, raw) {
    A.comp = ctx.createDynamicsCompressor();
    A.comp.threshold.value = -16;
    A.comp.knee.value = 12;
    A.comp.ratio.value = 5;
    A.comp.attack.value = 0.003;
    A.comp.release.value = 0.2;
    A.master = ctx.createGain();
    A.sfx = ctx.createGain();
    A.music = ctx.createGain();
    A.sfx.connect(A.master);
    A.music.connect(A.master);
    if (raw) A.master.connect(ctx.destination);
    else {
      A.master.connect(A.comp);
      A.comp.connect(ctx.destination);
    }
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    A.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // simple reverb (generated impulse) for dungeon ambience
    A.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3.2);
    }
    A.verb.buffer = ir;
    A.verbGain = ctx.createGain();
    A.verbGain.gain.value = 0.22;
    A.verb.connect(A.verbGain);
    A.verbGain.connect(A.master);
  }

  A.applyVolumes = function () {
    if (!A.ready) return;
    const s = PB.settings, t = A.ctx.currentTime;
    // perceptual curve; internal trims keep music and sfx at a similar loudness
    A.master.gain.setTargetAtTime(PB.muted ? 0 : Math.pow(s.master, 2) * 0.9, t, 0.03);
    A.sfx.gain.setTargetAtTime(Math.pow(s.sfx, 2) * 1.0, t, 0.03);
    A.music.gain.setTargetAtTime(Math.pow(s.music, 2) * 0.55, t, 0.03);
  };

  // ---------- primitives ----------
  function env(g, t, a, peak, dec, sus = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec);
  }
  function out(bus, verb) {
    const g = A.ctx.createGain();
    g.connect(bus || A.cur || A.sfx);
    if (verb) {
      const v = A.ctx.createGain();
      v.gain.value = verb;
      g.connect(v);
      v.connect(A.verb);
    }
    return g;
  }
  // Tone: oscillator with envelope + optional pitch slide and filter
  function tone(o) {
    const ctx = A.ctx, t = (o.t ?? ctx.currentTime) + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t + (o.slide ?? o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    env(g, t, o.a ?? 0.004, o.v ?? 0.2, o.dur, o.sus);
    if (o.sus) g.gain.exponentialRampToValueAtTime(0.0001, t + (o.a ?? 0.004) + o.dur + 0.045);
    let node = osc;
    if (o.lp || o.bp || o.hp) {
      const f = ctx.createBiquadFilter();
      f.type = o.lp ? 'lowpass' : o.bp ? 'bandpass' : 'highpass';
      f.frequency.setValueAtTime(o.lp || o.bp || o.hp, t);
      if (o.fto) f.frequency.exponentialRampToValueAtTime(o.fto, t + o.dur);
      f.Q.value = o.q ?? 1;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out(o.bus, o.verb));
    osc.start(t);
    osc.stop(t + (o.a ?? 0.004) + o.dur + 0.05);
    return osc;
  }
  function noise(o) {
    const ctx = A.ctx, t = (o.t ?? ctx.currentTime) + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = A.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    env(g, t, o.a ?? 0.002, o.v ?? 0.2, o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(out(o.bus, o.verb));
    src.start(t, Math.random() * 1.5);
    src.stop(t + (o.a ?? 0.002) + o.dur + 0.05);
  }
  A.tone = tone;
  A.noise = noise;

  // throttle identical sounds
  function gate(name, ms) {
    const now = performance.now();
    if (A.last[name] && now - A.last[name] < ms) return false;
    A.last[name] = now;
    return true;
  }

  const SFX = {
    flipUp() {
      noise({ f: 2200, q: 0.8, v: 0.16, dur: 0.035 });
      tone({ type: 'square', f: 110, to: 55, dur: 0.05, v: 0.07, lp: 600 });
    },
    flipDown() { noise({ f: 1400, q: 1, v: 0.07, dur: 0.03 }); },
    bumper(i = 0) {
      const base = [196, 233, 175][i % 3];
      tone({ type: 'sine', f: base * 1.5, to: 60, dur: 0.2, v: 0.38 });
      tone({ type: 'square', f: base * 3, dur: 0.04, v: 0.05, lp: 2500 });
      noise({ type: 'lowpass', f: 1800, to: 300, v: 0.14, dur: 0.22, verb: 0.15 });
    },
    sling() {
      noise({ type: 'highpass', f: 2500, v: 0.16, dur: 0.05 });
      tone({ type: 'triangle', f: 380, to: 120, dur: 0.09, v: 0.26 });
    },
    rubber(v = 0.5) { tone({ type: 'sine', f: 300 + Math.random() * 60, to: 140, dur: 0.06, v: 0.12 * v }); },
    wall(v = 0.5) { noise({ type: 'lowpass', f: 700, v: 0.12 * v, dur: 0.04 }); },
    flipperHit(v = 0.5) { tone({ type: 'sine', f: 140, to: 70, dur: 0.05, v: 0.14 * v }); },
    ballClack() { tone({ type: 'sine', f: 2400, to: 1800, dur: 0.03, v: 0.1 }); noise({ type: 'highpass', f: 4000, v: 0.08, dur: 0.02 }); },
    rollover() {
      tone({ type: 'sine', f: 1320, dur: 0.07, v: 0.14 });
      tone({ type: 'sine', f: 1980, dur: 0.06, v: 0.08, delay: 0.04 });
    },
    laneComplete() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.18, v: 0.16, delay: i * 0.06, verb: 0.3 }));
    },
    drop() {
      noise({ type: 'lowpass', f: 1400, v: 0.24, dur: 0.05 });
      tone({ type: 'square', f: 220, to: 70, dur: 0.12, v: 0.09, lp: 900 });
    },
    standup() {
      tone({ type: 'square', f: 880, dur: 0.035, v: 0.08, lp: 3000 });
      noise({ type: 'bandpass', f: 3000, v: 0.12, dur: 0.03 });
      tone({ type: 'sine', f: 660, dur: 0.12, v: 0.12, delay: 0.02 });
    },
    spinner() { tone({ type: 'square', f: 1600 + Math.random() * 300, dur: 0.012, v: 0.05, lp: 4000 }); },
    clang() {
      const f0 = 520 + Math.random() * 60;
      [1, 2.76, 5.4, 8.93].forEach((m, i) => tone({ type: 'sine', f: f0 * m, dur: 0.5 / (i + 1) + 0.05, v: 0.14 / (i + 1), verb: 0.25 }));
      noise({ type: 'highpass', f: 3500, v: 0.18, dur: 0.06 });
    },
    grunt(kind) {
      const p = { goblin: [300, 180], skeleton: [0, 0], cyclops: [95, 60], mimic: [150, 80], demon: [65, 40] }[kind] || [200, 100];
      if (kind === 'skeleton') {
        for (let i = 0; i < 6; i++) noise({ type: 'bandpass', f: 1800 + Math.random() * 1500, q: 6, v: 0.18, dur: 0.03, delay: i * 0.035 + Math.random() * 0.01 });
        return;
      }
      tone({ type: 'sawtooth', f: p[0], to: p[1], dur: 0.28, v: 0.16, bp: kind === 'goblin' ? 1100 : 600, q: 3, verb: 0.2 });
      tone({ type: 'sawtooth', f: p[0] * 1.01, to: p[1], dur: 0.28, v: 0.08, lp: 900, detune: 15 });
      if (kind === 'mimic') noise({ type: 'lowpass', f: 900, v: 0.25, dur: 0.06, delay: 0.12 });
      if (kind === 'demon') noise({ type: 'lowpass', f: 400, to: 120, v: 0.22, dur: 0.4, verb: 0.3 });
    },
    roar(kind) {
      const base = { goblin: 260, skeleton: 400, cyclops: 90, mimic: 140, demon: 55 }[kind] || 120;
      tone({ type: 'sawtooth', f: base * 1.3, to: base * 0.4, dur: 1.1, v: 0.2, lp: 1200, fto: 200, a: 0.05, verb: 0.4 });
      tone({ type: 'sawtooth', f: base * 1.32, to: base * 0.38, dur: 1.1, v: 0.12, lp: 900, detune: 25, a: 0.05 });
      noise({ type: 'lowpass', f: 1500, to: 150, v: 0.22, dur: 1.0, a: 0.05, verb: 0.4 });
    },
    coin(n = 1) {
      for (let i = 0; i < n; i++) {
        const d = i * 0.07 + Math.random() * 0.02;
        tone({ type: 'sine', f: 1976, dur: 0.06, v: 0.1, delay: d });
        tone({ type: 'sine', f: 2637, dur: 0.18, v: 0.1, delay: d + 0.05 });
      }
    },
    saucerIn() {
      tone({ type: 'sine', f: 180, to: 60, dur: 0.25, v: 0.3 });
      noise({ type: 'lowpass', f: 600, v: 0.18, dur: 0.12 });
    },
    kickout() {
      tone({ type: 'sine', f: 120, to: 50, dur: 0.15, v: 0.34 });
      noise({ type: 'bandpass', f: 900, v: 0.2, dur: 0.06 });
    },
    lock() {
      [110, 220, 277, 330, 415].forEach((f, i) => tone({ type: 'sine', f, dur: 2.0 - i * 0.2, v: 0.16 / (1 + i * 0.3), a: 0.005, verb: 0.5 }));
      noise({ type: 'lowpass', f: 300, v: 0.15, dur: 0.6, verb: 0.4 });
    },
    fanfare(minor) {
      const chords = minor
        ? [[50, 53, 57, 62], [46, 50, 53, 58], [48, 52, 55, 60], [50, 54, 57, 62]]
        : [[50, 54, 57, 62], [55, 59, 62, 67], [57, 61, 64, 69], [62, 66, 69, 74]];
      chords.forEach((ch, ci) => {
        ch.forEach((n) => {
          tone({ type: 'sawtooth', f: NOTE(n), dur: ci === 3 ? 1.1 : 0.22, v: 0.07, lp: 2200, delay: ci * 0.2, a: 0.01, verb: 0.35 });
          tone({ type: 'square', f: NOTE(n) * 1.003, dur: ci === 3 ? 1.1 : 0.22, v: 0.03, lp: 1600, delay: ci * 0.2, a: 0.01 });
        });
        tone({ type: 'sine', f: 70, to: 40, dur: 0.15, v: 0.3, delay: ci * 0.2 });
      });
    },
    jackpot() {
      SFX.fanfare(false);
      [1046, 1318, 1568, 2093, 2637, 3136].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.4, v: 0.1, delay: 0.7 + i * 0.05, verb: 0.5 }));
      SFX.coin(4);
    },
    ballSave() {
      [1318, 1568, 2093, 2637].forEach((f, i) => tone({ type: 'sine', f, dur: 0.8, v: 0.12, delay: i * 0.08, verb: 0.6 }));
    },
    drain() {
      [440, 370, 311, 220].forEach((f, i) => tone({ type: 'square', f, dur: 0.22, v: 0.07, lp: 1200, delay: i * 0.16 }));
      tone({ type: 'sine', f: 110, to: 40, dur: 0.9, v: 0.25, delay: 0.5 });
    },
    tiltWarn() { tone({ type: 'square', f: 110, dur: 0.3, v: 0.12, lp: 900 }); tone({ type: 'square', f: 116, dur: 0.3, v: 0.08, lp: 900 }); },
    tilt() { tone({ type: 'sawtooth', f: 80, dur: 1.4, v: 0.18, lp: 600 }); tone({ type: 'sawtooth', f: 84, dur: 1.4, v: 0.14, lp: 600 }); },
    plungeCharge() {
      A._charge = tone({ type: 'triangle', f: 90, to: 360, slide: 1.0, dur: 1.2, v: 0.06, a: 0.05, sus: 0.03 });
    },
    plungeRelease(power) {
      try { A._charge && A._charge.stop(); } catch (e) {}
      noise({ type: 'bandpass', f: 1200, v: 0.12 + power * 0.18, dur: 0.06 });
      tone({ type: 'sine', f: 140, to: 50, dur: 0.12, v: 0.2 + power * 0.15 });
    },
    levelUp() {
      [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.25, v: 0.12, delay: i * 0.07, verb: 0.4 }));
    },
    relic() {
      [587, 740, 880, 1175, 1480, 1760].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.7, v: 0.1, delay: i * 0.09, verb: 0.5 }));
    },
    select() { tone({ type: 'triangle', f: 880, dur: 0.05, v: 0.1 }); tone({ type: 'triangle', f: 1320, dur: 0.06, v: 0.08, delay: 0.04 }); },
    confirm() { [660, 990, 1320].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.12, v: 0.12, delay: i * 0.05 })); },
    uiTick() { tone({ type: 'sine', f: 1200, dur: 0.03, v: 0.06 }); },
    aegis() {
      [62, 66, 69, 74, 78].forEach((n, i) => {
        tone({ type: 'sawtooth', f: NOTE(n), dur: 1.6, v: 0.05, lp: 1400, a: 0.35, verb: 0.6, detune: 8 });
        tone({ type: 'sawtooth', f: NOTE(n), dur: 1.6, v: 0.04, lp: 1400, a: 0.35, detune: -8 });
      });
      SFX.ballSave();
    },
    rage() {
      for (let i = 0; i < 4; i++) {
        tone({ type: 'sine', f: 90, to: 40, dur: 0.25, v: 0.4, delay: i * 0.16 });
        noise({ type: 'lowpass', f: 500, v: 0.18, dur: 0.1, delay: i * 0.16 });
      }
      tone({ type: 'sawtooth', f: NOTE(38), dur: 1.2, v: 0.12, lp: 700, a: 0.1, delay: 0.5, verb: 0.4 });
      tone({ type: 'sawtooth', f: NOTE(45), dur: 1.2, v: 0.09, lp: 700, a: 0.1, delay: 0.5 });
    },
    extraBall() {
      [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'square', f, dur: 0.16, v: 0.06, lp: 3000, delay: i * 0.09 }));
      [1568, 1976, 2349].forEach((f, i) => tone({ type: 'sine', f, dur: 1.0, v: 0.08, delay: 0.4 + i * 0.03, verb: 0.5 }));
    },
    skillShot() {
      noise({ type: 'bandpass', f: 400, to: 4000, v: 0.12, dur: 0.4, q: 2 });
      [1046, 1568, 2093].forEach((f, i) => tone({ type: 'sine', f, dur: 0.5, v: 0.1, delay: 0.3 + i * 0.05, verb: 0.5 }));
    },
    combo(n) {
      const f = 440 * Math.pow(2, Math.min(n, 12) / 12);
      tone({ type: 'square', f, dur: 0.1, v: 0.06, lp: 2400 });
      tone({ type: 'square', f: f * 1.5, dur: 0.18, v: 0.05, lp: 2400, delay: 0.08 });
    },
    shrine() {
      noise({ type: 'bandpass', f: 300, to: 2400, v: 0.1, dur: 0.6, q: 4, verb: 0.5 });
      [880, 1109, 1319].forEach((f, i) => tone({ type: 'sine', f, dur: 1.0, v: 0.09, delay: 0.2 + i * 0.12, verb: 0.6 }));
    },
    orbit() {
      noise({ type: 'bandpass', f: 600, to: 2600, v: 0.1, dur: 0.25, q: 2 });
      tone({ type: 'triangle', f: 784, dur: 0.12, v: 0.1, delay: 0.1 });
    },
    crit() { SFX.clang(); tone({ type: 'sawtooth', f: 1200, to: 200, dur: 0.3, v: 0.08, lp: 3000 }); },
    fireball() { noise({ type: 'lowpass', f: 2000, to: 200, v: 0.18, dur: 0.6, verb: 0.3 }); },
    gameOver() {
      [62, 61, 60, 59, 58, 50].forEach((n, i) => tone({ type: 'triangle', f: NOTE(n), dur: i === 5 ? 1.8 : 0.35, v: 0.12, delay: i * 0.3, verb: 0.5 }));
    },
    bonusTick() { tone({ type: 'square', f: 1400, dur: 0.02, v: 0.05, lp: 3000 }); },
    rampUp() {
      noise({ type: 'bandpass', f: 500, to: 2600, q: 3, v: 0.12, dur: 0.6 });
      for (let i = 0; i < 8; i++) tone({ type: 'square', f: 900 + i * 90, dur: 0.02, v: 0.03, lp: 3000, delay: i * 0.06 });
    },
    rampTop() { [988, 1319, 1760].forEach((f, i) => tone({ type: 'sine', f, dur: 0.5, v: 0.08, delay: i * 0.05, verb: 0.5 })); },
    rampDown() {
      for (let i = 0; i < 6; i++) tone({ type: 'square', f: 1400 - i * 120, dur: 0.02, v: 0.03, lp: 3000, delay: i * 0.05 });
      tone({ type: 'sine', f: 160, to: 60, dur: 0.14, v: 0.25, delay: 0.3 });
    },
    rampFail() { noise({ type: 'bandpass', f: 1800, to: 400, q: 3, v: 0.1, dur: 0.5 }); },
    dragonRoar() {
      tone({ type: 'sawtooth', f: 70, to: 38, dur: 1.4, v: 0.22, lp: 900, fto: 160, a: 0.08, verb: 0.5 });
      tone({ type: 'sawtooth', f: 105, to: 52, dur: 1.3, v: 0.12, lp: 700, a: 0.08, detune: 30 });
      noise({ type: 'bandpass', f: 900, to: 220, q: 0.8, v: 0.25, dur: 1.3, a: 0.06, verb: 0.5 });
      noise({ type: 'lowpass', f: 300, v: 0.2, dur: 0.9, a: 0.2 });
    },
    squeak() {
      const f = 2600 + Math.random() * 900;
      tone({ type: 'sine', f, to: f * 1.4, dur: 0.06, v: 0.07 });
      tone({ type: 'sine', f: f * 1.2, to: f * 0.9, dur: 0.07, v: 0.06, delay: 0.08 });
    },
    splat() {
      noise({ type: 'lowpass', f: 900, to: 200, v: 0.3, dur: 0.18 });
      tone({ type: 'sine', f: 3200, to: 1800, dur: 0.09, v: 0.06 });
      tone({ type: 'sine', f: 120, to: 50, dur: 0.12, v: 0.22 });
    },
    egg() {
      tone({ type: 'triangle', f: 1400, dur: 0.05, v: 0.12 });
      noise({ type: 'highpass', f: 3000, v: 0.12, dur: 0.05 });
      tone({ type: 'sine', f: 660, to: 990, dur: 0.15, v: 0.1, delay: 0.03 });
    },
    lift() {
      tone({ type: 'sawtooth', f: 80, to: 320, dur: 0.7, v: 0.1, lp: 900, a: 0.02 });
      noise({ type: 'bandpass', f: 400, to: 3000, q: 2, v: 0.12, dur: 0.7 });
      [880, 1175, 1568].forEach((f, i) => tone({ type: 'sine', f, dur: 0.4, v: 0.07, delay: 0.5 + i * 0.06, verb: 0.5 }));
    },
    toast() { [1175, 1568, 2349].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.35, v: 0.08, delay: i * 0.07, verb: 0.4 })); },
    start() {
      [50, 57, 62, 65, 69, 74].forEach((n, i) => tone({ type: 'triangle', f: NOTE(n), dur: 0.5, v: 0.11, delay: i * 0.08, verb: 0.5 }));
      tone({ type: 'sine', f: 60, to: 35, dur: 0.6, v: 0.35 });
    },
  };


  // Per-sound loudness trims (measured with A.measure() so every effect sits at a similar level)
  // Measured RMS (dBFS) -> trims toward ~-32 dB (mechanical), ~-27 (gameplay), ~-23 (big events)
  const TRIM = {
    flipUp: 2.0, flipDown: 4, bumper: 0.5, sling: 1.2, rubber: 1.5, wall: 4, flipperHit: 1.3, ballClack: 2.2,
    rollover: 1.7, laneComplete: 1.3, drop: 2, standup: 1.75, spinner: 4.5, clang: 0.88, grunt: 2.1, roar: 1,
    coin: 1.45, saucerIn: 0.65, kickout: 0.76, lock: 0.57, fanfare: 0.76, jackpot: 0.83, ballSave: 0.84, drain: 0.61,
    tiltWarn: 0.9, tilt: 0.76, plungeCharge: 0.75, plungeRelease: 0.7, levelUp: 1.68, relic: 1.35, select: 2.3,
    confirm: 1.25, uiTick: 3.2, aegis: 1, rage: 0.76, extraBall: 1.25, skillShot: 1.2, combo: 2.2, shrine: 1.1,
    orbit: 2.8, crit: 0.95, fireball: 2.4, gameOver: 1.15, bonusTick: 3.6, start: 0.57,
  };
  A.TRIM = TRIM;
  A.SFX = SFX;
  // Dev tool: render each effect offline and report loudness (dBFS of loudest 120 ms window)
  A.measure = async function (names, args = {}) {
    const saved = { ctx: A.ctx, comp: A.comp, master: A.master, sfx: A.sfx, music: A.music, noiseBuf: A.noiseBuf, verb: A.verb, verbGain: A.verbGain };
    const out = {};
    for (const n of names || Object.keys(SFX)) {
      const off = new OfflineAudioContext(1, 44100 * 3, 44100);
      A.ctx = off;
      buildGraph(off, true);
      if (TRIM[n] && TRIM[n] !== 1) { A.cur = off.createGain(); A.cur.gain.value = TRIM[n]; A.cur.connect(A.sfx); }
      try { SFX[n](...(args[n] || [])); } catch (e) { out[n] = 'ERR ' + e.message; continue; }
      A.cur = null;
      const buf = await off.startRendering();
      const d = buf.getChannelData(0);
      const W = 5292;
      let best = 0, acc = 0, peak = 0;
      for (let i = 0; i < d.length; i++) {
        acc += d[i] * d[i];
        if (i >= W) acc -= d[i - W] * d[i - W];
        if (acc > best) best = acc;
        peak = Math.max(peak, Math.abs(d[i]));
      }
      out[n] = { rms: +(10 * Math.log10(best / W + 1e-12)).toFixed(1), peak: +(20 * Math.log10(peak + 1e-12)).toFixed(1) };
    }
    Object.assign(A, saved);
    return out;
  };

  const GATES = { spinner: 28, rubber: 40, wall: 50, flipperHit: 60, coin: 40, bumper: 35, rollover: 50, standup: 40, ballClack: 60, drop: 30, bonusTick: 30 };
  A.play = function (name, ...args) {
    if (!A.ready || !SFX[name]) return;
    if (A.ctx.state !== 'running') return;
    if (!gate(name, GATES[name] || 25)) return;
    try {
      const trim = TRIM[name] ?? 1;
      if (trim !== 1) {
        A.cur = A.ctx.createGain();
        A.cur.gain.value = trim;
        A.cur.connect(A.sfx);
      }
      SFX[name](...args);
    } catch (e) { /* never let audio break the game */ }
    A.cur = null;
  };

  // ---------- Music: procedural dungeon soundtrack ----------
  const Music = (A.Music = {
    mode: 'none', step: 0, nextTime: 0, timer: null, bar: 0,
    init() {
      this.timer = setInterval(() => this.schedule(), 30);
    },
    set(mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      this.step = 0;
      this.bar = 0;
      if (A.ready) this.nextTime = A.ctx.currentTime + 0.08;
    },
    schedule() {
      if (!A.ready || this.mode === 'none' || A.ctx.state !== 'running') return;
      const song = SONGS[this.mode];
      if (!song) return;
      const ctx = A.ctx;
      if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
      const spb = 60 / song.bpm / 4; // 16th notes
      while (this.nextTime < ctx.currentTime + 0.15) {
        song.play(this.step, this.bar, this.nextTime, spb);
        this.step++;
        if (this.step % 16 === 0) this.bar++;
        this.nextTime += spb;
      }
    },
  });

  const mb = () => A.music;
  function bass(n, t, d, v = 0.18) {
    tone({ t, type: 'sawtooth', f: NOTE(n), dur: d, v, lp: 420, fto: 160, q: 2, bus: mb() });
    tone({ t, type: 'sine', f: NOTE(n - 12), dur: d, v: v * 0.9, bus: mb() });
  }
  function pluck(n, t, d, v = 0.08) {
    tone({ t, type: 'triangle', f: NOTE(n), dur: d, v, bus: mb(), verb: 0.35 });
    tone({ t, type: 'square', f: NOTE(n), dur: d * 0.4, v: v * 0.25, lp: 1800, bus: mb() });
  }
  function pad(notes, t, d, v = 0.03) {
    notes.forEach((n) => {
      tone({ t, type: 'sawtooth', f: NOTE(n), dur: d, v, lp: 800, a: d * 0.35, sus: v * 0.5, bus: mb(), verb: 0.5, detune: 7 });
      tone({ t, type: 'sawtooth', f: NOTE(n), dur: d, v: v * 0.8, lp: 700, a: d * 0.35, sus: v * 0.4, bus: mb(), detune: -7 });
    });
  }
  function kick(t, v = 0.32) { tone({ t, type: 'sine', f: 130, to: 38, dur: 0.16, v, bus: mb() }); }
  function snare(t, v = 0.12) { noise({ t, type: 'bandpass', f: 1800, q: 0.7, v, dur: 0.12, bus: mb(), verb: 0.2 }); tone({ t, type: 'triangle', f: 210, to: 120, dur: 0.06, v: v * 0.8, bus: mb() }); }
  function hat(t, v = 0.04) { noise({ t, type: 'highpass', f: 7000, v, dur: 0.03, bus: mb() }); }
  function tom(t, n, v = 0.25) { tone({ t, type: 'sine', f: NOTE(n), to: NOTE(n) * 0.5, dur: 0.3, v, bus: mb(), verb: 0.3 }); }

  // chord progressions (midi roots + chord tones)
  const PROG_MAIN = [
    { root: 38, ch: [50, 53, 57] }, // Dm
    { root: 34, ch: [46, 50, 53] }, // Bb
    { root: 36, ch: [48, 52, 55] }, // C
    { root: 33, ch: [45, 49, 52] }, // A
  ];
  const PROG_BOSS = [
    { root: 38, ch: [50, 53, 57] },
    { root: 39, ch: [51, 55, 58] }, // Eb (phrygian dread)
    { root: 38, ch: [50, 53, 57] },
    { root: 37, ch: [49, 52, 55] }, // C#dim
  ];
  const MEL = [0, 2, 1, 2, 0, 1, 2, 1]; // arp index pattern
  const SONGS = {
    title: {
      bpm: 64,
      play(s, bar, t, spb) {
        const c = PROG_MAIN[bar % 4];
        const i = s % 16;
        if (i === 0) { pad(c.ch.map((n) => n - 12), t, spb * 16, 0.022); bass(c.root, t, spb * 14, 0.1); }
        if (i % 4 === 2 && Math.random() < 0.7) pluck(c.ch[MEL[(s >> 2) % 8]] + 12, t, 0.9, 0.05);
      },
    },
    normal: {
      bpm: 100,
      play(s, bar, t, spb) {
        const c = PROG_MAIN[bar % 4];
        const i = s % 16;
        if (i === 0) pad(c.ch, t, spb * 16, 0.016);
        if (i % 4 === 0) bass(c.root + (i === 8 ? 12 : 0), t, spb * 2.5, 0.12);
        if (i === 6 || i === 14) bass(c.root + 7, t, spb * 1.5, 0.08);
        if (i % 2 === 0) pluck(c.ch[MEL[(i >> 1) % 8]] + 12, t, spb * 2, 0.045);
        if (i === 0 || i === 10) kick(t, 0.22);
        if (i === 4 || i === 12) snare(t, 0.07);
        if (i % 2 === 1) hat(t, 0.022);
        if (bar % 8 >= 4 && (i === 3 || i === 11)) pluck(c.ch[2] + 24, t, spb * 3, 0.03);
      },
    },
    multiball: {
      bpm: 144,
      play(s, bar, t, spb) {
        const c = PROG_MAIN[(bar >> 0) % 4];
        const i = s % 16;
        if (i === 0) pad(c.ch.map((n) => n + 12), t, spb * 16, 0.014);
        if (i % 2 === 0) bass(c.root + (i % 4 === 2 ? 12 : 0), t, spb * 1.4, 0.12);
        pluck(c.ch[(i * 7) % 3] + 24 - (i % 3 === 0 ? 12 : 0), t, spb * 1.3, 0.035);
        if (i % 4 === 0) kick(t, 0.26);
        if (i === 4 || i === 12) snare(t, 0.09);
        hat(t, i % 2 ? 0.02 : 0.03);
      },
    },
    boss: {
      bpm: 118,
      play(s, bar, t, spb) {
        const c = PROG_BOSS[bar % 4];
        const i = s % 16;
        if (i === 0) pad(c.ch.map((n) => n - 12), t, spb * 16, 0.024);
        if (i % 2 === 0) bass(c.root, t, spb * 1.2, i % 8 === 0 ? 0.15 : 0.09);
        if (i === 0 || i === 3 || i === 8 || i === 11) kick(t, 0.28);
        if (i === 4 || i === 12) snare(t, 0.1);
        if (i === 14 || i === 15) tom(t, 45 - (i - 14) * 3, 0.16);
        if (i % 4 === 2) pluck(c.ch[(bar + (i >> 2)) % 3] + 12, t, spb * 3, 0.04);
        if (i % 2 === 1) hat(t, 0.02);
      },
    },
    victory: {
      bpm: 120,
      play(s, bar, t, spb) {
        const prog = [{ root: 38, ch: [50, 54, 57] }, { root: 43, ch: [55, 59, 62] }, { root: 45, ch: [57, 61, 64] }, { root: 38, ch: [62, 66, 69] }];
        const c = prog[bar % 4];
        const i = s % 16;
        if (i === 0) pad(c.ch, t, spb * 16, 0.02);
        if (i % 4 === 0) bass(c.root, t, spb * 3, 0.12);
        if (i % 2 === 0) pluck(c.ch[(i >> 1) % 3] + 12, t, spb * 2, 0.05);
        if (i % 8 === 0) kick(t, 0.22);
        if (i % 8 === 4) snare(t, 0.08);
      },
    },
  };
})(window.PB);
