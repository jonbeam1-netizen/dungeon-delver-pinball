'use strict';
(function (PB) {
  // Classic 128x32 dot-matrix display with a hand-made 5x7 bitmap font.
  const DW = 128, DH = 32;
  const F = {
    A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
    C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
    E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
    G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
    I: '111 010 010 010 010 010 111', J: '00111 00010 00010 00010 00010 10010 01100',
    K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
    M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
    O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
    Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
    S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
    U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
    W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
    Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
    0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
    2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
    4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
    6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
    8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
    '!': '1 1 1 1 1 0 1', '?': '01110 10001 00001 00010 00100 00000 00100',
    '.': '0 0 0 0 0 0 1', ',': '00 00 00 00 00 01 10', ':': '0 0 1 0 0 1 0',
    '-': '0000 0000 0000 1111 0000 0000 0000', '+': '00000 00100 00100 11111 00100 00100 00000',
    '/': '00001 00010 00010 00100 01000 01000 10000', "'": '1 1 0 0 0 0 0',
    '%': '11000 11001 00010 00100 01000 10011 00011', '=': '0000 0000 1111 0000 1111 0000 0000',
    '*': '00000 00100 10101 01110 10101 00100 00000', '(': '01 10 10 10 10 10 01', ')': '10 01 01 01 01 01 10',
    '<': '0001 0010 0100 1000 0100 0010 0001', '>': '1000 0100 0010 0001 0010 0100 1000',
    '#': '01010 01010 11111 01010 11111 01010 01010', '@': '00000 01010 11111 11111 01110 00100 00000',
    '$': '00100 01111 10100 01110 00101 11110 00100', ' ': '000 000 000 000 000 000 000',
  };
  const GLYPH = {};
  for (const k in F) {
    const rows = F[k].split(' ');
    GLYPH[k] = { w: rows[0].length, rows: rows.map((r) => [...r].map((c) => c === '1')) };
  }

  class DMD {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.buf = new Uint8Array(DW * DH);
      this.scenes = [];
      this.t = 0;
      this.idle = null;
      this.sprites = [];
      this.color = [255, 140, 26];
      this.resize();
    }
    setColor(r, g, b) {
      this.color = [r, g, b];
      this.makeSprites();
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cv.width = Math.max(128, Math.round(r.width * dpr));
      this.cv.height = Math.max(32, Math.round(r.height * dpr));
      this.makeSprites();
    }
    makeSprites() {
      const pitch = this.cv.width / DW;
      this.pitch = pitch;
      const size = Math.max(2, Math.ceil(pitch));
      this.sprites = [];
      const [R, Gc, B] = this.color;
      for (let l = 0; l < 16; l++) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const x = c.getContext('2d');
        const rad = size * 0.42;
        if (l === 0) x.fillStyle = 'rgba(70,32,8,0.35)';
        else {
          const k = 0.25 + (l / 15) * 0.75;
          x.fillStyle = `rgb(${Math.round(R * k)},${Math.round(Gc * k)},${Math.round(B * k)})`;
        }
        x.beginPath();
        x.arc(size / 2, size / 2, rad, 0, Math.PI * 2);
        x.fill();
        this.sprites.push(c);
      }
    }
    clear() { this.buf.fill(0); }
    px(x, y, l) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= DW || y >= DH) return;
      if (l > this.buf[y * DW + x]) this.buf[y * DW + x] = l;
    }
    rect(x, y, w, h, l) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, l); }
    measure(str, scale = 1) {
      let w = 0;
      for (const ch of String(str).toUpperCase()) {
        const g = GLYPH[ch] || GLYPH['?'];
        w += (g.w + 1) * scale;
      }
      return Math.max(0, w - scale);
    }
    text(str, x, y, o = {}) {
      const scale = o.scale || 1, l = o.l ?? 15;
      str = String(str).toUpperCase();
      let w = this.measure(str, scale);
      if (o.align === 'center') x = Math.round(x - w / 2);
      else if (o.align === 'right') x = x - w;
      for (const ch of str) {
        const g = GLYPH[ch] || GLYPH['?'];
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < g.w; c++) {
            if (g.rows[r][c]) {
              if (scale === 1) this.px(x + c, y + r, l);
              else this.rect(x + c * scale, y + r * scale, scale, scale, l);
            }
          }
        }
        x += (g.w + 1) * scale;
      }
      return w;
    }
    // fit text to width by choosing scale
    bigText(str, y, l = 15) {
      const s = this.measure(str, 2) <= DW - 2 ? 2 : 1;
      this.text(str, DW / 2, y + (s === 1 ? 4 : 0), { scale: s, align: 'center', l });
    }
    image(dots, x, y, w, h, bright = 1) {
      if (!dots) return;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const v = Math.round(dots[j * w + i] * bright);
        if (v > 0) this.px(x + i, y + j, Math.min(15, v));
      }
    }
    // queue a scene: {dur, draw(d, t, p)}
    show(scene, priority = 1) {
      scene.t = 0;
      scene.priority = priority;
      if (scene.replace !== false) this.scenes = this.scenes.filter((s) => s.priority > priority || s.keep);
      this.scenes.push(scene);
      this.scenes.sort((a, b) => b.priority - a.priority);
    }
    msg(l1, l2, o = {}) {
      const dur = o.dur || 2;
      this.show({
        dur,
        draw: (d, t, p) => {
          const blink = o.blink && Math.floor(t * 8) % 2 === 0;
          if (o.border) {
            const k = Math.floor(t * 20);
            for (let i = 0; i < DW; i++) { if ((i + k) % 4 === 0) { d.px(i, 0, 8); d.px(DW - 1 - i, 31, 8); } }
            for (let j = 0; j < DH; j++) { if ((j + k) % 4 === 0) { d.px(0, DH - 1 - j, 8); d.px(127, j, 8); } }
          }
          const lv = blink ? 6 : 15;
          if (l2) {
            d.text(l1, 64, 4, { align: 'center', l: lv, scale: d.measure(l1, 2) < 124 && o.big ? 2 : 1 });
            d.text(l2, 64, o.big && d.measure(l1, 2) < 124 ? 21 : 18, { align: 'center', l: 12 });
          } else {
            d.bigText(l1, 9, lv);
          }
          if (o.image) d.image(o.image, 0, 0, 32, 32, Math.min(1, t * 3));
        },
      }, o.priority || 1);
    }
    update(dt) {
      this.t += dt;
      if (this.scenes.length) {
        const s = this.scenes[0];
        s.t += dt;
        if (s.t >= s.dur) this.scenes.shift();
      }
    }
    render() {
      this.clear();
      const s = this.scenes[0];
      if (s) s.draw(this, s.t, s.t / s.dur);
      else if (this.idle) this.idle(this, this.t);
      const ctx = this.ctx, p = this.pitch;
      ctx.fillStyle = '#080402';
      ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      const yoff = (this.cv.height - p * DH) / 2;
      for (let y = 0; y < DH; y++) {
        for (let x = 0; x < DW; x++) {
          ctx.drawImage(this.sprites[this.buf[y * DW + x]], x * p, yoff + y * p);
        }
      }
    }
  }
  DMD.W = DW;
  DMD.H = DH;
  // Convert an image region to a 4-bit dot portrait
  DMD.toDots = function (img, w, h, crop) {
    try {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const s = crop.s * iw;
      x.drawImage(img, crop.cx * iw - s / 2, crop.cy * ih - (s * h) / w / 2, s, (s * h) / w, 0, 0, w, h);
      const data = x.getImageData(0, 0, w, h).data;
      const out = new Uint8Array(w * h);
      let min = 255, max = 0;
      const lum = [];
      for (let i = 0; i < w * h; i++) {
        const v = data[i * 4] * 0.3 + data[i * 4 + 1] * 0.55 + data[i * 4 + 2] * 0.15;
        lum.push(v);
        min = Math.min(min, v); max = Math.max(max, v);
      }
      for (let i = 0; i < w * h; i++) {
        const n = (lum[i] - min) / (max - min + 1);
        out[i] = Math.round(Math.pow(n, 1.2) * 15);
      }
      return out;
    } catch (e) {
      return null; // tainted canvas when opened from file://
    }
  };
  PB.DMD = DMD;
})(window.PB);
