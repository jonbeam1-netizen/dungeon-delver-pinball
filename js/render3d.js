// Three.js renderer: builds the whole machine + dungeon room procedurally and mirrors the game state each frame.
import { THREE, MODELS, renderPortraits } from './models.js';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { paintPlayfieldArt, installDecor, updateDecor } from './decor.js';

const PB = window.PB;
const T = PB.T, U = PB.U;
const S = 0.01; // table units -> world units
const TILT = 0.115; // playfield pitch (radians)
const TAU = Math.PI * 2;

// ---------------- procedural textures ----------------
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
function hexRGB(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (hex, a) => { const [r, g, b] = hexRGB(hex); return `rgba(${r},${g},${b},${a})`; };

// irregular flagstone layout shared by colour + bump maps
function flagstones(W, H, seed, rowMin = 36, rowMax = 66, wMin = 44, wMax = 120) {
  const R = rng(seed), out = [];
  let y = 0;
  while (y < H) {
    const rh = rowMin + R() * (rowMax - rowMin);
    let x = -R() * 40;
    while (x < W) {
      const w = wMin + R() * (wMax - wMin);
      out.push({ x, y, w, h: rh, tone: R(), hue: R() });
      x += w;
    }
    y += rh;
  }
  return out;
}
function paintStones(ctx, stones, o) {
  const R = rng(o.seed || 7);
  for (const s of stones) {
    const l = o.l0 + s.tone * (o.l1 - o.l0);
    ctx.fillStyle = o.bump ? `rgb(${120 + s.tone * 90 | 0},${120 + s.tone * 90 | 0},${120 + s.tone * 90 | 0})` : `hsl(${o.h0 + s.hue * 18},${o.sat}%,${l}%)`;
    const g = o.gap;
    ctx.beginPath();
    const r = Math.min(6, s.h / 5);
    ctx.roundRect ? ctx.roundRect(s.x + g, s.y + g, s.w - 2 * g, s.h - 2 * g, r) : ctx.rect(s.x + g, s.y + g, s.w - 2 * g, s.h - 2 * g);
    ctx.fill();
    // speckle + cracks
    const n = (s.w * s.h) / (o.bump ? 90 : 60);
    for (let i = 0; i < n; i++) {
      const v = R();
      ctx.fillStyle = o.bump ? `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.12)` : v > 0.5 ? 'rgba(255,235,200,0.05)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(s.x + g + R() * (s.w - 2 * g), s.y + g + R() * (s.h - 2 * g), 1 + R() * 2.5, 1 + R() * 2.5);
    }
    if (R() < 0.25) {
      ctx.strokeStyle = o.bump ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let cx = s.x + s.w * R(), cy = s.y + 3;
      ctx.moveTo(cx, cy);
      for (let k = 0; k < 4; k++) { cx += (R() - 0.5) * 16; cy += s.h / 5; ctx.lineTo(cx, cy); }
      ctx.stroke();
    }
    if (!o.bump && o.moss && R() < 0.18) {
      ctx.fillStyle = 'rgba(70,95,40,0.16)';
      ctx.beginPath(); ctx.ellipse(s.x + s.w * R(), s.y + s.h * R(), 10 + R() * 18, 6 + R() * 10, R() * 3, 0, TAU); ctx.fill();
    }
  }
}
function brickCanvas(w, h, bump) {
  const c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = bump ? '#000' : '#0d0907';
  x.fillRect(0, 0, w, h);
  const R = rng(11);
  const bh = 32;
  for (let r = 0; r * bh < h; r++) {
    const off = (r % 2) * 34;
    for (let k = -1; k * 68 < w + 68; k++) {
      const t = R();
      x.fillStyle = bump ? `rgb(${140 + t * 80 | 0},${140 + t * 80 | 0},${140 + t * 80 | 0})` : `hsl(${18 + R() * 16},${14 + R() * 8}%,${13 + t * 11}%)`;
      x.fillRect(k * 68 + off + 3, r * bh + 3, 62, bh - 6);
      for (let i = 0; i < 26; i++) { x.fillStyle = R() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)'; x.fillRect(k * 68 + off + 3 + R() * 60, r * bh + 3 + R() * 24, 2, 2); }
    }
  }
  return c;
}
function woodCanvas(w, h, base = '#3a2414') {
  const c = cv(w, h), x = c.getContext('2d'), R = rng(5);
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = R() > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,200,140,0.06)';
    x.lineWidth = 1 + R() * 2;
    x.beginPath();
    const y0 = R() * h;
    x.moveTo(0, y0);
    for (let k = 1; k <= 8; k++) x.lineTo((k * w) / 8, y0 + Math.sin(k + i) * 4 + (R() - 0.5) * 3);
    x.stroke();
  }
  return c;
}
function faceTex(w, h, draw) {
  const c = cv(w, h);
  draw(c.getContext('2d'), w, h);
  return tex(c);
}
const runeFace = (glyph, col) => faceTex(64, 128, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a1640'); g.addColorStop(1, '#0e0618');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#e8b44a'; x.lineWidth = 4; x.strokeRect(3, 3, w - 6, h - 6);
  x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 10;
  x.font = 'bold 54px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(glyph, w / 2, h / 2);
});
const bullseye = (col) => faceTex(64, 64, (x, w) => {
  x.fillStyle = '#f2ead6'; x.fillRect(0, 0, w, w);
  for (let i = 4; i > 0; i--) { x.beginPath(); x.arc(w / 2, w / 2, i * 7.5, 0, Math.PI * 2); x.fillStyle = i % 2 ? col : '#f2ead6'; x.fill(); }
  x.strokeStyle = '#1a0a04'; x.lineWidth = 3; x.strokeRect(1, 1, w - 2, w - 2);
});

function glowCanvas() {
  const c = cv(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return c;
}

// ---------------- the renderer ----------------
export class Renderer3D {
  constructor(canvas, overlay, game) {
    this.cv = canvas;
    this.ov = overlay;
    this.octx = overlay.getContext('2d');
    this.g = game;
    this.t = 0;
    this.bg = 'normal';
    this.bgK = { normal: 1, hoard: 0, boss: 0 };
    this.camMode = PB.settings.camera || 'player';
    this.follow = new THREE.Vector2(0, 0);
    this.quality = this.pickQuality();
    const r = (this.r = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.45;
    r.shadowMap.enabled = this.quality !== 'low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040302);
    this.scene.fog = new THREE.Fog(0x050302, 18, 46);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 120);
    this.glowTex = tex(glowCanvas(), null, false);
    this.build();
    installDecor(this);
    if (this.quality !== 'low' && PB.settings.bloom !== false) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.28, 0.3, 0.95);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }
  pickQuality() {
    const q = PB.settings.quality;
    if (q && q !== 'auto') return q;
    const touch = matchMedia('(pointer: coarse)').matches;
    return touch || Math.min(screen.width, screen.height) < 700 ? 'medium' : 'high';
  }

  // ---------- construction ----------
  build() {
    const scene = this.scene;
    // groups: tilt -> scale -> table-unit space (x, h, y)
    this.tilt = new THREE.Group();
    this.tilt.rotation.x = TILT;
    scene.add(this.tilt);
    const sc = new THREE.Group();
    sc.scale.setScalar(S);
    this.tilt.add(sc);
    const root = (this.root = new THREE.Group());
    root.position.set(-T.W / 2, 0, -T.H / 2);
    sc.add(root);

    this.buildEnv();
    this.buildLights();
    this.buildPlayfield();
    this.buildWalls();
    this.buildCabinet();
    this.buildRoom();
    this.buildFeatures();
    this.buildRamp();
    this.buildDeck();
    this.buildWings();
    this.buildRats();
    this.buildLamps();
    this.buildMonsters();
    this.buildBalls();
    this.buildParticles();
  }
  add(geo, mat, x = 0, h = 0, y = 0, parent = this.root, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h, y);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  extrude(points, depth, mat, bevel = 0, y0 = 0) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 16 });
    g.rotateX(Math.PI / 2);
    g.translate(0, depth + y0, 0);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  buildEnv() {
    // equirect environment for reflections: warm torch blobs in the dark
    const c = cv(512, 256), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#2a1c14'); g.addColorStop(0.5, '#120a06'); g.addColorStop(1, '#060403');
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    for (const [px, py, r, col] of [[90, 100, 40, '#ff9a40'], [420, 95, 40, '#ff8a30'], [256, 40, 90, '#6a5a50'], [256, 120, 30, '#ffd080']]) {
      const rg = x.createRadialGradient(px, py, 0, px, py, r);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: 0x140c08, side: THREE.BackSide })));
    const panel = (col, pos, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); envScene.add(m); };
    panel(0xffe0b0, [0, 14, 2], 14, 6);
    panel(0xff8a30, [-12, 4, -6], 4, 6);
    panel(0xff8a30, [12, 4, -6], 4, 6);
    panel(0x8a5aff, [-10, 6, 8], 6, 4);
    panel(0x3a8aff, [10, 6, 8], 6, 4);
    panel(0xfff4e0, [0, 6, 14], 10, 3);
    const pm = new THREE.PMREMGenerator(this.r);
    this.envMap = pm.fromScene(envScene, 0.03).texture;
    this.scene.environment = this.envMap;
    pm.dispose();
    this.mat = {
      steel: new THREE.MeshStandardMaterial({ color: 0xd8d2c8, metalness: 1, roughness: 0.22, envMapIntensity: 1.6 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xdedee4, metalness: 1, roughness: 0.1, envMapIntensity: 1.7 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.8, roughness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe8b440, metalness: 1, roughness: 0.25 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x8a1410, roughness: 0.6 }),
      stoneDark: new THREE.MeshStandardMaterial({ color: 0x2c241e, roughness: 0.9, flatShading: true }),
    };
    const bc = brickCanvas(512, 256), bb = brickCanvas(512, 256, true);
    this.mat.brick = new THREE.MeshStandardMaterial({ map: tex(bc, [1, 1]), bumpMap: tex(bb, [1, 1], false), bumpScale: 3, roughness: 0.95 });
    const wc = woodCanvas(256, 512);
    this.mat.wood = new THREE.MeshStandardMaterial({ map: tex(wc, [1, 3]), roughness: 0.6, metalness: 0.05 });
  }

  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xb0a0c0, 0x3a2010, 1.1);
    s.add(this.hemi);
    const key = (this.key = new THREE.DirectionalLight(0xffe2c4, 2.4));
    key.position.set(-3, 12, 7);
    key.target.position.set(0, 0, -0.5);
    s.add(key, key.target);
    key.castShadow = this.quality !== 'low';
    const sm = this.quality === 'high' ? 2048 : 1024;
    key.shadow.mapSize.set(sm, sm);
    Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 7.5, bottom: -7.5, near: 2, far: 30 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const pl = (col, int, x, h, y, dist = 0) => {
      const l = new THREE.PointLight(col, int, dist, 2);
      l.position.set(x, h, y);
      this.root.add(l);
      return l;
    };
    this.torchL = pl(0xff8a3a, 8, 40, 140, -20);
    this.torchR = pl(0xff8a3a, 8, 560, 140, -20);
    this.monLight = pl(0xff8a3a, 4, T.C, 190, 560);
    this.bumpLight = pl(0xff7a20, 3, 285, 90, 300);
    this.fill = pl(0xffe0c0, 3, 300, 320, 820);
  }

  buildPlayfield() {
    const k = 2, W = 600 * k, H = 1100 * k;
    const color = cv(W, H), bump = cv(W, H);
    const cx = color.getContext('2d'), bx = bump.getContext('2d');
    cx.scale(k, k); bx.scale(k, k);
    const stones = flagstones(600, 1100, 3);
    cx.fillStyle = '#080605'; cx.fillRect(0, 0, 600, 1100);
    bx.fillStyle = '#000'; bx.fillRect(0, 0, 600, 1100);
    paintPlayfieldArt(cx, this.g, stones, paintStones);
    paintStones(bx, stones, { gap: 1.6, bump: true });
    this.pfColor = color;
    const map = tex(color);
    const mat = this.quality === 'low'
      ? new THREE.MeshStandardMaterial({ map, roughness: 0.45 })
      : new THREE.MeshPhysicalMaterial({ map, bumpMap: tex(bump, null, false), bumpScale: 1.4, roughness: 0.55, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.8 });
    this.pfMat = mat;
    const geo = new THREE.PlaneGeometry(600, 1100);
    geo.rotateX(-Math.PI / 2);
    const m = this.add(geo, mat, 300, 0, 550, this.root, false);
    m.receiveShadow = true;
  }

  paintArt(ctx) {
    const g = this.g, parts = g.parts;
    // darker lanes and plunger channel
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(T.L, 292, 52, 270);
    ctx.fillRect(496, 292, 52, 250);
    ctx.fillRect(T.R, 330, T.LR - T.R, T.H);
    // vignette
    const v = ctx.createRadialGradient(T.C, 560, 120, T.C, 560, 640);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, 600, 1100);
    // painted path to the lair
    const glowLine = (pts, col, w) => {
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash([2, 10]);
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.restore();
    };
    glowLine([[T.C, 900], [T.C, 740], [T.C, 600]], 'rgba(255,170,80,0.35)', 3);
    // magic circle around the lair
    const m = parts.monster;
    ctx.save();
    ctx.translate(m.x, m.y);
    const rc = '#ff9a3a';
    ctx.shadowColor = rc; ctx.shadowBlur = 8;
    ctx.strokeStyle = rgba(rc, 0.5); ctx.lineWidth = 2;
    for (const r of [66, 80, 104]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * TAU) / 5;
      const x = Math.cos(a) * 104, y = Math.sin(a) * 104;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = rgba(rc, 0.28); ctx.stroke();
    ctx.fillStyle = rgba(rc, 0.6);
    ctx.font = 'bold 10px Cinzel, Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let i = 0; i < 24; i++) { ctx.save(); ctx.rotate((i / 24) * TAU); ctx.fillText(glyphs[i], 0, -92); ctx.restore(); }
    ctx.restore();
    // labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 11px Cinzel, Georgia, serif';
    ctx.fillStyle = 'rgba(255,215,140,0.55)';
    ctx.fillText('SLAY THE FIVE • DESCEND', T.C, 598);
    ctx.font = '700 10px Cinzel, Georgia, serif';
    ctx.fillStyle = 'rgba(255,211,77,0.85)';
    ctx.fillText('VAULT', 128, 386);
    ctx.fillStyle = 'rgba(125,249,255,0.85)';
    ctx.fillText('SHRINE RAMP', 442, 580);
    ctx.fillStyle = 'rgba(255,200,120,0.45)';
    ctx.save(); ctx.translate(569, 880); ctx.rotate(-Math.PI / 2); ctx.fillText('▲  LAUNCH  ▲', 0, 0); ctx.restore();
    // crest between the flippers
    ctx.save();
    ctx.translate(T.C, 960);
    ctx.strokeStyle = 'rgba(232,180,74,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-22, -20); ctx.lineTo(22, -20); ctx.lineTo(22, 4); ctx.quadraticCurveTo(22, 24, 0, 32); ctx.quadraticCurveTo(-22, 24, -22, 4); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(14, 20); ctx.moveTo(14, -12); ctx.lineTo(-14, 20); ctx.stroke();
    ctx.restore();
    // vault hole
    const sc = parts.saucers[0];
    ctx.beginPath(); ctx.arc(sc.x, sc.y, 22, 0, TAU); ctx.fillStyle = '#1a120c'; ctx.fill();
    const hg = ctx.createRadialGradient(sc.x, sc.y, 2, sc.x, sc.y, 18);
    hg.addColorStop(0, '#000'); hg.addColorStop(1, '#2a1c10');
    ctx.beginPath(); ctx.arc(sc.x, sc.y, 18, 0, TAU); ctx.fillStyle = hg; ctx.fill();
    // lamp sockets + ambient occlusion along walls
    for (const id in g.lamps) {
      const l = g.lamps[id];
      ctx.beginPath(); ctx.arc(l.x, l.y, (l.shape === 'pill' ? 14 : l.r + 4) * (l.size || 1), 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    }
    ctx.save();
    ctx.filter = 'blur(5px)';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 22; ctx.lineJoin = 'round';
    for (const r of g.table.draw.rails) {
      ctx.beginPath(); r.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
    ctx.restore();
  }

  buildWalls() {
    const draw = this.g.table.draw;
    const segs = { rail: [], outer: [] }, joints = { rail: [], outer: [] };
    const H = { rail: 34, outer: 74, rampMouth: 40 };
    for (const r of draw.rails) {
      const kind = r.style === 'outer' ? 'outer' : 'rail';
      const h = H[r.style] || H.rail;
      for (let i = 0; i < r.pts.length - 1; i++) segs[kind].push([...r.pts[i], ...r.pts[i + 1], r.r, h]);
      for (const p of r.pts) joints[kind].push([p[0], p[1], r.r, h]);
    }
    for (const gd of draw.guides) { segs.rail.push([gd.x, gd.y0, gd.x, gd.y1, 4.5, 30]); joints.rail.push([gd.x, gd.y0, 4.5, 30], [gd.x, gd.y1, 4.5, 30]); }
    const gt = this.g.parts.gate;
    segs.rail.push([gt.ax, gt.ay, gt.bx, gt.by, 2, 26]);
    const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.7, metalness: 0.2, map: this.mat.wood.map });
    for (const kind of ['rail', 'outer']) {
      const mat = kind === 'outer' ? outerMat : this.mat.steel;
      const im = new THREE.InstancedMesh(box, mat, segs[kind].length);
      segs[kind].forEach(([ax, ay, bx, by, r, h], i) => {
        const len = Math.hypot(bx - ax, by - ay);
        q.setFromAxisAngle(up, -Math.atan2(by - ay, bx - ax));
        m4.compose(new THREE.Vector3((ax + bx) / 2, h / 2, (ay + by) / 2), q, new THREE.Vector3(len, h, r * 2));
        im.setMatrixAt(i, m4);
      });
      im.castShadow = im.receiveShadow = true;
      this.root.add(im);
      if (kind === 'rail') this.railCaps(segs[kind], 0);
      const jm = new THREE.InstancedMesh(cyl, mat, joints[kind].length);
      joints[kind].forEach(([x, y, r, h], i) => {
        m4.compose(new THREE.Vector3(x, h / 2, y), new THREE.Quaternion(), new THREE.Vector3(r * 2, h, r * 2));
        jm.setMatrixAt(i, m4);
      });
      jm.castShadow = jm.receiveShadow = true;
      this.root.add(jm);
    }
    // gold cap rail on top of the outer wall
    const outer = draw.rails.find((r) => r.style === 'outer');
    const curve = new THREE.CatmullRomCurve3(outer.pts.map(([x, y]) => new THREE.Vector3(x, 75, y)), false, 'centripetal');
    const capRail = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 4.5, 8, false), this.mat.gold);
    capRail.castShadow = true;
    this.root.add(capRail);
    // corner blocks outside the arch
    const A = T.ARC, arc = [];
    for (let i = 0; i <= 44; i++) { const th = Math.PI + (i / 44) * Math.PI; arc.push([A.cx + A.rx * Math.cos(th), A.cy + A.ry * Math.sin(th)]); }
    const cornerMat = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.9, map: this.mat.brick.map });
    this.extrude([[0, -12], [600, -12], [600, 270], ...arc.slice().reverse(), [0, 270]], 70, cornerMat);
    // inlane blocks, apron
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.85 });
    this.extrude([[66, 904], [174, 976], [186, 1000], [150, 1100], [66, 1100]], 26, blockMat);
    this.extrude([[504, 904], [396, 976], [384, 1000], [420, 1100], [504, 1100]], 26, blockMat);
    const ap = cv(1024, 64), ax = ap.getContext('2d');
    const ag = ax.createLinearGradient(0, 0, 0, 64);
    ag.addColorStop(0, '#3a2a1c'); ag.addColorStop(1, '#1a120a');
    ax.fillStyle = ag; ax.fillRect(0, 0, 1024, 64);
    ax.fillStyle = '#d8b070'; ax.font = '900 30px Cinzel, Georgia, serif'; ax.textAlign = 'center'; ax.textBaseline = 'middle';
    ax.fillText('DUNGEON  DELVER', 512, 34);
    ax.strokeStyle = '#8a6a40'; ax.lineWidth = 3; ax.strokeRect(4, 4, 1016, 56);
    this.apronCanvas = ap;
    const apMat = [blockMat, blockMat, new THREE.MeshStandardMaterial({ map: tex(ap), roughness: 0.6, metalness: 0.2 }), blockMat, blockMat, blockMat];
    this.add(new THREE.BoxGeometry(T.R - T.L, 22, 34), apMat, (T.L + T.R) / 2, 11, 1084);
  }

  buildCabinet() {
    const wood = this.mat.wood;
    const add = (w, h, d, x, y, z, mat = wood) => this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
    add(36, 240, 1180, -18, -50, 560);
    add(36, 240, 1180, 618, -50, 560);
    add(36, 360, 460, -18, 0, -200);
    add(36, 360, 460, 618, 0, -200);
    add(672, 150, 1600, 300, -86, 360, new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.8 }));
    add(672, 52, 50, 300, 26, 1125, this.mat.iron);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 676, 24), this.mat.chrome);
    bar.rotation.z = Math.PI / 2; bar.position.set(300, 58, 1122); bar.castShadow = true; this.root.add(bar);
    // flipper buttons on the cabinet sides + launch button + coin door
    const btn = new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.3, emissive: 0x400000 });
    for (const bx of [-38, 638]) { const b2 = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 10, 20), btn); b2.rotation.z = Math.PI / 2; b2.position.set(bx, -10, 1060); this.root.add(b2); }
    const launch = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 10, 20), new THREE.MeshStandardMaterial({ color: 0xffc020, emissive: 0x806000, emissiveIntensity: 0.8 }));
    launch.rotation.x = Math.PI / 2; launch.position.set(560, -10, 1152); this.root.add(launch);
    const doorTex = faceTex(256, 256, (x, w, h) => {
      x.fillStyle = '#1a1614'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#8a8070'; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16);
      for (const cx of [80, 176]) { x.fillStyle = '#300606'; x.fillRect(cx - 22, 50, 44, 70); x.fillStyle = '#ff3020'; x.fillRect(cx - 4, 60, 8, 40); x.fillStyle = '#d8d0c0'; x.font = '700 16px Georgia'; x.textAlign = 'center'; x.fillText('25¢', cx, 140); }
      x.fillStyle = '#5a5248'; x.fillRect(40, 170, w - 80, 50);
      x.fillStyle = '#d8c8a0'; x.font = '900 18px Cinzel, Georgia, serif'; x.fillText('INSERT GOLD', w / 2, 202);
    });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ map: doorTex, emissive: 0xffffff, emissiveMap: doorTex, emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.4 }));
    door.position.set(300, -70, 1151); this.root.add(door);
    // metal side trims
    add(8, 8, 1180, -2, 72, 560, this.mat.chrome);
    add(8, 8, 1180, 602, 72, 560, this.mat.chrome);
    add(8, 8, 460, -2, 182, -200, this.mat.chrome);
    add(8, 8, 460, 602, 182, -200, this.mat.chrome);
    // backboard + gatehouse diorama
    const back = (this.backGroup = new THREE.Group());
    back.position.set(300, 130, -450);
    this.root.add(back);
    const b = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; back.add(m); return m; };
    b(new THREE.BoxGeometry(672, 360, 40), this.mat.brick, 0, 140, -20);
    const stone = this.mat.stoneDark;
    for (const sx of [-230, 230]) {
      b(new THREE.CylinderGeometry(52, 58, 300, 10), stone, sx, 150, 20);
      b(new THREE.ConeGeometry(66, 110, 10), new THREE.MeshStandardMaterial({ color: 0x4a1a14, roughness: 0.8, flatShading: true }), sx, 355, 20);
      for (let k = 0; k < 8; k++) b(new THREE.BoxGeometry(20, 22, 20), stone, sx + Math.cos((k / 8) * TAU) * 54, 305, 20 + Math.sin((k / 8) * TAU) * 54);
    }
    // arch + portcullis
    b(new THREE.BoxGeometry(260, 220, 30), stone, 0, 110, 10);
    const archDark = new THREE.Mesh(new THREE.CircleGeometry(70, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050302 }));
    archDark.position.set(0, 140, 26); back.add(archDark);
    b(new THREE.BoxGeometry(140, 140, 2), new THREE.MeshBasicMaterial({ color: 0x050302 }), 0, 70, 26);
    const port = (this.portcullis = new THREE.Group());
    port.position.set(0, 0, 30);
    back.add(port);
    for (let i = -3; i <= 3; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 200, 6), this.mat.iron); m.position.set(i * 20, 100, 0); port.add(m); }
    for (let j = 0; j < 5; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(140, 5, 5), this.mat.iron); m.position.set(0, 20 + j * 40, 0); port.add(m); }
    // glowing eyes in the dark gate
    this.gateEyes = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3010 }));
    this.gateEyes.position.set(-14, 120, 22);
    back.add(this.gateEyes);
    const e2 = this.gateEyes.clone(); e2.position.x = 14; back.add(e2);
    this.gateEyes2 = e2;
    // banners
    for (const sx of [-110, 110]) {
      const bc = cv(64, 192), x = bc.getContext('2d');
      x.fillStyle = '#6a1410'; x.fillRect(0, 0, 64, 170);
      x.beginPath(); x.moveTo(0, 170); x.lineTo(32, 192); x.lineTo(64, 170); x.fill();
      x.fillStyle = '#e8b44a'; x.font = '40px serif'; x.textAlign = 'center'; x.fillText('⚔', 32, 90);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(50, 150), new THREE.MeshStandardMaterial({ map: tex(bc), side: THREE.DoubleSide, roughness: 0.9 }));
      pm.position.set(sx, 150, 28);
      back.add(pm);
    }
    // backbox with a live dot-matrix screen
    b(new THREE.BoxGeometry(640, 300, 70), this.mat.wood, 0, 470, -30);
    b(new THREE.BoxGeometry(600, 160, 4), new THREE.MeshStandardMaterial({ color: 0x050302, roughness: 0.4 }), 0, 470, 6);
    this.dmdTex = new THREE.CanvasTexture(PB.dmd.cv);
    this.dmdTex.colorSpace = THREE.SRGBColorSpace;
    this.dmdScreen = new THREE.Mesh(new THREE.PlaneGeometry(560, 140), new THREE.MeshBasicMaterial({ map: this.dmdTex, toneMapped: false }));
    this.dmdScreen.position.set(0, 470, 9);
    back.add(this.dmdScreen);
    const mq = cv(1024, 128), mx = mq.getContext('2d');
    const mg = mx.createLinearGradient(0, 0, 0, 128); mg.addColorStop(0, '#5a1a0a'); mg.addColorStop(1, '#1a0602');
    mx.fillStyle = mg; mx.fillRect(0, 0, 1024, 128);
    mx.fillStyle = '#ffcf7a'; mx.font = '900 76px Cinzel, Georgia, serif'; mx.textAlign = 'center'; mx.textBaseline = 'middle';
    mx.shadowColor = '#ff7a20'; mx.shadowBlur = 24; mx.fillText('DUNGEON DELVER', 512, 68);
    this.marquee = new THREE.Mesh(new THREE.PlaneGeometry(600, 75), new THREE.MeshBasicMaterial({ map: tex(mq), toneMapped: false }));
    this.marquee.position.set(0, 590, 6);
    this.marqueeBox = b(new THREE.BoxGeometry(640, 90, 60), this.mat.wood, 0, 590, -30);
    back.add(this.marquee);
  }

  buildRoom() {
    // dungeon room around the machine (world space, not tilted)
    const room = new THREE.Group();
    this.scene.add(room);
    const fl = cv(512, 512), fx = fl.getContext('2d');
    fx.fillStyle = '#060404'; fx.fillRect(0, 0, 512, 512);
    paintStones(fx, flagstones(512, 512, 9, 60, 110, 70, 160), { gap: 3, l0: 8, l1: 15, h0: 20, sat: 10, moss: true });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex(fl, [10, 10]), roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.6;
    floor.receiveShadow = true;
    room.add(floor);
    const wallMat = this.mat.brick.clone();
    wallMat.map = this.mat.brick.map.clone(); wallMat.map.repeat.set(10, 4); wallMat.map.needsUpdate = true;
    wallMat.bumpMap = this.mat.brick.bumpMap.clone(); wallMat.bumpMap.repeat.set(10, 4); wallMat.bumpMap.needsUpdate = true;
    const mkWall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 12), wallMat); m.position.set(x, 3.4, z); m.rotation.y = ry; room.add(m); };
    mkWall(44, 0, -11, 0);
    mkWall(40, -15, 4, Math.PI / 2);
    mkWall(40, 15, 4, -Math.PI / 2);
    // pillars + wall torches
    this.roomTorches = [];
    const pil = new THREE.CylinderGeometry(0.55, 0.65, 12, 10);
    for (const [x, z] of [[-7, -9.5], [7, -9.5], [-13.5, -2], [13.5, -2], [-13.5, 7], [13.5, 7]]) {
      const m = new THREE.Mesh(pil, this.mat.stoneDark); m.position.set(x, 3.4, z); m.castShadow = true; room.add(m);
      const sconce = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 8), this.mat.iron);
      sconce.position.set(x + (x < 0 ? 0.62 : -0.62), 1.2, z + 0.4);
      sconce.rotation.x = Math.PI;
      room.add(sconce);
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false }));
      fl.position.set(sconce.position.x, 1.5, sconce.position.z);
      fl.scale.set(0.6, 0.9, 1);
      room.add(fl);
      this.roomTorches.push(fl);
    }
    this.roomLights = [];
    // treasure pile, chest and barrels as set dressing
    const coinGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.015, 12);
    const pile = new THREE.InstancedMesh(coinGeo, this.mat.gold, 260);
    pile.position.set(-4.5, 0, 1.5);
    const m4 = new THREE.Matrix4(), R = rng(21);
    for (let i = 0; i < 260; i++) {
      const a = R() * TAU, rr = Math.sqrt(R()) * 1.1, hh = (1.1 - rr) * 0.55 * R() + 0.01;
      m4.compose(new THREE.Vector3(-5.2 + Math.cos(a) * rr, -2.6 + hh, 3.5 + Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 0.8, R() * 3, R() * 0.8)), new THREE.Vector3(1, 1, 1));
      pile.setMatrixAt(i, m4);
    }
    room.add(pile);
    const chest = MODELS.mimic();
    chest.scale.setScalar(1.3);
    chest.position.set(-10, -2.6, 5);
    chest.rotation.y = 0.6;
    chest.userData.lid.rotation.x = -0.9;
    room.add(chest);
    const barrelMat = new THREE.MeshStandardMaterial({ map: this.mat.wood.map, roughness: 0.8 });
    for (const [x, z] of [[10.4, 5], [11.2, 5.8], [10.8, 4.1]]) {
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), barrelMat);
      bm.position.set(x, -2.05, z); bm.castShadow = true; room.add(bm);
      for (const yy of [-0.35, 0.35]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 6, 20), this.mat.iron); band.rotation.x = Math.PI / 2; band.position.set(x, -2.05 + yy, z); room.add(band); }
    }
    // machine legs
    for (const [x, z] of [[-3.1, -5.6], [3.1, -5.6], [-3.1, 5.6], [3.1, 5.6]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 0.22), this.mat.chrome);
      leg.position.set(x, -1.5, z); room.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 12), this.mat.iron);
      foot.position.set(x, -2.62, z); room.add(foot);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.26), this.mat.chrome);
      brace.position.set(x, -0.35, z); room.add(brace);
    }
  }

  buildFeatures() {
    const g = this.g, parts = g.parts, root = this.root;
    // bumpers (braziers)
    const wingBumps = [...parts.wings.crypt.bumpers, ...parts.wings.forge.bumpers];
    this.bumpers = [...parts.bumpers, parts.deckBumper, ...wingBumps].map((c) => {
      const grp = new THREE.Group();
      const baseH = c === parts.deckBumper ? T.DECK_H : wingBumps.includes(c) ? T.WING_H : 0;
      grp.position.set(c.x, baseH, c.y);
      root.add(grp);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(32, 34, 8, 24), this.mat.iron); base.position.y = 4; grp.add(base);
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(c.r + 3, c.r + 3, 10, 24, 1, true), this.mat.chrome); skirt.position.y = 12; grp.add(skirt);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff5a10, emissiveIntensity: 0.6, roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(c.r - 2, c.r, 26, 24), bodyMat); body.position.y = 26; grp.add(body);
      const cap = new THREE.Mesh(new THREE.TorusGeometry(c.r, 4, 8, 24), this.mat.iron); cap.rotation.x = Math.PI / 2; cap.position.y = 40; grp.add(cap);
      const coalMat = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff7a20, emissiveIntensity: 1.5, roughness: 0.9, flatShading: true });
      const coals = new THREE.Mesh(new THREE.SphereGeometry(c.r - 4, 10, 6, 0, TAU, 0, Math.PI / 2), coalMat); coals.position.y = 34; coals.scale.y = 0.4; grp.add(coals);
      for (let k = 0; k < 8; k++) { const st = new THREE.Mesh(new THREE.SphereGeometry(2.5, 6, 4), this.mat.gold); st.position.set(Math.cos((k / 8) * TAU) * (c.r + 1), 30, Math.sin((k / 8) * TAU) * (c.r + 1)); grp.add(st); }
      grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const ghost = parts.wings.crypt.bumpers.includes(c);
      if (ghost) { bodyMat.emissive.set(0x20ff60); coalMat.color.set(0x002a10); }
      return { c, grp, bodyMat, coalMat, body, base: baseH, ghost };
    });
    // slingshots
    this.slings = g.table.draw.slings.map((sl) => {
      const plastic = new THREE.MeshStandardMaterial({ color: 0x8a1a10, emissive: 0x400000, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88 });
      const m = this.extrude(sl.pts, 30, plastic);
      const f = sl.face;
      const len = Math.hypot(f.bx - f.ax, f.by - f.ay);
      const rub = new THREE.Mesh(new THREE.BoxGeometry(len, 14, 6), this.mat.rubber.clone());
      rub.rotation.y = -Math.atan2(f.by - f.ay, f.bx - f.ax);
      rub.position.set((f.ax + f.bx) / 2, 12, (f.ay + f.by) / 2);
      rub.castShadow = true;
      rub.visible = false;
      this.root.add(rub);
      for (const p of sl.pts) this.post(p[0], p[1], 6);
      const cx = (sl.pts[0][0] + sl.pts[1][0] + sl.pts[2][0]) / 3, cz = (sl.pts[0][1] + sl.pts[1][1] + sl.pts[2][1]) / 3;
      const ring = [];
      for (let i = 0; i < 3; i++) {
        const p = sl.pts[i], dx = p[0] - cx, dz = p[1] - cz, l = Math.hypot(dx, dz);
        const ang = Math.atan2(dz, dx);
        for (let k = -2; k <= 2; k++) { const a = ang + k * 0.45; ring.push(new THREE.Vector3(p[0] + Math.cos(a) * 8.5, 12, p[1] + Math.sin(a) * 8.5)); }
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true, 'centripetal'), 90, 3.6, 8, true), new THREE.MeshStandardMaterial({ color: 0x141010, roughness: 0.7 }));
      tube.castShadow = true;
      this.root.add(tube);
      return { sl, plastic, rub, base: rub.position.clone(), n: new THREE.Vector3(sl.side === 0 ? 0.92 : -0.92, 0, -0.39) };
    });
    for (const p of g.table.draw.posts) this.post(p.x, p.y, p.r);
    // drop targets & standups
    const runeMat = new THREE.MeshStandardMaterial({ color: 0x5a3a7a, emissive: 0x6a2ab0, emissiveIntensity: 0.5, roughness: 0.4 });
    this.drops = parts.drops.map((d, i) => {
      const side = runeMat.clone();
      const face = new THREE.MeshStandardMaterial({ map: runeFace('ᚱᚢᚾᛖ'[i], '#d89aff'), emissive: 0xffffff, emissiveMap: runeFace('ᚱᚢᚾᛖ'[i], '#d89aff'), emissiveIntensity: 0.35, roughness: 0.35 });
      const m = this.add(new THREE.BoxGeometry(12, 34, 30), [face, side, side, side, side, side], d.ax, 17, (d.ay + d.by) / 2);
      m.material.forEach((mm) => (mm.userData.drop = true));
      return { d, m, y: 17 };
    });
    const standMat = new THREE.MeshStandardMaterial({ color: 0xc02a1a, emissive: 0x300000, roughness: 0.35 });
    this.standups = parts.standups.map((s) => {
      const grp = new THREE.Group();
      grp.position.set(s.ax + 4, 0, (s.ay + s.by) / 2);
      this.root.add(grp);
      const bm = new THREE.MeshStandardMaterial({ map: bullseye('#c02a1a'), roughness: 0.4, emissive: 0x000000 });
      const sm = standMat.clone();
      const face = new THREE.Mesh(new THREE.BoxGeometry(6, 30, 28), [sm, bm, sm, sm, sm, sm]); face.position.set(-4, 18, 0); face.castShadow = true; grp.add(face);
      face.material = bm; face.material = [sm, bm, sm, sm, sm, sm];
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 18), this.mat.steel); pole.position.set(2, 9, 0); grp.add(pole);
      return { s, grp, face };
    });
    // spinner
    const sp = parts.spinner;
    this.spinnerGrp = new THREE.Group();
    this.spinnerGrp.position.set((sp.x0 + sp.x1) / 2, 30, sp.y);
    this.root.add(this.spinnerGrp);
    const spinTex = faceTex(176, 80, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f4f4f8'); gr.addColorStop(0.5, '#9aa0aa'); gr.addColorStop(1, '#e8e8ee');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
      x.fillStyle = '#1a3a8a'; x.font = '900 34px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SOULS', w / 2, h / 2 + 2);
      x.strokeStyle = '#1a3a8a'; x.lineWidth = 4; x.strokeRect(4, 4, w - 8, h - 8);
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(44, 20, 2), [this.mat.chrome, this.mat.chrome, this.mat.chrome, this.mat.chrome, new THREE.MeshStandardMaterial({ map: spinTex, metalness: 0.7, roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: spinTex, metalness: 0.7, roughness: 0.25 })]);
    plate.position.y = -11; plate.castShadow = true;
    this.spinnerGrp.add(plate);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 52, 8), this.mat.iron); axle.rotation.z = Math.PI / 2; this.spinnerGrp.add(axle);
    // vault rim
    const sc = parts.saucers[0];
    this.vaultRim = new THREE.Mesh(new THREE.TorusGeometry(20, 2.5, 8, 30), new THREE.MeshStandardMaterial({ color: 0x8a6a20, emissive: 0xffc040, emissiveIntensity: 0.4, metalness: 0.8, roughness: 0.3 }));
    this.vaultRim.rotation.x = Math.PI / 2;
    this.vaultRim.position.set(sc.x, 1.5, sc.y);
    this.root.add(this.vaultRim);
    // lair pedestal + HP ring
    const lair = parts.monster;
    const ped = this.add(new THREE.CylinderGeometry(lair.r + 2, lair.r + 8, 22, 12), this.mat.stoneDark, lair.x, 11, lair.y);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe0d6bc, roughness: 0.5 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const sx = lair.x + Math.cos(a) * (lair.r + 6), sz = lair.y + Math.sin(a) * (lair.r + 6);
      const sk = this.add(new THREE.SphereGeometry(5, 10, 8), boneMat, sx, 20, sz);
      sk.scale.set(1, 0.95, 1.1);
      const eyeM = new THREE.MeshBasicMaterial({ color: 0xff4a10 });
      for (const off of [-1.8, 1.8]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 4), eyeM);
        e.position.set(sx + Math.cos(a) * 4.4 - Math.sin(a) * off, 20.5, sz + Math.sin(a) * 4.4 + Math.cos(a) * off);
        this.root.add(e);
      }
    }
    const rim = this.add(new THREE.TorusGeometry(lair.r + 3, 2.2, 8, 40), this.mat.gold, lair.x, 22, lair.y);
    rim.rotation.x = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(lair.r + 3.2, lair.r + 3.2, 5, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x401808, emissive: 0xff7a20, emissiveIntensity: 1.2 }));
    band.position.set(lair.x, 16, lair.y);
    this.root.add(band);
    this.lairBand = band;
    this.hpBg = new THREE.Mesh(new THREE.RingGeometry(lair.r + 12, lair.r + 19, 48), new THREE.MeshBasicMaterial({ color: 0x200404, transparent: true, opacity: 0.85, toneMapped: false }));
    this.hpBg.rotation.x = -Math.PI / 2; this.hpBg.position.set(lair.x, 0.8, lair.y);
    this.root.add(this.hpBg);
    this.hpRing = new THREE.Mesh(new THREE.RingGeometry(lair.r + 12, lair.r + 19, 48, 1, 0, TAU), new THREE.MeshBasicMaterial({ color: 0xff6a2a, toneMapped: false }));
    this.hpRing.rotation.x = -Math.PI / 2; this.hpRing.position.set(lair.x, 1.0, lair.y);
    this.root.add(this.hpRing);
    this.hpKey = '';
    // flippers
    this.flippers = this.g.allFlippers().map((f) => {
      const grp = new THREE.Group();
      grp.position.set(f.px, f.upper ? T.DECK_H : f.wing ? T.WING_H : 0, f.py);
      this.root.add(grp);
      const shape = (rb, rt) => {
        const sh = new THREE.Shape();
        const L = f.len, a = Math.asin((rb - rt) / L);
        sh.moveTo(rb * Math.sin(a), -rb * Math.cos(a));
        sh.lineTo(L + rt * Math.sin(a), -rt * Math.cos(a));
        sh.absarc(L, 0, rt, -(Math.PI / 2 - a), Math.PI / 2 - a, false);
        sh.lineTo(rb * Math.sin(a), rb * Math.cos(a));
        sh.absarc(0, 0, rb, Math.PI / 2 - a, Math.PI * 1.5 + a, false);
        return sh;
      };
      const ex = (sh, depth, mat, y0) => {
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, bevelSegments: 2, curveSegments: 16 });
        geo.rotateX(Math.PI / 2);
        geo.translate(0, depth + y0, 0);
        const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m;
      };
      const rubber = ex(shape(f.rb, f.rt), 16, this.mat.rubber.clone(), 3);
      const decal = faceTex(256, 64, (x, w, h) => {
        const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#c8ccd4'); gr.addColorStop(1, '#8a8e98');
        x.fillStyle = gr; x.fillRect(0, 0, w, h);
        x.strokeStyle = 'rgba(60,40,20,0.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(40, h / 2); x.lineTo(w - 20, h / 2); x.stroke();
        x.fillStyle = '#a01810'; x.font = '900 30px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('DELVER', w * 0.58, h / 2 + 1);
      });
      decal.wrapS = decal.wrapT = THREE.RepeatWrapping;
      if (f.side === 1) { decal.repeat.set(-1 / f.len, -1 / (f.rb * 2)); decal.offset.set(1, 0.5); }
      else { decal.repeat.set(1 / f.len, 1 / (f.rb * 2)); decal.offset.set(0, 0.5); }
      const top = ex(shape(f.rb - 3.5, f.rt - 3), 22, [new THREE.MeshStandardMaterial({ map: decal, metalness: 0.85, roughness: 0.2, emissive: 0x000000 }), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, metalness: 0.9, roughness: 0.18, emissive: 0x000000 })], 2);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(5, 8, f.rb * 2 + 6), this.mat.gold); guard.position.set(13, 22, 0); guard.castShadow = true; grp.add(guard);
      const pom = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 30, 16), this.mat.gold); pom.position.y = 15; grp.add(pom);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc01818, emissive: 0x800000, emissiveIntensity: 1, roughness: 0.2 })); gem.position.y = 31; grp.add(gem);
      return { f, grp, rubber, top, gem };
    });
    // plunger
    this.plunger = new THREE.Group();
    this.root.add(this.plunger);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 80, 10), this.mat.steel); rod.rotation.x = Math.PI / 2; rod.position.set(0, 12, 40); this.plunger.add(rod);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 10, 16), this.mat.iron); tip.rotation.x = Math.PI / 2; tip.position.set(0, 12, 5); this.plunger.add(tip);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.3, metalness: 0.2 })); knob.position.set(0, 14, 82); this.plunger.add(knob);
    // centre post (Divine Aegis)
    this.post3 = this.add(new THREE.CylinderGeometry(9, 9, 34, 16), new THREE.MeshStandardMaterial({ color: 0xeaffef, emissive: 0x5aff8a, emissiveIntensity: 1.2 }), parts.post.x, 17, parts.post.y);
    // corner torches on the backboard
    this.flames = [];
    for (const [x, y] of [[44, 96], [556, 96]]) {
      const sconce = this.add(new THREE.CylinderGeometry(10, 5, 16, 10), this.mat.iron, x, 92, y);
      this.add(new THREE.CylinderGeometry(3, 3, 80, 6), this.mat.iron, x, 42, y);
      const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp2.position.set(x, 112, y); sp2.scale.set(36, 54, 1);
      this.root.add(sp2);
      this.flames.push({ sp: sp2, x, y });
    }
    // shrine crystal floating over the ramp apex
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(16, 0), new THREE.MeshStandardMaterial({ color: 0x7df9ff, emissive: 0x2ad0ff, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92 }));
    crystal.position.set(300, 190, 160);
    crystal.scale.y = 1.6;
    this.root.add(crystal);
    this.crystal = crystal;
    this.crystalHalo = new THREE.Mesh(new THREE.TorusGeometry(26, 1.6, 6, 40), new THREE.MeshBasicMaterial({ color: 0x7df9ff, toneMapped: false }));
    this.crystalHalo.position.copy(crystal.position);
    this.root.add(this.crystalHalo);
  }
  post(x, y, r) {
    this.add(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 32, 10), this.mat.steel, x, 16, y);
    this.add(new THREE.SphereGeometry(r * 0.75, 12, 8, 0, TAU, 0, Math.PI / 2), this.mat.gold, x, 32, y);
    const t = this.add(new THREE.TorusGeometry(r, 2.6, 8, 16), this.mat.rubber, x, 12, y);
    t.rotation.x = Math.PI / 2;
  }

  buildRamp() {
    const parts = this.g.parts;
    this.wire(parts.ramp, 0);
    this.wire(parts.denRamp, 4 * 24 - 6);
    this.wire(parts.retRamp, 0);
    this.wire(parts.cryptRamp, 2 * 24);
    this.wire(parts.forgeRamp, 2 * 24);
    this.wire(parts.cryptRet, 0);
    this.wire(parts.forgeRet, 0);
    // diverter flap at the apex
    this.diverter = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 26), this.mat.gold);
    this.diverter.position.set(300, 128, 188);
    this.root.add(this.diverter);
    this.rampExtras();
  }
  wire(R, from) {
    const all = R.pts.slice(from);
    const pts = all.filter((_, i) => i % 3 === 0).concat([all[all.length - 1]]);
    const rails = [[11, 3], [-11, 3], [17, 17], [-17, 17]];
    const curves = rails.map(([off, dh]) => {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        out.push(new THREE.Vector3(pts[i][0] - ty * off, pts[i][2] + dh, pts[i][1] + tx * off));
      }
      return new THREE.CatmullRomCurve3(out);
    });
    const grp = new THREE.Group();
    this.root.add(grp);
    for (const c of curves) {
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, 220, 1.7, 6, false), this.mat.chrome);
      m.castShadow = true;
      grp.add(m);
    }
    // hoops + supports
    for (let i = 4; i < pts.length - 2; i += 4) {
      const p = pts[i];
      const a = pts[i - 1], b = pts[i + 1];
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(18, 1.2, 6, 20, Math.PI), this.mat.chrome);
      hoop.position.set(p[0], p[2] + 3, p[1]);
      hoop.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      grp.add(hoop);
      const floorH = p[1] < -10 && p[0] > 60 && p[0] < 540 ? T.DECK_H : p[1] < 0 ? 70 : p[0] < -40 || p[0] > 640 ? T.WING_H : p[0] < 0 || p[0] > 600 ? -100 : 0;
      if (p[2] - floorH > 25 && i % 8 === 0) {
        const hh = p[2] + 3 - floorH;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, hh, 6), this.mat.chrome);
        post.position.set(p[0], floorH + hh / 2, p[1]);
        grp.add(post);
      }
    }
  }
  rampExtras() {
    // entry flap
    const flap = new THREE.Mesh(new THREE.BoxGeometry(62, 2, 80), this.mat.steel);
    flap.position.set(442, 13, 432);
    flap.rotation.x = Math.atan2(28, 75);
    flap.receiveShadow = true;
    this.root.add(flap);
    const sign = cv(256, 64), sx = sign.getContext('2d');
    sx.fillStyle = '#0a2a30'; sx.fillRect(0, 0, 256, 64);
    sx.strokeStyle = '#7df9ff'; sx.lineWidth = 4; sx.strokeRect(3, 3, 250, 58);
    sx.fillStyle = '#bff8ff'; sx.font = '900 30px Cinzel, Georgia, serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('SHRINE', 128, 34);
    this.rampSign = new THREE.Mesh(new THREE.PlaneGeometry(70, 18), new THREE.MeshBasicMaterial({ map: tex(sign), toneMapped: false }));
    this.rampSign.position.set(442, 56, 410);
    this.root.add(this.rampSign);
  }

  buildLamps() {
    this.lampMeshes = [];
    const glowMat = (col) => new THREE.MeshBasicMaterial({ map: this.glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const id in this.g.lamps) {
      const l = this.g.lamps[id];
      const pill = l.shape === 'pill';
      const W = pill ? 256 : 128, H = pill ? 64 : 128;
      const c = cv(W, H), x = c.getContext('2d');
      let w, h;
      if (pill) { w = l.label.length * 6.6 + 16; h = l.r * 1.8; }
      else if (l.shape === 'arrow') { w = h = 34 * l.size; }
      else if (l.shape === 'diamond') { w = l.r * 2.2; h = l.r * 2.8; }
      else { w = h = l.r * 2 + 2; }
      x.save();
      x.scale(W / w, H / h);
      x.translate(w / 2, h / 2);
      x.beginPath();
      if (pill) {
        const ww = w - 2, hh = h - 2, rr = hh / 2;
        x.moveTo(-ww / 2 + rr, -hh / 2); x.lineTo(ww / 2 - rr, -hh / 2); x.arc(ww / 2 - rr, 0, rr, -Math.PI / 2, Math.PI / 2); x.lineTo(-ww / 2 + rr, hh / 2); x.arc(-ww / 2 + rr, 0, rr, Math.PI / 2, Math.PI * 1.5);
      } else if (l.shape === 'arrow') {
        const s = l.size; x.moveTo(16 * s, 0); x.lineTo(-8 * s, -11 * s); x.lineTo(-3 * s, 0); x.lineTo(-8 * s, 11 * s);
      } else if (l.shape === 'diamond') {
        x.moveTo(0, -h / 2 + 1); x.lineTo(w / 2 - 1, 0); x.lineTo(0, h / 2 - 1); x.lineTo(-w / 2 + 1, 0);
      } else x.arc(0, 0, l.r, 0, TAU);
      x.closePath();
      const gr = x.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#b8b8b8');
      x.fillStyle = gr; x.fill();
      x.lineWidth = 1.2; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.stroke();
      if (l.label) {
        x.fillStyle = 'rgba(30,10,0,0.9)';
        x.font = `700 ${pill ? 9 : 10}px Cinzel, Georgia, serif`;
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(l.label, 0, 0.5);
      }
      x.restore();
      const mat = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.rotation.set(-Math.PI / 2, 0, -(l.shape === 'arrow' ? l.angle : 0));
      m.position.set(l.x, (l.h || 0) + 0.6, l.y);
      m.renderOrder = 2;
      this.root.add(m);
      const gs = (pill ? 70 : l.shape === 'arrow' ? 60 : 44) * (l.size || 1);
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(gs * (pill ? 1.6 : 1), gs), glowMat(l.color));
      gm.rotation.x = -Math.PI / 2;
      gm.position.set(l.x, (l.h || 0) + 1.2, l.y);
      gm.renderOrder = 3;
      this.root.add(gm);
      this.lampMeshes.push({ l, m, gm, col: new THREE.Color(l.color) });
    }
  }

  buildMonsters() {
    const lair = this.g.parts.monster;
    this.monRoot = new THREE.Group();
    this.monRoot.position.set(lair.x, 22, lair.y);
    this.root.add(this.monRoot);
    this.monModels = {};
    for (const d of PB.DATA.MONSTERS) {
      const holder = new THREE.Group();
      const m = MODELS[d.id]();
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      holder.add(m);
      holder.scale.setScalar(96);
      holder.visible = false;
      this.monRoot.add(holder);
      this.monModels[d.id] = { holder, m, rise: 0 };
    }
    this.curMon = null;
  }

  buildBalls() {
    const geo = new THREE.SphereGeometry(PB.Phys.BALL_R, 32, 24);
    this.ballMats = {
      steel: new THREE.MeshStandardMaterial({ color: 0xe6e6ea, metalness: 1, roughness: 0.1, envMapIntensity: 1.8 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc84a, metalness: 1, roughness: 0.18, envMapIntensity: 1.6, emissive: 0x402800 }),
      ember: new THREE.MeshStandardMaterial({ color: 0xff7a3a, metalness: 0.6, roughness: 0.25, emissive: 0xff3000, emissiveIntensity: 0.7 }),
    };
    const blob = cv(64, 64), bx = blob.getContext('2d');
    const bg = bx.createRadialGradient(32, 32, 0, 32, 32, 32);
    bg.addColorStop(0, 'rgba(0,0,0,0.7)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    bx.fillStyle = bg; bx.fillRect(0, 0, 64, 64);
    const blobMat = new THREE.MeshBasicMaterial({ map: tex(blob), transparent: true, depthWrite: false });
    this.balls = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(geo, this.ballMats.steel);
      m.castShadow = true;
      m.visible = false;
      this.root.add(m);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), blobMat);
      sh.rotation.x = -Math.PI / 2;
      sh.visible = false;
      sh.renderOrder = 1;
      this.root.add(sh);
      this.balls.push({ m, sh });
    }
    // coins
    this.coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(6, 6, 1.6, 14), this.mat.gold, 260);
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.coinMesh.castShadow = true;
    this.root.add(this.coinMesh);
    // expanding rings
    this.ringPool = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; this.root.add(m); this.ringPool.push(m);
    }
    this.fireMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false }));
    this.fireMesh.visible = false;
    this.root.add(this.fireMesh);
    this.fireLight = new THREE.PointLight(0xff6a10, 0, 0, 2);
    this.root.add(this.fireLight);
  }

  buildParticles() {
    const N = (this.pN = 2400);
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pCol = new Float32Array(N * 3);
    this.pSize = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.pUniforms = { uScale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.pUniforms,
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * ${S.toFixed(3)} * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`.replace('uScale', 'uScale').replace('void main', 'uniform float uScale;\n void main'),
      fragmentShader: `varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vC * a, 1.0); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.root.add(this.points);
  }

  // ---------- the Dragon's Den ----------
  instRails(rails, baseH, heights, mats) {
    const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const byMat = new Map();
    for (const r of rails) {
      const mat = mats[r.style] || mats.rail, h = heights[r.style] || heights.rail;
      if (!byMat.has(mat)) byMat.set(mat, { segs: [], joints: [] });
      const e = byMat.get(mat);
      for (let i = 0; i < r.pts.length - 1; i++) e.segs.push([...r.pts[i], ...r.pts[i + 1], r.r, h]);
      for (const p of r.pts) e.joints.push([p[0], p[1], r.r, h]);
    }
    for (const [mat, e] of byMat) {
      const im = new THREE.InstancedMesh(box, mat, e.segs.length);
      e.segs.forEach(([ax, ay, bx, by, r, h], i) => {
        q.setFromAxisAngle(up, -Math.atan2(by - ay, bx - ax));
        m4.compose(new THREE.Vector3((ax + bx) / 2, baseH + h / 2, (ay + by) / 2), q, new THREE.Vector3(Math.hypot(bx - ax, by - ay), h, r * 2));
        im.setMatrixAt(i, m4);
      });
      im.castShadow = im.receiveShadow = true;
      this.root.add(im);
      if (mat === this.mat.steel) this.railCaps(e.segs, baseH);
      const jm = new THREE.InstancedMesh(cyl, mat, e.joints.length);
      e.joints.forEach(([x, y, r, h], i) => { m4.compose(new THREE.Vector3(x, baseH + h / 2, y), new THREE.Quaternion(), new THREE.Vector3(r * 2, h, r * 2)); jm.setMatrixAt(i, m4); });
      jm.castShadow = jm.receiveShadow = true;
      this.root.add(jm);
    }
  }
  railCaps(segs, baseH) {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true).rotateZ(Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, this.mat.chrome, segs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    segs.forEach(([ax, ay, bx, by, r, h], i) => {
      q.setFromAxisAngle(up, -Math.atan2(by - ay, bx - ax));
      m4.compose(new THREE.Vector3((ax + bx) / 2, baseH + h, (ay + by) / 2), q, new THREE.Vector3(Math.hypot(bx - ax, by - ay), r * 2 + 1.5, r * 2 + 1.5));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    this.root.add(im);
  }
  buildDeck() {
    const parts = this.g.parts, D = T.DECK_H, deck = parts.deck;
    // under-deck dungeon: dark floor, pillars, barred cells with glowing eyes
    const uf = this.add(new THREE.PlaneGeometry(600, 440).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.95 }), 300, 0.2, -220, this.root, false);
    uf.receiveShadow = true;
    this.add(new THREE.BoxGeometry(600, D, 20), this.mat.brick, 300, D / 2, -425);
    for (const [x, y] of [[80, -30], [520, -30], [80, -380], [520, -380], [300, -395]]) this.add(new THREE.CylinderGeometry(16, 20, D - 16, 10), this.mat.stoneDark, x, (D - 16) / 2, y);
    for (let i = 0; i < 14; i++) this.add(new THREE.CylinderGeometry(2.4, 2.4, D - 30, 6), this.mat.iron, 140 + i * 24, (D - 30) / 2, -300);
    this.cellEyes = [];
    for (const [x, y] of [[170, -360], [260, -350], [380, -365], [450, -350]]) {
      for (const dx of [-5, 5]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a10 }));
        e.position.set(x + dx, 46, y);
        this.root.add(e);
        this.cellEyes.push(e);
      }
    }
    this.cellLight = { intensity: 0 };
    // deck slab with its own painted top
    const outline = [[56, -6]];
    for (let i = 0; i <= 28; i++) { const th = Math.PI + (i / 28) * Math.PI; outline.push([300 + 244 * Math.cos(th), -280 + 102 * Math.sin(th)]); }
    outline.push([544, -6]);
    const pc = cv(976, 784), px = pc.getContext('2d');
    px.scale(2, 2);
    px.translate(-56, 390);
    px.fillStyle = '#0a0605'; px.fillRect(56, -390, 488, 392);
    paintStones(px, flagstones(600, 420, 17, 30, 50, 34, 80).map((st) => ({ ...st, y: st.y - 420 })), { gap: 1.4, l0: 12, l1: 20, h0: 8, sat: 22 });
    // lava cracks
    px.strokeStyle = 'rgba(255,90,20,0.55)'; px.lineWidth = 2; px.shadowColor = '#ff5a10'; px.shadowBlur = 8;
    const RR = rng(33);
    for (let i = 0; i < 9; i++) { px.beginPath(); let x = 90 + RR() * 420, y = -360 + RR() * 330; px.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (RR() - 0.5) * 40; y += (RR() - 0.5) * 40; px.lineTo(x, y); } px.stroke(); }
    px.shadowBlur = 0;
    px.save(); px.translate(300, -170);
    px.strokeStyle = 'rgba(255,120,40,0.45)'; px.lineWidth = 3;
    px.beginPath(); px.arc(0, 0, 70, 0, TAU); px.stroke();
    px.beginPath(); px.arc(0, 0, 54, 0, TAU); px.stroke();
    px.fillStyle = 'rgba(255,170,90,0.6)'; px.font = '900 15px Cinzel, Georgia, serif'; px.textAlign = 'center'; px.textBaseline = 'middle';
    px.fillText("DRAGON'S DEN", 0, 0);
    px.restore();
    px.font = '700 10px Cinzel, Georgia, serif'; px.fillStyle = 'rgba(157,255,90,0.75)'; px.textAlign = 'center';
    px.fillText('EGGS', 135, -300);
    px.fillStyle = 'rgba(255,215,0,0.8)'; px.fillText('HOARD', 455, -248);
    px.fillStyle = 'rgba(0,0,0,0.6)'; px.beginPath(); px.arc(455, -212, 20, 0, TAU); px.fill();
    const topTex = tex(pc);
    topTex.wrapS = topTex.wrapT = THREE.RepeatWrapping;
    topTex.repeat.set(1 / 488, -1 / 392);
    topTex.offset.set(-56 / 488, -2 / 392);
    const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.5, envMapIntensity: 0.6 });
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 18, bevelEnabled: false, curveSegments: 24 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, D, 0);
    const slab = new THREE.Mesh(geo, [topMat, this.mat.stoneDark]);
    slab.receiveShadow = true; slab.castShadow = true;
    this.root.add(slab);
    // front fascia
    const fc = cv(1024, 96), fxx = fc.getContext('2d');
    fxx.fillStyle = '#1a0e08'; fxx.fillRect(0, 0, 1024, 96);
    fxx.strokeStyle = '#8a5020'; fxx.lineWidth = 6; fxx.strokeRect(4, 4, 1016, 88);
    fxx.fillStyle = '#ff8a3a'; fxx.font = '900 54px Cinzel, Georgia, serif'; fxx.textAlign = 'center'; fxx.textBaseline = 'middle';
    fxx.shadowColor = '#ff4a00'; fxx.shadowBlur = 20; fxx.fillText("~ THE DRAGON'S DEN ~", 512, 50);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(488, 34, 8), [this.mat.stoneDark, this.mat.stoneDark, this.mat.stoneDark, this.mat.stoneDark, new THREE.MeshStandardMaterial({ map: tex(fc), emissive: 0x401000, emissiveMap: tex(fc), emissiveIntensity: 0.9 }), this.mat.stoneDark]);
    fascia.position.set(300, D - 26, -2);
    this.root.add(fascia);
    // rails + posts on the deck
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.7, metalness: 0.2, map: this.mat.wood.map });
    this.instRails(deck.draw.rails, D, { rail: 30, deckOuter: 54 }, { rail: this.mat.steel, deckOuter: outerMat });
    for (const p of deck.draw.posts) { const m = this.add(new THREE.CylinderGeometry(4, 4, 30, 10), this.mat.steel, p.x, D + 15, p.y); const tt = this.add(new THREE.TorusGeometry(p.r, 2.6, 8, 16), this.mat.rubber, p.x, D + 12, p.y); tt.rotation.x = Math.PI / 2; }
    // chrome guard rail around the deck edge
    const guard = new THREE.CatmullRomCurve3(outline.map(([x, y]) => new THREE.Vector3(x, D + 58, y)));
    this.root.add(new THREE.Mesh(new THREE.TubeGeometry(guard, 120, 2.2, 6, false), this.mat.chrome));
    // dragon toy
    const dragon = MODELS.dragon();
    const dh = new THREE.Group();
    dh.position.set(parts.dragon.x, D, parts.dragon.y - 4);
    dh.scale.setScalar(92);
    dh.add(dragon);
    this.root.add(dh);
    this.dragon = { holder: dh, m: dragon };
    this.dragonLight = new THREE.PointLight(0xff5a20, 4, 0, 2);
    this.dragonLight.position.set(300, D + 120, -230);
    this.root.add(this.dragonLight);
    // eggs
    const eggTex = cv(128, 128), ex = eggTex.getContext('2d');
    ex.fillStyle = '#5a7a3a'; ex.fillRect(0, 0, 128, 128);
    const ER = rng(4);
    for (let i = 0; i < 40; i++) { ex.fillStyle = ER() > 0.5 ? '#2a4a1a' : '#8aa860'; ex.beginPath(); ex.arc(ER() * 128, ER() * 128, 3 + ER() * 7, 0, TAU); ex.fill(); }
    this.eggs = parts.eggs.map((c) => {
      const mat = new THREE.MeshStandardMaterial({ map: tex(eggTex), roughness: 0.4, emissive: 0x2a8a10, emissiveIntensity: 0 });
      const m = this.add(new THREE.SphereGeometry(c.r, 18, 14), mat, c.x, D + c.r * 1.25, c.y);
      m.scale.set(1, 1.3, 1);
      const nest = this.add(new THREE.TorusGeometry(c.r + 2, 4, 6, 14), this.mat.wood, c.x, D + 3, c.y);
      nest.rotation.x = Math.PI / 2;
      return { c, m, mat };
    });
    // hoard pit rim + gold
    const hp = parts.saucers[1];
    this.hoardRim = new THREE.Mesh(new THREE.TorusGeometry(20, 3, 8, 30), new THREE.MeshStandardMaterial({ color: 0x8a6a20, emissive: 0xffc040, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 }));
    this.hoardRim.rotation.x = Math.PI / 2;
    this.hoardRim.position.set(hp.x, D + 1.5, hp.y);
    this.root.add(this.hoardRim);
    const cg = new THREE.CylinderGeometry(5, 5, 1.4, 12);
    const pile = new THREE.InstancedMesh(cg, this.mat.gold, 60);
    const m4 = new THREE.Matrix4(), PR = rng(8);
    for (let i = 0; i < 60; i++) {
      const a = PR() * TAU, r = 30 + PR() * 26;
      m4.compose(new THREE.Vector3(hp.x + Math.cos(a) * r * 0.9, D + 1 + PR() * 4, hp.y + Math.sin(a) * r * 0.6 - 10), new THREE.Quaternion().setFromEuler(new THREE.Euler(PR(), PR() * 3, PR())), new THREE.Vector3(1, 1, 1));
      pile.setMatrixAt(i, m4);
    }
    this.root.add(pile);
  }
  // ---------- side tables ----------
  buildWings() {
    const parts = this.g.parts, H = T.WING_H;
    this.wings = {};
    for (const kind of ['crypt', 'forge']) {
      const W = parts.wings[kind], m = W.m, crypt = kind === 'crypt';
      // slab outline (slightly larger than the walls)
      const out = [[m(-482), 990]];
      for (let i = 0; i <= 26; i++) { const th = Math.PI + (i / 26) * Math.PI; out.push([m(-260 + 222 * Math.cos(th)), 380 + 132 * Math.sin(th)]); }
      out.push([m(-38), 990]);
      if (!crypt) out.reverse();
      // painted surface
      const xs = out.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = 240, y1 = 990, w = x1 - x0, hh = y1 - y0;
      const c = cv(Math.round(w * 2), Math.round(hh * 2)), x = c.getContext('2d');
      x.scale(2, 2); x.translate(-x0, -y0);
      const gr = x.createLinearGradient(0, y0, 0, y1);
      if (crypt) { gr.addColorStop(0, '#0a1a14'); gr.addColorStop(0.5, '#1a0f2a'); gr.addColorStop(1, '#06120a'); }
      else { gr.addColorStop(0, '#2a0a04'); gr.addColorStop(0.5, '#4a1606'); gr.addColorStop(1, '#1a0602'); }
      x.fillStyle = gr; x.fillRect(x0, y0, w, hh);
      const stones = flagstones(w, hh, crypt ? 51 : 77, 26, 44, 30, 70).map((st) => ({ ...st, x: st.x + x0, y: st.y + y0 }));
      x.save(); x.globalAlpha = 0.45; x.globalCompositeOperation = 'multiply';
      paintStones(x, stones, { gap: 1.2, l0: 30, l1: 70, h0: crypt ? 140 : 20, sat: 12 });
      x.restore();
      const cxp = m(-260);
      const rad = x.createRadialGradient(cxp, 530, 10, cxp, 530, 260);
      rad.addColorStop(0, crypt ? 'rgba(80,255,140,0.45)' : 'rgba(255,140,30,0.55)'); rad.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rad; x.fillRect(x0, y0, w, hh);
      x.strokeStyle = crypt ? 'rgba(120,255,160,0.7)' : 'rgba(255,190,80,0.75)'; x.lineWidth = 2.5;
      x.shadowColor = x.strokeStyle; x.shadowBlur = 10;
      for (const r of [50, 66, 90]) { x.beginPath(); x.arc(cxp, 530, r, 0, TAU); x.stroke(); }
      x.shadowBlur = 0;
      if (!crypt) {
        // lava channels
        x.strokeStyle = 'rgba(255,120,20,0.8)'; x.lineWidth = 5; x.shadowColor = '#ff6000'; x.shadowBlur = 14;
        for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(m(-460), 300 + i * 160); x.bezierCurveTo(m(-360), 260 + i * 160, m(-160), 360 + i * 160, m(-60), 320 + i * 160); x.stroke(); }
        x.shadowBlur = 0;
      } else {
        x.fillStyle = 'rgba(150,255,180,0.08)';
        for (let i = 0; i < 18; i++) { x.beginPath(); x.ellipse(m(-460 + Math.random() * 400), 300 + Math.random() * 600, 50, 14, 0, 0, TAU); x.fill(); }
      }
      x.fillStyle = crypt ? '#bfffd0' : '#ffd890';
      x.font = '900 22px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(crypt ? 'THE CRYPT' : 'THE FORGE', cxp, 790);
      x.font = '700 10px Cinzel, Georgia, serif';
      x.fillText(crypt ? 'COFFINS EXPOSE THE LICH' : 'FOUR STRIKES FORGE A WEAPON', cxp, 812);
      x.fillText(crypt ? 'OSSUARY' : 'CRUCIBLE', W.saucer.x, W.saucer.y - 30);
      x.beginPath(); x.arc(W.saucer.x, W.saucer.y, 20, 0, TAU); x.fillStyle = '#050302'; x.fill();
      x.save(); x.filter = 'blur(4px)'; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 18;
      for (const r of W.draw.rails) { x.beginPath(); r.pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke(); }
      x.restore();
      const tx = tex(c);
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.repeat.set(1 / w, -1 / hh);
      tx.offset.set(-x0 / w, y1 / hh);
      const topMat = this.quality === 'low' ? new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5 }) : new THREE.MeshPhysicalMaterial({ map: tx, roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.15 });
      const shape = new THREE.Shape(out.map(([px, py]) => new THREE.Vector2(px, py)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 20, bevelEnabled: false, curveSegments: 24 });
      geo.rotateX(Math.PI / 2); geo.translate(0, H, 0);
      const slab = new THREE.Mesh(geo, [topMat, this.mat.stoneDark]);
      slab.receiveShadow = slab.castShadow = true;
      this.root.add(slab);
      // cabinet body below the wing
      const body = this.add(new THREE.BoxGeometry(w, 200, hh), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.8, map: this.mat.wood.map }), (x0 + x1) / 2, H - 120, (y0 + y1) / 2 + 20);
      body.receiveShadow = true;
      // rails / posts
      const outerMat = new THREE.MeshStandardMaterial({ color: crypt ? 0x3a3048 : 0x4a2a1a, roughness: 0.7, metalness: 0.2, map: this.mat.brick.map });
      this.instRails(W.draw.rails, H, { rail: 30, wingOuter: 64 }, { rail: this.mat.steel, wingOuter: outerMat });
      for (const p of W.draw.posts) { this.add(new THREE.CylinderGeometry(3.5, 3.5, 30, 10), this.mat.steel, p.x, H + 15, p.y); const tt = this.add(new THREE.TorusGeometry(p.r, 2.4, 8, 16), this.mat.rubber, p.x, H + 12, p.y); tt.rotation.x = Math.PI / 2; }
      // guard rail on top of the outer wall
      const wallPts = W.draw.rails[0].pts.map(([px, py]) => new THREE.Vector3(px, H + 66, py));
      this.root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wallPts), 120, 3, 6, false), crypt ? this.mat.chrome : this.mat.gold));
      // boss toy
      const model = MODELS[crypt ? 'lich' : 'anvil']();
      const hold = new THREE.Group();
      hold.position.set(W.boss.x, H, W.boss.y);
      hold.scale.setScalar(crypt ? 80 : 74);
      hold.add(model);
      this.root.add(hold);
      const ped = this.add(new THREE.CylinderGeometry(W.boss.r + 2, W.boss.r + 6, 8, 16), this.mat.stoneDark, W.boss.x, H + 4, W.boss.y);
      // drop targets (coffins / ingots)
      const dropMat = crypt ? new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.7, emissive: 0x20ff60, emissiveIntensity: 0.15, map: this.mat.wood.map }) : new THREE.MeshStandardMaterial({ color: 0xffc040, metalness: 1, roughness: 0.25, emissive: 0xff8000, emissiveIntensity: 0.2 });
      const lid = faceTex(128, 96, (x2, w2, h2) => {
        if (crypt) {
          x2.fillStyle = '#3a2414'; x2.fillRect(0, 0, w2, h2);
          x2.strokeStyle = '#8a6a3a'; x2.lineWidth = 5; x2.strokeRect(4, 4, w2 - 8, h2 - 8);
          x2.fillStyle = '#7dff9a'; x2.shadowColor = '#40ff80'; x2.shadowBlur = 12;
          x2.fillRect(w2 / 2 - 5, 16, 10, 64); x2.fillRect(w2 / 2 - 22, 32, 44, 10);
        } else {
          const gg = x2.createLinearGradient(0, 0, 0, h2); gg.addColorStop(0, '#fff2a0'); gg.addColorStop(0.5, '#e8a830'); gg.addColorStop(1, '#8a5a10');
          x2.fillStyle = gg; x2.fillRect(0, 0, w2, h2);
          x2.fillStyle = '#5a3a08'; x2.font = '900 30px Cinzel, Georgia, serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('⚒', w2 / 2, h2 / 2);
        }
      });
      const faceM = new THREE.MeshStandardMaterial({ map: lid, roughness: crypt ? 0.6 : 0.25, metalness: crypt ? 0 : 0.8, emissive: 0xffffff, emissiveMap: lid, emissiveIntensity: crypt ? 0.3 : 0.15 });
      const drops = W.drops.map((d) => {
        const mm = this.add(new THREE.BoxGeometry(Math.hypot(d.bx - d.ax, d.by - d.ay) + 6, 30, 12), [dropMat, dropMat, dropMat, dropMat, faceM, dropMat], (d.ax + d.bx) / 2, H + 15, (d.ay + d.by) / 2);
        mm.rotation.y = -Math.atan2(d.by - d.ay, d.bx - d.ax);
        return { d, m: mm, y: H + 15 };
      });
      const stands = W.stands.map((s) => {
        const mm = this.add(new THREE.BoxGeometry(8, 28, 30), new THREE.MeshStandardMaterial({ color: crypt ? 0x6aff9a : 0xff9a3a, emissive: crypt ? 0x10a040 : 0xa04000, emissiveIntensity: 0.4, roughness: 0.35 }), s.ax, H + 16, (s.ay + s.by) / 2);
        return { s, m: mm };
      });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(19, 2.6, 8, 28), new THREE.MeshStandardMaterial({ color: 0x8a6a20, emissive: crypt ? 0x40ff80 : 0xff9020, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 }));
      rim.rotation.x = Math.PI / 2; rim.position.set(W.saucer.x, H + 1.5, W.saucer.y);
      this.root.add(rim);
      // set dressing
      const deco = [];
      if (crypt) {
        for (const [px, py, s, ry] of [[-440, 330, 40, 0.3], [-400, 300, 34, 0.1], [-120, 300, 36, -0.2], [-80, 340, 40, -0.4], [-450, 470, 30, 0.6], [-70, 470, 30, -0.6]]) {
          const tb = MODELS.tombstone(); const hg = new THREE.Group(); hg.add(tb); hg.scale.setScalar(s); hg.position.set(px, H, py); hg.rotation.y = ry; this.root.add(hg);
        }
      } else {
        // chimney + lava pool
        this.add(new THREE.CylinderGeometry(26, 34, 150, 10), this.mat.brick, m(-260), H + 75, 262);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(30, 24), new THREE.MeshBasicMaterial({ color: 0xff6a10, toneMapped: false }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(m(-120), H + 1, 330); this.root.add(pool);
        deco.push(pool);
      }
      const light = new THREE.PointLight(crypt ? 0x40ff80 : 0xff7a20, 6, 0, 2);
      light.position.set(m(-260), H + 150, 560);
      this.root.add(light);
      this.wings[kind] = { W, hold, model, drops, stands, rim, light, deco, crypt };
    }
  }
  updateWings(dt, t) {
    const p = this.g.p;
    for (const kind in this.wings) {
      const w = this.wings[kind], st = p ? p.wing[kind] : null, ud = w.model.userData, H = T.WING_H;
      const flash = st ? Math.max(0, st.flash) : 0;
      ud.mats.forEach((mm, i) => { if (mm.emissive && ud.base[i]) mm.emissive.setRGB(ud.base[i].r + flash, ud.base[i].g + flash * (w.crypt ? 1 : 0.5), ud.base[i].b + flash * (w.crypt ? 0.5 : 0)); });
      if (w.crypt) {
        w.hold.position.y = H + 6 + Math.sin(t * 1.6) * 5;
        w.hold.rotation.y = Math.sin(t * 0.6) * 0.4;
        ud.staff.rotation.z = Math.sin(t * 2) * 0.15 - flash * 0.6;
        ud.orb.material.emissiveIntensity = 2.5 + Math.sin(t * 5) + flash * 4;
        if (ud.runes) ud.runes.rotation.y += dt * 1.2;
        const dead = st && st.bossHP <= 0;
        w.hold.scale.setScalar(dead ? 40 : 80);
        if (Math.random() < 0.4) PB.FX.emit({ x: w.W.boss.x + U.rand(-50, 50), y: w.W.boss.y + U.rand(-40, 40), h: H + 10, vh: U.rand(20, 60), life: 1.2, color: '#40ff80', size: U.rand(14, 24), g: -10 });
      } else {
        const hm = st ? Math.max(0, st.hammer) : 0;
        ud.arm.rotation.z = -0.9 + Math.sin(hm * Math.PI) * 1.2 + Math.max(0, Math.sin(t * 2.5)) * 0.15;
        if (Math.random() < 0.5) PB.FX.emit({ x: w.W.m(-260) + U.rand(-20, 20), y: 262, h: H + 150, vh: U.rand(60, 140), life: 1.0, color: '#ff8a30', size: U.rand(12, 22), g: -40 });
        for (const d of w.deco) d.material.color.setHSL(0.06, 1, 0.5 + 0.08 * Math.sin(t * 3));
      }
      w.light.intensity = 5 + flash * 15 + Math.sin(t * 3) * 0.8;
      for (const d of w.drops) {
        const target = d.d.down ? H - 20 : H + 15;
        d.y += (target - d.y) * Math.min(1, dt * (d.d.down ? 25 : 10));
        d.m.position.y = d.y;
      }
      for (const s of w.stands) s.m.rotation.z = Math.sin((s.s.wobble || 0) * 30) * Math.max(0, s.s.wobble || 0) * 0.3;
      w.rim.material.emissiveIntensity = 0.5 + 0.4 * Math.sin(t * 3 + (w.crypt ? 0 : 2)) + (w.W.saucer.flash || 0) * 2;
    }
  }
  buildRats() {
    this.rats = [];
    for (let i = 0; i < 6; i++) {
      const m = MODELS.rat();
      const holder = new THREE.Group();
      holder.add(m);
      holder.scale.setScalar(26);
      holder.visible = false;
      this.root.add(holder);
      this.rats.push({ holder, m });
    }
    this.splatMat = new THREE.MeshBasicMaterial({ color: 0x5a0606, transparent: true, depthWrite: false });
  }
  updateDeck(dt, t) {
    const p = this.g.p, d = p ? p.den : null;
    const dm = this.dragon, ud = dm.m.userData;
    // dragon looks at deck balls, rears back on hits, breathes fire
    let target = 0;
    const db = this.g.world.balls.find((b) => b.alive && (b.layer || 0) === 1);
    if (db) target = U.clamp(Math.atan2(db.x - 300, db.y + 298) * 0.8, -0.7, 0.7);
    ud.head.rotation.y += (target - ud.head.rotation.y) * Math.min(1, dt * 3);
    const flash = d ? Math.max(0, d.flash) : 0, breath = d ? d.breath : 0;
    ud.head.rotation.x = -flash * 0.5 + Math.sin(t * 1.3) * 0.05 + (breath > 0 ? -0.25 : 0);
    ud.jaw.rotation.x = 0.1 + flash * 0.5 + (breath > 0 ? 0.6 : Math.max(0, Math.sin(t * 0.7)) * 0.15);
    if (ud.wingL) { ud.wingL.rotation.y = -0.5 - Math.sin(t * 1.5) * 0.15 - flash * 0.4; ud.wingR.rotation.y = 0.5 + Math.sin(t * 1.5) * 0.15 + flash * 0.4; }
    ud.mats.forEach((mat, i) => { if (mat.emissive && ud.base[i]) mat.emissive.setRGB(ud.base[i].r + flash, ud.base[i].g + flash * 0.4, ud.base[i].b); });
    this.dragonLight.intensity = 4 + flash * 12 + (breath > 0 ? 18 : 0) + Math.sin(t * 5) * 0.8;
    if (breath > 0) {
      for (let i = 0; i < 6; i++) {
        const a = ud.head.rotation.y + U.rand(-0.25, 0.25);
        const sp = U.rand(500, 900);
        PB.FX.emit({ x: 300 + Math.sin(a) * 40, y: -230, h: T.DECK_H + 95, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp, vh: U.rand(-80, 40), life: 0.7, color: i % 2 ? '#ff6a10' : '#ffd040', size: U.rand(16, 26), g: 60 });
      }
    }
    // eggs
    for (const e of this.eggs) {
      const w = Math.max(0, e.c.wobble || 0);
      e.m.rotation.z = Math.sin(w * 25) * w * 0.4;
      const lit = d && d.eggs[this.eggs.indexOf(e)];
      e.mat.emissiveIntensity = (lit ? 0.8 : 0) + (d && d.hatched ? 0.6 + 0.4 * Math.sin(t * 6) : 0);
    }
    this.hoardRim.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 3) + (this.g.parts.saucers[1].flash || 0) * 2;
    this.cellEyes.forEach((e, i) => { e.visible = Math.sin(t * 0.8 + i * 1.7) > -0.6; });
    this.cellLight.intensity = 2 + Math.sin(t * 2.2) * 0.8;
  }
  updateRats(dt, t) {
    const p = this.g.p, rats = p ? p.rats : [];
    this.rats.forEach((rm, i) => {
      const r = rats[i];
      if (!r || (r.fled && !r.alive) || (!r.alive && r.splat > 1.5)) { rm.holder.visible = false; return; }
      rm.holder.visible = true;
      rm.holder.position.set(r.x, 0, r.y);
      rm.holder.rotation.y = Math.PI / 2 - r.ang;
      const ud = rm.m.userData;
      if (r.alive) {
        rm.holder.scale.set(26, 26, 26);
        ud.legs.forEach((l, k) => (l.position.y = 0.08 + Math.max(0, Math.sin(t * 30 + k * 1.6)) * 0.06));
        ud.tail.rotation.y = Math.sin(t * 14) * 0.3;
      } else {
        rm.holder.scale.set(34, 3, 34);
      }
    });
  }

  // ---------- layout ----------
  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1);
    this.r.setPixelRatio(dpr);
    this.r.setSize(w, h, false);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.ov.width = Math.round(w * dpr);
    this.ov.height = Math.round(h * dpr);
    this.ov.style.width = w + 'px';
    this.ov.style.height = h + 'px';
    this.dpr = dpr;
    this.W = w; this.H = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
      this.bloom.resolution.set(Math.round(w * dpr * 0.5), Math.round(h * dpr * 0.5));
    }
    this.pUniforms.uScale.value = (h * dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.fit();
  }
  setBG(mode) { this.bg = mode; }
  setCamera(mode) { this.camMode = mode; this.fit(); }

  toWorld(x, y, h = 0) {
    this.root.updateWorldMatrix(true, false);
    return new THREE.Vector3(x, h, y).applyMatrix4(this.root.matrixWorld);
  }
  // find the closest camera distance that keeps the whole playfield on screen
  fit() {
    const cam = this.camera;
    const player = this.camMode === 'player';
    const corners = (player ? [[14, 30, 75], [586, 30, 75], [10, 1095, 0], [590, 1095, 0], [10, 1090, 30], [590, 1090, 30]] : [[10, -360, 200], [590, -360, 200], [-480, 260, 70], [1080, 260, 70], [-480, 990, 60], [1080, 990, 60], [10, 1095, 0], [590, 1095, 0], [10, 1090, 30], [590, 1090, 30], [10, 10, 75], [590, 10, 75]]).map(([x, y, h]) => this.toWorld(x, y, h));
    const bottom = corners.slice(player ? 2 : 4, player ? 4 : 6);
    const v = new THREE.Vector3();
    const xl = -1 + 2 * (this.insetL || 0) + 0.02, xr = 1 - 2 * (this.insetR || 0) - 0.02, yt = 1 - 2 * (this.insetT || 0) - 0.02;
    const fitAt = (el) => {
      const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
      let best = null;
      for (let ty = 200; ty <= 780; ty += 20) {
        const target = this.toWorld(300, ty, 0);
        let lo = 2, hi = 60;
        for (let it = 0; it < 24; it++) {
          const d = (lo + hi) / 2;
          cam.position.copy(target).addScaledVector(dir, d);
          cam.lookAt(target);
          cam.updateMatrixWorld();
          let ok = true;
          for (const c of corners) { v.copy(c).project(cam); if (v.x < xl || v.x > xr || v.y > yt || v.y < -0.96 || v.z > 1) { ok = false; break; } }
          if (ok) hi = d; else lo = d;
        }
        if (!best || hi < best.d) best = { d: hi, target, ty, dir };
      }
      cam.position.copy(best.target).addScaledVector(best.dir, best.d);
      cam.lookAt(best.target);
      cam.updateMatrixWorld();
      best.yb = Math.min(...bottom.map((c) => v.copy(c).project(cam).y));
      return best;
    };
    let best;
    if (this.camMode === 'overhead') best = fitAt(1.2);
    else {
      // lowest (most dramatic) angle that still fills the screen down to the flippers
      for (let el = player ? 0.5 : 0.66; el <= 1.15; el += 0.04) {
        best = fitAt(el);
        if (best.yb < -0.8) break;
      }
    }
    this.camBase = { target: best.target.clone(), pos: best.target.clone().addScaledVector(best.dir, best.d), d: best.d, ty: best.ty };
  }

  // ---------- per frame ----------
  draw(dt) {
    this.t += dt;
    const t = this.t, g = this.g, p = g.p, parts = g.parts;
    // background mood blend
    for (const k in this.bgK) this.bgK[k] += ((k === this.bg ? 1 : 0) - this.bgK[k]) * Math.min(1, dt * 1.5);
    const tint = new THREE.Color(1, 1, 1).lerp(new THREE.Color(1, 0.86, 0.55), this.bgK.hoard).lerp(new THREE.Color(1, 0.62, 0.5), this.bgK.boss);
    this.pfMat.color.copy(tint);
    const torchCol = new THREE.Color(0xff8a3a).lerp(new THREE.Color(0xffd040), this.bgK.hoard).lerp(new THREE.Color(0xff2a00), this.bgK.boss);
    const fl = (k) => 0.82 + 0.12 * Math.sin(t * 13 + k) + 0.08 * Math.sin(t * 23 + k * 2);
    this.torchL.color.copy(torchCol); this.torchR.color.copy(torchCol);
    const dim = p && p.curse === 'shadows' ? 0.45 : 1;
    this.hemi.intensity = 1.1 * (dim < 1 ? 0.55 : 1);
    this.key.intensity = 2.4 * dim;
    this.torchL.intensity = 8 * fl(0) * (1 + this.bgK.boss); this.torchR.intensity = 8 * fl(1.7) * (1 + this.bgK.boss);
    for (const f of this.flames) { const k = fl(f.x); f.sp.scale.set(30 * k, 50 * k, 1); f.sp.material.color.copy(torchCol); }
    this.roomTorches.forEach((s, i) => { const k = fl(i * 1.3); s.scale.set(0.5 * k, 0.85 * k, 1); });
    this.roomLights.forEach((l, i) => (l.intensity = 10 * fl(i * 2.1)));
    if (Math.random() < 0.5) for (const f of this.flames) PB.FX.emit({ x: f.x + U.rand(-4, 4), y: f.y + U.rand(-4, 4), h: 106, vh: U.rand(60, 140), life: 0.5, color: '#ff8a2a', size: U.rand(8, 14) });

    // bumpers
    let bumpFlash = 0;
    for (const b of this.bumpers) {
      b.c.flash = Math.max(0, b.c.flash - dt * 4);
      const f = b.c.flash;
      bumpFlash = Math.max(bumpFlash, f);
      b.grp.scale.set(1 + f * 0.08, 1 - f * 0.12, 1 + f * 0.08);
      b.bodyMat.emissiveIntensity = 0.5 + f * 2.5 + 0.1 * Math.sin(t * 9 + b.c.x);
      const frenzy = p && p.frenzyT > 0;
      b.coalMat.emissive.copy(frenzy ? new THREE.Color(0xffd040) : b.ghost ? new THREE.Color(0x40ff80) : torchCol);
      b.coalMat.emissiveIntensity = 1.3 + f * 3 + (frenzy ? 2 : 0);
      const big = frenzy ? 2 : 1;
      if (Math.random() < (PB.settings.quality === 'low' ? 0.3 : 0.9) * big) PB.FX.emit({ x: b.c.x + U.rand(-12, 12), y: b.c.y + U.rand(-12, 12), h: b.base + 40, vh: U.rand(80, 200) * (1 + f * 2) * big, life: U.rand(0.35, 0.6), color: frenzy ? '#ffd040' : b.ghost ? '#60ff90' : '#' + torchCol.getHexString(), size: U.rand(10, 18) * (1 + f) * big });
    }
    this.bumpLight.color.copy(torchCol);
    this.bumpLight.intensity = 2.5 + bumpFlash * 8;

    // slings
    for (const s of this.slings) {
      const f = s.sl.face;
      f.flash = Math.max(0, f.flash - dt * 6);
      s.rub.position.copy(s.base).addScaledVector(s.n, f.flash * 6);
      s.rub.visible = f.flash > 0.05;
      s.plastic.emissiveIntensity = 1 + f.flash * 4;
      s.rub.material.emissive.setRGB(f.flash * 0.8, f.flash * 0.25, 0);
    }
    // targets
    for (const d of this.drops) {
      const target = d.d.down ? -20 : 17;
      d.y += (target - d.y) * Math.min(1, dt * (d.d.down ? 25 : 10));
      d.m.position.y = d.y;
      d.m.material[0].emissiveIntensity = 0.25 + 0.25 * Math.sin(t * 4 + d.d.ay);
    }
    for (const s of this.standups) {
      s.s.wobble = Math.max(0, s.s.wobble - dt * 3);
      s.grp.rotation.z = Math.sin(s.s.wobble * 30) * s.s.wobble * 0.25;
      s.face.material[1].emissive.setRGB(s.s.wobble * 0.8, s.s.wobble * 0.2, 0);
    }
    this.spinnerGrp.rotation.x = parts.spinner.angle;
    // vault rim + crystal
    const vlamp = g.lamps.vault.lit;
    const sc = parts.saucers[0];
    sc.flash = Math.max(0, (sc.flash || 0) - dt * 2);
    this.vaultRim.material.emissiveIntensity = 0.3 + vlamp * 1.5 + sc.flash * 2;
    this.crystal.rotation.y += dt * 1.2;
    this.crystal.position.y = 190 + Math.sin(t * 2) * 6;
    this.crystalHalo.position.y = this.crystal.position.y;
    this.crystalHalo.rotation.set(Math.PI / 2 + Math.sin(t) * 0.3, t * 0.8, 0);
    this.crystal.material.emissiveIntensity = 1.2 + g.lamps.shrine.lit * 2;
    // portcullis rises during multiball, eyes glow when a boss is near
    const portTarget = p && p.mb ? 170 : 0;
    this.portcullis.position.y += (portTarget - this.portcullis.position.y) * Math.min(1, dt * 2);
    const eyeK = 0.5 + 0.5 * Math.sin(t * 3);
    this.gateEyes.material.color.setRGB(1 * eyeK + 0.2, 0.15 * eyeK, 0.05);
    // post
    this.post3.visible = parts.post.active;
    this.post3.material.emissiveIntensity = 1 + 0.6 * Math.sin(t * 8);
    // flippers
    const rage = p && p.ability === 'crusader' && p.abilityT > 0, aegis = p && p.ability === 'paladin' && p.abilityT > 0;
    for (const fm of this.flippers) {
      fm.grp.rotation.y = -fm.f.angle;
      const e = rage ? 0.6 + 0.4 * Math.sin(t * 10) : aegis ? 0.4 + 0.3 * Math.sin(t * 8) : 0;
      for (const mm of fm.top.material) mm.emissive.setRGB(rage ? e : aegis ? e * 0.3 : 0, aegis ? e : 0, aegis ? e * 0.5 : 0);
    }
    // plunger
    const pl = g.plunger;
    this.plunger.position.set(T.PLUNGER.x, 0, T.PLUNGER.floorY + Math.max(-0.15, pl.pos) * 34);

    this.diverter.rotation.y = this.g.denOpen && this.g.denOpen() ? 0.9 : 0;
    this.updateDeck(dt, t);
    this.updateWings(dt, t);
    this.updateRats(dt, t);
    this.updateLamps();
    this.updateMonster(dt, t);
    this.updateBalls();
    this.updateParticles(dt);
    this.updateDMD(dt);
    this.updateCamera(dt, t);
    updateDecor(this, dt, t);
    if (this.composer) this.composer.render(); else this.r.render(this.scene, this.camera);
    this.drawOverlay(t);
  }

  updateLamps() {
    for (const lm of this.lampMeshes) {
      const lit = lm.l.lit;
      const k = 0.22 + lit * 1.25;
      lm.m.material.color.setRGB(lm.col.r * k, lm.col.g * k, lm.col.b * k);
      lm.m.material.opacity = 0.55 + lit * 0.45;
      lm.gm.visible = lit > 0.02;
      lm.gm.material.opacity = lit * 0.4;
    }
  }

  updateMonster(dt, t) {
    const g = this.g, p = g.p;
    let def, m = p && p.mon;
    if (m) def = m.def;
    else def = PB.DATA.MONSTERS[Math.floor(t / 5) % 5];
    const cur = this.monModels[def.id];
    if (this.curMon !== cur) {
      if (this.curMon) this.curMon.holder.visible = false;
      this.curMon = cur;
      cur.rise = 0;
      cur.holder.visible = true;
      this.monLight.color.set(def.color);
      PB.FX.burst(g.parts.monster.x, g.parts.monster.y, { n: 40, color: '#a89880', speed: 200, life: 0.9, h: 10 });
    }
    cur.rise = Math.min(1, cur.rise + dt * 1.6);
    const md = cur.m.userData;
    const h = cur.holder;
    let y = -60 * (1 - U.ease.outBack(cur.rise));
    let s = 96, rotY = Math.sin(t * 0.7) * 0.25;
    // look towards the nearest ball
    const lair = g.parts.monster;
    let nb = null, nd = 1e9;
    for (const b of g.world.balls) { if (!b.alive) continue; const d = Math.hypot(b.x - lair.x, b.y - lair.y); if (d < nd) { nd = d; nb = b; } }
    if (nb) rotY = U.clamp(Math.atan2(nb.x - lair.x, nb.y - lair.y), -0.9, 0.9);
    h.rotation.y += (rotY - h.rotation.y) * Math.min(1, dt * 4);
    const wob = m ? m.wobble : 0;
    h.rotation.x = -wob * 0.35;
    if (m && m.dead) {
      const k = Math.min(1, m.deadT / 1.2);
      y -= k * 90;
      h.rotation.y += k * 8 * dt * 10;
      s *= 1 - k * 0.5;
    }
    h.position.y = y + Math.sin(t * 2.2) * 2;
    h.scale.set(s * (1 + wob * 0.1), s * (1 - wob * 0.15) * (1 + Math.sin(t * 2.2) * 0.02), s * (1 + wob * 0.1));
    // hit flash
    const fl = m ? m.hitFlash : 0;
    md.mats.forEach((mat, i) => {
      if (!mat.emissive) return;
      const base = md.base[i];
      mat.emissive.setRGB(base.r + fl, base.g + fl * 0.9, base.b + fl * 0.8);
    });
    // per-monster animation
    if (md.head) md.head.rotation.z = Math.sin(t * 1.7) * 0.08;
    if (md.kind === 'cyclops') {
      const open = m ? m.eye : Math.sin(t) > 0;
      md.lid.rotation.x += ((open ? -1.9 : 0.2) - md.lid.rotation.x) * Math.min(1, dt * 10);
      md.iris.material.emissiveIntensity = open ? 2 + Math.sin(t * 12) : 0.3;
    }
    if (md.kind === 'mimic') md.lid.rotation.x = -(0.35 + Math.abs(Math.sin(t * 3)) * 0.5 + wob * 0.6);
    if (md.kind === 'demon') {
      const atk = PB.FX.balls.length > 0;
      md.armL.rotation.z += ((atk ? -1.2 : Math.sin(t) * 0.1) - md.armL.rotation.z) * Math.min(1, dt * 5);
      md.armR.rotation.z += ((atk ? 1.2 : -Math.sin(t) * 0.1) - md.armR.rotation.z) * Math.min(1, dt * 5);
      md.ring.material.emissiveIntensity = 1.6 + Math.sin(t * 6) * 0.8;
      if (Math.random() < 0.6) PB.FX.emit({ x: lair.x + U.rand(-40, 40), y: lair.y + U.rand(-40, 40), h: 30, vh: U.rand(60, 160), life: 0.6, color: '#ff5a10', size: U.rand(10, 16) });
    }
    if (md.kind === 'skeleton' && md.sword) md.sword.rotation.z = -0.5 + Math.sin(t * 3) * 0.2 - wob;
    if (md.kind === 'goblin' && md.blade) md.blade.rotation.z = -0.3 + Math.sin(t * 4) * 0.25 - wob;
    this.monLight.intensity = 5 + fl * 14 + (def.boss ? 3 + 2 * Math.sin(t * 6) : 0);
    // HP ring
    const k = m && !m.dead ? m.hp / m.max : 0;
    const key = k.toFixed(3);
    if (key !== this.hpKey) {
      this.hpKey = key;
      this.hpRing.geometry.dispose();
      const r = lair.r;
      this.hpRing.geometry = new THREE.RingGeometry(r + 12, r + 19, 48, 1, Math.PI / 2, -TAU * Math.max(0.0001, k));
      this.hpRing.material.color.set(def.boss ? '#ff4a10' : k < 0.34 ? '#ff2a2a' : '#ff8a3a');
    }
    this.hpRing.visible = this.hpBg.visible = !!(m && !m.dead);
    this.lairBand.material.emissive.set(def.color);
  }

  updateBalls() {
    const balls = this.g.world.balls.filter((b) => b.alive);
    this.balls.forEach((bm, i) => {
      const b = balls[i];
      bm.m.visible = bm.sh.visible = !!b;
      if (!b) return;
      const lay0 = b.layer || 0;
      const h = (b.held !== 'ramp' && lay0 === 1 ? T.DECK_H : b.held !== 'ramp' && lay0 >= 2 ? T.WING_H : b.h || 0) + (b.held === 'saucer' ? -7 : 0);
      bm.m.position.set(b.x, PB.Phys.BALL_R + h, b.y);
      bm.m.material = this.ballMats[b.skin] || this.ballMats.steel;
      // rolling rotation
      const dx = b.x - (bm.lx ?? b.x), dy = b.y - (bm.ly ?? b.y);
      bm.lx = b.x; bm.ly = b.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 80) bm.m.rotateOnWorldAxis(new THREE.Vector3(dy, 0, -dx).normalize(), -d / PB.Phys.BALL_R);
      const lay = b.layer || 0;
      const groundH = b.held === 'ramp' ? b.h : lay === 1 ? T.DECK_H : lay >= 2 ? T.WING_H : 0;
      bm.sh.position.set(b.x + 3, groundH + 0.9, b.y + 4);
      const k = Math.max(0.3, 1 - (h - groundH) / 80);
      bm.sh.scale.setScalar(k);
      bm.sh.material.opacity = k;
    });
  }

  updateParticles(dt) {
    const FX = PB.FX;
    let n = 0;
    const N = this.pN, P = this.pPos, C = this.pCol, Z = this.pSize;
    const col = new THREE.Color();
    const push = (x, y, h, hex, a, size) => {
      if (n >= N) return;
      col.set(hex);
      P[n * 3] = x; P[n * 3 + 1] = h; P[n * 3 + 2] = y;
      C[n * 3] = col.r * a; C[n * 3 + 1] = col.g * a; C[n * 3 + 2] = col.b * a;
      Z[n] = size;
      n++;
    };
    let coins = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    for (const p of FX.parts) {
      const k = 1 - p.t / p.life;
      if (p.kind === 'coin') {
        if (coins < 260) {
          e.set(p.rot, p.rot * 0.7, 0);
          q.setFromEuler(e);
          pos.set(p.x, p.h, p.y);
          m4.compose(pos, q, one);
          this.coinMesh.setMatrixAt(coins++, m4);
        }
        continue;
      }
      const sz = p.kind === 'fire' ? p.size * 2.2 : p.size * 2.6;
      push(p.x, p.y, p.h, p.color, k * (p.kind === 'fire' ? 0.55 : 1), sz * (p.kind === 'fire' ? 0.6 + k * 0.6 : 1));
    }
    this.coinMesh.count = coins;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    // ball trails
    if (PB.settings.trail) {
      for (const b of this.g.world.balls) {
        if (!b.alive) continue;
        const tr = b.trail, cnt = tr.length / 3;
        const hex = b.skin === 'gold' ? '#ffcc40' : b.skin === 'ember' ? '#ff5a10' : '#8ab4ff';
        for (let i = 0; i < cnt - 1; i++) push(tr[i * 3], tr[i * 3 + 1], tr[i * 3 + 2] + 12, hex, (i / cnt) * 0.35, 22 * (0.4 + (0.6 * i) / cnt));
      }
    }
    // fireball
    const fb = FX.balls[0];
    this.fireMesh.visible = !!fb;
    if (fb && fb.x != null) {
      this.fireMesh.position.set(fb.x, fb.h, fb.y);
      this.fireLight.position.copy(this.fireMesh.position);
      this.fireLight.intensity = 6;
      push(fb.x, fb.y, fb.h, '#ff8a20', 1, 90);
      // warning circle at the target
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + this.t; push(fb.x1 + Math.cos(a) * 140, fb.y1 + Math.sin(a) * 140, 4, '#ff3000', 0.6, 14); }
    } else this.fireLight.intensity = 0;
    // rings
    this.ringPool.forEach((m, i) => {
      const r = FX.rings[i];
      m.visible = !!r;
      if (!r) return;
      const k = r.t / r.life;
      m.position.set(r.x, 2, r.y);
      m.scale.setScalar(20 + k * 180);
      m.material.color.set(r.color);
      m.material.opacity = 1 - k;
    });
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }

  updateDMD(dt) {
    this.dmdT = (this.dmdT || 0) + dt;
    if (this.dmdT > 0.06) { this.dmdT = 0; this.dmdTex.needsUpdate = true; }
  }

  updateCamera(dt, t) {
    const cam = this.camera, FX = PB.FX;
    const attract = PB.UI && ['ovTitle', 'ovMenu', 'ovHero'].includes(PB.UI.overlay);
    if (attract) {
      const a = t * 0.12;
      const target = new THREE.Vector3(0, 0.6, -0.6);
      const desired = new THREE.Vector3(Math.sin(a) * 15, 8 + Math.sin(t * 0.21) * 1.5, Math.cos(a) * 15);
      this.attractK = Math.min(1, (this.attractK || 0) + dt * 0.8);
      cam.position.lerp(desired, this.attractK < 1 ? 0.05 : 1);
      cam.lookAt(target);
      this.lookCur = target.clone();
      return;
    }
    this.attractK = 0;
    const base = this.camBase;
    if (!base) return;
    // follow: lowest ball on the main table, or swing up to the Dragon's Den when a ball is up there
    let fx = 0, fy = 0, zoom = 0;
    const balls = this.g.p ? this.g.world.balls.filter((b) => b.alive && !this.g.inShooter(b)) : [];
    const deckBall = balls.find((b) => (b.layer || 0) === 1 || (b.ramp && b.ramp.path === 'den' && b.y < 120));
    const wingBall = balls.find((b) => (b.layer || 0) >= 2 || (b.ramp && (b.ramp.path === 'crypt' || b.ramp.path === 'forge') && (b.x < 0 || b.x > 600)));
    const ty = base.ty || 600;
    if (wingBall && this.camMode !== 'overhead') { const cx = (wingBall.layer === 3 || wingBall.x > 300) ? 860 : -260; fx = cx - 300; fy = 640 - ty; zoom = this.camMode === 'player' ? 0.3 : 0.4; }
    else if (deckBall && this.camMode !== 'overhead') { fx = 0; fy = -210 - ty; zoom = this.camMode === 'player' ? 0.12 : 0.25; }
    else if (this.camMode === 'player' && balls.length) {
      const b = balls.reduce((a, c) => (c.y > a.y ? c : a));
      fx = (b.x - 300) * 0.07;
      fy = U.clamp((b.y - 640) * 0.08, -30, 30);
      zoom = 0.04;
    }
    const cf = PB.camFocus;
    if (cf) {
      cf.t += dt / Math.max(0.2, PB.timeScale);
      const k = Math.sin(Math.min(1, cf.t / cf.dur) * Math.PI);
      fx = U.lerp(fx, cf.x - 300, k);
      fy = U.lerp(fy, cf.y - ty, k);
      zoom = U.lerp(zoom, cf.zoom || 0.4, k);
      this.focusH = U.lerp(0, cf.h || 0, k);
      if (cf.t >= cf.dur) PB.camFocus = null;
    } else this.focusH = 0;
    const kk = Math.min(1, dt * 3);
    this.follow.x += (fx - this.follow.x) * kk;
    this.follow.y += (fy - this.follow.y) * kk;
    this.zoomK = (this.zoomK || 0) + (zoom - (this.zoomK || 0)) * kk;
    const off = this.toWorld(300 + this.follow.x, 600 + this.follow.y, this.focusH || 0).sub(this.toWorld(300, 600));
    const shake = new THREE.Vector3((FX.sx + FX.nx) * S, (FX.sy * 0.5) * S, (FX.ny) * S);
    const look = base.target.clone().add(off);
    const want = base.pos.clone().add(off).lerp(look, this.zoomK).add(shake);
    if (!this.lookCur) this.lookCur = look.clone();
    const k = cam.position.distanceTo(want) > 3 ? Math.min(1, dt * 3) : 1;
    cam.position.lerp(want, k);
    this.lookCur.lerp(look, k);
    cam.lookAt(this.lookCur);
  }

  project(x, y, h) {
    const v = this.toWorld(x, y, h).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, ok: v.z < 1 };
  }

  drawOverlay(t) {
    const ctx = this.octx, FX = PB.FX, g = this.g, p = g.p;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const unit = Math.min(this.W / 600, this.H / 900) * 1.6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of FX.texts) {
      const k = tx.t / tx.life;
      const s = this.project(tx.x, tx.y, 40 + k * 50);
      if (!s.ok) continue;
      const sc = tx.scale * (k < 0.15 ? U.ease.outBack(k / 0.15) : 1);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `800 ${Math.round(11 * sc * unit)}px Cinzel, Georgia, serif`;
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(tx.str, s.x, s.y);
      ctx.fillStyle = tx.color; ctx.fillText(tx.str, s.x, s.y);
    }
    ctx.globalAlpha = 1;
    // big banners
    for (const b of FX.banners) {
      const k = b.t / b.life;
      const inK = Math.min(1, b.t / 0.25);
      const sc = U.ease.outBack(inK) * (1 + Math.max(0, k - 0.8) * 0.6);
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      const size = Math.min(this.W / (b.str.length * 0.62 + 1), 64 * unit / 1.6);
      ctx.save();
      ctx.translate(this.W / 2, this.H * 0.36);
      ctx.scale(sc, sc);
      ctx.font = `900 ${Math.round(size)}px 'Cinzel Decorative', Cinzel, Georgia, serif`;
      ctx.lineWidth = Math.max(4, size / 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.shadowColor = b.color; ctx.shadowBlur = 30;
      ctx.strokeText(b.str, 0, 0);
      ctx.shadowBlur = 0;
      const gr = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, b.color); gr.addColorStop(1, b.color);
      ctx.fillStyle = gr;
      ctx.fillText(b.str, 0, 0);
      if (b.sub) {
        const ss = Math.round(size * 0.36);
        ctx.font = `700 ${ss}px Cinzel, Georgia, serif`;
        ctx.lineWidth = 4; ctx.strokeText(b.sub, 0, size * 0.75);
        ctx.fillStyle = '#fff3d0'; ctx.fillText(b.sub, 0, size * 0.75);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // plunge hint
    if (p && g.ballWaiting && g.ballWaiting()) {
      const touch = PB.UI && PB.UI.isTouch;
      const s = Math.round(12 * unit);
      ctx.font = `700 ${s}px Cinzel, Georgia, serif`;
      ctx.fillStyle = `rgba(255,230,160,${0.65 + 0.35 * Math.sin(t * 5)})`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const msg = touch ? 'HOLD RIGHT SIDE • RELEASE TO LAUNCH' : 'HOLD SPACE • RELEASE TO LAUNCH';
      ctx.strokeText(msg, this.W / 2, this.H * 0.12); ctx.fillText(msg, this.W / 2, this.H * 0.12);
      ctx.font = `600 ${Math.round(s * 0.8)}px Cinzel, Georgia, serif`;
      const m2 = 'a soft plunge into the flashing top lane = SKILL SHOT';
      ctx.strokeText(m2, this.W / 2, this.H * 0.12 + s * 1.4); ctx.fillText(m2, this.W / 2, this.H * 0.12 + s * 1.4);
      // plunger power meter
      if (g.plunger.held) {
        const k = g.plunger.charge, bw = 10 * unit, bh = 90 * unit;
        const x0 = this.W - bw - 10, y0 = this.H - bh - 20;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0, y0, bw, bh);
        ctx.fillStyle = k > 0.92 ? '#ff4040' : k > 0.6 ? '#ffd34d' : '#5aff8a';
        ctx.fillRect(x0, y0 + bh * (1 - k), bw, bh * k);
      }
    }
    if (p && p.ability === 'crusader' && p.abilityT > 0) {
      const a = 0.18 + 0.08 * Math.sin(t * 6);
      const v = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.H * 0.8);
      v.addColorStop(0, 'rgba(255,0,0,0)'); v.addColorStop(1, `rgba(255,0,0,${a})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, this.W, this.H);
    }
    if (p && p.tilted) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, this.W, this.H); }
    if (FX.flashA > 0.01) {
      ctx.globalCompositeOperation = FX.flashC === '#000' ? 'source-over' : 'lighter';
      ctx.globalAlpha = FX.flashA * 0.45;
      ctx.fillStyle = FX.flashC;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// Build portraits of every monster + hero once, for the UI and the dot-matrix display
export function makePortraits() {
  return renderPortraits([
    { id: 'goblin', focus: 0.58, dist: 1.0 },
    { id: 'skeleton', focus: 0.6, dist: 1.1 },
    { id: 'cyclops', focus: 0.6, dist: 1.15 },
    { id: 'mimic', focus: 0.45, dist: 1.0 },
    { id: 'demon', focus: 0.6, dist: 1.5 },
    { id: 'paladin', focus: 0.62, dist: 1.0, bg: 0x101810 },
    { id: 'crusader', focus: 0.62, dist: 1.0, bg: 0x181010 },
  ]);
}

PB.Renderer3D = Renderer3D;
PB.makePortraits = makePortraits;
window.dispatchEvent(new Event('pb3d-ready'));
