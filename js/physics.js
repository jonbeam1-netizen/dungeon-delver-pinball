'use strict';
(function (PB) {
  // Custom 2D pinball physics: circles vs. thick segments / circles / rotating tapered flippers.
  // Runs many small substeps per frame so fast balls never tunnel and flippers feel crisp.
  const P = (PB.Phys = {});
  P.G = 1750; // table-units / s^2 (1 unit ~ 1 mm)
  P.BALL_R = 12;
  P.MAX_SPEED = 3700;
  P.SUBSTEP = 1 / 720;
  P.FLIP_UP = 27; // rad/s
  P.FLIP_DOWN = 15;

  let nextBallId = 1;
  class Ball {
    constructor(x, y) {
      this.id = nextBallId++;
      this.x = x; this.y = y; this.px = x; this.py = y;
      this.vx = 0; this.vy = 0;
      this.r = P.BALL_R;
      this.held = null; // 'saucer' | 'plunger' | null
      this.trail = [];
      this.alive = true;
      this.skin = 'steel';
      this.age = 0;
      this.still = 0;
      this.lastHitAt = 0;
      this.roll = Math.random() * 6.28;
    }
    get speed() { return Math.hypot(this.vx, this.vy); }
  }
  P.Ball = Ball;

  P.seg = (ax, ay, bx, by, o = {}) => {
    const s = {
      type: 'seg', ax, ay, bx, by,
      r: o.r ?? 4, e: o.e ?? 0.4, fr: o.fr ?? 0.9995,
      kick: o.kick || 0, minKick: o.minKick ?? 30,
      active: o.active ?? true, tag: o.tag || 'wall',
      oneWay: o.oneWay || null, onHit: o.onHit || null, data: o.data || null,
      cool: 0, flash: 0,
    };
    s.dx = bx - ax; s.dy = by - ay;
    s.len2 = s.dx * s.dx + s.dy * s.dy || 1e-6;
    return s;
  };
  P.circ = (x, y, r, o = {}) => ({
    type: 'circ', x, y, r,
    e: o.e ?? 0.5, fr: o.fr ?? 0.9995, kick: o.kick || 0,
    active: o.active ?? true, tag: o.tag || 'post',
    onHit: o.onHit || null, data: o.data || null, cool: 0, flash: 0,
  });

  // Push ball out of surface and reflect relative velocity. (ux,uy) = surface velocity.
  function resolve(b, nx, ny, pen, ux, uy, e, fr) {
    b.x += nx * pen; b.y += ny * pen;
    const rvx = b.vx - ux, rvy = b.vy - uy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    const tvx = rvx - vn * nx, tvy = rvy - vn * ny;
    const ee = -vn < 45 ? 0 : e; // kill micro-bounces so resting contact is stable
    b.vx = ux + tvx * fr - vn * ee * nx;
    b.vy = uy + tvy * fr - vn * ee * ny;
    return -vn;
  }

  function hitCallback(c, b, impact, nx, ny) {
    if (c.onHit && (impact > 40 || c.kick) && c.cool <= 0) {
      c.onHit(b, impact, nx, ny, c);
    }
  }

  function collideSeg(b, s) {
    const px = b.x - s.ax, py = b.y - s.ay;
    let t = (px * s.dx + py * s.dy) / s.len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.ax + s.dx * t, cy = s.ay + s.dy * t;
    let nx = b.x - cx, ny = b.y - cy;
    const d2 = nx * nx + ny * ny, rr = b.r + s.r;
    if (d2 >= rr * rr) return;
    if (s.oneWay) {
      const side = px * s.oneWay.x + py * s.oneWay.y;
      if (side < 0) return;
      if (b.vx * s.oneWay.x + b.vy * s.oneWay.y > 0) return;
    }
    const d = Math.sqrt(d2) || 1e-6;
    nx /= d; ny /= d;
    const impact = resolve(b, nx, ny, rr - d, 0, 0, s.e, s.fr);
    if (s.kick && s.cool <= 0 && impact > s.minKick) {
      // Slingshot fire: fling ball away from the face.
      const vn = b.vx * nx + b.vy * ny;
      const add = Math.max(0, s.kick - vn * 0.5);
      b.vx += nx * add; b.vy += ny * add;
      hitCallback(s, b, impact, nx, ny);
      s.cool = 0.12; s.flash = 1;
      return;
    }
    hitCallback(s, b, impact, nx, ny);
    if (impact > 40 && s.onHit) s.cool = 0.06;
  }

  function collideCirc(b, c) {
    let nx = b.x - c.x, ny = b.y - c.y;
    const d2 = nx * nx + ny * ny, rr = b.r + c.r;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-6;
    nx /= d; ny /= d;
    const impact = resolve(b, nx, ny, rr - d, 0, 0, c.e, c.fr);
    if (c.kick && c.cool <= 0) {
      // Pop bumper fires on any contact.
      const vn = b.vx * nx + b.vy * ny;
      const tvx = b.vx - vn * nx, tvy = b.vy - vn * ny;
      const out = Math.max(vn, 0) * 0.35 + c.kick;
      b.vx = tvx * 0.85 + nx * out;
      b.vy = tvy * 0.85 + ny * out;
      if (c.onHit) c.onHit(b, Math.max(impact, c.kick), nx, ny, c);
      c.cool = 0.09; c.flash = 1;
      return;
    }
    hitCallback(c, b, impact, nx, ny);
    if (impact > 40 && c.onHit) c.cool = 0.08;
  }

  class Flipper {
    constructor(o) {
      Object.assign(this, o); // px,py,len,rb,rt,rest,up
      this.angle = this.rest;
      this.omega = 0;
      this.pressed = false;
      this.enabled = true;
      this.e = 0.38;
    }
    update(dt) {
      const pressed = this.pressed && this.enabled;
      const target = pressed ? this.up : this.rest;
      const diff = target - this.angle;
      if (Math.abs(diff) < 1e-7) { this.omega = 0; return; }
      const sp = pressed ? P.FLIP_UP : P.FLIP_DOWN;
      let step = Math.sign(diff) * sp * dt;
      if (Math.abs(step) >= Math.abs(diff)) step = diff;
      this.omega = step / dt;
      this.angle += step;
    }
    tip() {
      return { x: this.px + Math.cos(this.angle) * this.len, y: this.py + Math.sin(this.angle) * this.len };
    }
  }
  P.Flipper = Flipper;

  function collideFlipper(b, f) {
    const cos = Math.cos(f.angle), sin = Math.sin(f.angle);
    const dx = cos * f.len, dy = sin * f.len;
    const px = b.x - f.px, py = b.y - f.py;
    let t = (px * dx + py * dy) / (f.len * f.len);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const rad = f.rb + (f.rt - f.rb) * t;
    const cx = f.px + dx * t, cy = f.py + dy * t;
    let nx = b.x - cx, ny = b.y - cy;
    const d2 = nx * nx + ny * ny, rr = b.r + rad;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-6;
    nx /= d; ny /= d;
    // surface velocity at contact point
    const rx = cx + nx * rad - f.px, ry = cy + ny * rad - f.py;
    const ux = -f.omega * ry, uy = f.omega * rx;
    const impact = resolve(b, nx, ny, rr - d, ux, uy, f.e, 0.996);
    if (impact > 120 && f.onHit) f.onHit(b, impact);
  }

  function collideBalls(a, b) {
    let nx = b.x - a.x, ny = b.y - a.y;
    const d2 = nx * nx + ny * ny, rr = a.r + b.r;
    if (d2 >= rr * rr || d2 === 0) return 0;
    const d = Math.sqrt(d2);
    nx /= d; ny /= d;
    const pen = (rr - d) / 2;
    a.x -= nx * pen; a.y -= ny * pen;
    b.x += nx * pen; b.y += ny * pen;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv >= 0) return 0;
    const j = -rv * 0.95; // equal masses
    a.vx -= nx * j; a.vy -= ny * j;
    b.vx += nx * j; b.vy += ny * j;
    return -rv;
  }

  // ---- Sensors ----
  P.sensorCircle = (x, y, r, o = {}) => ({ type: 'circle', x, y, r, inside: new Set(), active: true, ...o });
  P.sensorLine = (ax, ay, bx, by, o = {}) => ({ type: 'line', ax, ay, bx, by, active: true, ...o });

  function checkSensors(w, b) {
    for (const s of w.sensors) {
      if (!s.active) continue;
      if (s.type === 'circle') {
        const inside = (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < s.r * s.r;
        const was = s.inside.has(b.id);
        if (inside && !was) { s.inside.add(b.id); s.onEnter && s.onEnter(b, s); }
        else if (!inside && was) { s.inside.delete(b.id); s.onExit && s.onExit(b, s); }
      } else {
        const ex = s.bx - s.ax, ey = s.by - s.ay;
        const c0 = ex * (b.py - s.ay) - ey * (b.px - s.ax);
        const c1 = ex * (b.y - s.ay) - ey * (b.x - s.ax);
        if ((c0 < 0) !== (c1 < 0)) {
          const t = ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / (ex * ex + ey * ey);
          if (t >= -0.05 && t <= 1.05) s.onCross && s.onCross(b, c1 < 0 ? -1 : 1, s);
        }
      }
    }
  }

  class World {
    constructor(layer = 0) {
      this.layer = layer;
      this.gScale = 1;
      this.balls = [];
      this.segs = [];
      this.circs = [];
      this.flippers = [];
      this.sensors = [];
      this.nudgeX = 0; this.nudgeY = 0;
      this.time = 0;
      this.onBallBall = null;
    }
    clearSensorState(ball) {
      for (const s of this.sensors) if (s.inside) s.inside.delete(ball.id);
    }
    step(frameDt) {
      let remaining = Math.min(frameDt, 1 / 20);
      const h = P.SUBSTEP;
      while (remaining > 1e-6) {
        const dt = Math.min(h, remaining);
        remaining -= dt;
        this.substep(dt);
      }
    }
    substep(h) {
      this.time += h;
      for (const f of this.flippers) f.update(h);
      const balls = this.balls;
      const maxS2 = P.MAX_SPEED * P.MAX_SPEED;
      for (const b of balls) {
        if ((b.layer || 0) !== this.layer) continue;
        if (b.held || !b.alive) { b.px = b.x; b.py = b.y; continue; }
        b.px = b.x; b.py = b.y;
        b.vy += P.G * this.gScale * h;
        b.vx *= 1 - 0.035 * h; b.vy *= 1 - 0.035 * h;
        const s2 = b.vx * b.vx + b.vy * b.vy;
        if (s2 > maxS2) {
          const k = P.MAX_SPEED / Math.sqrt(s2);
          b.vx *= k; b.vy *= k;
        }
        b.x += b.vx * h; b.y += b.vy * h;
        for (const s of this.segs) if (s.active) collideSeg(b, s);
        for (const c of this.circs) if (c.active) collideCirc(b, c);
        for (const f of this.flippers) collideFlipper(b, f);
      }
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.held || !a.alive || (a.layer || 0) !== this.layer) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.held || !b.alive || (b.layer || 0) !== this.layer) continue;
          const imp = collideBalls(a, b);
          if (imp > 150 && this.onBallBall) this.onBallBall(a, b, imp);
        }
      }
      for (const b of balls) if (!b.held && b.alive && (b.layer || 0) === this.layer) checkSensors(this, b);
      for (const s of this.segs) if (s.cool > 0) s.cool -= h;
      for (const c of this.circs) if (c.cool > 0) c.cool -= h;
    }
  }
  P.World = World;
})(window.PB);
