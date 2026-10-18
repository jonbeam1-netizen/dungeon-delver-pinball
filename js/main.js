'use strict';
(function (PB) {
  const $ = (id) => document.getElementById(id);
  const U = PB.U;
  PB.PORTRAITS = {};
  PB.monsterDots = {};

  function layout() {
    if (!PB.render) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const app = $('app');
    const dmdBox = $('dmdBox');
    const R = PB.render;
    const full = PB.UI && ['ovTitle', 'ovMenu', 'ovHero'].includes(PB.UI.overlay);
    R.insetL = R.insetR = R.insetT = 0;
    if (full) {
      app.className = 'full';
    } else if (vw / vh > 1.05 && vw >= 760) {
      app.className = 'wide';
      const panelW = U.clamp(vw * 0.2, 210, 320);
      $('left').style.width = $('right').style.width = panelW + 'px';
      if (dmdBox.parentElement !== $('dmdSide')) $('dmdSide').appendChild(dmdBox);
      R.insetL = R.insetR = (panelW + 18) / vw;
    } else {
      app.className = 'tall';
      if (dmdBox.parentElement !== $('dmdTop')) $('dmdTop').appendChild(dmdBox);
      const dmdW = Math.min(vw - 8, 560);
      $('dmdTop').style.width = dmdW + 'px';
      $('mobileHud').style.width = dmdW + 'px';
      $('mobileHud').style.top = dmdW / 4 + 10 + 'px';
      R.insetT = (dmdW / 4 + 62) / vh;
    }
    R.resize(vw, vh);
    requestAnimationFrame(() => PB.dmd.resize());
  }
  PB.relayout = layout;

  // Self-playing demo ball for the attract screens
  function attractAI(g, dt) {
    if (g.state !== 'attract') return;
    const w = g.world;
    if (w.balls.length < 1 && Math.random() < dt * 0.8) {
      const b = new PB.Phys.Ball(U.rand(200, 380), 120);
      b.vx = U.rand(-200, 200);
      w.balls.push(b);
    }
    for (const f of g.allFlippers()) {
      f.aiT = (f.aiT || 0) - dt;
      let want = false;
      for (const b of w.balls) {
        if ((b.layer || 0) !== (f.upper ? 1 : f.wing ? PB.T.WINGS[f.wing].layer : 0)) continue;
        const dx = b.x - f.px, dy = b.y - f.py;
        const onSide = f.side === 0 ? dx > 10 : dx < -10;
        if (onSide && Math.abs(dx) < f.len + 6 && dy > -50 && dy < 30 && b.vy > -50) want = true;
      }
      if (want && f.aiT <= 0) { f.pressed = true; f.aiT = 0.45; }
      if (f.aiT < 0.2) f.pressed = false;
    }
  }

  function setupPortraits() {
    try { PB.PORTRAITS = PB.makePortraits() || {}; } catch (e) { PB.PORTRAITS = {}; }
    for (const m of PB.DATA.MONSTERS) {
      const src = PB.PORTRAITS[m.id];
      if (!src) continue;
      const img = new Image();
      img.onload = () => { PB.monsterDots[m.id] = PB.DMD.toDots(img, 32, 32, { cx: 0.5, cy: 0.5, s: 1 }); };
      img.src = src;
    }
    document.querySelectorAll('[data-portrait]').forEach((im) => { im.src = PB.PORTRAITS[im.dataset.portrait] || ''; });
    $('heroImg').src = PB.PORTRAITS.paladin || '';
    $('monImg').src = PB.PORTRAITS.goblin || '';
  }

  function fail(msg) {
    document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#000;color:#ffd77a;font:20px Georgia;padding:30px;text-align:center;z-index:99">${msg}</div>`);
  }

  function boot() {
    if (!PB.Renderer3D) { fail('Dungeon Delver needs WebGL and a modern browser.<br>Please try the latest Chrome, Edge, Firefox or Safari.'); return; }
    const game = (PB.game = new PB.Game());
    PB.dmd = new PB.DMD($('dmd'));
    PB.dmd.idle = (d, t) => game.dmdIdle(d, t);
    try {
      PB.render = new PB.Renderer3D($('table'), $('overlay'), game);
    } catch (e) {
      console.error(e);
      fail('Could not start 3D graphics (WebGL). Please enable hardware acceleration or try another browser.');
      return;
    }
    setupPortraits();
    PB.UI.init();
    layout();
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', () => setTimeout(layout, 250));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());

    let last = performance.now(), fpsT = 0, frames = 0, hudT = 0, dmdT = 0;
    function frame(now) {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) dt = 0.001;
      PB.updateTimeScale(dt);
      dt *= PB.timeScale;
      const paused = game.state === 'paused';
      if (!paused) {
        attractAI(game, dt);
        game.update(dt);
        PB.FX.update(dt);
      }
      PB.dmd.update(dt);
      dmdT += dt;
      if (dmdT > 1 / 40) { dmdT = 0; PB.dmd.render(); }
      PB.render.draw(paused ? 0 : dt);
      hudT += dt;
      if (hudT > 0.1) { hudT = 0; PB.UI.updateHUD(); }
      frames++;
      fpsT += dt;
      if (fpsT > 0.5) {
        if (PB.settings.fps) $('fps').textContent = Math.round(frames / fpsT) + ' fps';
        frames = 0; fpsT = 0;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  // render3d.js is an ES module: it runs before DOMContentLoaded, but wait for it explicitly to be safe
  function start() {
    if (PB.Renderer3D) boot();
    else {
      let done = false;
      window.addEventListener('pb3d-ready', () => { if (!done) { done = true; boot(); } });
      setTimeout(() => { if (!done) { done = true; boot(); } }, 8000);
    }
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
  else start();
})(window.PB);
