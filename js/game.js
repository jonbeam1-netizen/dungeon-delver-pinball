'use strict';
(function (PB) {
  const U = PB.U, A = PB.Audio, T = PB.T, P = PB.Phys;

  const MONSTERS = [
    { id: 'goblin', name: 'SNIK THE CUTPURSE', title: 'Goblin Raider', hp: 4, crop: { cx: 0.43, cy: 0.31, s: 0.36 }, color: '#8fdc5a', desc: 'Every hit shakes loose some gold.' },
    { id: 'skeleton', name: 'RATTLEBONES', title: 'Skeleton Warrior', hp: 5, crop: { cx: 0.48, cy: 0.29, s: 0.44 }, color: '#efe6c8', desc: 'Reassembles itself over time. Strike fast!' },
    { id: 'cyclops', name: 'GORRUM ONE-EYE', title: 'Cave Cyclops', hp: 6, crop: { cx: 0.6, cy: 0.22, s: 0.42 }, color: '#e0b86a', desc: 'Hit while the EYE is OPEN for triple damage.' },
    { id: 'mimic', name: 'THE HUNGERING CHEST', title: 'Mimic', hp: 5, crop: { cx: 0.5, cy: 0.52, s: 0.66 }, color: '#d08a40', desc: 'Bleeds gold with every hit... but it bites back.' },
    { id: 'demon', name: 'AZGAROTH', title: 'The Ember King', hp: 10, crop: { cx: 0.455, cy: 0.27, s: 0.34 }, color: '#ff5a1f', boss: true, desc: 'BOSS: Hellfire Multiball! Slay him to descend deeper.' },
  ];
  const HEROES = {
    paladin: {
      id: 'paladin', name: 'SIR ALDRIC', title: 'Paladin of the Verdant Oath', power: 'DIVINE AEGIS',
      powerDesc: 'Raises a holy post between the flippers, saves every drain and lights both kickbacks for 20 seconds.',
      passive: '+4s ball save, and the left kickback is lit at the start of every ball.',
      crop: { cx: 0.53, cy: 0.25, s: 0.5 },
    },
    crusader: {
      id: 'crusader', name: 'BROTHER CAEDMON', title: 'Crusader of the Red Blade', power: 'BLOOD OATH',
      powerDesc: 'For 20 seconds all scoring is doubled and every monster hit deals double damage.',
      passive: '25% critical-hit chance on monsters, and jackpots are worth +50%.',
      crop: { cx: 0.37, cy: 0.2, s: 0.42 },
    },
  };
  const RELICS = [
    { id: 'ring', icon: '💍', name: 'Ring of Fortitude', desc: '+6 seconds of ball save on every ball.' },
    { id: 'gauntlet', icon: '🧤', name: 'Ogre Gauntlets', desc: 'Every monster hit deals +1 damage.' },
    { id: 'coin', icon: '💰', name: 'Lucky Purse', desc: '+50% gold from every source.' },
    { id: 'phoenix', icon: '🐦‍🔥', alt: '🔥', name: 'Phoenix Feather', desc: 'Once, rescues a ball that would have drained.' },
    { id: 'haste', icon: '🌀', name: 'Rune of Haste', desc: 'Spinner and orbits score 3x.' },
    { id: 'key', icon: '🗝️', name: 'Vault Key', desc: 'Each RUNE target hit drops two targets.' },
    { id: 'torch', icon: '🕯️', name: 'Everburning Torch', desc: 'Braziers score 5x and charge your power twice as fast.' },
    { id: 'heart', icon: '❤️', name: 'Heart Container', desc: 'Instantly lights EXTRA BALL at the Shrine.' },
    { id: 'boots', icon: '👢', name: 'Boots of Recoil', desc: 'Completing HERO lights both kickbacks.' },
    { id: 'tome', icon: '📕', name: 'Tome of Wisdom', desc: '+50% experience. Level-ups give +1 Bonus X.' },
    { id: 'chalice', icon: '🏆', name: 'Chalice of Plenty', desc: 'Bonus multiplier starts at 2X every ball.' },
    { id: 'whetstone', icon: '🗡️', name: 'Whetstone', desc: 'CRIT READY hits deal +4 damage instead of +2.' },
  ];
  PB.DATA = { MONSTERS, HEROES, RELICS };

  class Game {
    constructor() {
      const t = T.build(this);
      this.table = t;
      this.world = t.world;
      this.world2 = t.world2;
      this.parts = t.parts;
      this.worlds = t.worlds;
      for (const w of this.worlds) w.onBallBall = (a, b, imp) => A.play('ballClack');
      this.lamps = t.lamps;
      this.state = 'attract';
      this.timers = [];
      this.time = 0;
      this.plunger = { charge: 0, held: false, pos: 0, vel: 0 };
      this.lampShow = null;
      this.bgMode = 'normal';
      this.world.onBallBall = (a, b, imp) => A.play('ballClack');
      this.p = null; // player state
      this.attract();
    }

    // ---------------- helpers ----------------
    after(sec, fn) { const tm = { t: sec, fn }; this.timers.push(tm); return tm; }
    get fx() { return PB.FX; }
    get dmd() { return PB.dmd; }
    get hero() { return this.p ? HEROES[this.p.hero] : null; }
    has(relic) { return this.p && this.p.relics.includes(relic); }
    ballsInPlay() { return this.world.balls.filter((b) => b.alive).length; }
    flash(color, k = 0.5) { this.fx && this.fx.flash(color, k); }
    shake(k) { this.fx && this.fx.shake(k); }
    haptic(ms) { if (PB.settings.haptics && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate(ms); } catch (e) {} }

    score(n, x, y, color) {
      if (!this.p || this.p.tilted) return 0;
      let v = n;
      if (this.p.ability === 'crusader' && this.p.abilityT > 0) v *= 2;
      v = Math.round(v);
      this.p.score += v;
      if (x != null && this.fx) this.fx.text(x, y, '+' + U.fmt(v), color || '#ffe9a8', v >= 50000 ? 1.4 : 1);
      return v;
    }
    addGold(n, x, y) {
      if (!this.p) return;
      let g = Math.round(n * (this.has('coin') ? 1.5 : 1));
      this.p.gold += g;
      this.p.ballGold += g;
      this.questStat('gold', g);
      if (x != null && this.fx) this.fx.coins(x, y, Math.min(12, 2 + Math.floor(g / 6)));
      A.play('coin', Math.min(3, 1 + Math.floor(g / 20)));
    }
    addXP(n) {
      const p = this.p;
      if (!p) return;
      p.xp += Math.round(n * (this.has('tome') ? 1.5 : 1));
      while (p.xp >= this.xpFor(p.level + 1)) {
        p.level++;
        p.bonusX = Math.min(10, p.bonusX + (this.has('tome') ? 2 : 1));
        this.addCharge(50);
        A.play('levelUp');
        this.dmd.msg('LEVEL UP!', 'HERO LEVEL ' + p.level + '  BONUS ' + p.bonusX + 'X', { dur: 2.2, big: true, border: true, priority: 3 });
        this.fx.banner('LEVEL ' + p.level + '!', '#9dff5a', 'BONUS ' + p.bonusX + 'X');
        this.fx && this.fx.burst(T.C, 700, { n: 40, color: '#9dff5a', speed: 500, life: 1.2, glow: true });
        this.flash('#9dff5a', 0.25);
      }
    }
    xpFor(level) { return 120 * (level - 1) * level / 2 * 1.25; }
    addCharge(n) {
      const p = this.p;
      if (!p || p.abilityT > 0) return;
      const was = p.charge;
      p.charge = Math.min(100, p.charge + n);
      if (was < 100 && p.charge >= 100) {
        A.play('confirm');
        this.dmd.msg(this.hero.power + ' READY', 'PRESS E OR TAP YOUR HERO', { dur: 2.4, blink: true, priority: 2 });
      }
    }

    // ---------------- game flow ----------------
    attract() {
      this.state = 'attract';
      this.p = null;
      this.timers = [];
      this.world.balls = [];
      this.parts.post.active = false;
      for (const w of this.worlds) w.gScale = 1;
      for (const d of this.parts.drops) { d.active = true; d.down = false; }
      for (const W of Object.values(this.parts.wings)) for (const d of W.drops) { d.active = true; d.down = false; }
      for (const s of this.parts.saucers) s.held = null;
      this.setBG('normal');
      this.lampShow = { type: 'attract', t: 0 };
      if (A.Music) A.Music.set('title');
    }

    startGame(heroId) {
      this.timers = [];
      this.world.balls = [];
      for (const s of this.parts.saucers) s.held = null;
      this.p = {
        hero: heroId, score: 0, ball: 1, totalBalls: PB.settings.balls, extraBalls: 0,
        bonusX: 1, gold: 0, xp: 0, level: 1, floor: 1, monIdx: 0, mon: null,
        relics: [], charge: 0, abilityT: 0, ability: null,
        relicLit: false, lockLit: false, locks: 0, extraBallLit: false, shrineEB: false,
        mb: null, jackpot: 150000, jackpots: 0, superLit: false,
        topLanes: [false, false, false], heroLanes: [false, false, false, false],
        slay: [false, false, false, false], critReady: false,
        kick: [false, false], ballSave: 0, tilted: false, tiltLevel: 0, tiltWarn: 0,
        combo: 0, comboT: 0, lastShot: null, skillLane: -1, skillT: 0,
        slain: 0, ballSlain: 0, ballTargets: 0, ballGold: 0, phoenixUsed: false,
        stillT: 0, monstersKilled: 0, floorsCleared: 0,
      };
      this.initFeatures(this.p);
      this.lampShow = { type: 'flash', t: 0, dur: 1.2 };
      this.state = 'play';
      this.resetDrops(true);
      A.play('start');
      A.Music.set('normal');
      this.spawnMonster(true);
      this.startBall();
    }

    startBall() {
      const p = this.p;
      p.tilted = false; p.tiltLevel = 0; p.tiltWarn = 0; p.ballSave = 0;
      if (this.dmd) this.dmd.scenes = this.dmd.scenes.filter((s) => s.priority < 6);
      this.lampShow = null;
      p.bonusX = this.has('chalice') ? 2 : 1;
      p.ballSlain = 0; p.ballTargets = 0; p.ballGold = 0;
      p.rats = []; p.rescue = null; p.frenzyT = 0;
      p.kick = [p.hero === 'paladin', false];
      p.combo = 0;
      for (const f of this.allFlippers()) f.enabled = true;
      this.state = 'play';
      this.serveBall(false);
      this.dmd.msg('BALL ' + p.ball, this.p.mon ? this.p.mon.def.name : '', { dur: 1.8, big: true, priority: 2 });
    }

    serveBall(auto, delay = 0) {
      const b = new P.Ball(T.PLUNGER.x, T.PLUNGER.restY - 4);
      if (this.p && this.p.mb) b.skin = this.p.mb.type === 'hoard' ? 'gold' : 'ember';
      this.world.balls.push(b);
      const p = this.p;
      if (!auto && p) {
        p.skillLane = U.randi(0, 2);
        p.skillT = 0;
        b.skill = true;
      }
      if (auto) this.after(0.45 + delay, () => { if (b.alive && this.inShooter(b)) this.launch(U.rand(0.88, 1)); });
      return b;
    }
    inShooter(b) { return b.x > T.R + 4 && b.y > 600 && !(b.layer || 0); }
    allFlippers() {
      const P2 = this.parts;
      return [...P2.flippers, P2.upperLeft, P2.upperFlipper, ...P2.wings.crypt.flippers, ...P2.wings.forge.flippers];
    }
    ballWaiting() { return this.state === 'play' && this.world.balls.some((b) => b.alive && this.inShooter(b) && !b.launched); }

    launch(power) {
      const balls = this.world.balls.filter((b) => b.alive && this.inShooter(b) && b.y > T.PLUNGER.restY - 30 && Math.abs(b.vy) < 300);
      for (const b of balls) {
        b.vy = -(950 + power * 2150);
        b.launched = true;
        if (b.skill) b.skillArmed = true;
        if (this.p && this.p.ballSave <= 0 && !b.saved) this.p.ballSave = this.ballSaveTime();
      }
      A.play('plungeRelease', power);
      this.plunger.vel = -16 * (0.3 + power);
    }
    ballSaveTime() {
      let t = 10;
      if (this.p.hero === 'paladin') t += 4;
      if (this.has('ring')) t += 6;
      if (this.p.curse === 'frailty') t = Math.ceil(t / 2);
      return t;
    }

    drain(b) {
      b.alive = false;
      for (const w of this.worlds) w.clearSensorState(b);
      const p = this.p;
      if (!p) return;
      const left = this.ballsInPlay();
      if (this.state !== 'play') return;
      if (p.tilted) {
        if (left === 0) this.after(1, () => this.endBall());
        return;
      }
      const saving = p.ballSave > 0 || (p.ability === 'paladin' && p.abilityT > 0);
      if (left >= 1) {
        if (p.mb && left === 1) {
          if (saving) { this.saveBall('BALL SAVED'); return; }
          this.endMultiball();
        }
        return;
      }
      // last ball drained
      if (saving) {
        this.saveBall('BALL SAVED');
        return;
      }
      if (p.mb) this.endMultiball(true);
      if (this.has('phoenix') && !p.phoenixUsed) {
        p.phoenixUsed = true;
        this.saveBall('PHOENIX REBIRTH!');
        this.fx.burst(T.C, 1000, { n: 80, color: '#ff8a1f', speed: 900, life: 1.4, glow: true });
        return;
      }
      A.play('drain');
      this.flash('#000', 0.6);
      this.lampShow = { type: 'drain', t: 0, dur: 1.2 };
      this.after(1.0, () => this.endBall());
    }
    saveBall(text) {
      A.play('ballSave');
      this.dmd.msg(text, 'GET BACK IN THERE!', { dur: 1.6, blink: true, priority: 2 });
      this.fx.banner(text, '#7df9ff', '', 1.4);
      this.fx.burst(T.C, 1040, { n: 30, color: '#7df9ff', speed: 400, life: 0.9, glow: true });
      const b = this.serveBall(true);
      b.saved = true;
    }

    endBall() {
      const p = this.p;
      if (!p || this.state === 'bonus' || this.state === 'over') return;
      this.state = 'bonus';
      if (p.abilityT > 0) this.endAbility();
      if (p.mb) this.endMultiball(true);
      for (const f of this.parts.flippers) f.enabled = false;
      const rows = [];
      if (!p.tilted) {
        rows.push(['MONSTERS SLAIN', p.ballSlain, 25000]);
        rows.push(['TARGETS', p.ballTargets, 1500]);
        rows.push(['GOLD FOUND', p.ballGold, 60]);
        rows.push(['HERO LEVEL', p.level, 5000]);
        rows.push(['QUESTS DONE', p.questsDone, 20000]);
      }
      const base = rows.reduce((s, r) => s + r[1] * r[2], 0);
      const total = base * p.bonusX;
      let t = 0;
      const seq = [];
      for (const r of rows) seq.push({ l1: r[0], l2: U.fmt(r[1]) + ' X ' + U.fmt(r[2]), dur: 0.75 });
      if (!p.tilted) seq.push({ l1: 'BONUS X ' + p.bonusX, l2: '= ' + U.fmt(total), dur: 1.3 });
      else seq.push({ l1: 'TILT', l2: 'NO BONUS', dur: 1.5 });
      for (const s of seq) {
        this.after(t, () => {
          A.play('bonusTick');
          this.dmd.msg(s.l1, s.l2, { dur: s.dur, priority: 4 });
        });
        t += s.dur;
      }
      this.after(t, () => {
        p.score += total;
        if (total > 0) A.play('coin', 3);
        if (p.extraBalls > 0) {
          p.extraBalls--;
          this.dmd.msg('SHOOT AGAIN', 'SAME PLAYER', { dur: 1.6, big: true, blink: true, priority: 4 });
          A.play('extraBall');
          this.after(1.6, () => this.startBall());
        } else if (p.ball >= p.totalBalls) {
          this.gameOver();
        } else {
          p.ball++;
          this.after(0.3, () => this.startBall());
        }
      });
    }

    gameOver() {
      const p = this.p;
      this.state = 'over';
      A.play('gameOver');
      A.Music.set('title');
      this.dmd.msg('GAME OVER', 'SCORE ' + U.fmt(p.score), { dur: 3.5, big: true, priority: 5 });
      this.lampShow = { type: 'attract', t: 0 };
      this.after(2.5, () => PB.UI.gameOver(p));
    }

    // ---------------- monsters ----------------
    spawnMonster(first) {
      const p = this.p;
      const def = MONSTERS[p.monIdx];
      const hp = def.hp + (p.floor - 1) * (def.boss ? 4 : 2);
      p.mon = { def, hp, max: hp, t: 0, hitCool: 0, eye: false, eyeT: 3, regenT: 10, dead: false, deadT: 0, hitFlash: 0, attackT: 9, wobble: 0 };
      PB.UI && PB.UI.monsterChanged && PB.UI.monsterChanged(def);
      const img = PB.monsterDots && PB.monsterDots[def.id];
      if (!first) {
        A.play('grunt', def.id);
        this.fx.banner(def.boss ? 'BOSS APPEARS' : 'A FOE APPEARS', def.color, def.name);
        this.dmd.show({
          dur: 3,
          draw: (d, t) => {
            d.image(img, 0, 0, 32, 32, Math.min(1, t * 2));
            d.text(def.boss ? 'BOSS APPEARS!' : 'A FOE APPEARS', 80, 2, { align: 'center', l: Math.floor(t * 6) % 2 ? 15 : 9 });
            d.text(def.name, 80, 13, { align: 'center', l: 15 });
            d.text('HP ' + hp + '  FLOOR ' + p.floor, 80, 23, { align: 'center', l: 10 });
          },
        }, 3);
      }
      if (def.boss) this.after(first ? 0.5 : 2.6, () => this.startBoss());
    }

    damageMonster(ball) {
      const p = this.p, m = p.mon;
      if (!m || m.dead || m.hitCool > 0) return;
      m.hitCool = 0.22;
      let dmg = 1 + (this.has('gauntlet') ? 1 : 0) + (p.forgeDmg || 0);
      let crit = false;
      if (p.critReady) { dmg += this.has('whetstone') ? 4 : 2; p.critReady = false; crit = true; }
      if (p.hero === 'crusader' && Math.random() < 0.25) { dmg += 1; crit = true; }
      if (m.def.id === 'cyclops' && m.eye) { dmg *= 3; crit = true; }
      if (p.ability === 'crusader' && p.abilityT > 0) dmg *= 2;
      m.hp = Math.max(0, m.hp - dmg);
      m.hitFlash = 1;
      m.wobble = 1;
      p.ballTargets++;
      A.play(crit ? 'crit' : 'clang');
      A.play('grunt', m.def.id);
      this.haptic(20);
      const lair = this.parts.monster;
      this.fx.burst(ball.x, ball.y, { n: crit ? 30 : 16, color: crit ? '#ff3030' : '#fff1c0', speed: crit ? 650 : 420, life: 0.6, glow: true });
      this.fx.text(lair.x, lair.y - 70, (crit ? 'CRIT -' : '-') + dmg, crit ? '#ff4040' : '#ffffff', crit ? 1.8 : 1.3);
      this.shake(crit ? 7 : 3);
      this.score(5000 * dmg * p.floor, ball.x, ball.y - 20);
      this.addXP(10 * dmg);
      this.addCharge(4);
      if (m.def.id === 'goblin') this.addGold(6, lair.x, lair.y);
      if (m.def.id === 'mimic') {
        if (Math.random() < 0.25 && p.gold > 0) {
          const lost = Math.max(5, Math.round(p.gold * 0.1));
          p.gold = Math.max(0, p.gold - lost);
          this.dmd.msg('CHOMP!', 'THE MIMIC ATE ' + lost + ' GOLD', { dur: 1.4, priority: 2 });
          this.fx.text(lair.x, lair.y + 60, '-' + lost + ' GOLD', '#ff6060', 1.2);
        } else this.addGold(14, lair.x, lair.y);
      }
      if (p.mb) this.jackpot(ball);
      else if (!crit) this.dmd.msg(m.def.name, 'HP ' + m.hp + ' / ' + m.max, { dur: 1.0, priority: 1 });
      else this.dmd.msg('CRITICAL HIT!', '-' + dmg + ' HP', { dur: 1.1, big: true, priority: 2 });
      this.shot('monster');
      this.questStat('mhit');
      if (m.hp <= 0) this.killMonster();
    }

    killMonster() {
      const p = this.p, m = p.mon, def = m.def;
      m.dead = true;
      m.deadT = 0;
      p.slain++; p.ballSlain++; p.monstersKilled++;
      const lair = this.parts.monster;
      PB.slowmo(def.boss ? 0.18 : 0.3, def.boss ? 1.6 : 0.9, { x: lair.x, y: lair.y, h: 60, zoom: def.boss ? 0.55 : 0.4 });
      PB.achieve('first_blood');
      A.play('roar', def.id);
      this.after(0.5, () => A.play('fanfare', true));
      this.shake(14);
      this.flash(def.color, 0.7);
      this.haptic(80);
      this.fx.burst(lair.x, lair.y, { n: 110, color: def.color, speed: 900, life: 1.4, glow: true });
      this.fx.burst(lair.x, lair.y, { n: 50, color: '#ffffff', speed: 600, life: 0.8, glow: true });
      this.fx.ring(lair.x, lair.y, def.color);
      const pts = 75000 * (p.monIdx + 1) * p.floor;
      this.score(pts, lair.x, lair.y - 30, '#ffd700');
      this.addGold(20 * (p.monIdx + 1) * p.floor, lair.x, lair.y);
      this.addXP(60 * (p.monIdx + 1));
      this.addCharge(25);
      let quick = m.t < 25;
      if (quick) this.after(1.2, () => { this.score(50000 * p.floor, lair.x, lair.y + 40, '#7df9ff'); this.dmd.msg('QUICK KILL!', '+' + U.fmt(50000 * p.floor), { dur: 1.3, priority: 3 }); });
      this.lampShow = { type: 'flash', t: 0, dur: 1.5 };
      this.fx.banner(def.boss ? 'BOSS SLAIN!' : 'SLAIN!', def.color, def.name);
      this.fx.flasher('all', 1);
      this.after(0.25, () => this.fx.flasher('all', 1));
      this.after(0.5, () => this.fx.flasher('all', 1));
      const img = PB.monsterDots && PB.monsterDots[def.id];
      this.dmd.show({
        dur: 2.6,
        draw: (d, t) => {
          if (Math.floor(t * 10) % 2 === 0 || t > 1) d.image(img, 0, 0, 32, 32, Math.max(0, 1 - t * 0.5));
          d.text(def.boss ? 'BOSS SLAIN!' : 'SLAIN!', 80, 3, { align: 'center', scale: def.boss ? 1 : 2, l: 15 });
          d.text(U.fmt(pts), 80, def.boss ? 14 : 20, { align: 'center', l: 12 });
          if (def.boss) d.text('FLOOR ' + p.floor + ' CLEARED', 80, 24, { align: 'center', l: 10 });
        },
      }, 4);
      if (def.boss) {
        p.floorsCleared++;
        PB.achieve('floor');
        this.after(2.7, () => {
          const b = 400000 * p.floor;
          this.score(b, T.C, 600, '#ffd700');
          A.play('jackpot');
          this.dmd.msg('DESCEND DEEPER', 'FLOOR BONUS ' + U.fmt(b), { dur: 2.4, big: true, border: true, priority: 4 });
          if (!p.extraBallLit && p.extraBalls < 2) {
            p.extraBallLit = true;
            this.after(2.5, () => this.dmd.msg('EXTRA BALL LIT', 'SHOOT THE SHRINE', { dur: 2, blink: true, priority: 3 }));
          }
          this.setBG('normal');
          if (!p.mb) A.Music.set('normal');
        });
        p.floor++;
        p.monIdx = 0;
        this.applyCurse();
      } else {
        p.monIdx++;
      }
      if (!p.relicLit) {
        p.relicLit = true;
        this.after(def.boss ? 5.5 : 2.8, () => this.dmd.msg('RELIC AWAITS', 'SHOOT THE VAULT', { dur: 2, blink: true, priority: 2 }));
      }
      this.after(def.boss ? 5.5 : 2.6, () => { if (this.p === p) this.spawnMonster(false); });
    }

    startBoss() {
      const p = this.p;
      if (!p || this.state !== 'play') return;
      this.setBG('boss');
      A.Music.set('boss');
      A.play('roar', 'demon');
      this.shake(10);
      this.flash('#ff3b00', 0.5);
      this.dmd.msg('HELLFIRE', 'MULTIBALL', { dur: 2.2, big: true, border: true, priority: 4 });
      this.fx.banner('HELLFIRE!', '#ff5a1f', 'THE EMBER KING AWAKENS', 2.4);
      if (!p.mb) this.startMultiball('hellfire', 1);
    }

    // ---------------- multiball ----------------
    startMultiball(type, add) {
      const p = this.p;
      p.mb = { type, t: 0 };
      p.jackpots = 0;
      p.superLit = false;
      p.ballSave = Math.max(p.ballSave, 12);
      for (const b of this.world.balls) if (b.alive) b.skin = type === 'hoard' ? 'gold' : 'ember';
      for (let i = 0; i < add; i++) this.serveBall(true, i * 0.9);
      this.lampShow = { type: 'flash', t: 0, dur: 2 };
      if (type === 'hoard') {
        this.setBG('hoard');
        A.Music.set('multiball');
        A.play('fanfare', false);
        this.flash('#ffd700', 0.7);
        this.fx.coins(T.C, 300, 40);
        this.dmd.msg('TREASURE HOARD', 'MULTIBALL!', { dur: 2.5, big: true, border: true, priority: 4 });
        this.fx.banner('MULTIBALL!', '#ffd700', 'TREASURE HOARD', 2.4);
        PB.achieve('hoard');
        PB.slowmo(0.35, 0.7, { x: 128, y: 418, h: 30, zoom: 0.3 });
      }
    }
    endMultiball(silent) {
      const p = this.p;
      if (!p || !p.mb) return;
      const type = p.mb.type;
      p.mb = null;
      for (const b of this.world.balls) b.skin = 'steel';
      if (!silent) this.dmd.msg('MULTIBALL OVER', 'JACKPOTS: ' + p.jackpots, { dur: 2, priority: 3 });
      const boss = p.mon && p.mon.def.boss && !p.mon.dead;
      this.setBG(boss ? 'boss' : 'normal');
      A.Music.set(boss ? 'boss' : 'normal');
    }
    jackpot(ball) {
      const p = this.p;
      let v = p.jackpot * (p.hero === 'crusader' ? 1.5 : 1) * (p.mb.type === 'hellfire' ? 0.6 : 1);
      p.jackpots++;
      this.score(v, ball.x, ball.y - 40, '#ffd700');
      p.jackpot += 25000;
      A.play('jackpot');
      this.flash('#ffd700', 0.6);
      this.shake(9);
      this.fx.coins(this.parts.monster.x, this.parts.monster.y, 25);
      this.dmd.msg('JACKPOT!', U.fmt(v), { dur: 1.8, big: true, border: true, priority: 3 });
      this.fx.banner('JACKPOT!', '#ffd700', U.fmt(v));
      this.fx.flasher('all', 1);
      if (p.jackpots >= 3 && !p.superLit && p.mb.type === 'hoard') {
        p.superLit = true;
        this.after(1.8, () => this.dmd.msg('SUPER JACKPOT', 'IS LIT AT THE VAULT', { dur: 2, blink: true, priority: 3 }));
      }
    }

    // ---------------- ability ----------------
    useAbility() {
      const p = this.p;
      if (!p || this.state !== 'play' || p.charge < 100 || p.abilityT > 0 || p.tilted) return;
      p.charge = 0;
      p.abilityT = 20;
      p.ability = p.hero;
      this.flash(p.hero === 'paladin' ? '#bfffd0' : '#ff2a2a', 0.8);
      this.shake(8);
      this.lampShow = { type: 'flash', t: 0, dur: 1.2 };
      if (p.hero === 'paladin') {
        A.play('aegis');
        this.parts.post.active = true;
        p.kick = [true, true];
        this.dmd.msg('DIVINE AEGIS', 'NOTHING SHALL PASS', { dur: 2.2, big: true, border: true, priority: 4 });
        this.fx.banner('DIVINE AEGIS', '#bfffd0', 'NOTHING SHALL PASS');
        this.fx.burst(T.C, 1040, { n: 70, color: '#bfffd0', speed: 600, life: 1.2, glow: true });
      } else {
        A.play('rage');
        this.dmd.msg('BLOOD OATH', 'DOUBLE DAMAGE + SCORE', { dur: 2.2, big: true, border: true, priority: 4 });
        this.fx.banner('BLOOD OATH', '#ff3a3a', 'DOUBLE DAMAGE');
        this.fx.burst(T.C, 900, { n: 70, color: '#ff2a2a', speed: 700, life: 1.2, glow: true });
      }
    }
    endAbility() {
      const p = this.p;
      p.abilityT = 0;
      if (p.ability === 'paladin') {
        this.parts.post.active = false;
        // don't drop the post onto a ball resting there
      }
      p.ability = null;
    }

    // ---------------- shots & combos ----------------
    shot(name) {
      const p = this.p;
      if (p.comboT > 0 && p.lastShot && p.lastShot !== name) {
        p.combo++;
        const v = 15000 * p.combo;
        this.score(v);
        A.play('combo', p.combo);
        this.dmd.msg(p.combo + 'X COMBO', '+' + U.fmt(v), { dur: 1.2, big: true, priority: 2 });
        if (p.combo >= 2) this.fx.banner(p.combo + 'X COMBO', '#5aff8a', '+' + U.fmt(v), 1.2);
        this.questStat('combo', p.combo + 1, true);
        if (p.combo + 1 >= 5) PB.achieve('combo5');
        this.addXP(8 * p.combo);
      } else if (p.comboT <= 0) p.combo = 0;
      p.comboT = 4;
      p.lastShot = name;
    }

    // ---------------- inputs ----------------
    flipper(side, down) {
      const f = this.parts.flippers[side];
      if (f.pressed === down) return;
      f.pressed = down;
      if (side === 1) this.parts.upperFlipper.pressed = down;
      else this.parts.upperLeft.pressed = down;
      for (const W of Object.values(this.parts.wings)) W.flippers[side].pressed = down;
      if (this.state === 'relic') { if (down) PB.UI.relicMove(side ? 1 : -1); return; }
      if (this.state === 'bonus' && down && this.parts.flippers[0].pressed && this.parts.flippers[1].pressed) {
        // fast-forward bonus
        for (const t of this.timers) t.t = Math.min(t.t, 0.05);
      }
      if (!f.enabled || this.state !== 'play') return;
      if (down) {
        A.play('flipUp');
        const p = this.p;
        if (p) {
          // lane change
          const dir = side === 0 ? -1 : 1;
          p.topLanes = rot(p.topLanes, dir);
          p.heroLanes = rot(p.heroLanes, dir);
          if (p.skillLane >= 0 && this.world.balls.some((b) => b.alive && b.skill && !b.launched)) p.skillLane = (p.skillLane + dir + 3) % 3;
        }
      } else A.play('flipDown');
    }
    plungerDown(down) {
      if (this.state === 'relic') { if (down) PB.UI.relicConfirm(); return; }
      if (this.state !== 'play') return;
      const pl = this.plunger;
      if (down && !pl.held) {
        pl.held = true;
        pl.charge = 0;
        if (this.world.balls.some((b) => b.alive && this.inShooter(b))) A.play('plungeCharge');
      } else if (!down && pl.held) {
        pl.held = false;
        this.launch(pl.charge);
        pl.charge = 0;
      }
    }
    nudge(dx, dy) {
      if (this.state !== 'play' || !this.p || this.p.tilted) return;
      const p = this.p;
      for (const b of this.world.balls) if (b.alive && !b.held) { b.vx += dx * 160; b.vy += dy * 160; }
      this.fx.nudge(dx * 6, dy * 6);
      A.play('wall', 1);
      p.tiltLevel += 1;
      if (p.tiltLevel > 2.2) {
        p.tiltWarn++;
        p.tiltLevel = 0.6;
        if (p.tiltWarn >= 3) this.tilt();
        else {
          A.play('tiltWarn');
          this.dmd.msg('DANGER', 'WARNING ' + p.tiltWarn + ' OF 2', { dur: 1.2, blink: true, priority: 3 });
        }
      }
    }
    tilt() {
      const p = this.p;
      p.tilted = true;
      A.play('tilt');
      for (const f of this.parts.flippers) { f.enabled = false; }
      this.lampShow = { type: 'off', t: 0 };
      this.dmd.show({ dur: 99, draw: (d, t) => d.bigText('TILT', 9, Math.floor(t * 3) % 2 ? 15 : 6) }, 6);
      this.fx.banner('TILT', '#ff3030', '', 3);
      PB.achieve('tilt');
      for (const f of this.allFlippers()) f.enabled = false;
      this.parts.post.active = false;
      p.ballSave = 0;
      if (p.abilityT > 0) this.endAbility();
      for (const s of this.parts.saucers) if (s.held) this.eject(s, 0.3);
    }

    // ---------------- collisions ----------------
    onHit(kind, idx, b, imp, c) {
      const p = this.p;
      if (kind === 'wingBumper' || kind === 'lich' || kind === 'anvil' || kind === 'wingDrop' || kind === 'wingStand') {
        if (this.state === 'attract') { if (kind === 'wingBumper') A.play('bumper', 2); return; }
        return this.onWingHit(kind, idx, b, imp, c);
      }
      if (kind === 'dragon' || kind === 'egg' || kind === 'deckBumper') {
        if (this.state === 'attract') { if (kind === 'deckBumper') A.play('bumper', 1); return; }
        return this.onDeckHit(kind, idx, b, imp, c);
      }
      if (this.state === 'attract') {
        if (kind === 'bumper') A.play('bumper', idx);
        return;
      }
      if (!p || p.tilted) {
        if (kind === 'wall' && imp > 500) A.play('wall', 0.5);
        return;
      }
      switch (kind) {
        case 'wall':
          if (imp > 400) A.play('wall', Math.min(1, imp / 2000));
          break;
        case 'rubber':
          if (imp > 150) { A.play('rubber', Math.min(1, imp / 1500)); this.score(10); }
          break;
        case 'flipper':
          if (imp > 300) A.play('flipperHit', Math.min(1, imp / 1500));
          break;
        case 'sling': {
          A.play('sling');
          this.fx.flasher(idx ? 'right' : 'left', 0.8);
          this.score(110 * p.floor, b.x, b.y);
          this.addCharge(1);
          this.fx.burst(b.x, b.y, { n: 8, color: '#ffb347', speed: 300, life: 0.4 });
          this.haptic(10);
          break;
        }
        case 'bumper': {
          A.play('bumper', idx);
          const mult = (this.has('torch') ? 5 : 1) * (p.frenzyT > 0 ? 25 : 1);
          this.score(1000 * p.floor * mult, c.x, c.y - 30, '#ffb347');
          this.addCharge(this.has('torch') ? 2 : 1);
          this.questStat('bumper');
          this.fx.flasher('top', 0.7);
          this.addXP(1);
          this.fx.burst(c.x, c.y, { n: 14, color: '#ff8a1f', speed: 380, life: 0.55, glow: true, fire: true });
          this.shake(2);
          this.haptic(12);
          if (p.mon && p.mon.def.id === 'skeleton' && !p.mon.dead) {
            // bones rattle when the braziers fire
          }
          break;
        }
        case 'monster':
          if (imp > 160 && !(p.mon && p.mon.dead)) this.damageMonster(b);
          else A.play('rubber', 0.6);
          break;
        case 'drop': {
          const d = this.parts.drops[idx];
          if (d.down || imp < 120 || c && b.x < d.ax) break;
          this.dropTarget(idx, b);
          if (this.has('key')) {
            const next = this.parts.drops.findIndex((x) => !x.down);
            if (next >= 0) this.dropTarget(next, b);
          }
          break;
        }
        case 'standup': {
          const s = this.parts.standups[idx];
          if (imp < 100 || b.x > s.ax) break;
          s.wobble = 1;
          A.play('standup');
          p.ballTargets++;
          this.addCharge(3);
          if (!p.slay[idx]) {
            p.slay[idx] = true;
            this.score(5000 * p.floor, b.x, b.y);
            if (p.slay.every(Boolean)) {
              p.slay = [false, false, false, false];
              p.critReady = true;
              this.questStat('slayset');
              this.lightWing('forge');
              this.score(30000 * p.floor);
              A.play('laneComplete');
              this.dmd.msg('S-L-A-Y', 'CRIT READY: NEXT HIT +' + (this.has('whetstone') ? 4 : 2), { dur: 2, border: true, priority: 2 });
              this.lampShow = { type: 'flashGroup', ids: ['slay0', 'slay1', 'slay2', 'slay3', 'crit'], t: 0, dur: 1 };
            }
          } else this.score(1000 * p.floor, b.x, b.y);
          break;
        }
      }
    }

    dropTarget(idx, b) {
      const p = this.p;
      const d = this.parts.drops[idx];
      d.down = true;
      d.active = false;
      A.play('drop');
      p.ballTargets++;
      this.score(3000 * p.floor, d.ax + 20, d.ay + 14);
      this.addCharge(3);
      this.addXP(2);
      this.fx.burst(d.ax, d.ay + 14, { n: 10, color: '#c77dff', speed: 300, life: 0.5, glow: true });
      this.questStat('rune');
      if (this.parts.drops.every((x) => x.down)) {
        A.play('laneComplete');
        this.score(25000 * p.floor);
        this.lampShow = { type: 'flashGroup', ids: ['rune0', 'rune1', 'rune2', 'rune3', 'vault', 'lock0', 'lock1', 'lock2'], t: 0, dur: 1.2 };
        if (p.mb) {
          p.jackpot += 50000;
          this.dmd.msg('RUNES COMPLETE', 'JACKPOT +50,000', { dur: 1.8, priority: 2 });
        } else if (!p.lockLit) {
          p.lockLit = true;
          this.dmd.msg('LOCK IS LIT', 'SHOOT THE VAULT', { dur: 2, blink: true, border: true, priority: 2 });
        } else {
          this.addGold(10, d.ax + 20, d.ay);
        }
        this.after(1.4, () => this.resetDrops());
      }
    }
    resetDrops(force) {
      for (const d of this.parts.drops) {
        // don't pop a target up through a ball
        const blocked = !force && this.world.balls.some((b) => b.alive && Math.abs(b.x - d.ax) < 22 && b.y > d.ay - 16 && b.y < d.by + 16);
        if (blocked) { this.after(0.4, () => this.resetDrops()); return; }
      }
      for (const d of this.parts.drops) { d.down = false; d.active = true; }
      if (!force) A.play('drop');
    }

    // ---------------- sensors ----------------
    onSense(kind, idx, b, dir) {
      const p = this.p;
      if (kind === 'saucer') return this.capture(idx, b);
      if (kind === 'deckDrain') { if ((b.layer || 0) === 1 && b.vy > 0) this.toReturnRamp(b); return; }
      if (kind === 'wingDrain') { if ((b.layer || 0) === idx && b.vy > 0) this.toWingReturn(b); return; }
      if (kind === 'orbit' && b.vy < 0 && !b.held && p && this.state === 'play' && !p.tilted) {
        const wk = idx === 0 ? 'crypt' : 'forge';
        if (this.wingOpen(wk)) { this.divertWing(b, wk); return; }
      }
      if (kind === 'rampEnter') {
        if (b.vy >= 0 || b.held || (p && p.tilted)) return;
        b.held = 'ramp';
        b.ramp = { path: this.denOpen() ? 'den' : 'shrine', s: 0, v: Math.max(200, -b.vy * 0.95) };
        b.h = 0;
        this.world.clearSensorState(b);
        A.play('rampUp');
        return;
      }
      if (!p || this.state !== 'play') return;
      if (p.tilted && kind !== 'saucer') return;
      switch (kind) {
        case 'topLane': {
          A.play('rollover');
          if (b.skillArmed && idx === p.skillLane && !b.skillUsed) {
            b.skillUsed = true;
            const v = 50000 * p.floor;
            this.score(v, b.x, b.y + 30, '#7df9ff');
            A.play('skillShot');
            this.addCharge(20);
            this.flash('#7df9ff', 0.4);
            this.dmd.msg('SKILL SHOT!', '+' + U.fmt(v), { dur: 1.8, big: true, border: true, priority: 3 });
            this.fx.banner('SKILL SHOT!', '#7df9ff', '+' + U.fmt(v));
            PB.achieve('skill');
          }
          b.skillArmed = false;
          if (!p.topLanes[idx]) {
            p.topLanes[idx] = true;
            this.score(4000 * p.floor, b.x, b.y + 20);
          } else this.score(800 * p.floor);
          if (p.topLanes.every(Boolean)) {
            p.topLanes = [false, false, false];
            p.bonusX = Math.min(10, p.bonusX + 1);
            this.questStat('lanes');
            this.score(20000 * p.floor);
            A.play('laneComplete');
            this.lampShow = { type: 'flashGroup', ids: ['top0', 'top1', 'top2', 'bx2', 'bx3', 'bx4', 'bx5', 'bx6'], t: 0, dur: 1 };
            this.dmd.msg('BONUS ' + p.bonusX + 'X', 'TORCHES LIT', { dur: 1.6, big: true, priority: 2 });
          }
          break;
        }
        case 'heroLane': {
          A.play('rollover');
          if (!p.heroLanes[idx]) {
            p.heroLanes[idx] = true;
            this.score(3000 * p.floor, b.x, b.y);
          } else this.score(500 * p.floor);
          this.addXP(2);
          if (p.heroLanes.every(Boolean)) {
            p.heroLanes = [false, false, false, false];
            p.kick[0] = true;
            if (this.has('boots')) p.kick[1] = true;
            this.score(25000 * p.floor);
            this.addCharge(25);
            A.play('laneComplete');
            this.lampShow = { type: 'flashGroup', ids: ['hero0', 'hero1', 'hero2', 'hero3', 'kickL', 'kickR'], t: 0, dur: 1 };
            this.dmd.msg('H-E-R-O', 'KICKBACK LIT + CRYPT OPEN', { dur: 1.8, border: true, priority: 2 });
            this.lightWing('crypt');
          }
          break;
        }
        case 'kickback': {
          if (b.vy < 0) break;
          const active = p.kick[idx] || (p.ability === 'paladin' && p.abilityT > 0);
          if (!active) break;
          if (!(p.ability === 'paladin' && p.abilityT > 0)) p.kick[idx] = false;
          b.vx = idx === 0 ? 30 : -30;
          b.vy = -2350;
          A.play('kickout');
          A.play('ballSave');
          this.fx.burst(b.x, b.y, { n: 30, color: '#5aff8a', speed: 500, life: 0.7, glow: true });
          this.dmd.msg('KICKBACK!', '', { dur: 1, priority: 2 });
          this.shake(4);
          break;
        }
        case 'spinner': {
          const sp = this.parts.spinner;
          const v = Math.abs(b.vy);
          sp.vel += v / 35;
          if (dir < 0 && b.vy < 0) b.orbitFrom = { side: 0, t: this.time };
          break;
        }
        case 'orbit': {
          // dir > 0 / < 0 depends on line orientation; use vy instead
          if (b.vy < 0) {
            b.orbitFrom = { side: idx, t: this.time };
          } else if (b.orbitFrom && b.orbitFrom.side !== idx && this.time - b.orbitFrom.t < 3.5) {
            b.orbitFrom = null;
            this.orbitMade(idx === 1 ? 0 : 1, b);
          }
          break;
        }
        case 'shooterLane':
          break;
      }
    }

    orbitMade(fromSide, b) {
      const p = this.p;
      p.orbits++;
      this.fx.flasher(fromSide === 0 ? 'left' : 'right', 1);
      this.questStat('orbit');
      if (p.orbits >= 10) PB.achieve('loops10');
      const mult = this.has('haste') ? 3 : 1;
      const v = 15000 * p.floor * mult;
      A.play('orbit');
      this.score(v, b.x, b.y, '#5aff8a');
      this.addCharge(6);
      this.addXP(6);
      this.lampShow = { type: 'flashGroup', ids: [fromSide === 0 ? 'orbitL' : 'orbitR'], t: 0, dur: 0.6 };
      this.fx.trailBurst(b);
      if (p.mb) {
        this.score(25000 * p.floor, b.x, b.y + 20, '#ffd700');
      }
      this.dmd.msg('DUNGEON LOOP', '+' + U.fmt(v), { dur: 1.1, priority: 1 });
      this.shot(fromSide === 0 ? 'orbitL' : 'orbitR');
    }

    // ---------------- saucers ----------------
    capture(idx, b) {
      const sc = this.parts.saucers[idx];
      if (sc.held || b.held || b.ejecting > 0) return;
      if (this.state === 'attract' || !this.p) {
        b.held = 'saucer';
        sc.held = b;
        b.x = sc.x; b.y = sc.y; b.vx = b.vy = 0;
        A.play('saucerIn');
        this.after(0.8, () => this.eject(sc));
        return;
      }
      b.held = 'saucer';
      b.x = sc.x; b.y = sc.y; b.vx = 0; b.vy = 0;
      sc.held = b;
      sc.flash = 1;
      A.play('saucerIn');
      this.shake(3);
      const p = this.p;
      if (p.tilted) { this.after(0.5, () => this.eject(sc)); return; }
      if (sc.name === 'hoard') this.hoard(sc, b);
      else if (sc.name === 'ossuary' || sc.name === 'crucible') this.wingSaucer(sc, b);
      else this.vault(sc, b);
    }
    eject(sc, delay = 0) {
      const go = () => {
        const b = sc.held;
        if (!b) return;
        sc.held = null;
        b.held = null;
        b.x = sc.x; b.y = sc.y;
        const sp = 1000 + Math.random() * 100;
        const l = Math.hypot(sc.ex, sc.ey);
        b.vx = (sc.ex / l) * sp + U.rand(-30, 30);
        b.vy = (sc.ey / l) * sp;
        A.play('kickout');
        sc.flash = 1;
        this.fx.burst(sc.x, sc.y, { n: 12, color: sc.name === 'vault' ? '#ffd700' : '#7df9ff', speed: 300, life: 0.5, glow: true });
      };
      if (delay > 0) this.after(delay, go); else go();
    }

    vault(sc, b) {
      const p = this.p;
      this.shot('vault');
      this.questStat('vault');
      this.fx.flasher('left', 1);
      const steps = [];
      if (p.rescue) steps.push(() => { this.collectRescue(sc); return 1.6; });
      if (p.mb && p.superLit) {
        steps.push(() => {
          const v = p.jackpot * 3 * (p.hero === 'crusader' ? 1.5 : 1);
          p.superLit = false;
          p.jackpots = 0;
          this.score(v, sc.x, sc.y - 40, '#ffd700');
          A.play('jackpot');
          this.after(0.6, () => A.play('jackpot'));
          this.flash('#ffd700', 0.9);
          this.shake(14);
          this.fx.coins(sc.x, sc.y, 60);
          this.dmd.msg('SUPER JACKPOT', U.fmt(v), { dur: 2.5, big: true, border: true, priority: 4 });
          this.fx.banner('SUPER JACKPOT!', '#ffd700', U.fmt(v), 2.4);
          PB.achieve('super');
          PB.slowmo(0.3, 1.0, { x: sc.x, y: sc.y, h: 30, zoom: 0.45 });
          return 2.4;
        });
      }
      if (p.relicLit && !p.mb) {
        steps.push(() => {
          p.relicLit = false;
          this.openRelicChoice();
          return 0.6;
        });
      }
      if (p.lockLit && !p.mb) {
        steps.push(() => {
          p.lockLit = false;
          p.locks++;
          A.play('lock');
          this.flash('#ffd700', 0.4);
          this.fx.coins(sc.x, sc.y, 10);
          this.addXP(15);
          if (p.locks >= 3) {
            p.locks = 0;
            this.dmd.msg('BALL 3 LOCKED', 'THE HOARD AWAKENS...', { dur: 2, big: true, border: true, priority: 3 });
            this.after(1.6, () => this.startMultiball('hoard', 2));
            return 3.0;
          }
          this.dmd.msg('BALL ' + p.locks + ' LOCKED', 'RUNES RELIGHT LOCK', { dur: 1.8, big: true, priority: 3 });
          this.fx.banner('BALL ' + p.locks + ' LOCKED', '#ffd700');
          return 1.6;
        });
      }
      if (!steps.length) {
        steps.push(() => {
          this.score(10000 * p.floor, sc.x, sc.y - 30, '#ffd700');
          this.addGold(4, sc.x, sc.y);
          this.dmd.msg('THE VAULT', p.mb ? 'RUNES RAISE JACKPOT' : 'RUNES LIGHT LOCK', { dur: 1.2, priority: 1 });
          return 0.9;
        });
      }
      this.runSteps(steps, () => this.eject(sc));
    }

    runSteps(steps, done) {
      const next = () => {
        if (this.state === 'relic') { this.after(0.2, next); return; }
        const s = steps.shift();
        if (!s) { done(); return; }
        const d = s();
        this.after(d, next);
      };
      next();
    }

    shrine(b) {
      const p = this.p;
      const sc = { x: 300, y: 200 };
      this.shot('ramp');
      A.play('shrine');
      p.ramps++;
      this.fx.flasher('ramp', 1);
      this.questStat('ramp');
      if (p.ramps >= 5) PB.achieve('ramps5');
      if (p.ramps % 2 === 0 && !p.denLit) {
        p.denLit = true;
        this.after(2.8, () => {
          this.fx.banner("DEN IS OPEN", '#ff4a1a', 'NEXT RAMP RIDES THE LIFT', 2);
          this.dmd.msg("DRAGON'S DEN LIT", 'SHOOT THE SHRINE RAMP', { dur: 2, blink: true, priority: 3 });
        });
      }
      const v = 20000 * p.floor * (this.has('haste') ? 2 : 1);
      this.score(v, sc.x, sc.y + 40, '#7df9ff');
      this.addCharge(6);
      this.addXP(8);
      this.fx.burst(sc.x, sc.y, { n: 30, color: '#7df9ff', speed: 400, life: 0.9, h: 130 });
      this.lampShow = { type: 'flashGroup', ids: ['shrine', 'mystery'], t: 0, dur: 0.8 };
      if (p.mb) {
        this.jackpot(b);
        return;
      }
      if (p.extraBallLit) {
        p.extraBallLit = false;
        p.extraBalls++;
        A.play('extraBall');
        this.flash('#ff7a3d', 0.6);
        this.dmd.msg('EXTRA BALL!', '', { dur: 2.2, big: true, border: true, priority: 4 });
        this.fx.banner('EXTRA BALL!', '#ff9a4a', 'SHOOT AGAIN LIT');
        return;
      }
      const awards = [
        { w: 14, name: 'TREASURE CACHE', f: () => this.addGold(15 + 10 * p.floor, sc.x, sc.y) },
        { w: 12, name: 'SURGE OF POWER', f: () => this.addCharge(50) },
        { w: 9, name: 'LOCK IS LIT', ok: () => !p.lockLit && !p.mb, f: () => { p.lockLit = true; } },
        { w: 10, name: 'BALL SAVER 15S', f: () => { p.ballSave = Math.max(p.ballSave, 15); } },
        { w: 14, name: 'BIG POINTS', f: () => this.score(U.randi(4, 12) * 10000 * p.floor, sc.x, sc.y - 30) },
        { w: 9, name: 'KICKBACKS LIT', f: () => { p.kick = [true, true]; } },
        { w: 9, name: 'BONUS X +2', f: () => { p.bonusX = Math.min(10, p.bonusX + 2); } },
        { w: 10, name: 'HOLY SMITE', ok: () => p.mon && !p.mon.dead && p.mon.hp > 2, f: () => { p.mon.hp -= 2; p.mon.hitFlash = 1; A.play('crit'); this.fx.text(this.parts.monster.x, this.parts.monster.y - 70, '-2', '#7df9ff', 1.6); } },
        { w: 6, name: 'WISDOM +100 XP', f: () => this.addXP(100) },
        { w: 6, name: 'CRIT READY', f: () => { p.critReady = true; } },
        { w: 10, name: 'ADD-A-BALL', ok: () => !!p.mb, f: () => this.serveBall(true) },
        { w: 3, name: 'RELIC LIT', ok: () => !p.relicLit && !p.mb, f: () => { p.relicLit = true; } },
        { w: 2, name: 'EXTRA BALL LIT', ok: () => !p.shrineEB, f: () => { p.extraBallLit = true; p.shrineEB = true; } },
      ].filter((a) => !a.ok || a.ok());
      const total = awards.reduce((s, a) => s + a.w, 0);
      let r = Math.random() * total, pick = awards[0];
      for (const a of awards) { r -= a.w; if (r <= 0) { pick = a; break; } }
      const names = awards.map((a) => a.name);
      this.dmd.show({
        dur: 2.6,
        draw: (d, t) => {
          d.text('MYSTERY SHRINE', 64, 2, { align: 'center', l: 10 });
          if (t < 1.3) {
            const n = names[Math.floor(t * 18) % names.length];
            d.text(n, 64, 16, { align: 'center', l: 8 });
          } else {
            d.text(pick.name, 64, 16, { align: 'center', l: Math.floor(t * 8) % 2 ? 15 : 11 });
          }
        },
      }, 3);
      this.after(1.3, () => {
        pick.f();
        A.play('confirm');
        this.score(5000 * p.floor);
        this.fx.burst(sc.x, sc.y, { n: 30, color: '#7df9ff', speed: 450, life: 0.9, h: 130 });
      });
    }


    // Ball riding the Shrine wire ramp: 1D motion along the path with gravity from slope + height
    stepRamp(b, dt) {
      const r = b.ramp;
      const R = this.parts.ramps[r.path] || this.parts.ramp;
      const isRet = r.path === 'ret' || r.path === 'cryptRet' || r.path === 'forgeRet';
      const G = P.G, GH = 5200;
      const n = 6, h = dt / n;
      for (let i = 0; i < n; i++) {
        const q = R.at(r.s);
        const a = G * q.dy - GH * q.dh - r.v * 0.35;
        r.v += a * h;
        if (isRet) r.v = Math.max(r.v, 260);
        if (R.boostS != null && !r.lifted && r.s >= R.boostS) { r.lifted = true; r.v = Math.max(r.v, 1250); A.play('lift'); }
        r.s += r.v * h;
        if (r.s < 0) {
          // didn't make it: roll back out of the mouth
          const s0 = R.at(0);
          b.held = null; b.ramp = null; b.h = 0;
          b.x = s0.x; b.y = s0.y + 8; b.vx = U.rand(-40, 40); b.vy = Math.max(150, Math.abs(r.v));
          A.play('rampFail');
          return;
        }
        if (r.s >= R.L) {
          const e = R.at(R.L - 1);
          const sp = U.clamp(r.v, 450, 950);
          const l = Math.hypot(e.dx, e.dy) || 1;
          b.held = null; b.ramp = null; b.h = 0;
          b.x = e.x; b.y = e.y + 4; b.vx = (e.dx / l) * sp; b.vy = (e.dy / l) * sp;
          if (r.path === 'den') { this.enterDeck(b, e, r.v); return; }
          if (r.path === 'crypt' || r.path === 'forge') { this.enterWing(b, r.path, e, r.v); return; }
          A.play('rampDown');
          if (r.path === 'shrine' && this.p && this.state === 'play' && !this.p.tilted) this.shrine(b);
          return;
        }
      }
      const q = R.at(r.s);
      b.x = q.x; b.y = q.y; b.h = q.h;
      b.vx = q.dx * r.v; b.vy = q.dy * r.v;
      if (!r.top && q.h > 115) { r.top = true; A.play('rampTop'); }
    }

    // ---------------- relics ----------------
    openRelicChoice() {
      const p = this.p;
      const pool = RELICS.filter((r) => !p.relics.includes(r.id));
      if (!pool.length) {
        this.score(100000 * p.floor);
        return;
      }
      const choices = U.shuffle(pool).slice(0, 3);
      this.state = 'relic';
      for (const f of this.parts.flippers) f.pressed = false;
      A.play('relic');
      PB.UI.relicChoice(choices, (relic) => {
        p.relics.push(relic.id);
        this.state = 'play';
        A.play('confirm');
        this.dmd.msg('RELIC FOUND', relic.name, { dur: 2, border: true, priority: 3 });
        this.fx.banner(relic.name.toUpperCase(), '#ff9d3a', 'RELIC FOUND');
        if (relic.id === 'heart') { p.extraBallLit = true; }
        if (relic.id === 'boots') { p.kick = [true, true]; }
        if (relic.id === 'chalice') { p.bonusX = Math.max(p.bonusX, 2); }
        this.fx.burst(this.parts.saucers[0].x, this.parts.saucers[0].y, { n: 40, color: '#ff9d3a', speed: 500, life: 1, glow: true });
      });
    }

    setBG(mode) {
      if (this.bgMode === mode) return;
      this.bgMode = mode;
      PB.render && PB.render.setBG(mode);
      if (PB.dmd) {
        if (mode === 'hoard') PB.dmd.setColor(255, 200, 40);
        else if (mode === 'boss') PB.dmd.setColor(255, 70, 20);
        else PB.dmd.setColor(255, 140, 26);
      }
    }

    // ---------------- per-frame ----------------
    update(dt) {
      if (this.state === 'paused') return;
      this.time += dt;
      const p = this.p;
      if (this.state === 'relic') {
        this.updateLamps(dt);
        return;
      }
      // timers
      if (this.timers.length) {
        const due = [];
        for (const t of this.timers) { t.t -= dt; if (t.t <= 0) due.push(t); }
        if (due.length) {
          this.timers = this.timers.filter((t) => t.t > 0);
          for (const t of due) t.fn();
        }
      }
      if (this.state === 'relic') return;

      // plunger
      const pl = this.plunger;
      if (pl.held) pl.charge = Math.min(1, pl.charge + dt / 0.85);
      const target = pl.held ? pl.charge : 0;
      pl.vel += (target - pl.pos) * 900 * dt - pl.vel * 18 * dt;
      pl.pos += pl.vel * dt;
      if (pl.pos < -0.15) { pl.pos = -0.15; pl.vel = 0; }
      const fl = this.parts.plungerFloor;
      fl.ay = fl.by = T.PLUNGER.floorY + Math.max(0, pl.pos) * 34;

      for (const w of this.worlds) w.step(dt);
      for (const b of this.world.balls) if (b.alive && b.held === 'ramp') this.stepRamp(b, dt);

      // spinner
      const sp = this.parts.spinner;
      if (sp.vel > 0.05) {
        const before = Math.floor(sp.angle / Math.PI);
        sp.angle += sp.vel * dt;
        sp.vel *= Math.pow(0.25, dt);
        const after = Math.floor(sp.angle / Math.PI);
        if (after > before && p && this.state === 'play' && !p.tilted) {
          A.play('spinner');
          const mult = this.has('haste') ? 3 : 1;
          this.score(150 * p.floor * mult);
          if ((after & 3) === 0) this.addCharge(0.5);
          this.lamps.spin.lit = 1;
          this.questStat('spin');
        }
      } else sp.vel = 0;

      // balls: drain, trails, stuck detection
      for (const b of this.world.balls) {
        if (!b.alive) continue;
        b.age += dt;
        const lay = b.layer || 0;
        if (lay >= 2) {
          const cx = lay === 2 ? -260 : 860;
          if (!b.held && (b.y > 975 || b.y < 230 || Math.abs(b.x - cx) > 230)) this.toWingReturn(b);
        } else if (lay === 1) {
          if (!b.held && (b.y > 4 || b.y < -430 || b.x < 40 || b.x > 560)) this.toReturnRamp(b);
        } else if (b.held !== 'ramp' && (b.y > T.DRAIN_Y || b.x < -50 || b.x > T.W + 50 || b.y < -80)) {
          if (this.state === 'attract') { b.alive = false; continue; }
          this.drain(b);
          continue;
        }
        if (PB.settings.trail) {
          b.trail.push(b.x, b.y, b.h || 0);
          if (b.trail.length > 30) b.trail.splice(0, 3);
        } else b.trail.length = 0;
        // stuck ball rescue
        const slow = !b.held && Math.hypot(b.vx, b.vy) < 6 && !this.inShooter(b);
        const fl2 = this.allFlippers().filter((f) => (f.upper ? 1 : f.wing ? T.WINGS[f.wing].layer : 0) === (b.layer || 0));
        const onFlipper = fl2.some((f) => f.pressed && Math.hypot(b.x - f.px, b.y - f.py) < f.len + 30);
        b.still = slow && !onFlipper ? b.still + dt : 0;
        if (Math.hypot(b.vx, b.vy) > 300) b.stuckCount = 0;
        if (b.still > 3) {
          b.still = 0;
          b.stuckCount = (b.stuckCount || 0) + 1;
          if (b.stuckCount >= 2 && (b.layer || 0) >= 2) { this.toWingReturn(b); continue; }
          if (b.stuckCount >= 2 && (b.layer || 0) === 1) { this.toReturnRamp(b); continue; }
          b.vx += U.rand(-260, 260);
          b.vy -= 380;
          if (this.p) this.dmd.msg('BALL SEARCH', '', { dur: 0.8, priority: 1 });
        }
      }
      this.world.balls = this.world.balls.filter((b) => b.alive);

      if (p && this.state === 'play') this.updatePlayer(dt);
      this.updateLamps(dt);
    }

    updatePlayer(dt) {
      const p = this.p;
      if (p.ballSave > 0 && this.world.balls.some((b) => b.launched)) p.ballSave -= dt;
      if (p.comboT > 0) p.comboT -= dt;
      p.tiltLevel = Math.max(0, p.tiltLevel - dt * 0.7);
      if (p.mb) p.mb.t += dt;
      if (p.abilityT > 0) {
        p.abilityT -= dt;
        if (p.abilityT <= 0) {
          this.endAbility();
          this.dmd.msg('POWER FADES', '', { dur: 1, priority: 1 });
        }
      }
      const m = p.mon;
      if (m) {
        m.t += dt;
        m.hitCool -= dt;
        m.hitFlash = Math.max(0, m.hitFlash - dt * 3);
        m.wobble = Math.max(0, m.wobble - dt * 2.5);
        if (m.dead) m.deadT += dt;
        else {
          if (m.def.id === 'skeleton' && m.hp < m.max) {
            m.regenT -= dt;
            if (m.regenT <= 0) {
              m.regenT = 10;
              m.hp++;
              A.play('grunt', 'skeleton');
              this.dmd.msg('REASSEMBLING!', 'RATTLEBONES HP ' + m.hp, { dur: 1.3, priority: 2 });
              this.fx.burst(this.parts.monster.x, this.parts.monster.y, { n: 16, color: '#efe6c8', speed: -200, life: 0.6 });
            }
          }
          if (m.def.id === 'cyclops') {
            m.eyeT -= dt;
            if (m.eyeT <= 0) {
              m.eye = !m.eye;
              m.eyeT = m.eye ? 3.2 : 4.5;
              if (m.eye) A.play('grunt', 'cyclops');
            }
          }
          if (m.def.boss) {
            m.attackT -= dt;
            if (m.attackT <= 0 && this.ballsInPlay() > 0) {
              m.attackT = U.rand(7, 11);
              this.fireball();
            }
          }
        }
      }
      this.updateFeatures(dt);
    }

    fireball() {
      const tx = U.rand(120, 450), ty = U.rand(560, 860);
      A.play('fireball');
      this.dmd.msg('FIREBALL!', 'INCOMING', { dur: 1.2, blink: true, priority: 2 });
      this.fx.fireball(this.parts.monster.x, this.parts.monster.y, tx, ty, 1.3, () => {
        this.shake(10);
        A.play('roar', 'demon');
        for (const b of this.world.balls) {
          if (!b.alive || b.held || (b.layer || 0)) continue;
          const dx = b.x - tx, dy = b.y - ty, d = Math.hypot(dx, dy);
          if (d < 150) {
            const k = (1 - d / 150) * 1400;
            b.vx += (dx / (d || 1)) * k;
            b.vy += (dy / (d || 1)) * k - 200;
          }
        }
      });
    }

    // ---------------- lamps ----------------
    updateLamps(dt) {
      const L = this.lamps, p = this.p, t = this.time;
      const set = (id, s) => (L[id].state = s);
      for (const id in L) L[id].state = 0;
      if (p) {
        const live = this.state === 'play' || this.state === 'relic';
        for (let i = 0; i < 3; i++) {
          let s = p.topLanes[i] ? 1 : 0;
          if (p.skillLane === i && this.world.balls.some((b) => b.skill && (b.skillArmed || !b.launched) && !b.skillUsed)) s = 3;
          set('top' + i, s);
        }
        for (let i = 0; i < 4; i++) set('hero' + i, p.heroLanes[i] ? 1 : 0);
        this.parts.drops.forEach((d, i) => set('rune' + i, d.down ? 1 : 2));
        for (let i = 0; i < 4; i++) set('slay' + i, p.slay[i] ? 1 : 0);
        set('crit', p.critReady ? 3 : 0);
        set('den', p.denLit ? 3 : this.denOpen() ? 2 : 0);
        set('quest', p.quest && p.quest.done ? 3 : p.quest ? 2 : 0);
        set('rescue', p.rescue ? 3 : 0);
        for (let i = 0; i < 3; i++) set('egg' + i, p.den.eggs[i] ? 1 : 2);
        set('dragonJP', p.den.hatched ? 3 : 2);
        set('hoardPit', 2);
        set('crypt', p.cryptLit ? 3 : this.wingOpen('crypt') ? 2 : 0);
        set('forge', p.forgeLit ? 3 : this.wingOpen('forge') ? 2 : 0);
        for (const kind of ['crypt', 'forge']) {
          const W = this.parts.wings[kind], st = p.wing[kind];
          W.drops.forEach((d, i) => set(kind + 'Drop' + i, d.down ? 1 : 2));
          set(kind + 'Boss', 3);
          set(kind + 'Stand0', st.stands[0] ? 1 : 2);
          set(kind + 'Stand1', st.stands[1] ? 1 : 2);
          set(kind + 'Pit', 2);
        }
        const orbitOn = p.mb ? 3 : p.comboT > 0 ? 2 : 0;
        set('orbitL', orbitOn); set('orbitR', orbitOn);
        set('vault', p.superLit || p.rescue ? 3 : p.lockLit || p.relicLit ? 2 : 0);
        for (let i = 0; i < 3; i++) set('lock' + i, i < p.locks ? 1 : i === p.locks && p.lockLit ? 3 : 0);
        set('relic', p.relicLit ? 3 : 0);
        set('mystery', 2);
        set('shrine', p.extraBallLit || p.denLit ? 3 : 1);
        set('extraBall', p.extraBallLit ? 3 : p.extraBalls > 0 ? 1 : 0);
        set('jackpot', p.mb ? 3 : p.mon && p.mon.def.id === 'cyclops' && p.mon.eye ? 3 : 0);
        for (let i = 0; i < 5; i++) set('mon' + i, i < p.monIdx ? 1 : i === p.monIdx ? 2 : 0);
        [2, 3, 4, 5, 6].forEach((n) => set('bx' + n, p.bonusX >= n ? 1 : 0));
        set('ability', p.abilityT > 0 ? 3 : p.charge >= 100 ? 2 : 0);
        set('kickL', p.kick[0] || (p.ability === 'paladin' && p.abilityT > 0) ? 1 : 0);
        set('kickR', p.kick[1] || (p.ability === 'paladin' && p.abilityT > 0) ? 1 : 0);
        set('again', p.ballSave > 0 ? (p.ballSave < 3 ? 3 : 2) : p.extraBalls > 0 ? 1 : 0);
        set('spin', L.spin.lit > 0.5 ? 1 : 0);
        if (!live) for (const id in L) L[id].state = L[id].state ? 1 : 0;
      }
      // light shows
      const show = this.lampShow;
      if (show) {
        show.t += dt;
        const ids = Object.keys(L);
        if (show.type === 'attract') {
          ids.forEach((id, i) => {
            const l = L[id];
            const wave = Math.sin(t * 3 - l.y / 90 + Math.sin(t * 0.7) * 2);
            l.state = wave > 0.55 ? 1 : 0;
          });
        } else if (show.type === 'flash') {
          const on = Math.floor(show.t * 12) % 2 === 0;
          ids.forEach((id) => (L[id].state = on ? 1 : 0));
        } else if (show.type === 'flashGroup') {
          const on = Math.floor(show.t * 14) % 2 === 0;
          for (const id of show.ids) if (L[id]) L[id].state = on ? 1 : 0;
        } else if (show.type === 'drain') {
          ids.forEach((id) => (L[id].state = L[id].y > 1100 - show.t * 1100 ? 0 : L[id].state));
        } else if (show.type === 'off') {
          ids.forEach((id) => (L[id].state = 0));
        }
        if (show.dur && show.t > show.dur) this.lampShow = null;
      }
      // smooth incandescent fade
      for (const id in L) {
        const l = L[id];
        let target = 0;
        if (l.state === 1) target = 1;
        else if (l.state === 2) target = Math.sin((t + l.phase) * Math.PI * 2 * 1.2) > 0 ? 1 : 0.08;
        else if (l.state === 3) target = Math.sin((t + l.phase * 0.2) * Math.PI * 2 * 4) > 0 ? 1 : 0.05;
        const k = target > l.lit ? 30 : 9;
        l.lit += (target - l.lit) * Math.min(1, k * dt);
      }
    }

    // ---------------- DMD idle ----------------
    dmdIdle(d, t) {
      const p = this.p;
      if (!p) {
        const page = Math.floor(t / 4) % 4;
        const k = (t % 4) / 4;
        if (page === 0) {
          d.text('DUNGEON', 64, 2, { align: 'center', scale: 2, l: 15 });
          d.text('DELVER', 64, 18, { align: 'center', l: 12 });
        } else if (page === 1) {
          d.text('DESCEND. SLAY. LOOT.', 64, 6, { align: 'center', l: 12 });
          d.text(Math.floor(t * 2) % 2 ? 'PRESS START' : '', 64, 19, { align: 'center', l: 15 });
        } else if (page === 2) {
          const sc = PB.getScores();
          d.text('HALL OF HEROES', 64, 1, { align: 'center', l: 10 });
          sc.slice(0, 3).forEach((s, i) => d.text((i + 1) + ' ' + s.name + ' ' + U.fmt(s.score), 64, 9 + i * 8, { align: 'center', l: 15 - i * 2 }));
        } else {
          d.text('MADE BY JON BEAM', 64, 6, { align: 'center', l: 15 });
          d.text('WITH CLAUDE CODE', 64, 18, { align: 'center', l: 10 });
        }
        return;
      }
      // in-game score display
      const sc = U.fmt(p.score);
      d.text('BALL ' + p.ball + (p.extraBalls ? '+' + p.extraBalls : ''), 1, 1, { l: 9 });
      d.text('FLOOR ' + p.floor, 127, 1, { align: 'right', l: 9 });
      d.text(sc, 64, 9, { align: 'center', scale: d.measure(sc, 2) <= 126 ? 2 : 1, l: 15 });
      const m = p.mon;
      if (m && !m.dead) {
        const w = 40;
        d.text(m.def.id.toUpperCase(), 1, 25, { l: 8 });
        const x0 = 127 - w;
        for (let i = 0; i < w; i++) {
          const on = i < (m.hp / m.max) * w;
          d.px(x0 + i, 26, on ? 13 : 2);
          d.px(x0 + i, 27, on ? 13 : 2);
          d.px(x0 + i, 28, on ? 10 : 2);
        }
        if (p.rescue) d.text('RESCUE ' + U.fmt(p.rescue.v), 64, 25, { align: 'center', l: Math.floor(t * 6) % 2 ? 15 : 9 });
        else if (p.frenzyT > 0) d.text('FRENZY ' + Math.ceil(p.frenzyT), 64, 25, { align: 'center', l: Math.floor(t * 6) % 2 ? 15 : 9 });
        else if (p.mb) d.text(p.mb.type === 'hoard' ? 'JACKPOTS LIT' : 'HELLFIRE', 64, 25, { align: 'center', l: Math.floor(t * 4) % 2 ? 15 : 8 });
        else if (p.charge >= 100) d.text('POWER!', 64, 25, { align: 'center', l: Math.floor(t * 4) % 2 ? 15 : 6 });
      }
    }
  }

  function rot(arr, dir) {
    const a = arr.slice();
    if (dir > 0) a.unshift(a.pop());
    else a.push(a.shift());
    return a;
  }

  PB.Game = Game;
})(window.PB);
