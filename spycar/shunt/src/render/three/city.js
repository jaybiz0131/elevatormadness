// Neon City kit: modular buildings of varied height with emissive window patterns, invented signs and neon tubes, sidewalks, street
// lamps with fake light pools and cones, an overpass every so often, props every 10 to 20 m for parallax, steam vents, and the
// stretched reflection sprites that sell the wet road. Static geometry is merged per 400 pt chunk; repeated props are instanced.
// Everything is placed from hashes of the road seed and s, so the same seed always builds the same street.
import { Box3, BoxGeometry, BufferGeometry, Mesh, MeshStandardMaterial, MeshBasicMaterial, Color, Group, CanvasTexture, InstancedMesh, Object3D, PlaneGeometry, DoubleSide, InstancedBufferAttribute, DynamicDrawUsage, LinearFilter, RepeatWrapping, NearestFilter, SRGBColorSpace, Float32BufferAttribute, CylinderGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REF, hashI } from '../../sim/constants.js';
import { M, toWorld } from './scale.js';
import { CHUNK, AHEAD } from './road.js';
import { KIT, kitMaterial, kitGlow } from './kit.js';
import { PROP_BLINK } from './propModels.js';
import { Q } from '../../quality.js';
const D = new Object3D(), V = new Vector3(), V2 = new Vector3();
const BRANDS = ['KIRA', 'DRIFT DINER', 'OKAMI TYRES', 'NEON 9', 'ZEN-DO', 'PULSE', 'KUMO HOTEL', 'HOTARU', 'RAMEN 24', 'VOLT', 'SAKURA FM', 'MIDNIGHT GARAGE', 'TORII', 'ASTRA', 'HANABI', 'GHOST NOODLE', 'LUNA BAR', 'NOVA', 'KITSUNE', 'TAXI 7'];
const NEON = ['#ff2fd0', '#22e6ff', '#ffb02a', '#ff5a5a', '#8cff5a'];
const hash = (seed, i, salt = 0) => hashI(seed ^ Math.imul(salt + 1, 0x27d4eb2f), i) / 4294967296;
// a facade atlas: dark wall with a grid of windows, some lit warm, some cool, most dark; tiled by building size
function facadeTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d'); x.fillStyle = '#0d0f17'; x.fillRect(0, 0, S, S);
  const e = document.createElement('canvas'); e.width = S; e.height = S; const ex = e.getContext('2d'); ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const rng = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const px = i * 32 + 6, py = j * 32 + 8; const lit = rng(); const warm = rng() < 0.6; const col = lit < 0.42 ? (warm ? '#ffd9a0' : '#a8d8ff') : lit < 0.55 ? '#3a3f55' : '#171a26'; x.fillStyle = col; x.fillRect(px, py, 20, 16); if (lit < 0.42) { ex.fillStyle = warm ? '#ffb86a' : '#7ec6ff'; ex.globalAlpha = 0.5 + rng() * 0.5; ex.fillRect(px, py, 20, 16); ex.globalAlpha = 1; } }
  // two whole cells (bottom row, first two columns) are solid swatches for the merged shopfronts: big enough to survive mipmapping
  x.fillStyle = '#ffe2b0'; x.fillRect(0, 224, 32, 32); ex.globalAlpha = 1; ex.fillStyle = '#ffb86a'; ex.fillRect(0, 224, 32, 32); x.fillStyle = '#c8ecff'; x.fillRect(32, 224, 32, 32); ex.fillStyle = '#6ac8ff'; ex.fillRect(32, 224, 32, 32);
  const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.magFilter = NearestFilter; const te = new CanvasTexture(e); te.wrapS = te.wrapT = RepeatWrapping; te.colorSpace = SRGBColorSpace; te.magFilter = NearestFilter; return { map: t, emissive: te };
}
// the neon signs share one atlas (8 columns by 13 rows of 256 by 64 cells, drawn on first use: 20 names in 5 colours is at most 100) and one
// instanced mesh, so every sign on screen is a single draw call
const SIGN_COLS = 8, SIGN_ROWS = 13, SIGN_W = 256, SIGN_H = 64;
function drawSign(x, text, col, ox, oy) { x.save(); x.beginPath(); x.rect(ox, oy, SIGN_W, SIGN_H); x.clip(); x.fillStyle = '#000'; x.fillRect(ox, oy, SIGN_W, SIGN_H); x.font = '700 ' + (text.length > 10 ? 27 : 36) + 'px Rajdhani, "Avenir Next Condensed", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = col; x.shadowBlur = 9; x.fillStyle = col; x.fillText(text, ox + SIGN_W / 2, oy + SIGN_H / 2 + 2); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.55; x.fillText(text, ox + SIGN_W / 2, oy + SIGN_H / 2 + 2); x.restore(); }
function signAtlas() { const c = document.createElement('canvas'); c.width = SIGN_COLS * SIGN_W; c.height = SIGN_ROWS * SIGN_H; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.generateMipmaps = false; t.minFilter = LinearFilter; t.userData = { ctx: x, cells: new Map() }; return t; }
// a building box with per-face UVs sized so a window is 2.5 m wide and 3 m tall; colour tint per building
function building(w, h, d, x, y, z, tint, uOff) {
  const g = new BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); const uv = g.attributes.uv; const pos = g.attributes.position; const n = pos.count; const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 verts each; scale UVs by the face's size in windows
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) { const [fw, fh] = faces[f]; for (let k = 0; k < 4; k++) { const i = f * 4 + k; const u = uv.getX(i), v = uv.getY(i); if (f === 2 || f === 3) uv.setXY(i, 0.02, 0.98); else uv.setXY(i, uOff + u * fw / 2.5 / 8, v * fh / 3 / 8); } }
  g.setAttribute('color', new Float32BufferAttribute(col, 3)); return g;
}
// a detail box sampling one swatch of the facade atlas (u, v) with a flat tint: shopfronts, awnings, roof units, parapets
const SWATCH = { roof: [0.02, 0.98], warm: [0.0625, 0.0625], cool: [0.1875, 0.0625] };
function detail(w, h, d, x, y, z, sw, tint) { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, sw[0], sw[1]); const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; } g.setAttribute('color', new Float32BufferAttribute(col, 3)); return g; }
const WHITE = new Color(1, 1, 1);
export class City {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx; this.group = new Group(); scene.add(this.group); this.chunks = new Map(); this.signTex = new Map();
    const tex = facadeTexture(); this.mat = new MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: new Color('#ffffff'), emissiveIntensity: 1.6, vertexColors: true, roughness: 0.85, metalness: 0.05 });
    this.tubeMat = new MeshBasicMaterial({ color: new Color(1, 1, 1) });
    this.tubes = new InstancedMesh(new BoxGeometry(1, 1, 1), this.tubeMat, 512); this.tubes.count = 0; this.tubes.frustumCulled = false; this.tubes.instanceColor = null; this.group.add(this.tubes);
    this.signMats = []; this.signs = []; this.signAtlas = signAtlas();
    this.signCell = new InstancedBufferAttribute(new Float32Array(256 * 2), 2); this.signCell.setUsage(DynamicDrawUsage);
    const sg = new PlaneGeometry(1, 1); sg.setAttribute('aCell', this.signCell);
    const sm = new MeshBasicMaterial({ map: this.signAtlas, transparent: true, side: DoubleSide, depthWrite: false });
    sm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (vMapUv + aCell) * vec2(1.0 / ' + SIGN_COLS.toFixed(1) + ', 1.0 / ' + SIGN_ROWS.toFixed(1) + ');\n#endif'); };
    this.signMesh = new InstancedMesh(sg, sm, 256); this.signMesh.count = 0; this.signMesh.frustumCulled = false; this.signMesh.renderOrder = 4; this.group.add(this.signMesh);
    const kit = kitMaterial();
    this.bollard = this.inst(KIT.bollard(), kit, 128);
    this.bench = this.inst(KIT.bench(), kit, 48);
    this.vending = this.inst(KIT.vending(), kit, 48);
    this.hydrant = this.inst(KIT.hydrant(), kit, 48);
    this.pillar = this.inst(KIT.pillar(), kit, 24);
    this.beam = this.inst(KIT.deck(), kit, 12);
    this.vent = this.inst(KIT.vent(), kit, 32);
    this.lamp = this.inst(KIT.lamp(), kit, 64);
    this.props = [this.bollard, this.bench, this.vending, this.hydrant, this.pillar, this.beam, this.vent, this.lamp];
    this.glb = {}; this.sfDepth = 3.4; this.boxes = []; this.nBoxes = 0; this.near = 0;
    this.vents = []; this.lamps = []; this.signSpots = [];
    this.warm = true; this.seed = 0; this.neon = 1; this.wet = 1; this.steam = 0.6;
  }
  inst(geo, mat, n) { const m = new InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = Q.castProps; m.frustumCulled = false; this.group.add(m); return m; }
  put(m, road, x, s, yaw, sx = 1, sy = 1, sz = 1, lift = 0) { if (m.count >= m.instanceMatrix.count) return; toWorld(road, x, s, D.position); D.position.y += lift; D.rotation.set(0, -(road.frame(s).psi + yaw), 0); D.scale.set(sx, sy, sz); D.updateMatrix(); m.setMatrixAt(m.count++, D.matrix);
    // the big imported buildings near the car are boxes the camera tests its view against (a raycast cannot see into an InstancedMesh whose bounds were taken when it was empty)
    if (m.userData.occ && Math.abs(s - this.near) < 420 && this.nBoxes < 64) { const b = this.boxes[this.nBoxes] || (this.boxes[this.nBoxes] = new Box3()); this.nBoxes++; b.copy(m.geometry.boundingBox || m.geometry.computeBoundingBox() || m.geometry.boundingBox).applyMatrix4(D.matrix); } }
  // one chunk of street: buildings on both sides set back behind a sidewalk, with neon tubes and a sign or two
  // Jack's prop models (propModels.js): street lamps, storefronts, newsstands, phone booths, rooftop AC and the three landmarks
  // replace or join the kit pieces; set before the first chunk is built
  setPropModels(meshes) { for (const n of ['street_lamp', 'storefront', 'newsstand', 'phone_booth', 'rooftop_ac', 'hotel_tower', 'radio_tower', 'parking_garage']) if (meshes[n]) { this.glb[n] = meshes[n]; this.props.push(meshes[n]); if (meshes[n].geometry && !meshes[n].geometry.boundingBox) meshes[n].geometry.computeBoundingBox(); meshes[n].userData.occ = ['storefront', 'hotel_tower', 'parking_garage'].includes(n); }
    if (this.glb.storefront) { this.glb.storefront.geometry.computeBoundingBox(); const b = this.glb.storefront.geometry.boundingBox; this.sfDepth = b.max.z - b.min.z; } this.reset(); }
  buildChunk(G, k) {
    const road = G.road, seed = road.seed; const s0 = k * CHUNK; const parts = []; const tubes = []; const signs = []; const fronts = [], roofs = []; const tint = new Color();
    for (const side of [-1, 1]) {
      let s = s0; let i = 0;
      while (s < s0 + CHUNK - 40) {
        const h1 = hash(seed, Math.round(s) + side * 7, 1), h2 = hash(seed, Math.round(s) + side * 7, 2), h3 = hash(seed, Math.round(s) + side * 7, 3);
        const len = 120 + h1 * 160;
        // a landmark's plot stays clear of street buildings on its side
        if (LANDMARKS.some(lm => this.glb[lm.name] && lm.side === side && Math.abs(s + len / 2 - lm.s) < lm.clear)) { s += len + 20 + h2 * 40; i++; continue; }
        const a = road.at(s + len / 2); const w = a.width;
        // no towers round a hard corner (1,300 pt before to 700 pt after it): the chase camera swings across the inside of the bend and
        // used to end up inside a 40 m block; here every building is 7 m or less, well under the camera's height
        const tight = road.corners.some(c => c.hard && s + len / 2 > c.s0 - 1300 && s + len / 2 < c.s1 + 700);
        // round a tight bend a building on the inside lands on the road's other arc (the offset is wider than the radius): leave that plot empty
        if (tight) { toWorld(road, REF + side * (w / 2 + 66 + 8 / M), s + len / 2, V); let clash = false; for (let s2 = s - 500; s2 <= s + 500 && !clash; s2 += 25) { if (Math.abs(s2 - (s + len / 2)) < 90) continue; toWorld(road, REF, s2, V2); if (Math.hypot(V.x - V2.x, V.z - V2.z) < (road.at(s2).width / 2 + 60) * M) clash = true; } if (clash) { s += len + 20 + h2 * 40; i++; continue; } }
        const tower = h3 > 0.72 && !tight; const depth = tower ? 16 + h2 * 12 : 8 + h2 * 6; const height = tower ? 24 + (h3 - 0.72) * 70 : tight ? Math.min(7, 3 + h3 * 5) : 5 + h3 * 12; const x = REF + side * (w / 2 + (tower ? 330 + 120 * h2 : 66) + depth / 2 / M);
        toWorld(road, x, s + len / 2, V); const yaw = -(road.frame(s + len / 2).psi);
        tint.setHSL(0.6 + h2 * 0.15, 0.25, 0.09 + h1 * 0.06);
        // the box runs along the road (z) with its depth across (x); the road-facing facade is at x = -side * depth / 2
        const L = len * M * 0.92, fx = -side * depth / 2; const local = [building(depth, height, L, 0, 0, 0, tint, Math.floor(h3 * 8) / 8)];
        const glbFront = !tower && this.glb.storefront && L >= 7, glbRoof = !tower && this.glb.rooftop_ac;
        if (glbFront) fronts.push({ x: x - side * (depth / 2 + this.sfDepth / 2 - 1.5) / M, s: s + len / 2, yaw: side * Math.PI / 2 });   // shopfront model, its back 1.5 m into the facade
        if (glbRoof) for (let r = 0; r < 1; r++) { const hr = hash(seed, Math.round(s) + side * 7 + r * 13, 5); roofs.push({ x: x + side * (hr - 0.5) * depth * 0.4 / M, s: s + len / 2 + (r - 0.5) * L * 0.5 / M, y: height + 0.6, yaw: hr * 6.283 }); }
        if (!tower && !glbFront) { const sw = h1 > 0.5 ? SWATCH.warm : SWATCH.cool; local.push(detail(0.25, 2.6, L * 0.86, fx - side * 0.1, 1.5, 0, sw, WHITE), detail(1.4, 0.18, L * 0.9, fx - side * 0.7, 3.1, 0, SWATCH.roof, tint)); }   // lit shopfront and an awning over it
        local.push(detail(depth + 0.3, 0.6, L + 0.3, 0, height + 0.3, 0, SWATCH.roof, tint));   // parapet
        for (let r = 0; r < (tower ? 3 : glbRoof ? 0 : 2); r++) { const hr = hash(seed, Math.round(s) + side * 7 + r * 13, 5); local.push(detail(1.6 + hr * 1.6, 1.0 + hr, 2 + hr * 2, (hr - 0.5) * depth * 0.5, height + 0.6 + (0.5 + hr / 2), (r - 1) * L * 0.28, SWATCH.roof, tint.clone().multiplyScalar(1.5))); }   // roof units
        const g = mergeGeometries(local, false); for (const q of local) q.dispose(); g.rotateY(yaw); g.translate(V.x, 0, V.z); parts.push(g);
        // neon tube along the roof edge facing the road, and a sign on the facade for some buildings
        const nc = new Color(NEON[Math.floor(h1 * NEON.length)]); const inner = x - side * depth / 2 / M;
        tubes.push({ x: inner, s: s + len / 2, len: len * M * 0.9, y: height - 0.3, col: nc }); if (h2 > 0.5) tubes.push({ x: inner, s: s + len / 2, len: len * M * 0.9, y: 4.0, col: new Color(NEON[Math.floor(h3 * NEON.length)]) });
        if (h3 > 0.35 && len > 160) signs.push({ x: inner - side * 0.1 / M, s: s + len / 2, y: Math.min(height - 3, 7 + h1 * 6), w: Math.min(len * M * 0.7, 9), text: BRANDS[Math.floor(hash(seed, Math.round(s), 4) * BRANDS.length)], col: NEON[Math.floor(h2 * NEON.length)], side });
        s += len + 20 + h2 * 40; i++;
      }
    }
    const merged = mergeGeometries(parts, false); for (const p of parts) p.dispose(); merged.computeBoundingSphere();
    const mesh = new Mesh(merged, this.mat); mesh.castShadow = Q.castCity; mesh.receiveShadow = true; mesh.userData = { tubes, signs, fronts, roofs, s0 }; return mesh;
  }
  update(G, rdist, elapsed, look) {
    const road = G.road; if (this.seed !== road.seed) { this.reset(); this.seed = road.seed; }
    const k0 = Math.floor((rdist - 400) / CHUNK), k1 = Math.floor((rdist + AHEAD) / CHUNK); let built = 0;   // the street is built as far as the road (4,000 pt), inside the fog floor; 3 new chunks a frame at most
    for (let k = k0; k <= k1; k++) if (!this.chunks.has(k) && (this.warm || built < 3)) { const m = this.buildChunk(G, k); this.chunks.set(k, m); this.group.add(m); built++; }
    this.warm = false;
    for (const [k, m] of this.chunks) if (k < k0 - 1 || k > k1 + 1) { this.group.remove(m); m.geometry.dispose(); this.chunks.delete(k); }
    // neon tubes and signs from the live chunks; lamps, overpasses, vents and parallax props from s; light pools and reflections to fx
    this.tubes.count = 0; let si = 0; for (const p of this.props) p.count = 0; this.nBoxes = 0; this.near = rdist;
    const neonOn = this.neon;
    for (const [, m] of this.chunks) {
      if (m.userData.s0 > rdist + 1900) continue;   // far chunks are plain building blocks: tubes, signs and models stop about 140 m ahead
      // the detailed models stop about 90 m ahead (beyond that they are specks in the fog): the triangle budget
      if (this.glb.storefront) for (const f of m.userData.fronts) if (f.s < rdist + Q.detail) this.put(this.glb.storefront, road, f.x, f.s, f.yaw);
      if (this.glb.rooftop_ac) for (const r of m.userData.roofs) if (r.s < rdist + Q.detail) this.put(this.glb.rooftop_ac, road, r.x, r.s, r.yaw, 1, 1, 1, r.y);
      for (const t of m.userData.tubes) { if (this.tubes.count >= 512) break; toWorld(road, t.x, t.s, D.position); D.position.y = t.y; D.rotation.set(0, -(road.frame(t.s).psi), 0); D.scale.set(0.25, 0.25, t.len); D.updateMatrix(); this.tubes.setMatrixAt(this.tubes.count, D.matrix); this.setTubeColor(this.tubes.count, t.col, neonOn); this.tubes.count++;
        this.fx.reflect(G, t.x, t.s, t.col, 0.7 * neonOn * this.wet, t.len); }
      for (const sg of m.userData.signs) { if (si >= 256) break; const key = sg.text + sg.col, at = this.signAtlas.userData; let cell = at.cells.get(key); if (!cell) { const n = at.cells.size; cell = [n % SIGN_COLS, SIGN_ROWS - 1 - Math.floor(n / SIGN_COLS)]; at.cells.set(key, cell); drawSign(at.ctx, sg.text, sg.col, (n % SIGN_COLS) * SIGN_W, Math.floor(n / SIGN_COLS) * SIGN_H); this.signAtlas.needsUpdate = true; }
        this.signCell.setXY(si, cell[0], cell[1]); toWorld(road, sg.x, sg.s, D.position); D.position.y = sg.y; D.rotation.set(0, -(road.frame(sg.s).psi) + (sg.side > 0 ? -Math.PI / 2 : Math.PI / 2), 0); D.scale.set(sg.w, sg.w / 4, 1); D.updateMatrix(); this.signMesh.setMatrixAt(si, D.matrix); si++;
        this.fx.reflect(G, sg.x, sg.s, sg.c || (sg.c = new Color(sg.col)), 0.9 * neonOn * this.wet, sg.w); }
    }
    this.signMesh.count = si; this.signMesh.visible = si > 0; if (si) { this.signMesh.instanceMatrix.needsUpdate = true; this.signCell.needsUpdate = true; } this.signMesh.material.color.setScalar(0.6 + 1.6 * neonOn); this.signMesh.material.opacity = 0.35 + 0.65 * neonOn;
    if (this.tubes.count) { this.tubes.instanceMatrix.needsUpdate = true; if (this.tubes.instanceColor) this.tubes.instanceColor.needsUpdate = true; }
    const sA = Math.floor((rdist - 300) / 20) * 20, sB = rdist + 1400;
    for (let s = sA; s <= sB; s += 20) {
      const a = road.at(s); const w = a.width; const h = hash(road.seed, s / 20, 9);
      if (s % 160 === 80 && !(a.corner && a.corner.hard)) for (const side of [-1, 1]) { const x = REF + side * (w / 2 + 40), hx = REF + side * (w / 2 + 22); this.put(this.glb.street_lamp && s < rdist + Q.lamps ? this.glb.street_lamp : this.lamp, road, x, s, side > 0 ? Math.PI : 0); this.fx.pool(G, hx, s, 1.0, 0.72, 0.38, 0.16 + 0.08 * neonOn, 3.6); this.fx.reflect(G, hx, s, LAMP_COL, 0.55 * this.wet, 6); }   // street lamps with their light pools and wet-road streaks
      if (s % 20 === 0 && !(a.corner && a.corner.hard)) { const side = h < 0.5 ? -1 : 1; const kind = Math.floor(h * 977) % 5; const x = REF + side * (w / 2 + 44 + (h * 31 % 1) * 20);
        if (kind === 0) this.put(this.bollard, road, x, s, 0); else if (kind === 1 && s % 40 === 0) { if (this.glb.phone_booth && s % 80 === 0) this.put(this.glb.phone_booth, road, x, s, side * Math.PI / 2); else this.put(this.bench, road, x, s, side > 0 ? Math.PI / 2 : -Math.PI / 2); } else if (kind === 2 && s % 60 === 0) { if (this.glb.newsstand) this.put(this.glb.newsstand, road, x + side * 10, s, side * Math.PI / 2); else this.put(this.vending, road, x + side * 20, s, side > 0 ? -Math.PI / 2 : Math.PI / 2); } else if (kind === 3 && s % 40 === 0) this.put(this.hydrant, road, x, s, 0); }
      if (s % 3200 === 1600 && !(a.corner)) { for (const side of [-1, 1]) this.put(this.pillar, road, REF + side * (w / 2 + 26), s, 0); this.put(this.beam, road, REF, s, 0, (w + 90) * M, 1, 1, 7); }   // overpass
      if (s % 1200 === 600) { const side = h < 0.5 ? -1 : 1; const x = REF + side * (w / 2 + 24); this.put(this.vent, road, x, s, 0); const n = 6; for (let j = 0; j < n; j++) { const ph = ((elapsed * 0.35 + j / n + h) % 1); toWorld(road, x + (ph * 10 - 2) * side, s + 10, V); this.fx.puff(V.x, V.y + 0.3 + ph * 4.5, V.z, 0.5 + ph * 1.6, (1 - ph) * 0.35 * this.steam, 0.75, 0.78, 0.84); } }
    }
    for (const lm of LANDMARKS) { const im = this.glb[lm.name]; if (!im || lm.s < rdist - 600 || lm.s > rdist + 2600) continue;
      // a tower beside a hard corner would stand between the camera and the road: it stays out of the way
      if (road.corners.some(c => c.hard && lm.s > c.s0 - 1300 && lm.s < c.s1 + 900)) continue;
      const w = road.at(lm.s).width; this.put(im, road, REF + lm.side * (w / 2 + lm.off), lm.s, lm.yaw);
      if (lm.name === 'radio_tower') { toWorld(road, REF + lm.side * (w / 2 + lm.off), lm.s, V); for (const k of [1, 0.72, 0.48, 0.24]) this.fx.glow(V.x, V.y + 80 * k, V.z, 3.2, 1, 0.1, 0.06, 0.9 * PROP_BLINK.value); } }   // set pieces; the radio tower's red warning lights bloom
    PROP_BLINK.value = Math.sin(elapsed * 3.2) > -0.2 ? 1 : 0.15;   // aircraft-warning blink
    for (const p of this.props) { p.visible = p.count > 0; if (p.count) p.instanceMatrix.needsUpdate = true; } this.tubes.visible = this.tubes.count > 0;
  }
  setTubeColor(i, col, k) { if (!this.tubes.instanceColor) { this.tubes.instanceColor = new (Object.getPrototypeOf(this.tubes.instanceMatrix).constructor)(new Float32Array(512 * 3), 3); } const b = 0.4 + 2.6 * k; this.tubes.instanceColor.setXYZ(i, col.r * b, col.g * b, col.b * b); }
  setLook(P) { this.neon = P.neon; this.wet = P.wet; this.steam = P.steam; this.mat.emissiveIntensity = 0.8 + 1.0 * P.neon; kitGlow.value = 0.7 + 0.6 * P.neon; }
  reset() { for (const [, m] of this.chunks) { this.group.remove(m); m.geometry.dispose(); } this.chunks.clear(); this.warm = true; }
}
const LAMP_COL = new Color('#ffd9a0');
// the three landmarks: one each, at fixed distances along every road (pt), on one side, set back `off` pt from the road edge, turned to
// face the road; `clear` is the half-length of the plot kept free of street buildings
const LANDMARKS = [
  { name: 'radio_tower', s: 4200, side: -1, off: 330, clear: 340, yaw: 0 },
  { name: 'hotel_tower', s: 9000, side: 1, off: 300, clear: 280, yaw: Math.PI / 2 },
  { name: 'parking_garage', s: 15000, side: -1, off: 160, clear: 300, yaw: -Math.PI / 2 },
];
