'use strict';
window.PB = window.PB || {};
(function (PB) {
  const U = (PB.U = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  U.fmt = (n) => Math.floor(n).toLocaleString('en-US');
  U.ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  };

  U.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('ddpin_' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('ddpin_' + k, JSON.stringify(v));
      } catch (e) {}
    },
  };

  // ---------- Settings ----------
  const DEFAULTS = {
    master: 0.5,
    music: 0.6,
    sfx: 0.6,
    shake: true,
    flashes: true,
    trail: true,
    balls: 3,
    fps: false,
    haptics: true,
    quality: 'auto',
    bloom: true,
    camera: 'player',
  };
  PB.settings = Object.assign({}, DEFAULTS, U.store.get('settings', {}));
  PB.saveSettings = () => U.store.set('settings', PB.settings);
  PB.resetSettings = () => {
    Object.assign(PB.settings, DEFAULTS);
    PB.saveSettings();
  };

  // ---------- High scores ----------
  const DEFAULT_SCORES = [
    { name: 'AZG', score: 12000000, hero: 'demon' },
    { name: 'JON', score: 6000000, hero: 'paladin' },
    { name: 'CLD', score: 3000000, hero: 'crusader' },
    { name: 'GOB', score: 1500000, hero: 'paladin' },
    { name: 'SKL', score: 600000, hero: 'crusader' },
  ];
  PB.getScores = () => U.store.get('scores', DEFAULT_SCORES).slice(0, 5);
  PB.isHighScore = (s) => {
    const sc = PB.getScores();
    return sc.length < 5 || s > sc[sc.length - 1].score;
  };
  PB.addScore = (name, score, hero) => {
    const sc = PB.getScores();
    sc.push({ name, score, hero });
    sc.sort((a, b) => b.score - a.score);
    U.store.set('scores', sc.slice(0, 5));
  };
  PB.resetScores = () => U.store.set('scores', DEFAULT_SCORES);

  PB.BUILD = { date: 'October 18, 2026', version: '1.0' };
})(window.PB);
