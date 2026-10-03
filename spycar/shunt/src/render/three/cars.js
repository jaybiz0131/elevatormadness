// Placeholder cars: boxes with the 2D build's class colours (player cyan, enemies black with red, civilians pastel, trucks green,
// the armored truck dark with red). One merged vertex-coloured geometry per kind, one draw call per car, pooled meshes. Headlights,
// tail lights, blinkers, the Bruiser tell arrow, the Gunner sight line and hit flashes are additive glows and markers batched by fx.
import { BoxGeometry, Mesh, MeshStandardMaterial, Color, Vector3, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, REF, lerp } from '../../sim/constants.js';
import { M, toWorld } from './scale.js';
import { buildHero } from './hero.js';
const KIND_COL = { player: '#37e6ff', civ: '#cfe6ff', weak: '#3a3d46', bruiser: '#1a1b1f', gunner: '#1a1b1f', armored: '#20242b', truck: '#2fd36a', wreck: '#3a2a2a' };
const CIV_TINTS = ['#cfe6ff', '#fff1c9', '#cdebdc', '#e9d9ff'];
const RED = new Color('#ff3b3b'), WHITE = new Color('#ffffff'), DARK = new Color('#14161a'), GLASS = new Color('#1c2634'), GREY = new Color('#6a6f7a'), CYAN = new Color('#37e6ff');
function box(w, h, l, x, y, z, c) { const g = new BoxGeometry(w, h, l); g.translate(x, y, z); const n = g.attributes.position.count; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new Float32BufferAttribute(col, 3)); return g; }
// geometry in metres, body colour white (the material tints it), trim in fixed colours; forward is -z
function carGeometry(kind) {
  const [wp, lp] = T.sizes[kind] || T.sizes.civ; const w = wp * M, l = lp * M; const big = kind === 'armored' || kind === 'truck'; const h = big ? 2.4 : 1.1;
  const parts = [];
  parts.push(box(w, h * 0.55, l, 0, h * 0.275 + 0.35, 0, WHITE));                                  // body
  if (kind === 'player') { parts.push(box(w * 0.6, h * 0.5, l * 0.42, 0, h * 0.55 + 0.35, l * 0.02, new Color('#0d7a8c'))); parts.push(box(w * 0.9, h * 0.35, l * 0.25, 0, h * 0.2 + 0.35, -l * 0.43, WHITE)); }   // cabin and nose
  else if (kind === 'truck') { parts.push(box(w, h, l * 0.62, 0, h / 2 + 0.35, l * 0.19, WHITE)); parts.push(box(w * 0.9, h * 0.5, l * 0.28, 0, h * 0.25 + 0.35, -l * 0.34, GLASS)); }
  else if (kind === 'armored') { parts.push(box(w * 0.85, h * 0.9, l * 0.7, 0, h * 0.45 + 0.35, 0, new Color('#2e333b'))); parts.push(box(w * 0.9, 0.2, 0.3, 0, h + 0.35, 0, RED)); }
  else { parts.push(box(w * 0.78, h * 0.6, l * 0.45, 0, h * 0.55 + 0.35, l * 0.05, kind === 'civ' ? GLASS : DARK)); if (kind !== 'civ') parts.push(box(w * 0.7, 0.08, 0.5, 0, h * 0.85 + 0.37, 0, RED)); }
  if (kind === 'bruiser') { parts.push(box(0.45, 0.6, 1.6, -w / 2 - 0.2, 0.7, 0, GREY)); parts.push(box(0.45, 0.6, 1.6, w / 2 + 0.2, 0.7, 0, GREY)); }
  if (kind === 'gunner') parts.push(box(0.5, 0.4, 1.4, 0, h + 0.5, -l * 0.3, new Color('#555555')));
  for (const sx of [-1, 1]) for (const sz of [-0.3, 0.32]) parts.push(box(0.32, 0.7, 0.7, sx * (w / 2 - 0.1), 0.35, sz * l, DARK));   // wheels
  const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); g.computeBoundingSphere(); return g;
}
export class CarSystem {
  constructor(scene) {
    this.scene = scene; this.geo = {}; this.mat = {}; this.free = {}; this.live = []; this.pos = new Vector3(); this.meshOf = new Map(); this.stamp = 0;
    for (const k of ['player', 'civ', 'weak', 'bruiser', 'gunner', 'armored', 'truck']) { this.geo[k] = carGeometry(k); this.free[k] = []; }
    for (const [k, c] of Object.entries(KIND_COL)) this.mat[k] = new MeshStandardMaterial({ color: new Color(c), vertexColors: true, roughness: 0.55, metalness: 0.25 });
    for (let i = 0; i < CIV_TINTS.length; i++) this.mat['civ' + i] = new MeshStandardMaterial({ color: new Color(CIV_TINTS[i]), vertexColors: true, roughness: 0.6, metalness: 0.2 });
    this.player = buildHero({ paint: '#f4f6fa' }); this.player.traverse(o => { o.frustumCulled = false; }); scene.add(this.player);
    // readability: a cyan silhouette drawn only where the depth test fails, so the player shows through whatever covers it
    const outline = new Mesh(this.geo.player, new MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.5, transparent: true, opacity: 0.55, depthFunc: 4 /* GreaterDepth */, depthWrite: false })); outline.renderOrder = 30; outline.position.y = -0.35; this.player.add(outline);
  }
  acquire(kind) { let m = this.free[kind].pop(); if (!m) { m = new Mesh(this.geo[kind], this.mat[kind]); m.castShadow = true; m.frustumCulled = false; } this.scene.add(m); return m; }
  release(m) { this.scene.remove(m); this.free[m.userData.kind].push(m); }
  place(mesh, G, x, s, yaw, lift) { toWorld(G.road, x, s, this.pos); mesh.position.copy(this.pos); mesh.position.y += lift; mesh.rotation.set(0, -(G.road.frame(s).psi + yaw), 0, 'YXZ'); }
  // cars that exist this frame get a mesh; the rest go back to the pool. c.mesh is render-side only (the hash never reads it).
  update(G, alpha, fx, elapsed) {
    const stamp = ++this.stamp;   // no per-frame allocation: meshes seen this frame carry the stamp
    for (const c of G.cars) {
      if (!c.alive) continue; let m = this.meshOf.get(c); if (!m) { m = this.acquire(c.kind); m.userData.kind = c.kind; this.meshOf.set(c, m); }
      m.userData.stamp = stamp; const cx = lerp(c.px, c.x, alpha), cy = lerp(c.py, c.y, alpha); const w = c.w * M, l = c.l * M;
      if (c.wrecked) { m.material = this.mat.wreck; this.place(m, G, cx, cy, c.spin, 0); m.rotation.z = Math.sin(c.flip * Math.PI * 2) * 0.5; m.rotation.x = Math.sin(c.flip * Math.PI) * 0.2; if (c.debrisT > 0.5) fx.glow(m.position.x, m.position.y + 1, m.position.z, 2.5, 1, 0.5, 0.15, (c.debrisT - 0.5)); fx.shadow(m.position, w, l); continue; }
      m.material = c.kind === 'civ' ? this.mat['civ' + Math.max(0, CIV_TINTS.indexOf(c.tint))] : this.mat[c.kind]; m.rotation.z = 0; m.rotation.x = 0;
      this.place(m, G, cx, cy, (c.lean || 0) * Math.PI / 180 + (c.spin || 0), 0); fx.shadow(m.position, w, l);
      const p = m.position;
      const fx_ = Math.sin(-m.rotation.y), fz_ = -Math.cos(-m.rotation.y); const rx = Math.cos(-m.rotation.y), rz = Math.sin(-m.rotation.y);
      if (c.kind === 'truck') { if (!c.loaded) fx.glow(p.x - fx_ * l * 0.5, p.y + 2.6, p.z - fz_ * l * 0.5, 1.2, 1, 0.82, 0.25, 0.4 + 0.4 * Math.sin(elapsed * 6)); continue; }
      if (c.kind === 'civ') { if (c.blink > 0 && Math.floor(c.blink * 8) % 2 === 0) { const sx = c.blinkDir < 0 ? -1 : 1; fx.glow(p.x + rx * sx * w / 2, p.y + 0.9, p.z + rz * sx * w / 2, 0.6, 1, 0.7, 0.28, 0.9); } continue; }
      // enemies: red headlights, brake lights flashing in the tell, a white flash when hit
      for (const sx of [-1, 1]) fx.glow(p.x + fx_ * l * 0.5 + rx * sx * w * 0.35, p.y + 0.7, p.z + fz_ * l * 0.5 + rz * sx * w * 0.35, c.kind === 'armored' ? 1.1 : 0.9, 1, 0.23, 0.23, 0.9);
      const brake = c.state === 'tell' && Math.floor(c.t * 12) % 2 === 0; if (brake) for (const sx of [-1, 1]) fx.glow(p.x - fx_ * l * 0.5 + rx * sx * w * 0.35, p.y + 0.8, p.z - fz_ * l * 0.5 + rz * sx * w * 0.35, 0.8, 1, 0.42, 0.42, 1);
      if (c.hitFlash > 0) fx.glow(p.x, p.y + 1, p.z, w * 1.2, 1, 1, 1, 0.8);
      if (c.state === 'tell' || c.state === 'swerve' || c.state === 'sight') { const pulse = 0.55 + 0.45 * Math.sin(elapsed * 18); fx.ring(p.x, p.y + 0.04, p.z, Math.max(w, l) * 0.6, 0xff3b3b, pulse, 1); fx.glow(p.x, p.y + 0.8, p.z, l * 0.8, 1, 0.23, 0.23, 0.35 * pulse); }
      if (c.state === 'tell') { const dir = G.x < c.x ? -1 : 1; fx.marker(G, cx + dir * 36, cy, 'arrow', dir, 0.5 + 0.5 * Math.sin(elapsed * 20)); }
      if (c.kind === 'gunner' && c.state === 'sight') fx.sightLine(G, c.sightX, c.y, c.sightX, c.y + 700, 0.5 + 0.5 * Math.sin(elapsed * 30));
    }
    for (const [c, m] of this.meshOf) if (m.userData.stamp !== stamp) { this.release(m); this.meshOf.delete(c); }
  }
  updatePlayer(G, rx, rdist, fx, st, elapsed) {
    const m = this.player; const z = G.jumpZ; const lift = z * 3.5; const lean = (st.lean !== undefined ? st.lean : G.lean) * Math.PI / 180;
    this.place(m, G, rx, rdist, lean, lift); m.scale.set((2 - G.sq), G.sq, 1 + z * 0.1);
    // the rotary pods slide out as the barrels spin up; the barrels turn with the spin; a muzzle flash at the tips when a round leaves
    const spin = G.gunSpin || 0; for (const pd of m.userData.pods) { pd.pod.position.x = pd.home + pd.sx * 0.16 * spin; pd.barrel.rotation.z += spin * 0.9; }
    m.visible = !(st.phase === 'playing' && G.flashT > 0 && Math.floor(elapsed * 16) % 2 === 0);
    const p = m.position; fx.shadow(p, 34 * M * (1 - z * 0.2), 60 * M * (1 - z * 0.2), p.y - lift);
    const fx_ = Math.sin(-m.rotation.y), fz_ = -Math.cos(-m.rotation.y); const rx_ = Math.cos(-m.rotation.y), rz_ = Math.sin(-m.rotation.y); const w = 34 * M, l = 60 * M;
    // headlights (warm), brighter when the gun fires; tail lights, bright under braking; the cyan body glow that keeps the player readable
    for (const sx of [-1, 1]) { if (G.flashT2 > 0) fx.glow(p.x + fx_ * l * 0.42 + rx_ * sx * w * 0.5, p.y + 0.6, p.z + fz_ * l * 0.42 + rz_ * sx * w * 0.5, 2.4, 1, 0.85, 0.5, 1); fx.glow(p.x + fx_ * l * 0.5 + rx_ * sx * w * 0.35, p.y + 0.7, p.z + fz_ * l * 0.5 + rz_ * sx * w * 0.35, 1.0, 0.3, 0.95, 1, 0.8); fx.glow(p.x - fx_ * l * 0.5 + rx_ * sx * w * 0.35, p.y + 0.8, p.z - fz_ * l * 0.5 + rz_ * sx * w * 0.35, G.braking ? 1.2 : 0.6, 1, 0.3, 0.3, G.braking ? 1 : 0.6); }
    fx.glow(p.x, p.y + 0.8, p.z, 4.0, G.nitro > 0 ? 1 : 0.22, G.nitro > 0 ? 0.82 : 0.9, G.nitro > 0 ? 0.25 : 1, G.nitro > 0 ? 0.5 : 0.3);
    fx.poolAt(p.x + fx_ * 9, p.y - lift, p.z + fz_ * 9, 1, 0.95, 0.75, 0.22, 6, -m.rotation.y, 2.4);   // headlight pool on the road ahead
    if (G.drifting && st.phase === 'playing') fx.ring(p.x, p.y - lift + 0.03, p.z, 36 * M, G.driftTier >= 3 ? 0xff7a2a : G.driftTier === 2 ? 0xffd23f : 0xffffff, 0.8, Math.min(1, G.driftCharge / T.drift.tiers[2]));
    if (G.slamCd > 0) fx.ring(p.x, p.y - lift + 0.03, p.z, 30 * M, 0xffffff, 0.5, 1 - G.slamCd / T.slam.cooldown);
    if (G.air > 0 && G.air < 0.4) fx.ring(p.x, p.y - lift + 0.03, p.z, 26 * M, 0xffffff, 0.8, 1);
    if (G.smoke > 0 || G.armor === 1) { const a = G.armor === 1 ? 0.45 : Math.min(0.5, G.smoke * 0.3); for (let i = 0; i < 4; i++) fx.puff(p.x - fx_ * (0.5 + i * 0.9) + Math.sin(elapsed * 9 + i) * 0.3, p.y + 1 + i * 0.4, p.z - fz_ * (0.5 + i * 0.9), 0.5 + i * 0.25, a * 0.6); }
  }
  reset() { for (const [, m] of this.meshOf) this.release(m); this.meshOf.clear(); }
}
