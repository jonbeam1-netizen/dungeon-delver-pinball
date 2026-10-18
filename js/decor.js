// Visual richness layer: painted playfield art, printed plastics, flasher domes, coloured GI,
// toys & set dressing, printed sideboards, apron cards and an illuminated backglass.
import * as THREE from 'three';
import { MODELS } from './models.js';

const PB = window.PB;
const T = PB.T;
const TAU = Math.PI * 2;

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

// ---------------------------------------------------------------- playfield art
export function paintPlayfieldArt(ctx, g, stones, paintStones) {
  const parts = g.parts;
  const W = 600, H = 1100;
  // 1. saturated base: indigo night at the top -> blood crimson -> ember at the flippers
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#160c34');
  base.addColorStop(0.32, '#2a0f3e');
  base.addColorStop(0.6, '#3c0c22');
  base.addColorStop(1, '#2a0a06');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, col, a) => {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col.replace('A', a));
    gr.addColorStop(1, col.replace('A', 0));
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glow(285, 488, 330, 'rgba(255,150,40,A)', 0.42);
  glow(128, 430, 200, 'rgba(60,140,255,A)', 0.32);
  glow(442, 470, 200, 'rgba(40,230,255,A)', 0.28);
  glow(285, 260, 220, 'rgba(255,90,20,A)', 0.3);
  glow(285, 1020, 260, 'rgba(255,40,20,A)', 0.35);
  glow(60, 700, 160, 'rgba(180,80,255,A)', 0.3);
  glow(520, 680, 160, 'rgba(255,60,60,A)', 0.28);
  // 2. starburst behind the lair
  ctx.save();
  ctx.translate(285, 488);
  for (let i = 0; i < 32; i++) {
    const a0 = (i / 32) * TAU, a1 = ((i + 0.5) / 32) * TAU;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 420, a0, a1); ctx.closePath();
    const gr = ctx.createRadialGradient(0, 0, 60, 0, 0, 420);
    gr.addColorStop(0, i % 2 ? 'rgba(255,200,80,0.28)' : 'rgba(255,90,30,0.22)');
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr; ctx.fill();
  }
  ctx.restore();
  // 3. castle skyline behind the braziers with lit windows
  ctx.save();
  ctx.fillStyle = 'rgba(8,4,14,0.85)';
  ctx.beginPath();
  ctx.moveTo(90, 360);
  const R = rng(12);
  let x = 90;
  while (x < 500) {
    const w = 24 + R() * 40, h = 40 + R() * 90;
    ctx.lineTo(x, 360 - h);
    if (R() < 0.5) { ctx.lineTo(x + w / 2, 360 - h - 30 - R() * 30); }
    else for (let k = 0; k < 3; k++) { ctx.lineTo(x + (k * w) / 3, 360 - h); ctx.lineTo(x + (k * w) / 3, 360 - h - 8); ctx.lineTo(x + ((k + 0.5) * w) / 3, 360 - h - 8); ctx.lineTo(x + ((k + 0.5) * w) / 3, 360 - h); }
    ctx.lineTo(x + w, 360 - h);
    x += w;
  }
  ctx.lineTo(500, 360); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,190,80,0.85)';
  for (let i = 0; i < 40; i++) ctx.fillRect(100 + R() * 390, 250 + R() * 100, 3, 5);
  ctx.restore();
  // 4. flagstone texture blended over the art (keeps it a dungeon floor)
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.globalCompositeOperation = 'multiply';
  paintStones(ctx, stones, { gap: 1.6, l0: 30, l1: 70, h0: 20, sat: 10, moss: false });
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.6;
  for (const s of stones) ctx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
  ctx.restore();
  // 5. lava pit at the drain
  ctx.save();
  const lv = ctx.createLinearGradient(0, 960, 0, 1100);
  lv.addColorStop(0, 'rgba(255,90,10,0)');
  lv.addColorStop(0.4, 'rgba(255,110,20,0.8)');
  lv.addColorStop(1, 'rgba(255,200,60,0.95)');
  ctx.fillStyle = lv;
  ctx.beginPath(); ctx.moveTo(170, 1100); ctx.bezierCurveTo(200, 980, 370, 980, 400, 1100); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,120,0.7)'; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); const yy = 1010 + i * 14; ctx.moveTo(200 + i * 6, yy); ctx.bezierCurveTo(250, yy - 10, 320, yy + 10, 370 - i * 6, yy); ctx.stroke(); }
  ctx.restore();
  // 6. coloured shot beams from each arrow to its target
  const beam = (x0, y0, x1, y1, col, w0, w1) => {
    const a = Math.atan2(y1 - y0, x1 - x0), l = Math.hypot(x1 - x0, y1 - y0);
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(a);
    const gr = ctx.createLinearGradient(0, 0, l, 0);
    gr.addColorStop(0, col.replace('A', 0.55)); gr.addColorStop(1, col.replace('A', 0));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(0, -w0); ctx.lineTo(l, -w1); ctx.lineTo(l, w1); ctx.lineTo(0, w0); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  beam(104, 610, 48, 520, 'rgba(90,255,138,A)', 16, 22);
  beam(466, 600, 522, 500, 'rgba(90,255,138,A)', 16, 22);
  beam(166, 506, 128, 418, 'rgba(255,215,0,A)', 18, 24);
  beam(442, 512, 442, 470, 'rgba(125,249,255,A)', 18, 30);
  beam(285, 572, 285, 532, 'rgba(255,215,0,A)', 20, 30);
  // 7. gold filigree border just inside the walls
  ctx.save();
  ctx.strokeStyle = 'rgba(232,180,74,0.55)'; ctx.lineWidth = 2;
  const A = T.ARC;
  ctx.beginPath(); ctx.moveTo(34, 1060); ctx.lineTo(34, A.cy); ctx.ellipse(A.cx, A.cy, A.rx - 12, A.ry - 12, 0, Math.PI, TAU); ctx.lineTo(536, 1060); ctx.stroke();
  ctx.strokeStyle = 'rgba(232,180,74,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(A.cx, A.cy, A.rx - 20, A.ry - 20, 0, Math.PI, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,215,120,0.7)';
  for (let i = 0; i <= 16; i++) { const th = Math.PI + (i / 16) * Math.PI; const px = A.cx + (A.rx - 12) * Math.cos(th), py = A.cy + (A.ry - 12) * Math.sin(th); ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
  ctx.restore();
  // 8. magic circle (bright)
  const m = parts.monster;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.shadowColor = '#ffb050'; ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(255,190,90,0.85)'; ctx.lineWidth = 2.5;
  for (const r of [66, 80, 108]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i * 2 * TAU) / 5; const px = Math.cos(a) * 108, py = Math.sin(a) * 108; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.strokeStyle = 'rgba(255,140,60,0.55)'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,150,0.95)';
  ctx.font = 'bold 11px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) { ctx.save(); ctx.rotate((i / 24) * TAU); ctx.fillText(glyphs[i], 0, -94); ctx.restore(); }
  ctx.restore();
  // 9. scroll banners with labels
  const scroll = (x, y, w, text, col = '#3a1606') => {
    ctx.save(); ctx.translate(x, y);
    const gr = ctx.createLinearGradient(0, -9, 0, 9); gr.addColorStop(0, '#f4e2b0'); gr.addColorStop(1, '#c8a060');
    ctx.fillStyle = gr; ctx.strokeStyle = '#5a3a10'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-w / 2, -8); ctx.lineTo(w / 2, -8); ctx.lineTo(w / 2 + 8, 0); ctx.lineTo(w / 2, 8); ctx.lineTo(-w / 2, 8); ctx.lineTo(-w / 2 - 8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.font = '800 9px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
  };
  scroll(285, 598, 150, 'SLAY THE FIVE • DESCEND');
  scroll(128, 386, 92, 'TREASURE VAULT');
  scroll(442, 588, 92, 'SHRINE RAMP', '#063a40');
  scroll(285, 795, 120, 'BONUS MULTIPLIER');
  scroll(66, 578, 44, 'RUNES', '#3a0a5a');
  scroll(504, 568, 40, 'SLAY', '#5a0a0a');
  scroll(285, 735, 110, 'HERO LEVEL UP');
  // 10. crest with crossed swords above the drain
  ctx.save(); ctx.translate(285, 935);
  ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  ctx.fillStyle = '#5a1010'; ctx.strokeStyle = '#e8b44a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(24, -24); ctx.lineTo(24, 4); ctx.quadraticCurveTo(24, 26, 0, 36); ctx.quadraticCurveTo(-24, 26, -24, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#d8dce4'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-34, -30); ctx.lineTo(34, 40); ctx.moveTo(34, -30); ctx.lineTo(-34, 40); ctx.stroke();
  ctx.fillStyle = '#ffd77a'; ctx.font = '900 16px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('D', 0, 4);
  ctx.restore();
  // 11. bones & skull decals in quiet corners
  const skull = (x, y, s) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(230,220,190,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.fillRect(-5, 5, 10, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.arc(-3, -1, 2.2, 0, TAU); ctx.arc(3, -1, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  };
  [[150, 700, 1], [420, 690, 1.1], [200, 860, 0.8], [380, 865, 0.8], [250, 400, 0.7], [330, 410, 0.7]].forEach(([x, y, s]) => skull(x, y, s));
  // 12. insert bezels (gold ring + black outline around every lamp)
  for (const id in g.lamps) {
    const l = g.lamps[id];
    if (l.h) continue;
    const r = (l.shape === 'pill' ? 0 : l.shape === 'arrow' ? 20 : l.r + 3) * (l.size || 1);
    if (!r) {
      const w = l.label.length * 6.6 + 22, h = l.r * 1.8 + 6;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(l.x - w / 2, l.y - h / 2, w, h);
      ctx.strokeStyle = 'rgba(232,180,74,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(l.x - w / 2, l.y - h / 2, w, h);
      continue;
    }
    ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(232,180,74,0.8)'; ctx.stroke();
  }
  // 13. vault hole + ambient occlusion along every wall
  const sc = parts.saucers[0];
  ctx.beginPath(); ctx.arc(sc.x, sc.y, 22, 0, TAU); ctx.fillStyle = '#120a06'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#e8b44a'; ctx.stroke();
  const hg = ctx.createRadialGradient(sc.x, sc.y, 2, sc.x, sc.y, 18); hg.addColorStop(0, '#000'); hg.addColorStop(1, '#2a1c10');
  ctx.beginPath(); ctx.arc(sc.x, sc.y, 18, 0, TAU); ctx.fillStyle = hg; ctx.fill();
  ctx.save();
  ctx.filter = 'blur(5px)';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 20; ctx.lineJoin = 'round';
  for (const r of g.table.draw.rails) { ctx.beginPath(); r.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  ctx.restore();
  // 14. shooter lane label
  ctx.fillStyle = 'rgba(255,200,120,0.55)'; ctx.font = '700 10px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
  ctx.save(); ctx.translate(569, 880); ctx.rotate(-Math.PI / 2); ctx.fillText('▲  LAUNCH  ▲', 0, 0); ctx.restore();
}

// ---------------------------------------------------------------- decor installation
export function installDecor(R) {
  const root = R.root, g = R.g, parts = g.parts, mat = R.mat;
  const D = {};
  R.decor = D;
  const add = (geo, m, x, h, y, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, h, y); o.castShadow = shadow; o.receiveShadow = true; root.add(o); return o; };
  const glowSprite = (col, x, h, y, s) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sp.position.set(x, h, y); sp.scale.set(s, s, 1); root.add(sp); return sp;
  };
  const screw = (x, y, h) => { const s = add(new THREE.CylinderGeometry(2.6, 2.6, 1.6, 10), mat.chrome, x, h + 0.8, y, false); return s; };

  // ---- printed plastics on posts ----
  const plastic = (pts, h, painter, tint = 0xffffff, op = 0.82) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 4, x1 = Math.max(...xs) + 4, y0 = Math.min(...ys) - 4, y1 = Math.max(...ys) + 4;
    const w = x1 - x0, hh = y1 - y0, k = 4;
    const c = cv(Math.max(16, Math.round(w * k)), Math.max(16, Math.round(hh * k))), x = c.getContext('2d');
    x.scale(k, k); x.translate(-x0, -y0);
    painter(x, x0, y0, w, hh);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / w, -1 / hh);
    t.offset.set(-x0 / w, y1 / hh);
    const shape = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, h + 2.2, 0);
    const pm = new THREE.MeshPhysicalMaterial({ map: t, color: tint, transparent: true, opacity: op, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12 });
    const m = new THREE.Mesh(geo, [pm, new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.6 })]);
    m.castShadow = true;
    root.add(m);
    pts.forEach(([px, py], i) => { if (i % 2 === 0) screw(px + (px < 300 ? 5 : -5), py + 4, h + 2.2); });
    return m;
  };
  const artSkulls = (col1, col2, label) => (x, x0, y0, w, h) => {
    const gr = x.createLinearGradient(x0, y0, x0 + w, y0 + h); gr.addColorStop(0, col1); gr.addColorStop(1, col2);
    x.fillStyle = gr; x.fillRect(x0, y0, w, h);
    x.strokeStyle = 'rgba(255,220,140,0.9)'; x.lineWidth = 1.5; x.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4);
    x.fillStyle = 'rgba(255,240,210,0.9)';
    x.font = '900 9px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (label) x.fillText(label, x0 + w / 2, y0 + h / 2);
    x.font = '14px serif'; x.fillText('☠', x0 + w / 2, y0 + h / 2 + (label ? 13 : 0));
  };
  // slingshot covers
  for (const sl of g.table.draw.slings) {
    const [a, b, c] = sl.pts;
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    const grow = (p) => [cx + (p[0] - cx) * 1.12, cy + (p[1] - cy) * 1.12];
    plastic([grow(a), grow(b), grow(c)], 34, artSkulls('#b01818', '#3a0606', ''), 0xffffff, 0.9);
  }
  // inlane guide plastics
  const inl = (s) => { const m = (x) => (s ? 570 - x : x); return [[m(56), 752], [m(78), 752], [m(78), 896], [m(184), 966], [m(172), 984], [m(56), 908]]; };
  plastic(inl(0), 36, artSkulls('#5a2a8a', '#1a0a2a', 'HERO'), 0xffffff, 0.85);
  plastic(inl(1), 36, artSkulls('#5a2a8a', '#1a0a2a', 'HERO'), 0xffffff, 0.85);
  // orbit entrance shields
  const shield = (x, y, col, label) => plastic([[x - 22, y - 26], [x + 22, y - 26], [x + 22, y + 4], [x, y + 24], [x - 22, y + 4]], 38, (cx, x0, y0, w, h) => {
    const gr = cx.createLinearGradient(x0, y0, x0, y0 + h); gr.addColorStop(0, col); gr.addColorStop(1, '#0a0a0a');
    cx.fillStyle = gr; cx.fillRect(x0, y0, w, h);
    cx.strokeStyle = '#ffd77a'; cx.lineWidth = 2; cx.strokeRect(x0 + 3, y0 + 3, w - 6, h - 10);
    cx.fillStyle = '#fff3d0'; cx.font = '900 8px Cinzel, Georgia, serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(label, x0 + w / 2, y0 + h / 2 - 4);
  });
  shield(74, 566, '#1a8a4a', 'LOOP');
  shield(496, 548, '#1a8a4a', 'LOOP');
  // top lane plastics
  for (const gx of [187, 252, 318, 383]) plastic([[gx - 9, 140], [gx + 9, 140], [gx + 6, 168], [gx - 6, 168]], 32, artSkulls('#d8a020', '#5a3a06', ''), 0xffffff, 0.9);
  // brazier ring plate over the bumper cluster
  plastic([[178, 236], [392, 236], [392, 248], [178, 248]], 52, artSkulls('#ff7a1a', '#5a1a06', 'BRAZIERS'), 0xffffff, 0.9);
  for (const px of [180, 390]) add(new THREE.CylinderGeometry(2.5, 2.5, 52, 8), mat.chrome, px, 26, 242);

  // ---- flasher domes ----
  D.flashers = [];
  const flasher = (x, y, h, color, group) => {
    const col = new THREE.Color(color);
    add(new THREE.CylinderGeometry(7, 9, 6, 14), mat.iron, x, h + 3, y);
    const dm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.15, transparent: true, opacity: 0.85, roughness: 0.15 });
    const dome = add(new THREE.SphereGeometry(8, 16, 10, 0, TAU, 0, Math.PI / 2), dm, x, h + 6, y);
    const sp = glowSprite(col, x, h + 12, y, 60);
    sp.material.opacity = 0;
    D.flashers.push({ dm, sp, group, col, k: 0 });
  };
  flasher(74, 300, 34, 0xff2a2a, 'left');
  flasher(496, 300, 34, 0x3a8aff, 'right');
  flasher(404, 476, 40, 0x2ae0ff, 'ramp');
  flasher(480, 476, 40, 0x2ae0ff, 'ramp');
  flasher(124, 806, 38, 0xffc020, 'left');
  flasher(446, 806, 38, 0xffc020, 'right');
  flasher(30, 250, 74, 0xb04aff, 'top');
  flasher(570, 250, 74, 0xb04aff, 'top');
  D.flashL = new THREE.PointLight(0xff4a2a, 0, 0, 2); D.flashL.position.set(110, 140, 420); root.add(D.flashL);
  D.flashR = new THREE.PointLight(0x3a8aff, 0, 0, 2); D.flashR.position.set(470, 140, 420); root.add(D.flashR);

  // ---- coloured GI ----
  D.gi = [
    { l: new THREE.PointLight(0x9a4aff, 3.5, 0, 2), p: [40, 180, 260] },
    { l: new THREE.PointLight(0x2a8aff, 3.5, 0, 2), p: [560, 180, 300] },
    { l: new THREE.PointLight(0xff5a2a, 5, 0, 2), p: [300, 160, 960] },
  ];
  for (const gi of D.gi) { gi.l.position.set(...gi.p); gi.base = gi.l.intensity; root.add(gi.l); }

  // ---- toys and set dressing ----
  // sword in the stone on the left corner block
  const SX = 40, SY = 148;
  const rock = add(new THREE.DodecahedronGeometry(22, 0), mat.stoneDark, SX, 80, SY); rock.scale.set(1.2, 0.7, 1);
  const blade = add(new THREE.BoxGeometry(6, 70, 2), new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 1, roughness: 0.15, emissive: 0x2a4aff, emissiveIntensity: 0.3 }), SX, 123, SY);
  blade.rotation.z = 0.12;
  add(new THREE.BoxGeometry(24, 5, 6), mat.gold, SX - 4, 158, SY).rotation.z = 0.12;
  add(new THREE.CylinderGeometry(2.5, 2.5, 16, 8), new THREE.MeshStandardMaterial({ color: 0x4a2a14 }), SX - 6, 169, SY).rotation.z = 0.12;
  D.swordGlow = glowSprite(0x6a8aff, SX, 138, SY, 90);
  // crystal clusters
  D.crystals = [];
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x6af0ff, emissive: 0x20c0ff, emissiveIntensity: 1.2, roughness: 0.05, transparent: true, opacity: 0.9 });
  const cluster = (x, y, h, s = 1) => {
    const R2 = rng(Math.round(x * 7 + y));
    for (let i = 0; i < 6; i++) {
      const c = add(new THREE.OctahedronGeometry(7 * s, 0), crystalMat, x + (R2() - 0.5) * 22 * s, h + 8 * s, y + (R2() - 0.5) * 22 * s, false);
      c.scale.set(0.6, 2 + R2() * 1.6, 0.6);
      c.rotation.set((R2() - 0.5) * 0.8, R2() * 3, (R2() - 0.5) * 0.8);
      D.crystals.push(c);
    }
    glowSprite(0x40d0ff, x, h + 18 * s, y, 40 * s).material.opacity = 0.5;
  };
  cluster(568, 136, 70, 1.0);
  cluster(492, 400, 34, 0.7);
  cluster(150, -330, T.DECK_H, 0.9);
  // vault door toy (opens when a lock or relic is waiting)
  const doorG = new THREE.Group();
  doorG.position.set(106, 0, 392);
  root.add(doorG);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 5, 24), new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.85, roughness: 0.35 }));
  door.rotation.x = Math.PI / 2; door.position.set(22, 26, 0); door.castShadow = true;
  doorG.add(door);
  const rimD = new THREE.Mesh(new THREE.TorusGeometry(22, 2.5, 8, 24), mat.gold); rimD.position.set(22, 26, 3); doorG.add(rimD);
  for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(2, 18, 2), mat.gold); sp.position.set(22, 26, 4); sp.rotation.z = (i / 6) * Math.PI; doorG.add(sp); }
  const frame = add(new THREE.BoxGeometry(56, 54, 8), mat.stoneDark, 128, 27, 386);
  D.vaultDoor = doorG;
  // skulls & candles on the inlane blocks
  D.candles = [];
  const skull3 = (x, y, h, s, rot) => {
    const gS = new THREE.Group(); gS.position.set(x, h, y); gS.rotation.y = rot; gS.scale.setScalar(s); root.add(gS);
    const bone = new THREE.MeshStandardMaterial({ color: 0xe8dfc4, roughness: 0.55 });
    const sk = new THREE.Mesh(new THREE.SphereGeometry(8, 14, 10), bone); sk.position.y = 8; sk.scale.set(0.9, 1, 1); sk.castShadow = true; gS.add(sk);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7), bone); jaw.position.set(0, 1.5, 2); gS.add(jaw);
    for (const ex of [-3, 3]) { const e = new THREE.Mesh(new THREE.SphereGeometry(2.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 })); e.position.set(ex, 9, 6.6); gS.add(e); }
  };
  const candle = (x, y, h, ht) => {
    add(new THREE.CylinderGeometry(3, 3.4, ht, 10), new THREE.MeshStandardMaterial({ color: 0xf0e4c8, roughness: 0.6 }), x, h + ht / 2, y);
    D.candles.push(glowSprite(0xffa040, x, h + ht + 5, y, 22));
  };
  for (const s of [0, 1]) {
    const m = (x) => (s ? 570 - x : x);
    skull3(m(100), 1040, 26, 1.1, s ? -0.4 : 0.4);
    skull3(m(126), 1060, 26, 0.8, s ? -0.2 : 0.2);
    candle(m(80), 1012, 26, 18); candle(m(140), 1030, 26, 12); candle(m(92), 1072, 26, 22);
  }
  // gargoyles on the corner blocks
  D.gargoyles = [];
  for (const [x, y, ry] of [[92, 40, 0.4], [508, 40, -0.4]]) {
    const gm = MODELS.demon();
    gm.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (o.material.emissiveIntensity > 1) { o.material.color.set(0x40ff60); o.material.emissive.set(0x20ff40); } else { o.material.color.set(0x5a5650); o.material.emissive && o.material.emissive.set(0x000000); } o.castShadow = true; } });
    const hol = new THREE.Group(); hol.add(gm); hol.scale.setScalar(30); hol.position.set(x, 70, y); hol.rotation.y = ry;
    root.add(hol);
    D.gargoyles.push(hol);
  }
  // hanging chains across the top arch
  const chainMat = mat.iron;
  for (const [a, b] of [[[40, 300], [74, 292]], [[496, 292], [560, 300]]]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * k, 72 - Math.sin(k * Math.PI) * 18, a[1] + (b[1] - a[1]) * k)); }
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 1.4, 5), chainMat));
  }
  // torches along the side walls
  D.wallTorches = [];
  for (const y of [420, 640, 860]) for (const x of [16, 596]) {
    add(new THREE.CylinderGeometry(4, 2, 14, 8), mat.iron, x, 82, y);
    D.wallTorches.push(glowSprite(0xff8a30, x, 96, y, 34));
  }

  // ---- rollover wire switches in every lane ----
  const wireG = new THREE.TorusGeometry(8, 0.9, 6, 16, Math.PI);
  const slotM = new THREE.MeshBasicMaterial({ color: 0x050302 });
  const lanes = [...parts.topLanes.map((s) => [s.x, s.y]), ...parts.heroLanes.map((s) => [s.x, s.y])];
  for (const [x, y] of lanes) {
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(4, 22), slotM);
    slot.rotation.x = -Math.PI / 2; slot.position.set(x, 0.5, y); root.add(slot);
    const wire = new THREE.Mesh(wireG, mat.chrome);
    wire.rotation.y = Math.PI / 2; wire.position.set(x, 0, y); root.add(wire);
  }
  // star rollovers studded along the orbit lanes
  const starG = new THREE.CylinderGeometry(5, 5, 1.5, 5);
  const starM = new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xffb020, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 });
  for (const [x, y] of [[48, 560], [48, 360], [522, 540], [522, 360]]) add(starG, starM, x, 0.8, y, false);

  // ---- printed sideboards ----
  const side = cv(2048, 160), sx = side.getContext('2d');
  const sg = sx.createLinearGradient(0, 0, 0, 160); sg.addColorStop(0, '#1a0a20'); sg.addColorStop(0.7, '#3a0a10'); sg.addColorStop(1, '#ff5a10');
  sx.fillStyle = sg; sx.fillRect(0, 0, 2048, 160);
  for (let i = 0; i < 40; i++) { sx.fillStyle = `rgba(255,${120 + (i % 5) * 20},40,0.25)`; sx.beginPath(); const fxp = i * 52; sx.moveTo(fxp, 160); sx.quadraticCurveTo(fxp + 20, 100 - (i % 3) * 20, fxp + 40, 160); sx.fill(); }
  sx.strokeStyle = '#e8b44a'; sx.lineWidth = 4; sx.strokeRect(4, 4, 2040, 152);
  sx.fillStyle = 'rgba(255,220,150,0.85)'; sx.font = '900 40px Cinzel, Georgia, serif'; sx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) sx.fillText('☠  DUNGEON DELVER  ⚔', 40 + i * 520, 60);
  const sideTex = tex(side);
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, emissive: 0xffffff, emissiveMap: sideTex, emissiveIntensity: 0.35, roughness: 0.5 });
  for (const [x, ry] of [[T.L + 6.2, Math.PI / 2], [T.LR - 6.2, -Math.PI / 2]]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(830, 70), sideMat);
    pl.position.set(x, 37, 685);
    pl.rotation.y = ry;
    root.add(pl);
  }

  // ---- apron instruction cards ----
  const card = (x, title, lines) => {
    const c = cv(512, 128), cx = c.getContext('2d');
    cx.fillStyle = '#f2ead6'; cx.fillRect(0, 0, 512, 128);
    cx.strokeStyle = '#7a1a10'; cx.lineWidth = 6; cx.strokeRect(6, 6, 500, 116);
    cx.fillStyle = '#7a1a10'; cx.font = '900 26px Cinzel, Georgia, serif'; cx.textAlign = 'center'; cx.fillText(title, 256, 36);
    cx.fillStyle = '#2a1a10'; cx.font = '600 17px Georgia, serif';
    lines.forEach((l, i) => cx.fillText(l, 256, 64 + i * 22));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(118, 30), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.7 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 22.4, 1084);
    root.add(m);
  };
  card(98, 'HOW TO PLAY', ['Slay 5 monsters per floor', 'RUNES light lock • 3 locks = MULTIBALL']);
  card(472, 'DRAGON’S DEN', ['Every 2nd Shrine Ramp opens the Den', 'Upper flipper = right button']);

  // ---- illuminated backglass ----
  const bgc = cv(1024, 640), b = bgc.getContext('2d');
  const sky = b.createLinearGradient(0, 0, 0, 640); sky.addColorStop(0, '#1a0410'); sky.addColorStop(0.5, '#a0200a'); sky.addColorStop(0.8, '#ff8a1a'); sky.addColorStop(1, '#2a0804');
  b.fillStyle = sky; b.fillRect(0, 0, 1024, 640);
  const sun = b.createRadialGradient(512, 430, 10, 512, 430, 360); sun.addColorStop(0, 'rgba(255,230,140,0.9)'); sun.addColorStop(1, 'rgba(255,120,20,0)');
  b.fillStyle = sun; b.fillRect(0, 0, 1024, 640);
  // mountains
  b.fillStyle = '#1a0606';
  b.beginPath(); b.moveTo(0, 640); const MR = rng(40); let mx = 0; while (mx < 1024) { b.lineTo(mx, 470 - MR() * 120); mx += 60 + MR() * 60; } b.lineTo(1024, 640); b.fill();
  // dragon silhouette
  b.save(); b.translate(640, 230); b.fillStyle = '#0a0204';
  b.beginPath(); b.ellipse(0, 40, 90, 34, -0.2, 0, TAU); b.fill();
  b.beginPath(); b.moveTo(-60, 40); b.quadraticCurveTo(-150, 0, -170, -60); b.quadraticCurveTo(-140, -50, -120, 10); b.fill();
  b.beginPath(); b.moveTo(-170, -60); b.lineTo(-215, -48); b.lineTo(-180, -40); b.closePath(); b.fill();
  b.beginPath(); b.moveTo(-20, 20); b.lineTo(-120, -190); b.lineTo(-60, -130); b.lineTo(-20, -200); b.lineTo(10, -120); b.lineTo(70, -170); b.lineTo(60, 10); b.closePath(); b.fill();
  b.beginPath(); b.moveTo(30, 20); b.lineTo(200, -150); b.lineTo(170, -60); b.lineTo(260, -80); b.lineTo(180, 0); b.lineTo(250, 20); b.lineTo(70, 50); b.closePath(); b.fill();
  b.beginPath(); b.moveTo(80, 50); b.quadraticCurveTo(200, 120, 280, 60); b.lineTo(270, 80); b.quadraticCurveTo(190, 140, 70, 70); b.fill();
  b.fillStyle = '#ffd040'; b.beginPath(); b.arc(-178, -58, 4, 0, TAU); b.fill();
  // fire breath
  const fire = b.createLinearGradient(-215, -50, -420, 60); fire.addColorStop(0, 'rgba(255,240,150,1)'); fire.addColorStop(1, 'rgba(255,80,0,0)');
  b.fillStyle = fire; b.beginPath(); b.moveTo(-212, -50); b.lineTo(-440, 10); b.lineTo(-420, 110); b.closePath(); b.fill();
  b.restore();
  // knight silhouette with raised sword
  b.save(); b.translate(250, 470); b.fillStyle = '#060204';
  b.fillRect(-26, -90, 52, 90); b.beginPath(); b.arc(0, -108, 22, 0, TAU); b.fill();
  b.fillRect(-32, -86, 64, 18); b.fillRect(-24, 0, 18, 60); b.fillRect(6, 0, 18, 60);
  b.save(); b.translate(26, -80); b.rotate(-0.5); b.fillRect(-4, -170, 8, 170); b.fillRect(-18, -8, 36, 7); b.restore();
  b.beginPath(); b.moveTo(-26, -80); b.quadraticCurveTo(-90, -20, -70, 60); b.lineTo(-30, 0); b.fill();
  b.restore();
  // title
  b.textAlign = 'center'; b.textBaseline = 'middle';
  b.font = '900 96px Cinzel, Georgia, serif';
  b.lineWidth = 10; b.strokeStyle = '#1a0402'; b.strokeText('DUNGEON DELVER', 512, 92);
  const tg = b.createLinearGradient(0, 40, 0, 140); tg.addColorStop(0, '#fff6c8'); tg.addColorStop(0.5, '#ffc040'); tg.addColorStop(1, '#a04a08');
  b.fillStyle = tg; b.shadowColor = '#ff8a20'; b.shadowBlur = 30; b.fillText('DUNGEON DELVER', 512, 92);
  b.shadowBlur = 0;
  b.font = '700 28px Cinzel, Georgia, serif'; b.fillStyle = '#ffe0a0'; b.fillText('DEPTHS OF THE EMBER KING', 512, 160);
  b.strokeStyle = '#e8b44a'; b.lineWidth = 10; b.strokeRect(5, 5, 1014, 630);
  const bgTex = tex(bgc);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(600, 375), new THREE.MeshStandardMaterial({ map: bgTex, emissive: 0xffffff, emissiveMap: bgTex, emissiveIntensity: 0.9, roughness: 0.2 }));
  // mount above the existing backbox
  const back = R.backGroup;
  if (back) {
    const boxM = new THREE.Mesh(new THREE.BoxGeometry(640, 400, 70), mat.wood);
    boxM.position.set(0, 860, -30); boxM.castShadow = true; back.add(boxM);
    glass.position.set(0, 860, 6);
    back.add(glass);
    // speaker grilles either side of the dot-matrix display
    const grill = cv(128, 128), gx = grill.getContext('2d');
    gx.fillStyle = '#0a0806'; gx.fillRect(0, 0, 128, 128);
    gx.fillStyle = '#2a2420';
    for (let yy = 6; yy < 128; yy += 10) for (let xx = 6; xx < 128; xx += 10) { gx.beginPath(); gx.arc(xx, yy, 3.2, 0, TAU); gx.fill(); }
    gx.strokeStyle = '#e8b44a'; gx.lineWidth = 6; gx.strokeRect(3, 3, 122, 122);
    for (const sx2 of [-262, 262]) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(90, 140), new THREE.MeshStandardMaterial({ map: tex(grill), metalness: 0.4, roughness: 0.6 })); sp.position.set(sx2, 470, 7); back.add(sp); }
    // chrome trim around the backbox
    for (const yy of [318, 622, 662, 1058]) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 650, 10), mat.chrome); tr.rotation.z = Math.PI / 2; tr.position.set(0, yy, 8); back.add(tr); }
    if (R.marquee) R.marquee.position.y = 1108;
    if (R.marqueeBox) R.marqueeBox.position.y = 1108;
  }
  return D;
}

export function updateDecor(R, dt, t) {
  const D = R.decor, FX = PB.FX, g = R.g, p = g.p;
  if (!D) return;
  // flashers decay; attract mode strobes them
  const F = FX.flashers || (FX.flashers = {});
  for (const k in F) F[k] = Math.max(0, F[k] - dt * 3.5);
  if (!p) { const ph = Math.floor(t * 1.5) % 4; F[['left', 'top', 'right', 'ramp'][ph]] = Math.max(F[['left', 'top', 'right', 'ramp'][ph]] || 0, 0.25); }
  let L = 0, Rr = 0;
  for (const f of D.flashers) {
    const k = Math.max(F[f.group] || 0, F.all || 0);
    f.dm.emissiveIntensity = 0.15 + k * 2.2;
    f.sp.material.opacity = k * 0.45;
    f.sp.scale.setScalar(36 + k * 34);
    if (f.group === 'left' || f.group === 'top') L = Math.max(L, k);
    if (f.group === 'right' || f.group === 'ramp') Rr = Math.max(Rr, k);
  }
  D.flashL.intensity = L * 14;
  D.flashR.intensity = Rr * 14;
  // GI breathes, dims with the Curse of Shadows, flares on big events
  const dim = p && p.curse === 'shadows' ? 0.35 : 1;
  const flare = (F.all || 0) * 0.8;
  D.gi.forEach((gi, i) => (gi.l.intensity = gi.base * dim * (1 + 0.12 * Math.sin(t * 1.3 + i * 2)) + flare * 6));
  for (const c of D.crystals) c.rotation.y += dt * 0.3;
  const fl = (k) => 0.8 + 0.15 * Math.sin(t * 13 + k) + 0.08 * Math.sin(t * 29 + k * 3);
  D.candles.forEach((s, i) => s.scale.setScalar(20 * fl(i)));
  D.wallTorches.forEach((s, i) => s.scale.setScalar(34 * fl(i * 1.7)));
  D.swordGlow.material.opacity = 0.25 + 0.15 * Math.sin(t * 2);
  const open = p && (p.lockLit || p.relicLit || p.superLit || p.rescue);
  D.vaultDoor.rotation.y += ((open ? -1.6 : 0) - D.vaultDoor.rotation.y) * Math.min(1, dt * 4);
  D.gargoyles.forEach((gg, i) => (gg.rotation.y = (i ? -0.5 : 0.5) + Math.sin(t * 0.5 + i) * 0.1));
}
