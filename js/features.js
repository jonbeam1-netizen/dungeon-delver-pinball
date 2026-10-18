'use strict';
(function (PB) {
  // Extra game systems layered on top of the core rules:
  // the Dragon's Den upper deck, quests, Torch Frenzy, rat swarms, rescue hurry-ups,
  // floor curses, achievements and slow-motion "epic moments".
  const U = PB.U, A = PB.Audio, T = PB.T;
  const G = PB.Game.prototype;

  // ---------------- quests ----------------
  const QUESTS = [
    { id: 'loops', name: 'LOOP THE CATACOMBS', desc: 'Make 3 orbit loops', stat: 'orbit', goal: 3, reward: '100K + 30 GOLD', give(g) { g.score(100000 * g.p.floor); g.addGold(30); } },
    { id: 'ramps', name: 'PILGRIMAGE', desc: 'Ride the Shrine Ramp 2 times', stat: 'ramp', goal: 2, reward: 'DRAGON\'S DEN OPENS', give(g) { g.p.denLit = true; g.score(80000 * g.p.floor); } },
    { id: 'braziers', name: 'STOKE THE BRAZIERS', desc: 'Hit the braziers 25 times', stat: 'bumper', goal: 25, reward: 'TORCH FRENZY', give(g) { g.startFrenzy(20); } },
    { id: 'runes', name: 'RUNE BREAKER', desc: 'Drop 8 RUNE targets', stat: 'rune', goal: 8, reward: '120K + LOCK LIT', give(g) { g.score(120000 * g.p.floor); if (!g.p.mb) g.p.lockLit = true; } },
    { id: 'hunter', name: 'MONSTER HUNTER', desc: 'Strike the monster 6 times', stat: 'mhit', goal: 6, reward: 'CRIT READY + 100K', give(g) { g.p.critReady = true; g.score(100000 * g.p.floor); } },
    { id: 'spin', name: 'WHEEL OF SOULS', desc: 'Spin the spinner 40 times', stat: 'spin', goal: 40, reward: '75K + 40 GOLD', give(g) { g.score(75000 * g.p.floor); g.addGold(40); } },
    { id: 'combo', name: 'BLADE DANCE', desc: 'Chain a 3X combo', stat: 'combo', goal: 3, abs: true, reward: '200K', give(g) { g.score(200000 * g.p.floor); } },
    { id: 'lanes', name: 'TORCHBEARER', desc: 'Complete the top lanes twice', stat: 'lanes', goal: 2, reward: 'BONUS X +2', give(g) { g.p.bonusX = Math.min(10, g.p.bonusX + 2); } },
    { id: 'gold', name: 'TREASURE SEEKER', desc: 'Collect 80 gold', stat: 'gold', goal: 80, reward: 'RELIC LIT', give(g) { if (!g.p.relicLit && !g.p.mb) g.p.relicLit = true; else g.score(150000 * g.p.floor); } },
    { id: 'vault', name: 'VAULT RAIDER', desc: 'Shoot the Vault 3 times', stat: 'vault', goal: 3, reward: 'RESCUE MISSION', give(g) { g.startRescue(); } },
    { id: 'slay', name: 'SLAY', desc: 'Complete S-L-A-Y twice', stat: 'slayset', goal: 2, reward: 'SUPER CRIT + 150K', give(g) { g.p.critReady = true; g.score(150000 * g.p.floor); } },
    { id: 'den', name: 'INTO THE DEN', desc: 'Reach the Dragon\'s Den', stat: 'den', goal: 1, reward: '250K', give(g) { g.score(250000 * g.p.floor); } },
    { id: 'crypt', name: 'DESCEND TO THE CRYPT', desc: 'Visit the Crypt side table', stat: 'cryptIn', goal: 1, reward: '200K + FORGE OPEN', give(g) { g.score(200000 * g.p.floor); g.lightWing('forge'); } },
    { id: 'forge', name: 'FORGEMASTER', desc: 'Strike the anvil 4 times', stat: 'anvil', goal: 4, reward: '250K', give(g) { g.score(250000 * g.p.floor); } },
    { id: 'graves', name: 'GRAVE DIGGER', desc: 'Smash 3 coffins in the Crypt', stat: 'coffin', goal: 3, reward: 'CRYPT RELIT + 150K', give(g) { g.score(150000 * g.p.floor); g.lightWing('crypt'); } },
  ];

  // ---------------- achievements (persist between games) ----------------
  const ACH = [
    { id: 'first_blood', icon: '🗡️', name: 'First Blood', desc: 'Slay your first monster.' },
    { id: 'floor', icon: '👑', name: 'Into the Depths', desc: 'Defeat Azgaroth, the Ember King.' },
    { id: 'hoard', icon: '💰', name: 'Treasure Hoard', desc: 'Start Treasure Hoard Multiball.' },
    { id: 'super', icon: '✨', name: 'Super Jackpot', desc: 'Collect a Super Jackpot at the Vault.' },
    { id: 'den', icon: '🐉', name: 'Den Diver', desc: 'Ride the lift into the Dragon\'s Den.' },
    { id: 'dragon', icon: '🔥', name: 'Dragon Tamer', desc: 'Trigger the Dragon\'s Hoard.' },
    { id: 'hatch', icon: '🥚', name: 'Hatchling', desc: 'Hatch all three dragon eggs.' },
    { id: 'ramps5', icon: '⛪', name: 'Pilgrim', desc: 'Ride the Shrine Ramp 5 times in one game.' },
    { id: 'loops10', icon: '🌀', name: 'Catacomb Runner', desc: 'Loop the orbits 10 times in one game.' },
    { id: 'rats', icon: '🐀', name: 'Exterminator', desc: 'Squash every rat in a swarm.' },
    { id: 'rescue', icon: '🛡️', name: 'Hero of the People', desc: 'Rescue the trapped adventurer.' },
    { id: 'frenzy', icon: '🕯️', name: 'Pyromancer', desc: 'Trigger Torch Frenzy.' },
    { id: 'combo5', icon: '⚔️', name: 'Blade Dancer', desc: 'Chain a 5X combo.' },
    { id: 'skill', icon: '🎯', name: 'Sharpshooter', desc: 'Hit a Skill Shot.' },
    { id: 'relics4', icon: '🏺', name: 'Collector', desc: 'Carry 4 relics in one game.' },
    { id: 'quests5', icon: '📜', name: 'Questmaster', desc: 'Complete 5 quests in one game.' },
    { id: 'million', icon: '💎', name: 'Millionaire', desc: 'Score 1,000,000 points.' },
    { id: 'legend', icon: '🏆', name: 'Legend', desc: 'Score 10,000,000 points.' },
    { id: 'level5', icon: '⭐', name: 'Veteran', desc: 'Reach hero level 5.' },
    { id: 'tilt', icon: '🤦', name: 'Heavy Hand', desc: 'Tilt the machine. Oops.' },
    { id: 'cryptIn', icon: '⚰️', name: 'Grave Robber', desc: 'Enter the Crypt side table.' },
    { id: 'forgeIn', icon: '⚒️', name: 'Into the Fire', desc: 'Enter the Forge side table.' },
    { id: 'lich', icon: '💀', name: 'Lichbane', desc: 'Destroy the Lich in the Crypt.' },
    { id: 'smith', icon: '🗡️', name: 'Master Smith', desc: 'Forge a weapon on the anvil.' },
    { id: 'allTables', icon: '🗺️', name: 'Cartographer', desc: 'Visit the Den, the Crypt and the Forge in one game.' },
  ];
  PB.ACH = ACH;
  PB.achUnlocked = () => U.store.get('ach', {});
  PB.achieve = function (id) {
    const got = PB.achUnlocked();
    if (got[id]) return;
    const a = ACH.find((x) => x.id === id);
    if (!a) return;
    got[id] = Date.now();
    U.store.set('ach', got);
    A.play('toast');
    PB.UI && PB.UI.toast && PB.UI.toast(a.icon, 'Achievement unlocked: ' + a.name, a.desc);
  };

  const CURSES = [
    { id: 'shadows', name: 'CURSE OF SHADOWS', desc: 'The torches gutter. The dungeon grows dark.' },
    { id: 'weight', name: 'CURSE OF IRON', desc: 'Your ball grows heavy and fast.' },
    { id: 'frailty', name: 'CURSE OF FRAILTY', desc: 'Ball save time is halved.' },
  ];
  PB.DATA.QUESTS = QUESTS;
  PB.DATA.CURSES = CURSES;

  // ---------------- slow motion ----------------
  PB.timeScale = 1;
  PB.slowmo = function (scale, dur, focus) {
    PB.slow = { scale, dur, t: 0 };
    if (focus) PB.camFocus = Object.assign({ t: 0, dur: dur + 0.4 }, focus);
  };
  PB.updateTimeScale = function (realDt) {
    const s = PB.slow;
    if (!s) { PB.timeScale = 1; return; }
    s.t += realDt;
    const k = s.t / s.dur;
    PB.timeScale = k < 0.75 ? s.scale : U.lerp(s.scale, 1, (k - 0.75) / 0.25);
    if (k >= 1) { PB.slow = null; PB.timeScale = 1; }
  };

  // ---------------- init / per-ball ----------------
  G.initFeatures = function (p) {
    Object.assign(p, {
      quest: null, questsDone: 0, frenzyT: 0,
      rats: [], ratT: U.rand(40, 65), rescue: null, rescueT: U.rand(55, 85),
      curse: null, denLit: false, ramps: 0, orbits: 0,
      den: { eggs: [false, false, false], hatched: false, dragonHits: 0, visits: 0, flash: 0, breath: 0 },
      cryptLit: true, forgeLit: false, forgeDmg: 0,
      wing: {
        crypt: { visits: 0, stands: [false, false], bossHP: 8, bossMax: 8, kills: 0, flash: 0, cool: 0 },
        forge: { visits: 0, stands: [false, false], hits: 0, flash: 0, cool: 0, hammer: 0 },
      },
    });
    for (const W of Object.values(this.parts.wings)) for (const d of W.drops) { d.down = false; d.active = true; }
    for (const w of this.worlds) w.gScale = 1;
    this.after(3, () => this.newQuest());
  };

  // ---------------- quests ----------------
  G.newQuest = function () {
    const p = this.p;
    if (!p || this.state === 'over') return;
    const prev = p.quest && p.quest.def.id;
    const pool = QUESTS.filter((q) => q.id !== prev && !(q.id === 'den' && p.den.visits > 0));
    const def = U.pick(pool);
    p.quest = { def, n: 0 };
    this.dmd.msg('NEW QUEST', def.name, { dur: 2, priority: 2 });
    PB.UI && PB.UI.questChanged && PB.UI.questChanged();
  };
  G.questStat = function (stat, n = 1, abs) {
    const p = this.p;
    if (!p || !p.quest || p.quest.done || p.tilted) return;
    const q = p.quest;
    if (q.def.stat !== stat) return;
    q.n = abs || q.def.abs ? Math.max(q.n, n) : q.n + n;
    if (q.n >= q.def.goal) {
      q.n = q.def.goal;
      q.done = true;
      p.questsDone++;
      A.play('levelUp');
      this.fx.banner('QUEST COMPLETE', '#5aff8a', q.def.reward, 2.2);
      this.dmd.msg('QUEST COMPLETE', q.def.reward, { dur: 2.2, big: false, border: true, priority: 3 });
      this.lampShow = { type: 'flashGroup', ids: ['quest'], t: 0, dur: 1.2 };
      q.def.give(this);
      this.addXP(40);
      if (p.questsDone >= 5) PB.achieve('quests5');
      this.after(4, () => this.newQuest());
    }
  };

  // ---------------- Torch Frenzy ----------------
  G.startFrenzy = function (sec) {
    const p = this.p;
    p.frenzyT = Math.max(p.frenzyT, sec);
    A.play('rage');
    this.fx.banner('TORCH FRENZY', '#ffb030', 'BRAZIERS WORTH 25,000', 2.2);
    this.dmd.msg('TORCH FRENZY', 'BRAZIERS 25K FOR ' + sec + 'S', { dur: 2, border: true, priority: 3 });
    this.flash('#ff9a30', 0.5);
    PB.achieve('frenzy');
  };

  // ---------------- rat swarm ----------------
  G.spawnRats = function () {
    const p = this.p;
    p.rats = [];
    for (let i = 0; i < 6; i++) {
      const side = i % 2;
      p.rats.push({ x: side ? 430 : 150, y: U.rand(640, 860), tx: U.rand(185, 385), ty: U.rand(630, 870), spd: U.rand(70, 120), alive: true, t: 0, ang: side ? Math.PI : 0, life: 20, splat: 0 });
    }
    p.ratKills = 0;
    A.play('squeak');
    this.fx.banner('RAT SWARM!', '#c8c0b0', 'SQUASH THEM WITH THE BALL', 2);
    this.dmd.msg('RAT SWARM', 'SQUASH THE RATS!', { dur: 2, blink: true, priority: 3 });
  };
  G.updateRats = function (dt) {
    const p = this.p;
    if (!p.rats.length) return;
    let alive = 0;
    for (const r of p.rats) {
      if (!r.alive) { r.splat += dt; continue; }
      r.t += dt;
      const dx = r.tx - r.x, dy = r.ty - r.y, d = Math.hypot(dx, dy);
      if (d < 8 || Math.random() < dt * 0.4) { r.tx = U.rand(185, 385); r.ty = U.rand(630, 870); }
      // scatter away from nearby balls
      let fx = dx / (d || 1), fy = dy / (d || 1);
      for (const b of this.world.balls) {
        if (!b.alive || (b.layer || 0) || b.held) continue;
        const bx = r.x - b.x, by = r.y - b.y, bd = Math.hypot(bx, by);
        if (bd < 21) { this.squashRat(r, b); break; }
        if (bd < 90) { fx += (bx / bd) * 1.4; fy += (by / bd) * 1.4; }
      }
      if (!r.alive) continue;
      const l = Math.hypot(fx, fy) || 1;
      const sp = r.spd * (1 + Math.sin(r.t * 9) * 0.3);
      r.x = U.clamp(r.x + (fx / l) * sp * dt, 150, 420);
      r.y = U.clamp(r.y + (fy / l) * sp * dt, 615, 885);
      const want = Math.atan2(fy, fx);
      let da = want - r.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      r.ang += da * Math.min(1, dt * 8);
      r.life -= dt;
      if (r.life <= 0) r.alive = false, r.fled = true;
      alive++;
      if (Math.random() < dt * 0.15) A.play('squeak');
    }
    if (!alive && p.rats.every((r) => !r.alive && (r.fled || r.splat > 1.5))) {
      if (p.rats.some((r) => r.fled) && p.ratKills < 6) this.dmd.msg('THE RATS ESCAPED', p.ratKills + ' OF 6 SQUASHED', { dur: 1.6, priority: 2 });
      p.rats = [];
    }
  };
  G.squashRat = function (r, b) {
    const p = this.p;
    r.alive = false;
    r.splat = 0;
    p.ratKills = (p.ratKills || 0) + 1;
    const v = 20000 * p.floor * p.ratKills;
    this.score(v, r.x, r.y, '#e8e0d0');
    A.play('splat');
    this.fx.burst(r.x, r.y, { n: 18, color: '#8a1010', speed: 260, life: 0.6, h: 6 });
    this.fx.burst(r.x, r.y, { n: 8, color: '#b0a898', speed: 160, life: 0.5, h: 6 });
    this.shake(2);
    if (p.ratKills >= 6) {
      const bonus = 150000 * p.floor;
      this.after(0.3, () => {
        this.score(bonus, T.C, 760, '#ffd700');
        this.addGold(25, T.C, 760);
        this.fx.banner('EXTERMINATOR!', '#ffd700', '+' + U.fmt(bonus));
        A.play('jackpot');
      });
      PB.achieve('rats');
    }
  };

  // ---------------- rescue hurry-up ----------------
  G.startRescue = function () {
    const p = this.p;
    if (p.rescue || p.mb) return;
    const max = 300000 * p.floor;
    p.rescue = { v: max, max, t: 25 };
    A.play('shrine');
    this.fx.banner('RESCUE!', '#ffffff', 'AN ADVENTURER IS TRAPPED - SHOOT THE VAULT', 2.4);
    this.dmd.msg('HURRY UP!', 'SHOOT THE VAULT TO RESCUE', { dur: 2.2, blink: true, priority: 3 });
  };
  G.updateRescue = function (dt) {
    const p = this.p, r = p.rescue;
    if (!r) return;
    r.t -= dt;
    r.v = Math.max(r.max * 0.2, r.max * (r.t / 25));
    if (r.t <= 0) {
      p.rescue = null;
      A.play('drain');
      this.dmd.msg('TOO LATE...', 'THE ADVENTURER IS LOST', { dur: 1.8, priority: 2 });
    }
  };
  G.collectRescue = function (sc) {
    const p = this.p, r = p.rescue;
    p.rescue = null;
    this.score(r.v, sc.x, sc.y - 40, '#ffffff');
    this.addXP(60);
    this.addGold(20, sc.x, sc.y);
    A.play('jackpot');
    this.fx.banner('RESCUED!', '#ffffff', '+' + U.fmt(r.v));
    this.dmd.msg('RESCUED!', U.fmt(r.v), { dur: 2, big: true, border: true, priority: 4 });
    PB.achieve('rescue');
  };

  // ---------------- curses ----------------
  G.applyCurse = function () {
    const p = this.p;
    if (p.floor < 2) { p.curse = null; return; }
    const c = CURSES[(p.floor - 2) % CURSES.length];
    p.curse = c.id;
    for (const w of this.worlds) w.gScale = c.id === 'weight' ? 1.13 : p.floor >= 5 ? 1.06 : 1;
    this.after(5.5, () => {
      this.fx.banner('FLOOR ' + p.floor, '#c77dff', c.name, 2.6);
      this.dmd.msg(c.name, c.desc, { dur: 2.6, border: true, priority: 3 });
      A.play('roar', 'skeleton');
    });
  };

  // ---------------- Dragon's Den ----------------
  G.denOpen = function () {
    const p = this.p;
    return !!p && (p.denLit || (p.mb && p.mb.type === 'hoard'));
  };
  G.enterDeck = function (b, e, v) {
    const p = this.p;
    b.layer = 1;
    b.held = null;
    b.ramp = null;
    b.h = T.DECK_H;
    b.x = e.x; b.y = e.y;
    const l = Math.hypot(e.dx, e.dy) || 1;
    const sp = U.clamp(v, 250, 600);
    b.vx = (e.dx / l) * sp; b.vy = (e.dy / l) * sp + 120;
    b.trail.length = 0;
    if (!p || this.state !== 'play') return;
    p.denLit = false;
    p.den.visits++;
    p.den.dragonHits = 0;
    A.play('dragonRoar');
    this.shake(8);
    this.flash('#ff4a1a', 0.35);
    this.fx.banner("DRAGON'S DEN", '#ff4a1a', 'WAKE THE DRAGON', 2.2);
    this.dmd.msg("DRAGON'S DEN", 'UPPER FLIPPER: RIGHT BUTTON', { dur: 2.4, border: true, priority: 3 });
    this.score(50000 * p.floor);
    this.questStat('den');
    PB.achieve('den');
    PB.camFocus = { x: 300, y: -200, h: T.DECK_H, t: 0, dur: 1.6, zoom: 0.5 };
  };
  G.toReturnRamp = function (b) {
    b.layer = 0;
    b.held = 'ramp';
    b.ramp = { path: 'ret', s: 0, v: 420 };
    b.h = T.DECK_H;
    this.world2.clearSensorState(b);
    A.play('rampDown');
  };
  G.onDeckHit = function (kind, idx, b, imp, c) {
    const p = this.p;
    if (!p || p.tilted) return;
    const d = p.den;
    if (kind === 'deckBumper') {
      A.play('bumper', 1);
      this.score((p.frenzyT > 0 ? 25000 : 1500) * p.floor, c.x, c.y - 20, '#ffb347');
      this.fx.burst(c.x, c.y, { n: 12, color: '#ff8a1f', speed: 360, life: 0.5, fire: true, h: T.DECK_H + 30 });
      this.addCharge(1);
      this.questStat('bumper');
      return;
    }
    if (kind === 'egg') {
      if (imp < 90) return;
      c.wobble = 1;
      A.play('egg');
      if (!d.eggs[idx]) {
        d.eggs[idx] = true;
        this.score(15000 * p.floor, c.x, c.y);
        if (d.eggs.every(Boolean) && !d.hatched) {
          d.hatched = true;
          this.score(75000 * p.floor);
          A.play('dragonRoar');
          this.fx.banner('EGGS HATCHED!', '#9dff5a', 'DRAGON JACKPOTS DOUBLED', 2);
          this.fx.burst(c.x, c.y, { n: 40, color: '#9dff5a', speed: 400, life: 0.9, h: T.DECK_H + 20 });
          PB.achieve('hatch');
        }
      } else this.score(3000 * p.floor);
      return;
    }
    if (kind === 'dragon') {
      if (imp < 140 || d.hitCool > 0) return;
      d.hitCool = 0.3;
      d.flash = 1;
      d.dragonHits++;
      let v = 120000 * p.floor * (d.hatched ? 2 : 1);
      if (p.mb) v += p.jackpot;
      this.score(v, c.x, c.y + 30, '#ff8a3a');
      A.play('clang');
      A.play('dragonRoar');
      this.shake(6);
      this.fx.burst(b.x, b.y, { n: 24, color: '#ff6a1a', speed: 500, life: 0.7, fire: true, h: T.DECK_H + 30 });
      this.dmd.msg('DRAGON JACKPOT', U.fmt(v), { dur: 1.5, big: true, priority: 3 });
      this.fx.flasher('all', 1);
      this.questStat('mhit');
      if (d.dragonHits % 3 === 0) {
        d.breath = 2.2;
        const hv = 400000 * p.floor * (d.hatched ? 2 : 1);
        this.after(0.4, () => {
          this.score(hv, c.x, c.y + 60, '#ffd700');
          this.addGold(50, c.x, c.y + 50);
          this.fx.coins(c.x, c.y + 50, 40);
          A.play('jackpot');
          this.flash('#ff8a20', 0.7);
          this.shake(14);
          this.fx.banner("DRAGON'S HOARD!", '#ffb020', '+' + U.fmt(hv), 2.4);
          PB.achieve('dragon');
          PB.slowmo(0.3, 1.0, { x: c.x, y: c.y, h: T.DECK_H + 40, zoom: 0.55 });
        });
      }
    }
  };
  G.hoard = function (sc, b) {
    const p = this.p;
    const v = 60000 * p.floor;
    this.score(v, sc.x, sc.y - 30, '#ffd700');
    this.addGold(20, sc.x, sc.y);
    this.fx.banner('HOARD PIT', '#ffd700', '+' + U.fmt(v), 1.4);
    A.play('lock');
    this.after(1.2, () => this.eject(sc));
  };

  // ---------------- per frame ----------------
  G.updateFeatures = function (dt) {
    const p = this.p;
    if (p.frenzyT > 0) p.frenzyT -= dt;
    if (p.den.flash > 0) p.den.flash -= dt * 2;
    if (p.den.breath > 0) p.den.breath -= dt;
    if (p.den.hitCool > 0) p.den.hitCool -= dt;
    for (const e of this.parts.eggs) if (e.wobble > 0) e.wobble -= dt * 2;
    if (p.wing.crypt.exposed > 0) p.wing.crypt.exposed -= dt;
    this.updateRats(dt);
    this.updateRescue(dt);
    if (!p.mb && !p.tilted) {
      if (!p.rats.length) { p.ratT -= dt; if (p.ratT <= 0) { p.ratT = U.rand(60, 95); this.spawnRats(); } }
      if (!p.rescue) { p.rescueT -= dt; if (p.rescueT <= 0) { p.rescueT = U.rand(70, 110); this.startRescue(); } }
    }
    if (p.score >= 1e6) PB.achieve('million');
    if (p.score >= 1e7) PB.achieve('legend');
    if (p.level >= 5) PB.achieve('level5');
    if (p.relics.length >= 4) PB.achieve('relics4');
    for (const k of ['crypt', 'forge']) { const st = p.wing[k]; if (st.flash > 0) st.flash -= dt * 2; if (st.cool > 0) st.cool -= dt; }
    if (p.wing.forge.hammer > 0) p.wing.forge.hammer -= dt * 3;
    for (const W of Object.values(this.parts.wings)) for (const s of W.stands) if (s.wobble > 0) s.wobble -= dt * 3;
  };

  // ---------------- side tables: the Crypt & the Forge ----------------
  const WING = {
    crypt: { name: 'THE CRYPT', color: '#b46aff', sub: 'DESTROY THE LICH', fx: '#7dff9a' },
    forge: { name: 'THE FORGE', color: '#ff7a1a', sub: 'STRIKE THE ANVIL', fx: '#ffb030' },
  };
  G.wingOpen = function (kind) {
    const p = this.p;
    return !!p && (p[kind + 'Lit'] || (p.mb && p.mb.type === 'hoard'));
  };
  G.lightWing = function (kind) {
    const p = this.p;
    if (!p || p[kind + 'Lit']) return;
    p[kind + 'Lit'] = true;
    this.after(1.8, () => {
      this.fx.banner(WING[kind].name + ' OPEN', WING[kind].color, 'SHOOT THE ' + (kind === 'crypt' ? 'LEFT' : 'RIGHT') + ' ORBIT', 2);
      A.play('shrine');
    });
  };
  G.divertWing = function (b, kind) {
    b.held = 'ramp';
    b.ramp = { path: kind, s: 0, v: Math.max(320, -b.vy) };
    b.h = 0;
    this.world.clearSensorState(b);
    b.orbitFrom = null;
    A.play('rampUp');
    this.fx.flasher(kind === 'crypt' ? 'left' : 'right', 1);
  };
  G.enterWing = function (b, kind, e, v) {
    const p = this.p, W = this.parts.wings[kind];
    b.layer = W.layer;
    b.held = null; b.ramp = null;
    b.h = T.WING_H;
    b.x = e.x; b.y = e.y;
    const l = Math.hypot(e.dx, e.dy) || 1, sp = U.clamp(v, 250, 650);
    b.vx = (e.dx / l) * sp; b.vy = (e.dy / l) * sp + 100;
    b.trail.length = 0;
    if (!p || this.state !== 'play') return;
    p[kind + 'Lit'] = false;
    const st = p.wing[kind];
    st.visits++;
    A.play(kind === 'crypt' ? 'roar' : 'clang', 'skeleton');
    this.shake(6);
    this.flash(WING[kind].color, 0.3);
    this.fx.banner(WING[kind].name, WING[kind].color, WING[kind].sub, 2.2);
    this.dmd.msg(WING[kind].name, WING[kind].sub, { dur: 2.2, border: true, priority: 3 });
    this.score(60000 * p.floor);
    this.questStat(kind === 'crypt' ? 'cryptIn' : 'forgeIn');
    PB.achieve(kind === 'crypt' ? 'cryptIn' : 'forgeIn');
    if (p.den.visits && p.wing.crypt.visits && p.wing.forge.visits) PB.achieve('allTables');
    PB.camFocus = { x: W.cx, y: 620, h: T.WING_H, t: 0, dur: 1.4, zoom: 0.35 };
  };
  G.toWingReturn = function (b) {
    const kind = b.layer === 2 ? 'crypt' : 'forge';
    for (const w of this.worlds) w.clearSensorState(b);
    b.layer = 0;
    b.held = 'ramp';
    b.ramp = { path: kind + 'Ret', s: 0, v: 420 };
    b.h = T.WING_H;
    A.play('rampDown');
  };
  G.onWingHit = function (kind, idx, b, imp, c) {
    const p = this.p;
    if (!p || p.tilted) return;
    const layer = kind === 'wingBumper' || kind === 'lich' || kind === 'anvil' ? idx : Math.floor(idx / 10);
    const wk = layer === 2 ? 'crypt' : 'forge', W = this.parts.wings[wk], st = p.wing[wk], H = T.WING_H;
    if (kind === 'wingBumper') {
      A.play('bumper', 2);
      this.score((p.frenzyT > 0 ? 25000 : 2500) * p.floor, c.x, c.y - 20, WING[wk].fx);
      this.fx.burst(c.x, c.y, { n: 14, color: WING[wk].fx, speed: 380, life: 0.5, fire: true, h: H + 30 });
      this.fx.flasher(wk === 'crypt' ? 'left' : 'right', 0.6);
      this.addCharge(1);
      this.questStat('bumper');
      return;
    }
    if (kind === 'wingDrop') {
      const i = idx % 10, d = W.drops[i];
      if (d.down || imp < 110 || b.y < (d.ay + d.by) / 2) return;
      d.down = true; d.active = false;
      A.play('drop');
      this.score(12000 * p.floor, b.x, b.y);
      this.fx.burst(b.x, d.ay, { n: 14, color: WING[wk].fx, speed: 300, life: 0.6, h: H + 10 });
      if (wk === 'crypt') this.questStat('coffin');
      if (W.drops.every((x) => x.down)) {
        A.play('laneComplete');
        if (wk === 'crypt') {
          this.fx.banner('RAISE THE DEAD', '#7dff9a', 'THE LICH IS EXPOSED: DOUBLE DAMAGE', 2);
          st.exposed = 12;
          this.score(100000 * p.floor);
        } else {
          this.fx.banner('INGOTS SMELTED', '#ffd040', '+30 GOLD', 2);
          this.addGold(30, W.boss.x, W.boss.y);
          this.score(120000 * p.floor);
        }
        this.after(1.5, () => this.resetWingDrops(W));
      }
      return;
    }
    if (kind === 'wingStand') {
      const i = idx % 10, s = W.stands[i];
      if (imp < 90) return;
      s.wobble = 1;
      A.play('standup');
      if (!st.stands[i]) {
        st.stands[i] = true;
        this.score(8000 * p.floor, b.x, b.y);
        if (st.stands.every(Boolean)) {
          st.stands = [false, false];
          this.score(50000 * p.floor);
          this.addCharge(30);
          this.fx.banner(wk === 'crypt' ? 'GHOSTS BOUND' : 'BELLOWS PUMPED', WING[wk].color, '+50K • POWER +30', 1.6);
        }
      } else this.score(2000 * p.floor);
      return;
    }
    if (imp < 190 || st.cool > 0) return;
    st.cool = 0.4;
    st.flash = 1;
    if (kind === 'lich') {
      const dmg = 1 + (st.exposed > 0 ? 1 : 0) + (p.forgeDmg || 0);
      st.bossHP = Math.max(0, st.bossHP - dmg);
      A.play('crit');
      A.play('grunt', 'skeleton');
      this.shake(5);
      this.score(30000 * p.floor * dmg, c.x, c.y - 50, '#9dff5a');
      this.fx.burst(b.x, b.y, { n: 22, color: '#9dff5a', speed: 480, life: 0.7, h: H + 30 });
      this.dmd.msg('THE LICH', 'HP ' + st.bossHP + ' / ' + st.bossMax, { dur: 1.2, priority: 2 });
      if (st.bossHP <= 0) {
        st.kills++;
        const v = 750000 * p.floor;
        A.play('roar', 'skeleton');
        A.play('jackpot');
        this.fx.banner('LICH DESTROYED!', '#9dff5a', '+' + U.fmt(v), 2.4);
        this.fx.burst(c.x, c.y, { n: 120, color: '#9dff5a', speed: 900, life: 1.4, h: H + 40 });
        this.fx.coins(c.x, c.y, 30);
        this.fx.flasher('all', 1);
        this.score(v, c.x, c.y, '#ffd700');
        this.addXP(150);
        PB.slowmo(0.3, 1.0, { x: c.x, y: c.y, h: H + 40, zoom: 0.5 });
        PB.achieve('lich');
        if (!p.lichEB) { p.lichEB = true; p.extraBallLit = true; this.after(2.5, () => this.fx.banner('EXTRA BALL LIT', '#ff9a4a', 'AT THE SHRINE RAMP')); }
        st.bossMax += 5;
        this.after(3, () => { st.bossHP = st.bossMax; });
      }
      return;
    }
    if (kind === 'anvil') {
      st.hits++;
      st.hammer = 1;
      A.play('clang');
      this.shake(5);
      this.score(40000 * p.floor, c.x, c.y - 50, '#ffb030');
      this.fx.burst(c.x, c.y, { n: 30, color: '#ffd040', speed: 600, life: 0.6, h: H + 50 });
      this.questStat('anvil');
      if (st.hits % 4 === 0) {
        if ((p.forgeDmg || 0) < 3) {
          p.forgeDmg = (p.forgeDmg || 0) + 1;
          A.play('levelUp');
          this.fx.banner('WEAPON FORGED', '#ffb030', 'MONSTER DAMAGE +' + p.forgeDmg, 2.2);
          this.dmd.msg('WEAPON FORGED', 'ALL HITS +' + p.forgeDmg + ' DAMAGE', { dur: 2, border: true, priority: 3 });
          PB.achieve('smith');
          PB.slowmo(0.35, 0.8, { x: c.x, y: c.y, h: H + 40, zoom: 0.45 });
        } else {
          const v = 300000 * p.floor;
          this.score(v, c.x, c.y);
          this.fx.banner('MASTERWORK', '#ffd040', '+' + U.fmt(v), 1.8);
        }
      } else this.dmd.msg('THE ANVIL', 4 - (st.hits % 4) + ' MORE TO FORGE', { dur: 1.1, priority: 2 });
    }
  };
  G.resetWingDrops = function (W) {
    const blocked = this.world.balls.some((b) => b.alive && (b.layer || 0) === W.layer && W.drops.some((d) => Math.abs(b.y - d.ay) < 22 && b.x > Math.min(d.ax, d.bx) - 16 && b.x < Math.max(d.ax, d.bx) + 16));
    if (blocked) { this.after(0.4, () => this.resetWingDrops(W)); return; }
    for (const d of W.drops) { d.down = false; d.active = true; }
    A.play('drop');
  };
  G.wingSaucer = function (sc, b) {
    const p = this.p, crypt = sc.name === 'ossuary';
    if (crypt) {
      const v = 60000 * p.floor;
      this.score(v, sc.x, sc.y - 30, '#9dff5a');
      this.addGold(15, sc.x, sc.y);
      this.fx.banner('SOUL HARVEST', '#9dff5a', '+' + U.fmt(v), 1.4);
      A.play('shrine');
    } else {
      this.score(50000 * p.floor, sc.x, sc.y - 30, '#ffd040');
      this.addGold(40, sc.x, sc.y);
      this.fx.banner('MOLTEN GOLD', '#ffd040', '+40 GOLD', 1.4);
      A.play('lock');
    }
    this.after(1.2, () => this.eject(sc));
  };
})(window.PB);
