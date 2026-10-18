'use strict';
(function (PB) {
  // Table geometry. Logical playfield is 600 x 1100 units.
  const P = PB.Phys;
  const T = (PB.T = {
    W: 600, H: 1100,
    L: 22, R: 548, LR: 590, C: 285,
    ARC: { cx: 306, cy: 270, rx: 284, ry: 232 },
    PLUNGER: { x: 569, restY: 1050, floorY: 1062 },
    DRAIN_Y: 1118,
    DECK_H: 150,
    WING_H: 60,
    WINGS: { crypt: { layer: 2, cx: -260 }, forge: { layer: 3, cx: 860 } },
  });
  const mx = (x) => 2 * T.C - x; // mirror around playfield centre


  // Catmull-Rom path sampled by arc length: ramp.at(s) -> {x, y, h, dy, dh}
  T.makeRamp = function (ctrl) {
    const pts = [];
    const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < 24; k++) {
        const t = k / 24, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
      }
    }
    pts.push(ctrl[ctrl.length - 1].slice());
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const L = cum[cum.length - 1];
    function at(s) {
      s = Math.max(0, Math.min(L - 1e-6, s));
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const a = pts[lo], b = pts[hi], seg = cum[hi] - cum[lo] || 1, k = (s - cum[lo]) / seg;
      return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, h: a[2] + (b[2] - a[2]) * k, dx: (b[0] - a[0]) / seg, dy: (b[1] - a[1]) / seg, dh: (b[2] - a[2]) / seg };
    }
    return { ctrl, pts, cum, L, at };
  };

  // A side table (wing) is its own physics layer with two flippers, bumpers, a boss toy,
  // a bank of drop targets, two standups and a saucer. The Forge mirrors the Crypt.
  T.buildWing = function (G, kind, mainWorld, hit, sense) {
    const info = T.WINGS[kind];
    const m = kind === 'crypt' ? (x) => x : (x) => 600 - x;
    const w = new P.World(info.layer);
    Object.defineProperty(w, 'balls', { get: () => (G.world ? G.world.balls : mainWorld.balls), set() {} });
    const draw = { rails: [], posts: [] };
    const poly = (pts, o = {}) => {
      const mp = pts.map(([x, y]) => [m(x), y]);
      for (let i = 0; i < mp.length - 1; i++) w.segs.push(P.seg(mp[i][0], mp[i][1], mp[i + 1][0], mp[i + 1][1], { onHit: hit('wall', 0), ...o }));
      draw.rails.push({ pts: mp, r: o.r ?? 5, style: o.style || 'rail' });
    };
    const arc = [];
    for (let i = 0; i <= 26; i++) { const th = Math.PI + (i / 26) * Math.PI; arc.push([-260 + 210 * Math.cos(th), 380 + 120 * Math.sin(th)]); }
    poly([[-470, 822], ...arc, [-50, 822]], { r: 6, style: 'wingOuter' });
    poly([[-470, 822], [-333, 879]], { r: 5 });
    poly([[-50, 822], [-187, 879]], { r: 5 });
    // inlane guides
    poly([[-430, 760], [-430, 788]], { r: 4 });
    poly([[-90, 760], [-90, 788]], { r: 4 });
    const fl = (px, side) => {
      const f = new P.Flipper(side === 0
        ? { px: m(px), py: 885, len: 64, rb: 12, rt: 6, rest: 0.5, up: -0.5, side: 0, wing: kind }
        : { px: m(px), py: 885, len: 64, rb: 12, rt: 6, rest: Math.PI - 0.5, up: Math.PI + 0.5, side: 1, wing: kind });
      f.onHit = (b, imp) => G.onHit('flipper', 0, b, imp);
      w.flippers.push(f);
      return f;
    };
    // the Forge is mirrored, so its left-hand flipper comes from the Crypt's right-hand one
    const flippers = kind === 'crypt' ? [fl(-335, 0), fl(-185, 1)] : [fl(-185, 0), fl(-335, 1)];
    const bumperPos = kind === 'crypt' ? [[-372, 405], [-148, 405]] : [[-372, 405], [-148, 405], [-260, 330]];
    const bumpers = bumperPos.map(([x, y], i) => {
      const c = P.circ(m(x), y, 22, { kick: 800, e: 0.5, tag: 'bumper', onHit: hit('wingBumper', info.layer) });
      w.circs.push(c);
      return c;
    });
    const boss = P.circ(m(-260), 530, 34, { e: 0.6, tag: kind === 'crypt' ? 'lich' : 'anvil', onHit: hit(kind === 'crypt' ? 'lich' : 'anvil', info.layer) });
    w.circs.push(boss);
    const drops = [0, 1, 2].map((i) => {
      const x0 = -350 + i * 74;
      const s = P.seg(m(x0), 647 + (i % 2) * 10, m(x0 + 32), 657 - (i % 2) * 10, { r: 6, e: 0.3, tag: 'wingDrop', onHit: hit('wingDrop', info.layer * 10 + i) });
      s.down = false;
      w.segs.push(s);
      return s;
    });
    const stands = [[-458, 1], [-62, -1]].map(([x, dir], i) => {
      const s = P.seg(m(x), 640, m(x), 670, { r: 6, e: 0.45, tag: 'wingStand', onHit: hit('wingStand', info.layer * 10 + i) });
      s.wobble = 0;
      w.segs.push(s);
      return s;
    });
    for (const [x, y] of [[-430, 760], [-90, 760]]) { const c = P.circ(m(x), y, 6, { e: 0.6, onHit: hit('rubber', 0) }); w.circs.push(c); draw.posts.push(c); }
    const saucer = { name: kind === 'crypt' ? 'ossuary' : 'crucible', x: m(-430), y: 560, ex: kind === 'crypt' ? 0.5 : -0.5, ey: 1, held: null, t: 0, flash: 0, layer: info.layer };
    G._wingSaucers = G._wingSaucers || [];
    w.sensors.push(P.sensorCircle(saucer.x, saucer.y, 15, { onEnter: (b) => G.onSense('saucer', saucer.idx, b) }));
    w.sensors.push(P.sensorLine(m(-330), 935, m(-190), 935, { onCross: sense('wingDrain', info.layer) }));
    return { kind, layer: info.layer, world: w, draw, flippers, bumpers, boss, drops, stands, saucer, m, cx: info.cx };
  };

  T.build = function (G) {
    const w = new P.World();
    const draw = { rails: [], slings: [], posts: [], guides: [] };
    const parts = {};
    const hit = (kind, idx) => (b, imp, nx, ny, c) => G.onHit(kind, idx, b, imp, c);

    const poly = (pts, o = {}) => {
      for (let i = 0; i < pts.length - 1; i++) {
        w.segs.push(P.seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], { onHit: hit('wall', 0), ...o }));
      }
      draw.rails.push({ pts, r: o.r ?? 4, style: o.style || 'rail' });
    };

    // --- Outer shell with elliptical top arch ---
    const A = T.ARC;
    const arc = [];
    const N = 44;
    for (let i = 0; i <= N; i++) {
      const th = Math.PI + (i / N) * Math.PI;
      arc.push([A.cx + A.rx * Math.cos(th), A.cy + A.ry * Math.sin(th)]);
    }
    poly([[T.L, 1130], ...arc, [T.LR, 1130]], { r: 6, e: 0.3, style: 'outer' });

    // Plunger lane inner wall + one-way gate at its top
    poly([[T.R, 1130], [T.R, 332]], { r: 4 });
    {
      const ax = T.LR, ay = 282, bx = T.R, by = 332;
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      const n = { x: -dy / l, y: dx / l }; // pick the upper-left side
      if (n.y > 0) { n.x = -n.x; n.y = -n.y; }
      const g = P.seg(ax, ay, bx, by, { r: 3, e: 0.3, oneWay: n, tag: 'gate' });
      w.segs.push(g);
      parts.gate = g;
    }
    // Plunger floor (ball rests here; moves with the plunger)
    parts.plungerFloor = P.seg(T.R + 4, T.PLUNGER.floorY, T.LR - 4, T.PLUNGER.floorY, { r: 2, e: 0.1 });
    w.segs.push(parts.plungerFloor);

    // Orbit lane inner walls
    poly([[74, 562], [74, 292]], { r: 5 });
    poly([[496, 542], [496, 292]], { r: 5 });

    // Inlane/outlane dividers + flipper guides
    poly([[66, 760], [66, 900], [172, 972]], { r: 4 });
    poly([[mx(66), 760], [mx(66), 900], [mx(172), 972]], { r: 4 });
    for (const x of [66, mx(66)]) {
      const c = P.circ(x, 760, 7, { e: 0.6, onHit: hit('rubber', 0) });
      w.circs.push(c);
      draw.posts.push(c);
    }

    // Slingshots
    const mkSling = (pts, side) => {
      const [top, bl, br] = pts;
      w.segs.push(P.seg(top[0], top[1], bl[0], bl[1], { r: 4, e: 0.5, onHit: hit('rubber', 0) }));
      w.segs.push(P.seg(bl[0], bl[1], br[0], br[1], { r: 4, e: 0.5, onHit: hit('rubber', 0) }));
      const face = P.seg(br[0], br[1], top[0], top[1], { r: 5, e: 0.55, kick: 820, minKick: 70, tag: 'sling', onHit: hit('sling', side) });
      w.segs.push(face);
      for (const p of pts) {
        const c = P.circ(p[0], p[1], 6, { e: 0.55 });
        w.circs.push(c);
      }
      draw.slings.push({ pts, face, side });
      return face;
    };
    parts.slingL = mkSling([[112, 778], [112, 872], [166, 906]], 0);
    parts.slingR = mkSling([[mx(112), 778], [mx(112), 872], [mx(166), 906]], 1);

    // Top lane guides
    for (const x of [187, 252, 318, 383]) {
      w.segs.push(P.seg(x, 146, x, 200, { r: 4.5, e: 0.4 }));
      draw.guides.push({ x, y0: 146, y1: 200 });
    }

    // Pop bumpers (braziers)
    parts.bumpers = [[220, 276], [350, 276], [285, 352]].map(([x, y], i) => {
      const c = P.circ(x, y, 26, { kick: 880, e: 0.5, tag: 'bumper', onHit: hit('bumper', i) });
      w.circs.push(c);
      return c;
    });

    // Monster lair
    parts.monster = P.circ(T.C, 488, 44, { e: 0.55, kick: 0, tag: 'monster', onHit: hit('monster', 0) });
    w.circs.push(parts.monster);

    // Center post (only raised by Divine Aegis)
    parts.post = P.circ(T.C, 1040, 9, { e: 0.6, active: false, onHit: hit('rubber', 0) });
    w.circs.push(parts.post);

    // RUNE drop targets (left wall) and SLAY standups (right wall)
    parts.drops = [592, 628, 664, 700].map((y0, i) => {
      const s = P.seg(37, y0, 37, y0 + 28, { r: 6, e: 0.3, tag: 'drop', onHit: hit('drop', i) });
      s.down = false; s.anim = 0;
      w.segs.push(s);
      return s;
    });
    parts.standups = [585, 625, 665, 705].map((y0, i) => {
      const s = P.seg(533, y0, 533, y0 + 28, { r: 6, e: 0.45, tag: 'standup', onHit: hit('standup', i) });
      s.wobble = 0;
      w.segs.push(s);
      return s;
    });

    // Flippers
    const FL = { len: 88, rb: 14, rt: 7 };
    const left = new P.Flipper({ px: 185, py: 985, ...FL, rest: 0.5, up: -0.5, side: 0 });
    const right = new P.Flipper({ px: mx(185), py: 985, ...FL, rest: Math.PI - 0.5, up: Math.PI + 0.5, side: 1 });
    left.onHit = right.onHit = (b, imp) => G.onHit('flipper', 0, b, imp);
    w.flippers.push(left, right);
    parts.flippers = [left, right];
    const ul = new P.Flipper({ px: 92, py: 330, len: 70, rb: 12, rt: 6, rest: 0.45, up: -0.45, side: 0, extra: true });
    ul.onHit = left.onHit;
    w.flippers.push(ul);
    parts.upperLeft = ul;

    // ---- Sensors ----
    const sense = (kind, idx) => (b, dir) => G.onSense(kind, idx, b, dir);
    parts.topLanes = [220, 285, 350].map((x, i) => {
      const s = P.sensorCircle(x, 178, 13, { onEnter: sense('topLane', i) });
      w.sensors.push(s);
      return s;
    });
    parts.heroLanes = [44, 89, mx(89), mx(44)].map((x, i) => {
      const s = P.sensorCircle(x, 840, 13, { onEnter: sense('heroLane', i) });
      w.sensors.push(s);
      return s;
    });
    // kickbacks at bottom of outlanes
    parts.kickers = [44, mx(44)].map((x, i) => {
      const s = P.sensorCircle(x, 985, 14, { onEnter: sense('kickback', i) });
      w.sensors.push(s);
      return s;
    });
    // spinner across left orbit
    parts.spinner = { x0: T.L, x1: 74, y: 430, angle: 0, vel: 0 };
    w.sensors.push(P.sensorLine(T.L, 430, 74, 430, { onCross: sense('spinner', 0) }));
    // orbit gates
    w.sensors.push(P.sensorLine(T.L, 505, 74, 505, { onCross: sense('orbit', 0) }));
    w.sensors.push(P.sensorLine(496, 488, T.R, 488, { onCross: sense('orbit', 1) }));
    // saucers
    parts.saucers = [
      { name: 'vault', x: 128, y: 418, ex: 0.42, ey: 1, held: null, t: 0, flash: 0 },
    ];
    // Shrine wire ramp: mouth on the right, climbs over the top of the table and drops into the left inlane
    poly([[404, 474], [404, 408], [480, 408], [480, 474]], { r: 5, style: 'rampMouth' });
    w.sensors.push(P.sensorLine(410, 466, 474, 466, { onCross: sense('rampEnter', 0) }));
    parts.ramp = T.makeRamp([
      [442, 470, 0], [442, 395, 28], [438, 305, 78], [402, 228, 108], [300, 188, 122],
      [196, 222, 112], [128, 310, 96], [102, 450, 76], [93, 610, 50], [89, 735, 22], [89, 792, 4],
    ]);
    w.sensors.push(P.sensorCircle(parts.saucers[0].x, parts.saucers[0].y, 15, { onEnter: sense('saucer', 0) }));
    w.segs.push(P.seg(80, 368, 156, 392, { r: 6, e: 0.4, onHit: hit('wall', 0) }));
    // Diverted branch of the same ramp: lifts the ball up to the Dragon's Den deck
    parts.denRamp = T.makeRamp([
      [442, 470, 0], [442, 395, 28], [438, 305, 78], [402, 228, 108], [300, 188, 122],
      [332, 118, 140], [420, 40, 158], [500, -60, 176], [516, -190, 184], [496, -292, 168], [468, -316, 156],
    ]);
    parts.denRamp.boostS = parts.denRamp.cum[4 * 24];
    // Return wireform from the deck drain to the right inlane
    parts.retRamp = T.makeRamp([
      [300, -18, 150], [385, 12, 140], [470, 62, 128], [512, 165, 112], [514, 300, 96], [508, 460, 74], [496, 620, 48], [486, 740, 20], [481, 795, 4],
    ]);

    // ================= THE DRAGON'S DEN (upper deck, layer 1) =================
    const w2 = new P.World(1);
    Object.defineProperty(w2, 'balls', { get: () => G.world ? G.world.balls : w.balls, set() {} });
    const deckDraw = { rails: [], posts: [] };
    const dpoly = (pts, o = {}) => {
      for (let i = 0; i < pts.length - 1; i++) w2.segs.push(P.seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], { onHit: hit('wall', 0), ...o }));
      deckDraw.rails.push({ pts, r: o.r ?? 5, style: o.style || 'rail' });
    };
    const dArc = [];
    for (let i = 0; i <= 28; i++) {
      const th = Math.PI + (i / 28) * Math.PI;
      dArc.push([300 + 230 * Math.cos(th), -280 + 90 * Math.sin(th)]);
    }
    dpoly([[70, -150], ...dArc, [530, -150]], { r: 6, style: 'deckOuter' });
    dpoly([[70, -150], [288, -52]], { r: 5 });
    dpoly([[530, -150], [418, -80]], { r: 5 });
    const dpost = P.circ(296, -50, 7, { e: 0.6, onHit: hit('rubber', 0) });
    w2.circs.push(dpost);
    deckDraw.posts.push(dpost);
    parts.dragon = P.circ(300, -298, 42, { e: 0.6, tag: 'dragon', onHit: hit('dragon', 0) });
    w2.circs.push(parts.dragon);
    parts.eggs = [-268, -226, -184].map((y, i) => {
      const c = P.circ(97, y, 13, { e: 0.5, tag: 'egg', onHit: hit('egg', i) });
      c.wobble = 0;
      w2.circs.push(c);
      return c;
    });
    parts.deckBumper = P.circ(212, -212, 24, { kick: 820, e: 0.5, tag: 'bumper', onHit: hit('deckBumper', 0) });
    w2.circs.push(parts.deckBumper);
    const upper = new P.Flipper({ px: 410, py: -74, len: 80, rb: 13, rt: 6.5, rest: Math.PI - 0.45, up: Math.PI + 0.5, side: 1, upper: true });
    upper.onHit = (b, imp) => G.onHit('flipper', 0, b, imp);
    w2.flippers.push(upper);
    parts.upperFlipper = upper;
    parts.saucers.push({ name: 'hoard', x: 455, y: -212, ex: -0.5, ey: 1, held: null, t: 0, flash: 0, layer: 1 });
    w2.sensors.push(P.sensorCircle(455, -212, 15, { onEnter: sense('saucer', 1) }));
    w2.sensors.push(P.sensorLine(236, -30, 396, -30, { onCross: sense('deckDrain', 0) }));
    parts.deck = { world: w2, draw: deckDraw };

    // ================= SIDE TABLES: THE CRYPT (left) & THE FORGE (right) =================
    parts.wings = {};
    for (const kind of ['crypt', 'forge']) {
      const W = (parts.wings[kind] = T.buildWing(G, kind, w, hit, sense));
      W.saucer.idx = parts.saucers.length;
      parts.saucers.push(W.saucer);
    }
    const R = T.makeRamp;
    parts.cryptRamp = R([[48, 505, 0], [48, 430, 4], [48, 350, 22], [40, 300, 52], [10, 278, 90], [-40, 276, 112], [-90, 290, 108], [-130, 318, 90], [-150, 348, 72], [-160, 372, 64]]);
    parts.forgeRamp = R([[522, 488, 0], [522, 420, 4], [522, 350, 22], [540, 300, 52], [580, 276, 90], [640, 276, 112], [690, 290, 108], [730, 318, 90], [750, 348, 72], [760, 372, 64]]);
    parts.cryptRamp.boostS = parts.cryptRamp.cum[2 * 24];
    parts.forgeRamp.boostS = parts.forgeRamp.cum[2 * 24];
    parts.cryptRet = R([[-260, 958, 60], [-200, 990, 82], [-100, 992, 106], [-14, 930, 118], [44, 852, 96], [78, 802, 58], [88, 770, 28], [89, 795, 4]]);
    parts.forgeRet = R([[860, 958, 60], [800, 990, 82], [700, 992, 106], [614, 930, 118], [528, 852, 96], [494, 802, 58], [482, 770, 28], [481, 795, 4]]);
    parts.ramps = { shrine: parts.ramp, den: parts.denRamp, ret: parts.retRamp, crypt: parts.cryptRamp, forge: parts.forgeRamp, cryptRet: parts.cryptRet, forgeRet: parts.forgeRet };
    // plunger lane exit (for skill shot timing) and lane entry
    w.sensors.push(P.sensorLine(T.R, 700, T.LR, 700, { onCross: sense('shooterLane', 0) }));

    // ---- Lamps (inserts) ----
    const lamps = {};
    const lamp = (id, x, y, o = {}) => (lamps[id] = { id, x, y, shape: o.shape || 'circle', r: o.r || 9, color: o.color || '#ffb347', label: o.label || '', angle: o.angle || 0, size: o.size || 1, state: 0, phase: Math.random(), lit: 0 });
    [220, 285, 350].forEach((x, i) => lamp('top' + i, x, 222, { color: '#ffcf5a', label: ['I', 'II', 'III'][i], r: 10 }));
    [44, 89, mx(89), mx(44)].forEach((x, i) => lamp('hero' + i, x, 880, { color: '#5ae0ff', label: 'HERO'[i], r: 10 }));
    [606, 642, 678, 714].forEach((y, i) => lamp('rune' + i, 66, y, { color: '#c77dff', label: 'RUNE'[i], r: 9 }));
    [599, 639, 679, 719].forEach((y, i) => lamp('slay' + i, 504, y, { color: '#ff5a5a', label: 'SLAY'[i], r: 9 }));
    lamp('orbitL', 104, 610, { shape: 'arrow', angle: -2.2, color: '#5aff8a', size: 1.1 });
    lamp('orbitR', 466, 600, { shape: 'arrow', angle: -0.95, color: '#5aff8a', size: 1.1 });
    lamp('vault', 166, 506, { shape: 'arrow', angle: Math.atan2(418 - 506, 128 - 166), color: '#ffd700', size: 1.25 });
    lamp('shrine', 442, 512, { shape: 'arrow', angle: -Math.PI / 2, color: '#7df9ff', size: 1.25 });
    lamp('lock0', 196, 408, { color: '#ffd700', r: 7 });
    lamp('lock1', 214, 422, { color: '#ffd700', r: 7 });
    lamp('lock2', 232, 436, { color: '#ffd700', r: 7 });
    lamp('crypt', 118, 652, { color: '#b46aff', label: 'C', r: 10 });
    lamp('forge', 452, 652, { color: '#ff7a1a', label: 'F', r: 10 });
    // wing lamps
    for (const kind of ['crypt', 'forge']) {
      const W = parts.wings[kind], m = W.m, H = T.WING_H, col = kind === 'crypt' ? '#9dff5a' : '#ffb030';
      [0, 1, 2].forEach((i) => (lamp(kind + 'Drop' + i, m(-334 + i * 74), 690, { color: col, r: 8 }).h = H));
      lamp(kind + 'Boss', m(-260), 600, { shape: 'arrow', angle: -Math.PI / 2, color: kind === 'crypt' ? '#9dff5a' : '#ff6a1a', size: 1.2 }).h = H;
      lamp(kind + 'Stand0', m(-430), 655, { color: col, r: 7 }).h = H;
      lamp(kind + 'Stand1', m(-90), 655, { color: col, r: 7 }).h = H;
      lamp(kind + 'Pit', m(-430), 600, { shape: 'diamond', color: '#ffd700', r: 8 }).h = H;
    }
    lamp('relic', 128, 476, { shape: 'diamond', color: '#ff9d3a', r: 9 });
    lamp('mystery', 442, 548, { shape: 'diamond', color: '#7df9ff', r: 9 });
    lamp('extraBall', 285, 708, { shape: 'pill', color: '#ff7a3d', label: 'EXTRA BALL', r: 11 });
    lamp('jackpot', 285, 572, { shape: 'arrow', angle: -Math.PI / 2, color: '#ffd700', size: 1.35 });
    ['G', 'S', 'C', 'M', 'D'].forEach((l, i) => lamp('mon' + i, 205 + i * 40, 630, { color: i === 4 ? '#ff3b1f' : '#ff6b4a', label: l, r: 11 }));
    [2, 3, 4, 5, 6].forEach((n, i) => lamp('bx' + n, 205 + i * 40, 760, { color: '#ffb347', label: n + 'X', r: 11 }));
    lamp('ability', 285, 662, { shape: 'pill', color: '#9dff5a', label: 'HERO POWER', r: 11 });
    lamp('kickL', 44, 940, { color: '#5aff8a', label: 'K', r: 8 });
    lamp('kickR', mx(44), 940, { color: '#5aff8a', label: 'K', r: 8 });
    lamp('again', T.C, 1006, { shape: 'pill', color: '#ff3b6b', label: 'SHOOT AGAIN', r: 10 });
    lamp('spin', 48, 470, { color: '#5ae0ff', r: 7 });
    lamp('crit', 285, 826, { shape: 'pill', color: '#ff3b3b', label: 'CRIT READY', r: 10 });
    lamp('den', 392, 548, { color: '#ff4a1a', label: 'D', r: 10 });
    lamp('quest', 285, 868, { shape: 'pill', color: '#5aff8a', label: 'QUEST', r: 10 });
    lamp('rescue', 166, 470, { shape: 'diamond', color: '#ffffff', r: 8 });
    // deck lamps (h = deck height)
    [-268, -226, -184].forEach((y, i) => (lamp('egg' + i, 128, y, { color: '#9dff5a', r: 8 }).h = T.DECK_H));
    lamp('dragonJP', 300, -228, { shape: 'arrow', angle: -Math.PI / 2, color: '#ff4a1a', size: 1.3 }).h = T.DECK_H;
    lamp('hoardPit', 455, -176, { shape: 'diamond', color: '#ffd700', r: 9 }).h = T.DECK_H;

    parts.lamps = lamps;
    return { world: w, world2: w2, worlds: [w, w2, parts.wings.crypt.world, parts.wings.forge.world], parts, draw, lamps };
  };
})(window.PB);
