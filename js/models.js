// Procedural 3D models: every monster and hero is built from primitives in code (no image assets).
import * as THREE from './vendor/three.module.min.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- procedural surface textures (generated once, shared) ----
const TEXC = {};
function genTex(kind) {
  if (TEXC[kind]) return TEXC[kind];
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  let seed = kind.length * 977 + 13;
  const R = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  x.fillStyle = '#808080'; x.fillRect(0, 0, N, N);
  if (kind === 'skin') {
    for (let o = 0; o < 3; o++) for (let i = 0; i < 900 * (o + 1); i++) {
      const v = R() > 0.5 ? 255 : 0, s = (3 - o) * 3 * R() + 1;
      x.fillStyle = `rgba(${v},${v},${v},${0.06 + o * 0.03})`;
      x.beginPath(); x.arc(R() * N, R() * N, s, 0, Math.PI * 2); x.fill();
    }
    x.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 40; i++) { x.beginPath(); let px = R() * N, py = R() * N; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (R() - 0.5) * 30; py += (R() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); }
  } else if (kind === 'scales') {
    const s = 22;
    for (let row = -1; row < N / (s * 0.5) + 1; row++) for (let col = -1; col < N / s + 1; col++) {
      const cx = col * s + (row % 2) * s / 2, cy = row * s * 0.5;
      const g = x.createRadialGradient(cx, cy - 4, 2, cx, cy, s * 0.62);
      g.addColorStop(0, '#d8d8d8'); g.addColorStop(0.8, '#707070'); g.addColorStop(1, '#202020');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, s * 0.6, 0, Math.PI); x.fill();
    }
  } else if (kind === 'cloth') {
    for (let i = 0; i < N; i += 4) { x.fillStyle = i % 8 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)'; x.fillRect(i, 0, 2, N); x.fillRect(0, i, N, 2); }
    for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(0,0,0,0.1)'; x.fillRect(R() * N, R() * N, 6 * R(), 1); }
  } else if (kind === 'metal') {
    for (let i = 0; i < 500; i++) { const v = 90 + R() * 80; x.strokeStyle = `rgba(${v},${v},${v},0.5)`; x.beginPath(); const y = R() * N; x.moveTo(0, y); x.lineTo(N, y + (R() - 0.5) * 4); x.stroke(); }
    for (let i = 0; i < 40; i++) { x.strokeStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); const px = R() * N, py = R() * N; x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 40, py + (R() - 0.5) * 10); x.stroke(); }
  } else if (kind === 'bone') {
    for (let i = 0; i < 1500; i++) { const v = R() > 0.6 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},0.08)`; x.fillRect(R() * N, R() * N, 2, 2); }
    x.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 12; i++) { x.beginPath(); let px = R() * N, py = R() * N; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (R() - 0.5) * 24; py += R() * 16; x.lineTo(px, py); } x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return (TEXC[kind] = t);
}

function M(color, o = {}) {
  const metal = (o.m ?? 0) > 0.5;
  const glowing = o.e && o.e !== 0x000000 && (o.ei ?? 1) > 1;
  const surf = o.tex === false || glowing || o.op ? null : o.tex || (metal ? 'metal' : 'skin');
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness: o.r ?? 0.7, metalness: o.m ?? 0,
    emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    flatShading: !!o.flat, transparent: !!o.op, opacity: o.op ?? 1,
    side: o.ds ? THREE.DoubleSide : THREE.FrontSide,
    clearcoat: o.cc ?? (glowing ? 1 : 0), clearcoatRoughness: 0.1,
    sheen: o.tex === 'cloth' ? 0.6 : 0, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4), sheenRoughness: 0.6,
  });
  if (surf) {
    const t = genTex(surf);
    if (metal) { mat.roughnessMap = t; mat.bumpMap = t; mat.bumpScale = 0.3; }
    else { mat.bumpMap = t; mat.bumpScale = surf === 'scales' ? 2.2 : surf === 'cloth' ? 0.8 : 1.2; }
  }
  return mat;
}
function add(parent, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.scale.set(...s);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const sph = (r, w = 32, h = 22) => new THREE.SphereGeometry(r, Math.max(w, 24), Math.max(h, 16));
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 12);
const cone = (r, h, s = 12) => new THREE.ConeGeometry(r, h, s);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h, s = 20) => new THREE.CylinderGeometry(a, b, h, s);

// limb segment between two points
function limb(parent, a, b, r0, r1, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(cyl(r1, r0, len, 18), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  parent.add(m);
  const j = new THREE.Mesh(sph(r1, 16, 12), mat);
  j.position.copy(b);
  j.castShadow = true;
  parent.add(j);
  return m;
}
// tapered horn along a curve
function horn(parent, pts, r0, mat) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a = curve.getPoint(i / N), b = curve.getPoint((i + 1) / N);
    limb(parent, a, b, r0 * (1 - i / N) + 0.004, r0 * (1 - (i + 1) / N) + 0.004, mat);
  }
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function finish(g, extra = {}) {
  const mats = new Set();
  g.traverse((o) => { if (o.material) mats.add(o.material); });
  g.userData.mats = [...mats];
  g.userData.base = g.userData.mats.map((m) => (m.emissive ? m.emissive.clone() : null));
  Object.assign(g.userData, extra);
  return g;
}

// ---------------- monsters ----------------
function goblin() {
  const g = new THREE.Group();
  const skin = M(0x6f9a3e, { r: 0.6 }), cloth = M(0x5a3a22, { r: 0.9, tex: 'cloth' }), hood = M(0x8a1c18, { r: 0.85, tex: 'cloth' });
  const leather = M(0x3a2414, { r: 0.6 }), brass = M(0xc89a40, { m: 0.9, r: 0.3 });
  add(g, new THREE.TorusGeometry(0.175, 0.025, 8, 28), leather, [0, 0.27, 0], [Math.PI / 2, 0, 0]);
  add(g, box(0.05, 0.04, 0.02), brass, [0, 0.27, 0.18]);
  add(g, box(0.08, 0.09, 0.05), leather, [-0.14, 0.22, 0.09], [0, 0.4, 0]);
  add(g, cyl(0.055, 0.06, 0.08, 16), leather, [-0.26, 0.37, 0.09], [0.6, 0, 0.6]);
  add(g, cyl(0.055, 0.06, 0.08, 16), leather, [0.27, 0.4, 0.1], [0.6, 0, -0.6]);
  add(g, new THREE.TorusGeometry(0.17, 0.012, 6, 24, Math.PI * 0.9), leather, [0, 0.4, 0.02], [0, 0, -0.9]);
  const eye = M(0xffd040, { e: 0xffb000, ei: 0.9 }), dark = M(0x1a0a06), tooth = M(0xf0e8c8, { r: 0.4 });
  add(g, cap(0.17, 0.22), cloth, [0, 0.36, 0]);
  add(g, cyl(0.2, 0.26, 0.16, 16), hood, [0, 0.24, 0]);
  limb(g, V3(-0.08, 0.22, 0), V3(-0.12, 0.03, 0.04), 0.055, 0.05, skin);
  limb(g, V3(0.08, 0.22, 0), V3(0.12, 0.03, 0.04), 0.055, 0.05, skin);
  // arms + dagger
  limb(g, V3(-0.16, 0.48, 0), V3(-0.3, 0.32, 0.12), 0.05, 0.04, skin);
  limb(g, V3(0.16, 0.48, 0), V3(0.3, 0.36, 0.14), 0.05, 0.04, skin);
  const blade = add(g, box(0.025, 0.3, 0.012), M(0xd8dce4, { m: 0.9, r: 0.25 }), [0.31, 0.5, 0.17], [0.35, 0, -0.3]);
  add(g, box(0.09, 0.02, 0.03), M(0x6a4a20), [0.3, 0.37, 0.15], [0, 0, -0.3]);
  const head = new THREE.Group();
  head.position.set(0, 0.7, 0.02);
  g.add(head);
  add(head, sph(0.19), skin, [0, 0, 0], [0, 0, 0], [1.05, 0.95, 1]);
  add(head, cone(0.055, 0.32), skin, [-0.25, 0.05, -0.02], [0, 0, Math.PI / 2 + 0.35]);
  add(head, new THREE.TorusGeometry(0.025, 0.006, 6, 16), M(0xffd040, { m: 1, r: 0.2 }), [0.3, 0.0, 0.0], [0, Math.PI / 2, 0]);
  add(head, cone(0.055, 0.32), skin, [0.25, 0.05, -0.02], [0, 0, -Math.PI / 2 - 0.35]);
  add(head, cone(0.04, 0.16), skin, [0, -0.02, 0.22], [Math.PI / 2 - 0.25, 0, 0]);
  add(head, sph(0.045), eye, [-0.08, 0.05, 0.15]);
  add(head, sph(0.045), eye, [0.08, 0.05, 0.15]);
  add(head, sph(0.018), dark, [-0.08, 0.05, 0.19]);
  add(head, sph(0.018), dark, [0.08, 0.05, 0.19]);
  add(head, box(0.2, 0.06, 0.05), M(0x3a0606), [0, -0.1, 0.15]);
  for (let i = 0; i < 5; i++) add(head, cone(0.014, 0.04, 6), tooth, [-0.07 + i * 0.035, -0.085, 0.175], [Math.PI, 0, 0]);
  add(head, new THREE.SphereGeometry(0.215, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hood, [0, 0.02, -0.04], [-0.5, 0, 0]);
  for (let i = 0; i < 4; i++) add(head, cone(0.025, 0.12, 6), M(0x1a1a14), [0, 0.2 + i * 0.01, -0.06 + i * 0.05], [-0.3 + i * 0.2, 0, 0]);
  return finish(g, { head, blade, kind: 'goblin', h: 0.95 });
}

function skeleton() {
  const g = new THREE.Group();
  const bone = M(0xe8dfc4, { r: 0.55, tex: 'bone' }), iron = M(0x6a6a72, { m: 0.75, r: 0.4 }), rag = M(0x8a1a14, { r: 0.9, tex: 'cloth' });
  for (let i = 0; i < 7; i++) add(g, cyl(0.032, 0.032, 0.03, 14), bone, [0, 0.3 + i * 0.055, -0.03]);
  limb(g, V3(-0.17, 0.68, 0.02), V3(0, 0.66, 0.05), 0.016, 0.016, bone);
  limb(g, V3(0.17, 0.68, 0.02), V3(0, 0.66, 0.05), 0.016, 0.016, bone);
  const glow = M(0xff3020, { e: 0xff2010, ei: 2.5 }), black = M(0x050302);
  add(g, cyl(0.025, 0.025, 0.38), bone, [0, 0.45, -0.02]);
  for (let i = 0; i < 4; i++) {
    const r = 0.13 - i * 0.012;
    add(g, new THREE.TorusGeometry(r, 0.016, 6, 20, Math.PI * 1.5), bone, [0, 0.62 - i * 0.055, 0], [Math.PI / 2, 0, Math.PI * 0.75]);
  }
  add(g, box(0.22, 0.07, 0.12), bone, [0, 0.27, 0]);
  add(g, box(0.26, 0.12, 0.14), rag, [0, 0.22, 0.01]);
  limb(g, V3(-0.08, 0.24, 0), V3(-0.1, 0.02, 0.03), 0.025, 0.022, bone);
  limb(g, V3(0.08, 0.24, 0), V3(0.1, 0.02, 0.03), 0.025, 0.022, bone);
  add(g, sph(0.08), iron, [-0.18, 0.68, 0], [0, 0, 0], [1, 0.7, 1]);
  add(g, sph(0.08), iron, [0.18, 0.68, 0], [0, 0, 0], [1, 0.7, 1]);
  limb(g, V3(-0.18, 0.66, 0), V3(-0.27, 0.45, 0.1), 0.022, 0.02, bone);
  limb(g, V3(0.18, 0.66, 0), V3(0.3, 0.5, 0.12), 0.022, 0.02, bone);
  const shield = add(g, cyl(0.17, 0.17, 0.03, 24), M(0x5a3a1e, { r: 0.8 }), [-0.3, 0.45, 0.16], [Math.PI / 2, 0, 0.2]);
  add(g, cyl(0.05, 0.05, 0.04, 16), iron, [-0.3, 0.45, 0.18], [Math.PI / 2, 0, 0.2]);
  add(g, new THREE.TorusGeometry(0.165, 0.014, 8, 32), iron, [-0.3, 0.45, 0.165], [0, 0, 0.2]);
  add(g, cyl(0.11, 0.11, 0.032, 24), M(0x8a1a14, { r: 0.6, tex: false }), [-0.3, 0.45, 0.17], [Math.PI / 2, 0, 0.2]);
  const sword = add(g, box(0.03, 0.42, 0.012), M(0xc8ccd4, { m: 0.9, r: 0.3 }), [0.33, 0.7, 0.14], [0.2, 0, -0.5]);
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0);
  g.add(head);
  add(head, sph(0.15), bone, [0, 0, 0], [0, 0, 0], [0.9, 1, 1]);
  add(head, box(0.15, 0.06, 0.12), bone, [0, -0.13, 0.04]);
  add(head, sph(0.042), black, [-0.055, 0.0, 0.11]);
  add(head, sph(0.042), black, [0.055, 0.0, 0.11]);
  add(head, sph(0.017), glow, [-0.055, 0.0, 0.135]);
  add(head, sph(0.017), glow, [0.055, 0.0, 0.135]);
  add(head, cone(0.02, 0.04, 3), black, [0, -0.05, 0.14], [Math.PI, 0, 0]);
  add(head, new THREE.SphereGeometry(0.165, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), iron, [0, 0.02, 0]);
  add(head, box(0.025, 0.12, 0.02), iron, [0, -0.02, 0.15]);
  return finish(g, { head, sword, shield, kind: 'skeleton', h: 1.05 });
}

function cyclops() {
  const g = new THREE.Group();
  const skin = M(0xc4a074, { r: 0.65 }), fur = M(0x5a3a1c, { r: 1, flat: true }), dark = M(0x200a04);
  add(g, sph(0.3), skin, [0, 0.48, 0], [0, 0, 0], [1.05, 1.05, 0.85]);
  add(g, sph(0.12), skin, [-0.12, 0.56, 0.18], [0, 0, 0], [1, 0.8, 0.6]);
  add(g, sph(0.12), skin, [0.12, 0.56, 0.18], [0, 0, 0], [1, 0.8, 0.6]);
  add(g, cyl(0.3, 0.33, 0.2, 9), fur, [0, 0.2, 0]);
  limb(g, V3(-0.12, 0.15, 0), V3(-0.14, 0.02, 0.03), 0.08, 0.07, skin);
  limb(g, V3(0.12, 0.15, 0), V3(0.14, 0.02, 0.03), 0.08, 0.07, skin);
  limb(g, V3(-0.3, 0.62, 0), V3(-0.42, 0.32, 0.08), 0.09, 0.075, skin);
  limb(g, V3(0.3, 0.62, 0), V3(0.42, 0.32, 0.08), 0.09, 0.075, skin);
  add(g, sph(0.09), skin, [-0.43, 0.27, 0.1]);
  add(g, sph(0.09), skin, [0.43, 0.27, 0.1]);
  const wood = M(0x5a3a1c, { r: 0.85 }), ironC = M(0x4a4440, { m: 0.85, r: 0.4 });
  const club = new THREE.Group(); club.position.set(0.45, 0.27, 0.12); club.rotation.set(0.5, 0, -0.35); g.add(club);
  add(club, cyl(0.09, 0.035, 0.6, 14), wood, [0, 0.3, 0]);
  for (let i = 0; i < 8; i++) { const a = i * 0.8, yy = 0.42 + (i % 3) * 0.08; add(club, cone(0.018, 0.07, 6), ironC, [Math.cos(a) * 0.08, yy, Math.sin(a) * 0.08], [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4]); }
  add(g, new THREE.TorusGeometry(0.31, 0.03, 8, 30), M(0x3a2414, { r: 0.6 }), [0, 0.31, 0], [Math.PI / 2, 0, 0]);
  add(g, sph(0.05), M(0xe8dcc0, { tex: 'bone' }), [0, 0.31, 0.3]);
  for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.085, 0.02, 8, 20), ironC, [s * 0.41, 0.4, 0.06], [Math.PI / 2 + 0.3, 0, s * 0.4]);
  const head = new THREE.Group();
  head.position.set(0, 0.88, 0.04);
  g.add(head);
  add(head, sph(0.2), skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.95]);
  add(head, cone(0.05, 0.2), M(0xe8dcc0, { r: 0.4 }), [0, 0.22, -0.02], [-0.25, 0, 0]);
  add(head, box(0.2, 0.04, 0.06), skin, [0, 0.09, 0.16]);
  add(head, sph(0.085), M(0xf4f0e8, { r: 0.3 }), [0, 0.0, 0.14]);
  const iris = add(head, sph(0.045), M(0xffcc33, { e: 0xffa000, ei: 1.5 }), [0, 0.0, 0.205]);
  add(head, sph(0.02), dark, [0, 0, 0.245]);
  const lid = add(head, new THREE.SphereGeometry(0.095, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), skin, [0, 0, 0.14], [0.2, 0, 0]);
  add(head, box(0.16, 0.04, 0.05), dark, [0, -0.13, 0.15]);
  add(head, cone(0.018, 0.06, 6), M(0xf0e8d0), [-0.05, -0.1, 0.17]);
  add(head, cone(0.018, 0.06, 6), M(0xf0e8d0), [0.05, -0.1, 0.17]);
  return finish(g, { head, lid, iris, kind: 'cyclops', h: 1.1 });
}

function mimic() {
  const g = new THREE.Group();
  const woodTex = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#6a3c1a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      x.fillStyle = i % 2 ? '#7a4820' : '#5e3416';
      x.fillRect(0, (i * h) / 6, w, h / 6 - 3);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect(0, ((i + 1) * h) / 6 - 3, w, 3);
      for (let k = 0; k < 20; k++) { x.fillStyle = 'rgba(30,10,0,0.25)'; x.fillRect(Math.random() * w, (i * h) / 6 + Math.random() * 18, 30 + Math.random() * 60, 1); }
    }
  });
  const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
  const iron = M(0x3a3632, { m: 0.8, r: 0.45 }), gold = M(0xe8b440, { m: 1, r: 0.3 });
  const tooth = M(0xf2ead2, { r: 0.35 }), tongue = M(0xc02848, { r: 0.4 }), eyes = M(0xff2a1a, { e: 0xff2010, ei: 3 });
  const W = 0.7, D = 0.46, H = 0.34;
  add(g, box(W, H, D), wood, [0, H / 2, 0]);
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) add(g, box(0.05, H + 0.01, D + 0.02), iron, [x, H / 2, 0]);
  add(g, box(W + 0.02, 0.04, D + 0.02), iron, [0, 0.02, 0]);
  for (let i = 0; i < 7; i++) add(g, cone(0.026, 0.09, 6), tooth, [-W / 2 + 0.08 + i * 0.09, H + 0.04, D / 2 - 0.02]);
  add(g, sph(0.035), eyes, [-0.12, H - 0.02, -0.02]);
  add(g, sph(0.035), eyes, [0.12, H - 0.02, -0.02]);
  for (let i = 0; i < 6; i++) add(g, cyl(0.035, 0.035, 0.01, 12), gold, [-0.2 + Math.random() * 0.4, H - 0.01, -0.12 + Math.random() * 0.1], [Math.random() * 0.5, 0, Math.random() * 0.5]);
  const tg = add(g, sph(0.07), tongue, [0, H + 0.01, D / 2 + 0.07], [0.5, 0, 0], [1.1, 0.35, 2.2]);
  const drool = M(0xd8f0ff, { r: 0.05, op: 0.6, cc: 1 });
  for (const dx of [-0.2, 0.05, 0.22]) add(g, cyl(0.006, 0.012, 0.12, 6), drool, [dx, H - 0.02, D / 2 + 0.01]);
  for (let i = 0; i < 6; i++) add(g, cone(0.018, 0.06, 6), tooth, [-W / 2 + 0.12 + i * 0.09, H + 0.02, D / 2 - 0.08]);
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  g.add(lid);
  const top = add(lid, new THREE.CylinderGeometry(D / 2, D / 2, W, 20, 1, false, 0, Math.PI), wood, [0, 0, D / 2], [0, 0, Math.PI / 2]);
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) {
    const band = add(lid, new THREE.CylinderGeometry(D / 2 + 0.01, D / 2 + 0.01, 0.05, 20, 1, true, 0, Math.PI), iron, [x, 0, D / 2]);
    band.rotation.set(0, 0, Math.PI / 2);
  }
  for (let i = 0; i < 7; i++) add(lid, cone(0.026, 0.09, 6), tooth, [-W / 2 + 0.12 + i * 0.08, -0.03, D - 0.02], [Math.PI, 0, 0]);
  add(lid, box(0.1, 0.12, 0.03), gold, [0, -0.04, D + 0.005]);
  return finish(g, { lid, tongue: tg, kind: 'mimic', h: 0.75 });
}

function demon() {
  const g = new THREE.Group();
  const skin = M(0x3a3432, { r: 0.55 }), hornM = M(0x1a1412, { r: 0.4 }), eye = M(0xffd020, { e: 0xffb000, ei: 3 });
  const lava = M(0xff5a10, { e: 0xff4000, ei: 2.2 }), tooth = M(0xd8d0b8, { r: 0.4 }), stone = M(0x2a2420, { r: 0.9, flat: true });
  add(g, cyl(0.42, 0.48, 0.16, 10), stone, [0, 0.08, 0]);
  const ring = add(g, new THREE.TorusGeometry(0.4, 0.03, 8, 40), lava, [0, 0.17, 0], [Math.PI / 2, 0, 0]);
  add(g, sph(0.3), skin, [0, 0.52, 0], [0, 0, 0], [1.25, 1, 0.8]);
  add(g, sph(0.14), skin, [-0.13, 0.62, 0.16], [0, 0, 0], [1.1, 0.8, 0.6]);
  add(g, sph(0.14), skin, [0.13, 0.62, 0.16], [0, 0, 0], [1.1, 0.8, 0.6]);
  for (let i = 0; i < 3; i++) add(g, sph(0.07), skin, [0, 0.45 - i * 0.09, 0.2], [0, 0, 0], [1.5, 0.7, 0.6]);
  add(g, sph(0.16), skin, [-0.38, 0.7, 0], [0, 0, 0], [1, 0.9, 1]);
  add(g, sph(0.16), skin, [0.38, 0.7, 0], [0, 0, 0], [1, 0.9, 1]);
  const wingM2 = M(0x2a1410, { r: 0.6, ds: true, tex: 'skin' });
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(0.75, 0.6); sh.lineTo(0.95, 0.15); sh.quadraticCurveTo(0.8, 0.05, 0.7, -0.1); sh.quadraticCurveTo(0.55, -0.05, 0.45, -0.2); sh.quadraticCurveTo(0.3, -0.1, 0.2, -0.25); sh.closePath();
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(sh, 8), wingM2);
    wing.position.set(s * 0.22, 0.75, -0.2); wing.scale.set(s, 1, 1); wing.rotation.y = s * 0.6; wing.castShadow = true;
    g.add(wing);
    for (const [bx, by] of [[0.75, 0.6], [0.95, 0.15]]) limb(g, V3(s * 0.22, 0.75, -0.2), V3(s * (0.22 + bx * 0.8), 0.75 + by, -0.2 - bx * 0.45), 0.02, 0.008, hornM);
  }
  const tail = new THREE.CatmullRomCurve3([V3(0, 0.3, -0.25), V3(0.2, 0.15, -0.5), V3(0.45, 0.2, -0.55), V3(0.6, 0.35, -0.4)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(tail, 24, 0.035, 8), skin));
  add(g, cone(0.06, 0.12, 4), hornM, [0.63, 0.4, -0.37], [0, 0, -0.8]);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 5), M(0xff6010, { e: 0xff4000, ei: 3 }));
  rune.position.set(0, 0.6, 0.24); g.add(rune);
  const armL = new THREE.Group(); armL.position.set(-0.4, 0.7, 0); g.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.4, 0.7, 0); g.add(armR);
  for (const [arm, s] of [[armL, -1], [armR, 1]]) {
    limb(arm, V3(0, 0, 0), V3(s * 0.15, -0.28, 0.12), 0.1, 0.085, skin);
    limb(arm, V3(s * 0.15, -0.28, 0.12), V3(s * 0.12, -0.42, 0.3), 0.085, 0.07, skin);
    for (let k = 0; k < 3; k++) add(arm, cone(0.018, 0.1, 6), hornM, [s * 0.1 + (k - 1) * 0.04, -0.44, 0.38], [Math.PI / 2, 0, 0]);
    const chainM = M(0x5a5450, { m: 0.9, r: 0.35 });
    add(arm, new THREE.TorusGeometry(0.09, 0.022, 8, 20), chainM, [s * 0.14, -0.3, 0.16], [Math.PI / 2 + 0.6, 0, 0]);
    for (let k = 0; k < 4; k++) add(arm, new THREE.TorusGeometry(0.03, 0.009, 6, 12), chainM, [s * (0.16 + k * 0.035), -0.36 - k * 0.05, 0.18], [0, (k % 2) * Math.PI / 2, 0]);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0.05);
  g.add(head);
  add(head, sph(0.17), skin, [0, 0, 0], [0, 0, 0], [1, 1.1, 1]);
  add(head, box(0.22, 0.05, 0.08), skin, [0, 0.06, 0.13]);
  add(head, sph(0.035), eye, [-0.065, 0.02, 0.15]);
  add(head, sph(0.035), eye, [0.065, 0.02, 0.15]);
  add(head, box(0.15, 0.06, 0.06), M(0x120404), [0, -0.1, 0.14]);
  for (let i = 0; i < 6; i++) add(head, cone(0.012, 0.05, 6), tooth, [-0.06 + i * 0.024, -0.075, 0.16], [Math.PI, 0, 0]);
  horn(head, [V3(-0.12, 0.08, 0), V3(-0.3, 0.2, -0.02), V3(-0.38, 0.42, -0.08), V3(-0.3, 0.6, -0.14)], 0.055, hornM);
  horn(head, [V3(0.12, 0.08, 0), V3(0.3, 0.2, -0.02), V3(0.38, 0.42, -0.08), V3(0.3, 0.6, -0.14)], 0.055, hornM);
  g.scale.setScalar(1.18);
  return finish(g, { head, armL, armR, ring, kind: 'demon', h: 1.35 });
}

// ---------------- heroes (for portraits) ----------------
function knightBase(o) {
  const g = new THREE.Group();
  const steel = M(o.steel, { m: 0.9, r: 0.3 }), dark = M(0x050505);
  add(g, cyl(0.2, 0.17, 0.42, 20), o.torsoMat || steel, [0, 0.45, 0]);
  add(g, sph(0.13), steel, [-0.24, 0.62, 0], [0, 0, 0.3], [1.1, 0.8, 1]);
  add(g, sph(0.13), steel, [0.24, 0.62, 0], [0, 0, -0.3], [1.1, 0.8, 1]);
  limb(g, V3(-0.26, 0.58, 0), V3(-0.3, 0.28, 0.08), 0.06, 0.055, steel);
  limb(g, V3(0.26, 0.58, 0), V3(0.3, 0.3, 0.1), 0.06, 0.055, steel);
  add(g, cyl(0.08, 0.1, 0.08, 16), steel, [0, 0.7, 0]);
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0);
  g.add(head);
  if (o.greatHelm) {
    add(head, cyl(0.13, 0.13, 0.24, 24), steel, [0, 0, 0]);
    add(head, cyl(0.135, 0.135, 0.02, 24), steel, [0, 0.12, 0]);
    add(head, box(0.2, 0.025, 0.02), dark, [0, 0.02, 0.125]);
    add(head, box(0.025, 0.12, 0.02), dark, [0, -0.02, 0.128]);
  } else {
    add(head, sph(0.13), steel, [0, 0.02, 0], [0, 0, 0], [1, 1.15, 1.05]);
    add(head, cone(0.13, 0.12, 20), steel, [0, 0.16, 0.0]);
    add(head, box(0.16, 0.022, 0.02), dark, [0, 0.03, 0.13]);
    add(head, box(0.02, 0.1, 0.03), steel, [0, -0.03, 0.14]);
  }
  return { g, head, steel };
}
function paladin() {
  const { g, head } = knightBase({ steel: 0xb8bcc4 });
  const green = M(0x1f4a2c, { r: 0.9, ds: true, tex: 'cloth' });
  add(g, new THREE.TorusGeometry(0.13, 0.05, 8, 20), green, [0, 0.7, 0], [Math.PI / 2, 0, 0]);
  add(g, new THREE.PlaneGeometry(0.55, 0.7), green, [0, 0.35, -0.2], [0.15, 0, 0]);
  add(g, sph(0.05), M(0xd8b040, { m: 1, r: 0.3 }), [0, 0.55, 0.19]);
  add(g, box(0.035, 0.6, 0.01), M(0xdfe4ec, { m: 1, r: 0.2 }), [0.32, 0.5, 0.12], [0.1, 0, -0.1]);
  add(g, box(0.14, 0.025, 0.03), M(0xc9a040, { m: 1, r: 0.3 }), [0.32, 0.2, 0.12]);
  return finish(g, { head, kind: 'paladin', h: 1.05 });
}
function crusader() {
  const tabTex = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#e8e2d4'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#b01818';
    x.fillRect(w * 0.42, h * 0.12, w * 0.16, h * 0.76);
    x.fillRect(w * 0.18, h * 0.32, w * 0.64, h * 0.14);
  });
  const tabard = new THREE.MeshStandardMaterial({ map: tabTex, roughness: 0.9 });
  const { g, head } = knightBase({ steel: 0x9aa0a8, greatHelm: true });
  add(g, cyl(0.205, 0.22, 0.44, 20, 1), tabard, [0, 0.42, 0]);
  add(g, box(0.035, 0.62, 0.01), M(0xb01a14, { m: 0.8, r: 0.3 }), [0.32, 0.55, 0.12], [0.1, 0, -0.25]);
  add(g, box(0.15, 0.025, 0.03), M(0x6a5030, { m: 0.6 }), [0.29, 0.24, 0.12], [0, 0, -0.25]);
  const sh = add(g, box(0.3, 0.38, 0.03), M(0x1a1a1a, { m: 0.3, r: 0.6 }), [-0.3, 0.45, 0.14], [0, 0.3, 0.05]);
  add(g, box(0.05, 0.3, 0.035), M(0xf0ece4), [-0.3, 0.45, 0.15], [0, 0.3, 0.05]);
  add(g, box(0.22, 0.05, 0.035), M(0xf0ece4), [-0.3, 0.5, 0.15], [0, 0.3, 0.05]);
  return finish(g, { head, shield: sh, kind: 'crusader', h: 1.05 });
}

// ---------------- deck toy: the dragon ----------------
function dragon() {
  const g = new THREE.Group();
  const scale = M(0x8a1c12, { r: 0.45, m: 0.15, tex: 'scales' }), belly = M(0xd8a050, { r: 0.6, tex: 'cloth' });
  const hornM = M(0x2a1c14, { r: 0.4 }), tooth = M(0xf0e8d0, { r: 0.3 });
  const eye = M(0xffe040, { e: 0xffb000, ei: 3 }), mouthGlow = M(0xff6010, { e: 0xff4000, ei: 2.5 });
  const wingM = M(0x5a120c, { r: 0.7, ds: true, op: 0.95 });
  // curved neck rising out of the back
  const neckPts = [V3(0, 0.0, -0.55), V3(0, 0.45, -0.45), V3(0, 0.85, -0.2), V3(0, 1.05, 0.12)];
  const neck = new THREE.CatmullRomCurve3(neckPts);
  for (let i = 0; i <= 10; i++) {
    const p = neck.getPoint(i / 10), r = 0.24 - i * 0.008;
    add(g, sph(r, 14, 10), scale, [p.x, p.y, p.z]);
    add(g, sph(r * 0.8, 10, 8), belly, [p.x, p.y - 0.02, p.z + r * 0.45]);
    if (i % 2 === 0 && i < 10) add(g, cone(0.05, 0.16, 6), hornM, [p.x, p.y + r * 0.95, p.z - 0.04], [-0.4, 0, 0]);
  }
  // wings
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(0.9, 0.55); sh.lineTo(1.05, 0.05); sh.lineTo(0.8, -0.05); sh.lineTo(0.6, -0.25); sh.lineTo(0.35, -0.12); sh.lineTo(0.15, -0.3); sh.closePath();
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(sh), wingM);
    wing.position.set(s * 0.18, 0.55, -0.5);
    wing.scale.set(s, 1, 1);
    wing.rotation.y = s * 0.5;
    wing.castShadow = true;
    g.add(wing);
    g.userData['wing' + (s < 0 ? 'L' : 'R')] = wing;
  }
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.18);
  g.add(head);
  add(head, sph(0.22, 18, 12), scale, [0, 0, 0], [0, 0, 0], [1, 0.85, 1.1]);
  add(head, box(0.26, 0.13, 0.36), scale, [0, -0.02, 0.28]);
  add(head, box(0.2, 0.05, 0.2), mouthGlow, [0, -0.08, 0.3]);
  add(head, sph(0.04), M(0x200000, { e: 0xff3000, ei: 1.5 }), [-0.07, 0.04, 0.46]);
  add(head, sph(0.04), M(0x200000, { e: 0xff3000, ei: 1.5 }), [0.07, 0.04, 0.46]);
  add(head, box(0.3, 0.05, 0.08), scale, [0, 0.12, 0.08], [0.2, 0, 0]);
  add(head, sph(0.05), eye, [-0.12, 0.08, 0.14]);
  add(head, sph(0.05), eye, [0.12, 0.08, 0.14]);
  for (let i = 0; i < 6; i++) add(head, cone(0.016, 0.07, 6), tooth, [-0.1 + (i % 3) * 0.1 * (i < 3 ? 1 : 1), -0.1, 0.18 + (i < 3 ? 0.04 : 0.24)], [Math.PI, 0, 0]);
  horn(head, [V3(-0.12, 0.12, -0.05), V3(-0.22, 0.28, -0.2), V3(-0.25, 0.38, -0.42)], 0.05, hornM);
  horn(head, [V3(0.12, 0.12, -0.05), V3(0.22, 0.28, -0.2), V3(0.25, 0.38, -0.42)], 0.05, hornM);
  for (const s of [-1, 1]) add(head, cone(0.03, 0.14, 6), hornM, [s * 0.2, -0.02, -0.02], [0, 0, s * 1.3]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.09, 0.05);
  head.add(jaw);
  add(jaw, box(0.22, 0.06, 0.38), scale, [0, -0.03, 0.2]);
  for (let i = 0; i < 5; i++) add(jaw, cone(0.015, 0.06, 6), tooth, [-0.08 + i * 0.04, 0.02, 0.33]);
  // claws gripping the ledge
  for (const s of [-1, 1]) {
    limb(g, V3(s * 0.2, 0.35, -0.3), V3(s * 0.32, 0.05, 0.05), 0.08, 0.06, scale);
    for (let k = 0; k < 3; k++) add(g, cone(0.02, 0.1, 6), hornM, [s * 0.32 + (k - 1) * 0.04, 0.02, 0.12], [Math.PI / 2, 0, 0]);
  }
  return finish(g, { head, jaw, kind: 'dragon', h: 1.4 });
}

function rat() {
  const g = new THREE.Group();
  const fur = M(0x5a524a, { r: 0.9 }), pink = M(0xd89090, { r: 0.6 }), black = M(0x050505, { r: 0.2 });
  add(g, sph(0.3, 14, 10), fur, [0, 0.28, 0], [0, 0, 0], [0.75, 0.62, 1.1]);
  add(g, cone(0.2, 0.42, 12), fur, [0, 0.3, 0.42], [Math.PI / 2, 0, 0]);
  add(g, sph(0.04), pink, [0, 0.3, 0.64]);
  add(g, sph(0.035), black, [-0.09, 0.4, 0.42]);
  add(g, sph(0.035), black, [0.09, 0.4, 0.42]);
  add(g, cyl(0.08, 0.08, 0.02, 12), pink, [-0.12, 0.5, 0.32], [0.3, 0, 0.6]);
  add(g, cyl(0.08, 0.08, 0.02, 12), pink, [0.12, 0.5, 0.32], [0.3, 0, -0.6]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0.25, -0.3), V3(0.1, 0.18, -0.6), V3(-0.08, 0.12, -0.9), V3(0.05, 0.08, -1.15)]), 12, 0.025, 6), pink);
  g.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.15, 0.2], [0.15, 0.2], [-0.15, -0.2], [0.15, -0.2]]) legs.push(add(g, cap(0.05, 0.1), pink, [x, 0.08, z]));
  return finish(g, { tail, legs, kind: 'rat', h: 0.5 });
}

function lich() {
  const g = new THREE.Group();
  const robe = M(0x2a1a3a, { r: 0.85, tex: 'cloth' }), trim = M(0x9a7a20, { m: 0.8, r: 0.3 });
  const bone = M(0xd8d0b8, { r: 0.5 }), glow = M(0x6aff8a, { e: 0x3aff6a, ei: 3 }), dark = M(0x050308);
  add(g, cone(0.36, 0.9, 10), robe, [0, 0.45, 0]);
  add(g, new THREE.TorusGeometry(0.33, 0.025, 6, 20), trim, [0, 0.06, 0], [Math.PI / 2, 0, 0]);
  add(g, sph(0.16), robe, [-0.2, 0.72, 0], [0, 0, 0], [1.1, 0.8, 1]);
  add(g, sph(0.16), robe, [0.2, 0.72, 0], [0, 0, 0], [1.1, 0.8, 1]);
  const head = new THREE.Group(); head.position.set(0, 0.98, 0.02); g.add(head);
  add(head, new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), robe, [0, 0.02, -0.02], [-0.3, 0, 0]);
  add(head, sph(0.13), bone, [0, -0.02, 0.04], [0, 0, 0], [0.9, 1, 1]);
  add(head, sph(0.035), dark, [-0.045, 0.0, 0.14]);
  add(head, sph(0.035), dark, [0.045, 0.0, 0.14]);
  add(head, sph(0.02), glow, [-0.045, 0.0, 0.16]);
  add(head, sph(0.02), glow, [0.045, 0.0, 0.16]);
  add(head, box(0.1, 0.04, 0.06), bone, [0, -0.12, 0.08]);
  for (let i = 0; i < 5; i++) add(head, cone(0.02, 0.09, 5), trim, [-0.08 + i * 0.04, 0.16, 0.06], [0.2, 0, 0]);
  add(head, new THREE.TorusGeometry(0.11, 0.015, 8, 24), trim, [0, 0.12, 0.03], [Math.PI / 2 + 0.25, 0, 0]);
  const runes = new THREE.Group(); runes.position.y = 0.5; g.add(runes);
  const runeM = M(0x6aff8a, { e: 0x3aff6a, ei: 2.5 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 3), runeM); r2.position.set(Math.cos(a) * 0.45, Math.sin(i) * 0.08, Math.sin(a) * 0.45); runes.add(r2); }
  // arms + staff with glowing orb
  limb(g, V3(0.22, 0.72, 0), V3(0.32, 0.5, 0.15), 0.05, 0.04, robe);
  limb(g, V3(-0.22, 0.72, 0), V3(-0.3, 0.55, 0.18), 0.05, 0.04, robe);
  const staff = new THREE.Group(); staff.position.set(0.33, 0.5, 0.16); g.add(staff);
  add(staff, cyl(0.018, 0.018, 1.0, 8), M(0x3a2a1a), [0, 0.15, 0]);
  const orb = add(staff, sph(0.07), M(0x8affb0, { e: 0x40ff80, ei: 3, op: 0.9 }), [0, 0.7, 0]);
  for (let i = 0; i < 3; i++) add(staff, cone(0.015, 0.1, 5), bone, [Math.cos(i * 2.1) * 0.06, 0.62, Math.sin(i * 2.1) * 0.06], [0, 0, Math.cos(i * 2.1) * 0.5]);
  return finish(g, { head, staff, orb, runes, kind: 'lich', h: 1.2 });
}

function anvil() {
  const g = new THREE.Group();
  const iron = M(0x2e2c2a, { m: 0.85, r: 0.35 }), wood = M(0x5a3a1c, { r: 0.85 }), hot = M(0xff7a20, { e: 0xff5a00, ei: 2.5 });
  add(g, cyl(0.3, 0.36, 0.3, 12), wood, [0, 0.15, 0]);
  add(g, box(0.34, 0.12, 0.24), iron, [0, 0.36, 0]);
  add(g, box(0.18, 0.12, 0.16), iron, [0, 0.46, 0]);
  add(g, box(0.62, 0.1, 0.28), iron, [0, 0.57, 0]);
  add(g, cone(0.1, 0.32, 10), iron, [-0.46, 0.58, 0], [0, 0, Math.PI / 2]);
  add(g, box(0.34, 0.035, 0.07), hot, [0.06, 0.64, 0]);
  const arm = new THREE.Group(); arm.position.set(0.5, 0.45, -0.25); g.add(arm);
  add(arm, cyl(0.03, 0.03, 0.6, 8), wood, [-0.25, 0.3, 0.15], [0, 0, 0.9]);
  add(arm, box(0.2, 0.14, 0.14), iron, [-0.5, 0.48, 0.15]);
  add(g, cyl(0.05, 0.06, 0.5, 8), iron, [0.5, 0.25, -0.25]);
  return finish(g, { arm, kind: 'anvil', h: 0.9 });
}

function tombstone() {
  const g = new THREE.Group();
  const st = M(0x6a6670, { r: 0.9, flat: true });
  add(g, box(0.5, 0.6, 0.12), st, [0, 0.3, 0]);
  add(g, cyl(0.25, 0.25, 0.12, 16, 1), st, [0, 0.6, 0], [Math.PI / 2, 0, 0]);
  add(g, box(0.06, 0.28, 0.02), M(0x2a2830), [0, 0.42, 0.07]);
  add(g, box(0.2, 0.06, 0.02), M(0x2a2830), [0, 0.48, 0.07]);
  return finish(g, { kind: 'tomb', h: 0.85 });
}

export const MODELS = { goblin, skeleton, cyclops, mimic, demon, paladin, crusader, dragon, rat, lich, anvil, tombstone };

// Render a portrait of a model to a data URL (used for the UI and the dot-matrix display)
export function renderPortraits(list, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  let r;
  try { r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true }); }
  catch (e) { return {}; }
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  // studio environment so metal armour has something to reflect
  const envScene = new THREE.Scene();
  const panel = (col, pos, size) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); envScene.add(m); };
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), new THREE.MeshBasicMaterial({ color: 0x4a3a30, side: THREE.BackSide })));
  panel(0xfff0d8, [0, 8, 4], 8); panel(0xff9040, [-8, 2, -2], 6); panel(0x6080ff, [8, 3, -3], 5); panel(0xffffff, [3, 2, 8], 5);
  const pm = new THREE.PMREMGenerator(r);
  const envTex = pm.fromScene(envScene, 0.02).texture;
  const out = {};
  for (const { id, bg, focus = 0.72, dist = 1.0 } of list) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bg || 0x140c08);
    scene.environment = envTex;
    scene.add(new THREE.HemisphereLight(0xb0a090, 0x201008, 1.4));
    const key = new THREE.DirectionalLight(0xffe0b8, 2.6);
    key.position.set(1.2, 2, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff7a2a, 2.2);
    rim.position.set(-2, 1, -1.5);
    scene.add(rim);
    const model = MODELS[id]();
    scene.add(model);
    const h = model.userData.h * model.scale.y;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    cam.position.set(0.25 * dist, h * focus + 0.12, 2.0 * dist);
    cam.lookAt(0, h * focus, 0);
    r.render(scene, cam);
    out[id] = canvas.toDataURL('image/png');
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  r.dispose();
  try { r.forceContextLoss(); } catch (e) {}
  return out;
}
export { THREE };
