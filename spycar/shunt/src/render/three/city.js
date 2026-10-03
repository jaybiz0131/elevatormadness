// Neon City kit: modular buildings of varied height with emissive window patterns, invented signs and neon tubes, sidewalks, street
// lamps with fake light pools and cones, an overpass every so often, props every 10 to 20 m for parallax, steam vents, and the
// stretched reflection sprites that sell the wet road. Static geometry is merged per 400 pt chunk; repeated props are instanced.
// Everything is placed from hashes of the road seed and s, so the same seed always builds the same street.
import { BoxGeometry, BufferGeometry, Mesh, MeshStandardMaterial, MeshBasicMaterial, Color, Group, CanvasTexture, InstancedMesh, Object3D, PlaneGeometry, DoubleSide, RepeatWrapping, NearestFilter, SRGBColorSpace, Float32BufferAttribute, CylinderGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REF, hashI } from '../../sim/constants.js';
import { M, toWorld } from './scale.js';
import { CHUNK } from './road.js';
const D = new Object3D(), V = new Vector3();
const BRANDS = ['KIRA', 'DRIFT DINER', 'OKAMI TYRES', 'NEON 9', 'ZEN-DO', 'PULSE', 'KUMO HOTEL', 'HOTARU', 'RAMEN 24', 'VOLT', 'SAKURA FM', 'MIDNIGHT GARAGE', 'TORII', 'ASTRA', 'HANABI', 'GHOST NOODLE', 'LUNA BAR', 'NOVA', 'KITSUNE', 'TAXI 7'];
const NEON = ['#ff2fd0', '#22e6ff', '#ffb02a', '#ff5a5a', '#8cff5a'];
const hash = (seed, i, salt = 0) => hashI(seed ^ Math.imul(salt + 1, 0x27d4eb2f), i) / 4294967296;
// a facade atlas: dark wall with a grid of windows, some lit warm, some cool, most dark; tiled by building size
function facadeTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d'); x.fillStyle = '#0d0f17'; x.fillRect(0, 0, S, S);
  const e = document.createElement('canvas'); e.width = S; e.height = S; const ex = e.getContext('2d'); ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const rng = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const px = i * 32 + 6, py = j * 32 + 8; const lit = rng(); const warm = rng() < 0.6; const col = lit < 0.42 ? (warm ? '#ffd9a0' : '#a8d8ff') : lit < 0.55 ? '#3a3f55' : '#171a26'; x.fillStyle = col; x.fillRect(px, py, 20, 16); if (lit < 0.42) { ex.fillStyle = warm ? '#ffb86a' : '#7ec6ff'; ex.globalAlpha = 0.5 + rng() * 0.5; ex.fillRect(px, py, 20, 16); ex.globalAlpha = 1; } }
  const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.magFilter = NearestFilter; const te = new CanvasTexture(e); te.wrapS = te.wrapT = RepeatWrapping; te.colorSpace = SRGBColorSpace; te.magFilter = NearestFilter; return { map: t, emissive: te };
}
function signTexture(text, col) { const w = 512, h = 128, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.font = '700 ' + (text.length > 10 ? 54 : 72) + 'px Rajdhani, "Avenir Next Condensed", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = col; x.shadowBlur = 18; x.fillStyle = col; x.fillText(text, w / 2, h / 2 + 4); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.55; x.fillText(text, w / 2, h / 2 + 4); const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t; }
// a building box with per-face UVs sized so a window is 2.5 m wide and 3 m tall; colour tint per building
function building(w, h, d, x, y, z, tint, uOff) {
  const g = new BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); const uv = g.attributes.uv; const pos = g.attributes.position; const n = pos.count; const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 verts each; scale UVs by the face's size in windows
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) { const [fw, fh] = faces[f]; for (let k = 0; k < 4; k++) { const i = f * 4 + k; const u = uv.getX(i), v = uv.getY(i); if (f === 2 || f === 3) uv.setXY(i, 0.02, 0.98); else uv.setXY(i, uOff + u * fw / 2.5 / 8, v * fh / 3 / 8); } }
  g.setAttribute('color', new Float32BufferAttribute(col, 3)); return g;
}
export class City {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx; this.group = new Group(); scene.add(this.group); this.chunks = new Map(); this.signTex = new Map();
    const tex = facadeTexture(); this.mat = new MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: new Color('#ffffff'), emissiveIntensity: 1.6, vertexColors: true, roughness: 0.85, metalness: 0.05 });
    this.tubeMat = new MeshBasicMaterial({ color: new Color(1, 1, 1) });
    this.tubes = new InstancedMesh(new BoxGeometry(1, 1, 1), this.tubeMat, 512); this.tubes.count = 0; this.tubes.frustumCulled = false; this.tubes.instanceColor = null; this.group.add(this.tubes);
    this.signMats = []; this.signs = []; this.signPool = [];
    const std = (c) => new MeshStandardMaterial({ color: new Color(c), roughness: 0.8 });
    this.bollard = this.inst(new CylinderGeometry(0.15, 0.18, 1, 6).translate(0, 0.5, 0), std('#8a929e'), 128);
    this.bench = this.inst(new BoxGeometry(1.8, 0.45, 0.6).translate(0, 0.45, 0), std('#5a4634'), 48);
    this.vending = this.inst(new BoxGeometry(1, 1.9, 0.8).translate(0, 0.95, 0), new MeshStandardMaterial({ color: new Color('#223'), emissive: new Color('#7ad8ff'), emissiveIntensity: 1.2, roughness: 0.5 }), 48);
    this.hydrant = this.inst(new CylinderGeometry(0.18, 0.22, 0.8, 6).translate(0, 0.4, 0), std('#ff3b3b'), 48);
    this.pillar = this.inst(new BoxGeometry(1.6, 7, 1.6).translate(0, 3.5, 0), std('#3a3f4c'), 24);
    this.beam = this.inst(new BoxGeometry(1, 1, 1), std('#2c3038'), 12);
    this.vent = this.inst(new CylinderGeometry(0.6, 0.7, 0.3, 8).translate(0, 0.15, 0), std('#4a4f5a'), 32);
    this.props = [this.bollard, this.bench, this.vending, this.hydrant, this.pillar, this.beam, this.vent];
    this.vents = []; this.lamps = []; this.signSpots = [];
    this.seed = 0; this.neon = 1; this.wet = 1; this.steam = 0.6;
  }
  inst(geo, mat, n) { const m = new InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = true; m.frustumCulled = false; this.group.add(m); return m; }
  put(m, road, x, s, yaw, sx = 1, sy = 1, sz = 1, lift = 0) { if (m.count >= m.instanceMatrix.count) return; toWorld(road, x, s, D.position); D.position.y += lift; D.rotation.set(0, -(road.frame(s).psi + yaw), 0); D.scale.set(sx, sy, sz); D.updateMatrix(); m.setMatrixAt(m.count++, D.matrix); }
  // one chunk of street: buildings on both sides set back behind a sidewalk, with neon tubes and a sign or two
  buildChunk(G, k) {
    const road = G.road, seed = road.seed; const s0 = k * CHUNK; const parts = []; const tubes = []; const signs = []; const tint = new Color();
    for (const side of [-1, 1]) {
      let s = s0; let i = 0;
      while (s < s0 + CHUNK - 40) {
        const h1 = hash(seed, Math.round(s) + side * 7, 1), h2 = hash(seed, Math.round(s) + side * 7, 2), h3 = hash(seed, Math.round(s) + side * 7, 3);
        const len = 120 + h1 * 160; const tower = h3 > 0.72; const depth = tower ? 16 + h2 * 12 : 8 + h2 * 6; const height = tower ? 24 + (h3 - 0.72) * 70 : 5 + h3 * 12;
        const a = road.at(s + len / 2); const w = a.width; const x = REF + side * (w / 2 + (tower ? 330 + 120 * h2 : 66) + depth / 2 / M);
        toWorld(road, x, s + len / 2, V); const yaw = -(road.frame(s + len / 2).psi);
        tint.setHSL(0.6 + h2 * 0.15, 0.25, 0.09 + h1 * 0.06);
        const g = building(len * M * 0.92, height, depth, 0, 0, 0, tint, Math.floor(h3 * 8) / 8); g.rotateY(yaw); g.translate(V.x, 0, V.z); parts.push(g);
        // neon tube along the roof edge facing the road, and a sign on the facade for some buildings
        const nc = new Color(NEON[Math.floor(h1 * NEON.length)]); const inner = x - side * depth / 2 / M;
        tubes.push({ x: inner, s: s + len / 2, len: len * M * 0.9, y: height - 0.3, col: nc }); if (h2 > 0.5) tubes.push({ x: inner, s: s + len / 2, len: len * M * 0.9, y: 4.0, col: new Color(NEON[Math.floor(h3 * NEON.length)]) });
        if (h3 > 0.35 && len > 160) signs.push({ x: inner - side * 0.1 / M, s: s + len / 2, y: Math.min(height - 3, 7 + h1 * 6), w: Math.min(len * M * 0.7, 9), text: BRANDS[Math.floor(hash(seed, Math.round(s), 4) * BRANDS.length)], col: NEON[Math.floor(h2 * NEON.length)], side });
        s += len + 20 + h2 * 40; i++;
      }
    }
    const merged = mergeGeometries(parts, false); for (const p of parts) p.dispose(); merged.computeBoundingSphere();
    const mesh = new Mesh(merged, this.mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = { tubes, signs }; return mesh;
  }
  update(G, rdist, elapsed, look) {
    const road = G.road; if (this.seed !== road.seed) { this.reset(); this.seed = road.seed; }
    const k0 = Math.floor((rdist - 400) / CHUNK), k1 = Math.floor((rdist + 1500) / CHUNK);
    for (let k = k0; k <= k1; k++) if (!this.chunks.has(k)) { const m = this.buildChunk(G, k); this.chunks.set(k, m); this.group.add(m); }
    for (const [k, m] of this.chunks) if (k < k0 - 1 || k > k1 + 1) { this.group.remove(m); m.geometry.dispose(); this.chunks.delete(k); }
    // neon tubes and signs from the live chunks; lamps, overpasses, vents and parallax props from s; light pools and reflections to fx
    this.tubes.count = 0; let si = 0; for (const p of this.props) p.count = 0;
    const neonOn = this.neon;
    for (const [, m] of this.chunks) {
      for (const t of m.userData.tubes) { if (this.tubes.count >= 512) break; toWorld(road, t.x, t.s, D.position); D.position.y = t.y; D.rotation.set(0, -(road.frame(t.s).psi), 0); D.scale.set(0.25, 0.25, t.len); D.updateMatrix(); this.tubes.setMatrixAt(this.tubes.count, D.matrix); this.setTubeColor(this.tubes.count, t.col, neonOn); this.tubes.count++;
        this.fx.reflect(G, t.x, t.s, t.col, 0.35 * neonOn * this.wet, t.len); }
      for (const sg of m.userData.signs) { let mesh = this.signPool[si]; if (!mesh) { mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false })); mesh.renderOrder = 4; this.signPool.push(mesh); this.group.add(mesh); } si++;
        let tex = this.signTex.get(sg.text + sg.col); if (!tex) { tex = signTexture(sg.text, sg.col); this.signTex.set(sg.text + sg.col, tex); } if (mesh.material.map !== tex) { mesh.material.map = tex; mesh.material.needsUpdate = true; }
        mesh.material.color.setScalar(0.6 + 1.6 * neonOn); mesh.material.opacity = 0.35 + 0.65 * neonOn; toWorld(road, sg.x, sg.s, mesh.position); mesh.position.y = sg.y; mesh.rotation.set(0, -(road.frame(sg.s).psi) + (sg.side > 0 ? -Math.PI / 2 : Math.PI / 2), 0); mesh.scale.set(sg.w, sg.w / 4, 1); mesh.visible = true;
        this.fx.reflect(G, sg.x, sg.s, new Color(sg.col), 0.5 * neonOn * this.wet, sg.w); }
    }
    for (let i = si; i < this.signPool.length; i++) this.signPool[i].visible = false;
    if (this.tubes.count) { this.tubes.instanceMatrix.needsUpdate = true; if (this.tubes.instanceColor) this.tubes.instanceColor.needsUpdate = true; }
    const sA = Math.floor((rdist - 300) / 20) * 20, sB = rdist + 1400;
    for (let s = sA; s <= sB; s += 20) {
      const a = road.at(s); const w = a.width; const h = hash(road.seed, s / 20, 9);
      if (s % 160 === 80) for (const side of [-1, 1]) { const x = REF + side * (w / 2 + 34); this.fx.pool(G, x, s, 1.0, 0.72, 0.38, 0.14 + 0.08 * neonOn, 3.6); this.fx.reflect(G, x, s, LAMP_COL, 0.18 * this.wet, 4); }   // lamp light pools (the posts come from props)
      if (s % 20 === 0 && !(a.corner && a.corner.hard)) { const side = h < 0.5 ? -1 : 1; const kind = Math.floor(h * 977) % 5; const x = REF + side * (w / 2 + 44 + (h * 31 % 1) * 20);
        if (kind === 0) this.put(this.bollard, road, x, s, 0); else if (kind === 1 && s % 40 === 0) this.put(this.bench, road, x, s, side > 0 ? Math.PI / 2 : -Math.PI / 2); else if (kind === 2 && s % 60 === 0) this.put(this.vending, road, x + side * 20, s, side > 0 ? -Math.PI / 2 : Math.PI / 2); else if (kind === 3 && s % 40 === 0) this.put(this.hydrant, road, x, s, 0); }
      if (s % 3200 === 1600 && !(a.corner)) { for (const side of [-1, 1]) this.put(this.pillar, road, REF + side * (w / 2 + 26), s, 0); this.put(this.beam, road, REF, s, 0, (w + 90) * M, 1.4, 4, 7); }   // overpass
      if (s % 1200 === 600) { const side = h < 0.5 ? -1 : 1; const x = REF + side * (w / 2 + 24); this.put(this.vent, road, x, s, 0); const n = 6; for (let j = 0; j < n; j++) { const ph = ((elapsed * 0.35 + j / n + h) % 1); toWorld(road, x + (ph * 10 - 2) * side, s + 10, V); this.fx.puff(V.x, V.y + 0.3 + ph * 4.5, V.z, 0.5 + ph * 1.6, (1 - ph) * 0.35 * this.steam, 0.75, 0.78, 0.84); } }
    }
    for (const p of this.props) if (p.count) p.instanceMatrix.needsUpdate = true;
  }
  setTubeColor(i, col, k) { if (!this.tubes.instanceColor) { this.tubes.instanceColor = new (Object.getPrototypeOf(this.tubes.instanceMatrix).constructor)(new Float32Array(512 * 3), 3); } const b = 0.4 + 2.6 * k; this.tubes.instanceColor.setXYZ(i, col.r * b, col.g * b, col.b * b); }
  setLook(P) { this.neon = P.neon; this.wet = P.wet; this.steam = P.steam; this.mat.emissiveIntensity = 0.8 + 1.0 * P.neon; this.vending.material.emissiveIntensity = 0.5 + P.neon; }
  reset() { for (const [, m] of this.chunks) { this.group.remove(m); m.geometry.dispose(); } this.chunks.clear(); }
}
const LAMP_COL = new Color('#ffd9a0');
