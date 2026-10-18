'use strict';
(function (PB) {
  const U = PB.U, A = PB.Audio;
  const $ = (id) => document.getElementById(id);
  const UI = (PB.UI = {
    isTouch: matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window,
    overlay: null,
    stack: [],
  });

  // ---------- overlays ----------
  function show(id) {
    document.querySelectorAll('.overlay.show').forEach((o) => { if (o.id !== id) o.classList.remove('show'); });
    if (id) $(id).classList.add('show');
    const was = UI.overlay;
    UI.overlay = id;
    const full = (o) => ['ovTitle', 'ovMenu', 'ovHero'].includes(o);
    if (full(was) !== full(id) && PB.relayout) PB.relayout();
  }
  UI.show = show;
  function openModal(id) {
    UI.stack.push(UI.overlay);
    show(id);
  }
  function closeModal() {
    const prev = UI.stack.pop();
    show(prev || null);
    if (!prev && PB.game.state === 'paused') resume();
  }

  // ---------- title screen embers ----------
  function spawnEmbers() {
    const box = $('embers');
    if (!box) return;
    const id = setInterval(() => {
      if (UI.overlay !== 'ovTitle') { clearInterval(id); return; }
      const e = document.createElement('div');
      e.className = 'ember';
      e.style.left = Math.random() * 100 + '%';
      e.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      const d = 5 + Math.random() * 6;
      e.style.animationDuration = d + 's';
      e.style.width = e.style.height = 2 + Math.random() * 4 + 'px';
      box.appendChild(e);
      setTimeout(() => e.remove(), d * 1000);
    }, 160);
  }

  UI.init = function () {
    const g = PB.game;
    $('lastUpdated').textContent = PB.BUILD.date;
    document.querySelectorAll('.upd').forEach((e) => (e.textContent = PB.BUILD.date));
    UI.overlay = 'ovTitle';
    spawnEmbers();

    $('ovTitle').addEventListener('pointerup', () => {
      A.init();
      A.play('start');
      A.Music.set('title');
      show('ovMenu');
      $('mStart').focus();
    });

    // menu
    $('mStart').onclick = () => { A.play('select'); openHero(); };
    $('mHelp').onclick = () => { A.play('uiTick'); openModal('ovHelp'); };
    $('mScores').onclick = () => { A.play('uiTick'); renderScores($('scoreList')); openModal('ovScores'); };
    $('mSettings').onclick = () => { A.play('uiTick'); openSettings(); };
    $('mAch').onclick = () => { A.play('uiTick'); renderAch(); openModal('ovAch'); };
    $('achClose').onclick = () => { A.play('uiTick'); closeModal(); };
    $('hClose').onclick = () => { A.play('uiTick'); closeModal(); };
    $('scClose').onclick = () => { A.play('uiTick'); closeModal(); };

    // hero select
    const opts = [...document.querySelectorAll('.hero-opt')];
    opts.forEach((o) => {
      const h = PB.DATA.HEROES[o.dataset.hero];
      o.querySelector('.power span').textContent = h.powerDesc;
      o.querySelector('.passive').textContent = 'Passive: ' + h.passive;
      o.onclick = () => startWith(o.dataset.hero);
      o.onmouseenter = () => { UI.heroSel = opts.indexOf(o); markHero(); };
    });
    UI.heroSel = 0;

    // pause
    $('pResume').onclick = () => { A.play('uiTick'); resume(); };
    $('pSettings').onclick = () => { A.play('uiTick'); openSettings(); };
    $('pHelp').onclick = () => { A.play('uiTick'); openModal('ovHelp'); };
    $('pRestart').onclick = () => { A.play('uiTick'); UI.stack = []; show(null); g.state = 'play'; openHero(); };
    $('pQuit').onclick = () => { A.play('uiTick'); UI.stack = []; g.attract(); show('ovMenu'); };

    // game over
    $('oAgain').onclick = () => { A.play('select'); openHero(); };
    $('oMenu').onclick = () => { A.play('uiTick'); show('ovMenu'); };
    $('saveScore').onclick = saveScore;
    $('initials').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') saveScore(); });
    $('initials').addEventListener('keyup', (e) => e.stopPropagation());

    // side buttons
    $('btnSettings').onclick = () => { if (g.state === 'play') pause(); openSettings(); };
    $('btnPause').onclick = () => togglePause();
    $('mPause').onclick = () => togglePause();
    $('btnMute').onclick = () => toggleMute();
    $('btnFull').onclick = () => toggleFull();
    $('btnHelp').onclick = () => { if (g.state === 'play') pause(); openModal('ovHelp'); };
    $('powerBtn').onclick = () => g.useAbility();
    $('mPower').addEventListener('pointerdown', (e) => { e.stopPropagation(); g.useAbility(); });

    setupSettings();
    setupInput();
    document.addEventListener('visibilitychange', () => { if (document.hidden && g.state === 'play') pause(); });
    UI.updateHUD(true);
  };

  // ---------- hero select ----------
  function openHero() {
    UI.stack = [];
    show('ovHero');
    markHero();
  }
  function markHero() {
    document.querySelectorAll('.hero-opt').forEach((o, i) => o.classList.toggle('sel', i === UI.heroSel));
  }
  function startWith(hero) {
    A.init();
    A.play('confirm');
    show(null);
    UI.stack = [];
    UI.setHero(hero);
    PB.game.startGame(hero);
    UI.monsterChanged(PB.game.p.mon.def);
    UI.updateHUD(true);
  }
  UI.setHero = function (hero) {
    const h = PB.DATA.HEROES[hero];
    $('heroImg').src = PB.PORTRAITS[hero] || '';
    $('mHeroImg').src = PB.PORTRAITS[hero] || '';
    $('heroName').textContent = h.name;
    $('heroTitle').textContent = h.title;
    $('powerName').textContent = h.power;
  };
  UI.monsterChanged = function (def) {
    $('monImg').src = PB.PORTRAITS[def.id] || '';
    $('monName').textContent = def.name;
    $('monTitle').textContent = def.title;
    $('monDesc').textContent = def.desc;
    $('mMonName').textContent = def.name;
  };

  // ---------- pause ----------
  let prevState = 'play';
  function pause() {
    const g = PB.game;
    if (g.state !== 'play' && g.state !== 'bonus' && g.state !== 'relic') return;
    prevState = g.state;
    g.state = 'paused';
    for (const f of g.parts.flippers) f.pressed = false;
    g.plunger.held = false;
    UI.stack = [];
    show('ovPause');
    if (A.ready) A.ctx.suspend();
  }
  function resume() {
    const g = PB.game;
    if (g.state !== 'paused') return;
    g.state = prevState;
    UI.stack = [];
    show(prevState === 'relic' ? 'ovRelic' : null);
    if (A.ready) A.ctx.resume();
  }
  function togglePause() {
    const g = PB.game;
    if (g.state === 'paused') resume();
    else pause();
  }
  UI.pause = pause;
  UI.cycleCamera = function () {
    const order = ['player', 'fixed', 'overhead'];
    const s = PB.settings;
    s.camera = order[(order.indexOf(s.camera) + 1) % order.length];
    PB.saveSettings();
    PB.render.setCamera(s.camera);
    A.play('uiTick');
    if (PB.dmd) PB.dmd.msg('CAMERA', { player: 'PLAYER VIEW', fixed: 'FIXED VIEW', overhead: 'OVERHEAD' }[s.camera], { dur: 1, priority: 2 });
  };

  // ---------- mute / fullscreen ----------
  function toggleMute() {
    PB.muted = !PB.muted;
    $('btnMute').textContent = PB.muted ? '🔇' : '🔊';
    A.applyVolumes();
  }
  function toggleFull() {
    const d = document;
    try {
      if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen).call(d.documentElement);
      else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } catch (e) {}
  }

  // ---------- settings ----------
  function openSettings() {
    syncSettings();
    openModal('ovSettings');
  }
  function syncSettings() {
    const s = PB.settings;
    $('sMaster').value = Math.round(s.master * 100);
    $('sMusic').value = Math.round(s.music * 100);
    $('sSfx').value = Math.round(s.sfx * 100);
    $('oMaster').textContent = $('sMaster').value;
    $('oMusic').textContent = $('sMusic').value;
    $('oSfx').textContent = $('sSfx').value;
    $('sShake').checked = s.shake;
    $('sFlashes').checked = s.flashes;
    $('sTrail').checked = s.trail;
    $('sHaptics').checked = s.haptics;
    $('sFps').checked = s.fps;
    $('sBloom').checked = s.bloom !== false;
    $('sBalls').value = String(s.balls);
    $('sCamera').value = s.camera || 'player';
    $('sQuality').value = s.quality || 'auto';
  }
  function setupSettings() {
    const s = PB.settings;
    let testT = 0;
    const slider = (id, key, out, test) => {
      $(id).addEventListener('input', () => {
        s[key] = $(id).value / 100;
        $(out).textContent = $(id).value;
        A.applyVolumes();
        PB.saveSettings();
        const now = performance.now();
        if (test && now - testT > 160) { testT = now; A.play(test); }
      });
    };
    slider('sMaster', 'master', 'oMaster', 'bumper');
    slider('sMusic', 'music', 'oMusic', null);
    slider('sSfx', 'sfx', 'oSfx', 'sling');
    const tog = (id, key) => $(id).addEventListener('change', () => { s[key] = $(id).checked; PB.saveSettings(); A.play('uiTick'); });
    $('sBloom').addEventListener('change', () => { s.bloom = $('sBloom').checked; PB.saveSettings(); if (PB.render.bloom) PB.render.bloom.enabled = s.bloom; else if (s.bloom) location.reload(); });
    tog('sShake', 'shake'); tog('sFlashes', 'flashes'); tog('sTrail', 'trail'); tog('sHaptics', 'haptics'); tog('sFps', 'fps');
    $('sBalls').addEventListener('change', () => { s.balls = +$('sBalls').value; PB.saveSettings(); });
    $('sCamera').addEventListener('change', () => { s.camera = $('sCamera').value; PB.saveSettings(); PB.render.setCamera(s.camera); });
    $('sQuality').addEventListener('change', () => {
      s.quality = $('sQuality').value;
      PB.saveSettings();
      // the WebGL context is created with these options, so restart when it's safe to
      if (!PB.game.p || PB.game.state === 'over' || PB.game.state === 'attract') location.reload();
    });
    $('sResetScores').onclick = () => { if (confirm('Erase the Hall of Heroes?')) { PB.resetScores(); A.play('drop'); } };
    $('sDefaults').onclick = () => { PB.resetSettings(); syncSettings(); A.applyVolumes(); A.play('uiTick'); };
    $('sClose').onclick = () => { A.play('uiTick'); closeModal(); };
  }

  // ---------- relics ----------
  UI.relicChoice = function (choices, cb) {
    UI.relicCb = cb;
    UI.relicChoices = choices;
    UI.relicSel = 1;
    const box = $('relicCards');
    box.innerHTML = '';
    choices.forEach((r, i) => {
      const b = document.createElement('button');
      b.className = 'relic-card';
      b.innerHTML = `<div class="ic">${r.icon}</div><div class="rn">${r.name}</div><div class="rd">${r.desc}</div>`;
      b.onclick = () => { UI.relicSel = i; UI.relicConfirm(); };
      b.onmouseenter = () => { UI.relicSel = i; markRelic(); };
      box.appendChild(b);
    });
    markRelic();
    show('ovRelic');
  };
  function markRelic() {
    [...$('relicCards').children].forEach((c, i) => c.classList.toggle('sel', i === UI.relicSel));
  }
  UI.relicMove = function (d) {
    if (!UI.relicChoices) return;
    UI.relicSel = (UI.relicSel + d + UI.relicChoices.length) % UI.relicChoices.length;
    A.play('select');
    markRelic();
  };
  UI.relicConfirm = function () {
    if (!UI.relicCb) return;
    const r = UI.relicChoices[UI.relicSel];
    const cb = UI.relicCb;
    UI.relicCb = null;
    UI.relicChoices = null;
    show(null);
    cb(r);
    UI.updateHUD(true);
  };

  // ---------- scores / game over ----------
  function renderScores(el, mine) {
    el.innerHTML = '';
    PB.getScores().forEach((s) => {
      const li = document.createElement('li');
      if (mine && s.score === mine.score && s.name === mine.name) li.className = 'me';
      li.innerHTML = `<span class="n">${s.name}</span><span class="s">${U.fmt(s.score)}</span>`;
      el.appendChild(li);
    });
  }
  let lastGame = null;
  UI.gameOver = function (p) {
    lastGame = p;
    $('finalScore').textContent = U.fmt(p.score);
    const relics = p.relics.length;
    $('finalStats').textContent = `${PB.DATA.HEROES[p.hero].name} · Level ${p.level} · ${p.monstersKilled} monsters slain · reached Floor ${p.floor} · ${p.gold} gold · ${relics} relic${relics === 1 ? '' : 's'}`;
    const hs = PB.isHighScore(p.score) && p.score > 0;
    $('entry').classList.toggle('show', hs);
    renderScores($('overScores'));
    show('ovOver');
    if (hs) setTimeout(() => $('initials').focus(), 100);
  };
  function saveScore() {
    const name = ($('initials').value || 'AAA').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(3, '-').slice(0, 3);
    PB.addScore(name, lastGame.score, lastGame.hero);
    A.play('confirm');
    $('entry').classList.remove('show');
    renderScores($('overScores'), { name, score: lastGame.score });
    $('initials').value = '';
    $('oAgain').focus();
  }

  // ---------- achievements + toasts ----------
  function renderAch() {
    const got = PB.achUnlocked();
    const grid = $('achGrid');
    grid.innerHTML = '';
    let n = 0;
    for (const a of PB.ACH) {
      const ok = !!got[a.id];
      if (ok) n++;
      const d = document.createElement('div');
      d.className = 'ach' + (ok ? '' : ' locked');
      d.innerHTML = `<div class="ai">${a.icon}</div><div><b>${a.name}</b><span>${a.desc}</span></div>`;
      grid.appendChild(d);
    }
    $('achCount').textContent = `${n} of ${PB.ACH.length} unlocked`;
  }
  UI.toast = function (icon, title, desc) {
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<div class="ti">${icon}</div><div><b>${title}</b><span>${desc}</span></div>`;
    box.appendChild(t);
    setTimeout(() => t.remove(), 4300);
  };
  UI.questChanged = function () { UI.updateHUD(true); };

  // ---------- HUD ----------
  let lastRelics = '';
  UI.updateHUD = function (force) {
    const g = PB.game, p = g.p;
    $('fps').style.display = PB.settings.fps ? 'block' : 'none';
    if (!p) return;
    const h = PB.DATA.HEROES[p.hero];
    $('lvl').textContent = p.level;
    $('mLvl').textContent = p.level;
    const x0 = g.xpFor(p.level), x1 = g.xpFor(p.level + 1);
    $('xpBar').style.width = U.clamp(((p.xp - x0) / (x1 - x0)) * 100, 0, 100) + '%';
    const charge = p.abilityT > 0 ? (p.abilityT / 20) * 100 : p.charge;
    $('chargeBar').style.width = charge + '%';
    const pb = $('powerBtn');
    pb.classList.toggle('ready', p.charge >= 100 && p.abilityT <= 0);
    pb.classList.toggle('active', p.abilityT > 0);
    $('powerHint').textContent = p.abilityT > 0 ? `ACTIVE · ${Math.ceil(p.abilityT)}s` : p.charge >= 100 ? 'READY! Press E' : `Charging · ${Math.floor(p.charge)}%`;
    $('mCharge').style.strokeDashoffset = 106.8 * (1 - charge / 100);
    $('mPower').classList.toggle('ready', p.charge >= 100 && p.abilityT <= 0);
    $('gold').textContent = U.fmt(p.gold);
    $('mGold').textContent = U.fmt(p.gold);
    const key = p.relics.join(',') + p.phoenixUsed;
    if (force || key !== lastRelics) {
      lastRelics = key;
      const box = $('relics');
      box.innerHTML = '';
      if (!p.relics.length) box.innerHTML = '<span class="none">None yet — slay a monster, then shoot the Vault.</span>';
      for (const id of p.relics) {
        const r = PB.DATA.RELICS.find((x) => x.id === id);
        const d = document.createElement('div');
        d.className = 'relic-chip' + (id === 'phoenix' && p.phoenixUsed ? ' used' : '');
        d.textContent = r.icon;
        d.title = r.name + ' — ' + r.desc;
        box.appendChild(d);
      }
    }
    const m = p.mon;
    if (m) {
      const k = m.dead ? 0 : (m.hp / m.max) * 100;
      $('hpBar').style.width = k + '%';
      $('mHp').style.width = k + '%';
      $('hpText').textContent = m.dead ? 'SLAIN' : `HP ${m.hp} / ${m.max}` + (m.def.id === 'cyclops' ? (m.eye ? ' · EYE OPEN!' : ' · eye closed') : '');
    }
    $('floor').textContent = p.floor;
    const foes = $('foes');
    if (force || foes.dataset.k !== p.monIdx + '/' + p.floor) {
      foes.dataset.k = p.monIdx + '/' + p.floor;
      foes.innerHTML = '';
      PB.DATA.MONSTERS.forEach((d, i) => {
        const f = document.createElement('div');
        f.className = 'foe' + (i < p.monIdx ? ' done' : i === p.monIdx ? ' cur' : '');
        f.innerHTML = `<img src="${PB.PORTRAITS[d.id] || ''}" alt="">`;
        f.title = d.name;
        foes.appendChild(f);
      });
    }
    const q = p.quest;
    if (q) {
      $('qName').textContent = q.def.name;
      $('qDesc').textContent = q.done ? 'Complete!' : q.def.desc;
      $('qBar').style.width = (q.n / q.def.goal) * 100 + '%';
      $('qReward').textContent = 'Reward: ' + q.def.reward + ' · ' + Math.floor(q.n) + ' / ' + q.def.goal;
      $('mQuest').textContent = q.def.name + ' ' + Math.floor(q.n) + '/' + q.def.goal;
    }
    const chips = [];
    if (p.denLit) chips.push(['DEN OPEN', 1]);
    if (p.cryptLit) chips.push(['CRYPT OPEN', 1]);
    if (p.forgeLit) chips.push(['FORGE OPEN', 1]);
    if (p.forgeDmg) chips.push(['WEAPON +' + p.forgeDmg, 0]);
    if (p.frenzyT > 0) chips.push(['FRENZY ' + Math.ceil(p.frenzyT) + 's', 1]);
    if (p.rescue) chips.push(['RESCUE ' + U.fmt(p.rescue.v), 1]);
    if (p.rats.length && p.rats.some((r) => r.alive)) chips.push(['RATS ' + (p.ratKills || 0) + '/6', 1]);
    if (p.critReady) chips.push(['CRIT READY', 1]);
    if (p.lockLit) chips.push(['LOCK LIT', 1]);
    if (p.relicLit) chips.push(['RELIC LIT', 1]);
    if (p.curse) chips.push([PB.DATA.CURSES.find((c) => c.id === p.curse).name, 0]);
    if (p.den.hatched) chips.push(['EGGS HATCHED', 0]);
    const ck = chips.map((c) => c[0]).join('|');
    if (ck !== $('chips').dataset.k) {
      $('chips').dataset.k = ck;
      $('chips').innerHTML = chips.map(([t, hot]) => `<span class="chip${hot ? ' hot' : ''}">${t}</span>`).join('');
    }
    $('locks').textContent = '◆'.repeat(p.locks) + (p.lockLit ? '◈' : '') + '◇'.repeat(Math.max(0, 3 - p.locks - (p.lockLit ? 1 : 0)));
    $('bonusX').textContent = p.bonusX + 'X';
    $('ballNo').textContent = `${p.ball} of ${p.totalBalls}` + (p.extraBalls ? ` (+${p.extraBalls})` : '');
  };

  // ---------- input ----------
  const KEYS = {
    left: ['ShiftLeft', 'KeyZ', 'ArrowLeft', 'KeyA'],
    right: ['ShiftRight', 'Slash', 'ArrowRight', 'KeyD'],
    plunger: ['Space', 'Enter', 'ArrowDown', 'KeyS', 'NumpadEnter'],
    ability: ['KeyE', 'ArrowUp', 'KeyW'],
  };
  function setupInput() {
    const g = PB.game;
    const down = new Set();
    window.addEventListener('keydown', (e) => {
      const c = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Tab'].includes(c) && UI.overlay !== 'ovSettings') e.preventDefault();
      if (e.repeat) return;
      down.add(c);
      // overlays
      if (UI.overlay === 'ovTitle') {
        if (['Space', 'Enter'].includes(c)) $('ovTitle').dispatchEvent(new PointerEvent('pointerup'));
        return;
      }
      if (UI.overlay === 'ovHero') {
        if (KEYS.left.includes(c)) { UI.heroSel = 0; markHero(); A.play('select'); }
        else if (KEYS.right.includes(c)) { UI.heroSel = 1; markHero(); A.play('select'); }
        else if (KEYS.plunger.includes(c)) startWith(UI.heroSel ? 'crusader' : 'paladin');
        else if (c === 'Escape') show('ovMenu');
        return;
      }
      if (c === 'Escape' || c === 'KeyP') {
        if (UI.overlay === 'ovSettings' || UI.overlay === 'ovHelp' || UI.overlay === 'ovScores' || UI.overlay === 'ovAch') { closeModal(); return; }
        if (g.state === 'play' || g.state === 'paused' || g.state === 'bonus') togglePause();
        return;
      }
      if (c === 'KeyM') { toggleMute(); return; }
      if (c === 'KeyF') { toggleFull(); return; }
      if (c === 'KeyV') { UI.cycleCamera(); return; }
      if (UI.overlay && UI.overlay !== 'ovRelic') return;
      if (KEYS.left.includes(c)) g.flipper(0, true);
      if (KEYS.right.includes(c)) g.flipper(1, true);
      if (KEYS.plunger.includes(c)) g.plungerDown(true);
      if (KEYS.ability.includes(c)) g.useAbility();
      if (c === 'KeyX') g.nudge(1, -0.4);
      if (c === 'KeyV') g.nudge(-1, -0.4);
      if (c === 'KeyC') g.nudge(0, -1);
    });
    window.addEventListener('keyup', (e) => {
      const c = e.code;
      down.delete(c);
      const any = (list) => list.some((k) => down.has(k));
      if (KEYS.left.includes(c) && !any(KEYS.left)) g.flipper(0, false);
      if (KEYS.right.includes(c) && !any(KEYS.right)) g.flipper(1, false);
      if (KEYS.plunger.includes(c) && !any(KEYS.plunger)) g.plungerDown(false);
    });
    window.addEventListener('blur', () => {
      down.clear();
      g.flipper(0, false);
      g.flipper(1, false);
      if (g.plunger.held) g.plungerDown(false);
    });

    // pointer / touch flippers on the table area
    const ptrs = new Map();
    const center = $('center');
    const sideOf = (x) => {
      const r = $('table').getBoundingClientRect();
      return x < r.left + r.width / 2 ? 0 : 1;
    };
    let plungePtr = null;
    const release = (id) => {
      if (plungePtr === id) { plungePtr = null; g.plungerDown(false); }
      const side = ptrs.get(id);
      if (side == null) return;
      ptrs.delete(id);
      if (![...ptrs.values()].includes(side)) g.flipper(side, false);
    };
    center.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (UI.overlay && UI.overlay !== 'ovRelic') return;
      e.preventDefault();
      if (g.state === 'relic') {
        // tapping during relic select is handled by the cards
        return;
      }
      A.init();
      const side = sideOf(e.clientX);
      ptrs.set(e.pointerId, side);
      g.flipper(side, true);
      // the right side also works the plunger while a ball waits in the shooter lane
      if (side === 1 && plungePtr == null && g.ballWaiting()) { plungePtr = e.pointerId; g.plungerDown(true); }
      try { center.setPointerCapture(e.pointerId); } catch (err) {}
    });
    center.addEventListener('pointerup', (e) => release(e.pointerId));
    center.addEventListener('pointercancel', (e) => release(e.pointerId));
    center.addEventListener('contextmenu', (e) => e.preventDefault());

  }
})(window.PB);
