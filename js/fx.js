'use strict';
(function (PB) {
  // Effects simulation in table coordinates (x, y on the playfield, h = height above it).
  // The 3D renderer draws these; game code only calls the helpers below.
  const U = PB.U;
  const TAU = Math.PI * 2;
  const FX = (PB.FX = {
    parts: [], texts: [], rings: [], balls: [], banners: [],
    flashA: 0, flashC: '#ffffff', shakeA: 0, sx: 0, sy: 0, nx: 0, ny: 0,
    max: 1400,
    burst(x, y, o = {}) {
      const n = Math.min(o.n || 10, 140);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = (o.speed || 300) * (0.3 + Math.random() * 0.8);
        this.parts.push({
          x, y, h: o.h ?? 16,
          vx: Math.cos(a) * s * 0.8, vy: Math.sin(a) * s * 0.8,
          vh: o.fire ? U.rand(120, 320) : U.rand(80, 520) * (o.up ?? 1),
          life: (o.life || 0.6) * (0.5 + Math.random() * 0.7), t: 0,
          color: o.color || '#ffffff', size: (o.size || 3) * (0.6 + Math.random() * 0.8),
          kind: o.fire ? 'fire' : 'spark', g: o.fire ? -120 : 900,
        });
      }
      this.trim();
    },
    emit(p) { this.parts.push(Object.assign({ t: 0, g: -120, kind: 'fire', h: 10, vx: 0, vy: 0, vh: 100 }, p)); },
    coins(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = U.rand(60, 380);
        this.parts.push({ x, y, h: 40, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vh: U.rand(380, 900), life: U.rand(1.4, 2.2), t: 0, color: '#ffd700', size: 6, kind: 'coin', g: 1700, spin: U.rand(6, 16), rot: Math.random() * 6 });
      }
      this.trim();
    },
    trim() {
      const lim = PB.settings.quality === 'low' ? 500 : this.max;
      if (this.parts.length > lim) this.parts.splice(0, this.parts.length - lim);
    },
    text(x, y, str, color, scale = 1) {
      this.texts.push({ x, y, str, color, scale, t: 0, life: 1.2 });
      if (this.texts.length > 30) this.texts.shift();
    },
    banner(str, color = '#ffd77a', sub = '', life = 1.8) {
      this.banners = [{ str, sub, color, t: 0, life }];
    },
    ring(x, y, color) { this.rings.push({ x, y, color, t: 0, life: 0.8 }); },
    flashers: {},
    flasher(name, k = 1) { this.flashers[name] = Math.max(this.flashers[name] || 0, k); },
    flash(color, k) {
      this.flashC = color;
      this.flashA = Math.max(this.flashA, k * (PB.settings.flashes ? 1 : 0.25));
    },
    shake(k) { if (PB.settings.shake) this.shakeA = Math.min(18, this.shakeA + k); },
    nudge(dx, dy) { this.nx += dx; this.ny += dy; },
    trailBurst(b) { this.burst(b.x, b.y, { n: 20, color: '#5aff8a', speed: 250, life: 0.6 }); },
    fireball(x0, y0, x1, y1, dur, onHit) { this.balls.push({ x0, y0, x1, y1, t: 0, dur, onHit }); },
    update(dt) {
      for (const p of this.parts) {
        p.t += dt;
        p.vh -= p.g * dt;
        p.h += p.vh * dt;
        const floor = p.y < -8 && p.x > 60 && p.x < 540 ? PB.T.DECK_H + 2 : 2;
        if (p.h < floor && p.vh < 0 && (p.h > floor - 40 || floor === 2)) {
          p.h = floor;
          if (p.kind === 'coin') { p.vh = Math.abs(p.vh) * 0.42; p.vx *= 0.7; p.vy *= 0.7; if (p.vh < 60) p.vh = 0; }
          else p.vh = 0;
        }
        const damp = 1 - (p.kind === 'fire' ? 2.5 : 1.2) * dt;
        p.vx *= damp; p.vy *= damp;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.spin) p.rot += p.spin * dt;
      }
      this.parts = this.parts.filter((p) => p.t < p.life);
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter((t) => t.t < t.life);
      for (const b of this.banners) b.t += dt;
      this.banners = this.banners.filter((b) => b.t < b.life);
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter((r) => r.t < r.life);
      for (const f of this.balls) {
        f.t += dt;
        const k = Math.min(1, f.t / f.dur);
        f.x = U.lerp(f.x0, f.x1, k);
        f.y = U.lerp(f.y0, f.y1, k);
        f.h = 60 + Math.sin(k * Math.PI) * 260 * (1 - k * 0.3);
        if (Math.random() < 0.9) this.emit({ x: f.x, y: f.y, h: f.h, vx: U.rand(-60, 60), vy: U.rand(-60, 60), vh: U.rand(-40, 60), life: 0.5, color: '#ff7a1a', size: U.rand(10, 16) });
        if (k >= 1 && !f.done) {
          f.done = true;
          this.burst(f.x1, f.y1, { n: 80, color: '#ff6a00', speed: 700, life: 0.9, fire: true, size: 6 });
          this.ring(f.x1, f.y1, '#ff6a00');
          this.flash('#ff4a00', 0.35);
          f.onHit && f.onHit();
        }
      }
      this.balls = this.balls.filter((f) => !f.done);
      this.flashA = Math.max(0, this.flashA - dt * 2.2);
      this.shakeA = Math.max(0, this.shakeA - dt * 30);
      this.sx = (Math.random() * 2 - 1) * this.shakeA;
      this.sy = (Math.random() * 2 - 1) * this.shakeA;
      this.nx *= Math.pow(0.0005, dt);
      this.ny *= Math.pow(0.0005, dt);
    },
  });
})(window.PB);
