// Placeholder cars: boxes with the 2D build's class colours (player cyan, enemies black with red, civilians pastel, trucks green,
// the armored truck dark with red). One merged vertex-coloured geometry per kind, one draw call per car, pooled meshes. Headlights,
// tail lights, blinkers, the Bruiser tell arrow, the Gunner sight line and hit flashes are additive glows and markers batched by fx.
import { BoxGeometry, Mesh, MeshStandardMaterial, Color, Vector3, Float32BufferAttribute, Group, Object3D, Matrix4, Quaternion } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, REF, lerp, clamp } from '../../sim/constants.js';
import { M, toWorld } from './scale.js';
import { buildHero } from './hero.js';
import { tickEnemyLights } from './enemyModels.js';
import { HEAD_K } from './heroModel.js';
import { loadGatling } from './gatling.js';
import { Explosions } from './explosions.js';
const FADE_FAR = 2300, FADE_SPAN = 600;   // enemy lights fade out between 1,700 and 2,300 pt ahead
const V3 = new Vector3(), UP = new Vector3(0, 1, 0), QY = new Quaternion(), QB = new Quaternion(), OFF = new Vector3();
const KIND_COL = { player: '#37e6ff', civ: '#cfe6ff', weak: '#3a3d46', bruiser: '#1a1b1f', gunner: '#1a1b1f', armored: '#20242b', truck: '#2fd36a', wreck: '#3a2a2a' };
const CIV_TINTS = ['#cfe6ff', '#fff1c9', '#cdebdc', '#e9d9ff'];
// the traffic model's body colours, one per sim tint (silver, dark red, white, navy); never cyan, that is the hero's
const CIV_BODY = ['#b8bec8', '#7a1a22', '#f2f2f2', '#1f2d55'].map(h => new Color(h));
const AMBER = new Color('#ffb020'), RED = new Color('#ff3b3b'), WHITE = new Color('#ffffff'), DARK = new Color('#14161a'), GLASS = new Color('#1c2634'), GREY = new Color('#6a6f7a'), CYAN = new Color('#37e6ff');
function box(w, h, l, x, y, z, c) { const g = new BoxGeometry(w, h, l); g.translate(x, y, z); const n = g.attributes.position.count; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new Float32BufferAttribute(col, 3)); return g; }
// geometry in metres, body colour white (the material tints it), trim in fixed colours; forward is -z
function carGeometry(kind) {
  const [wp, lp] = T.sizes[kind] || T.sizes.civ; const w = wp * M, l = lp * M; const big = kind === 'armored' || kind === 'truck'; const h = big ? 2.4 : 1.1;
  const parts = [];
  parts.push(box(w, h * 0.55, l, 0, h * 0.275 + 0.35, 0, WHITE));                                  // body
  if (kind === 'player') { parts.push(box(w * 0.6, h * 0.5, l * 0.42, 0, h * 0.55 + 0.35, l * 0.02, new Color('#0d7a8c'))); parts.push(box(w * 0.9, h * 0.35, l * 0.25, 0, h * 0.2 + 0.35, -l * 0.43, WHITE)); }   // cabin and nose
  else if (kind === 'truck') { parts.push(box(w, h, l * 0.62, 0, h / 2 + 0.35, l * 0.19, WHITE)); parts.push(box(w * 0.9, h * 0.5, l * 0.28, 0, h * 0.25 + 0.35, -l * 0.34, GLASS)); }
  else if (kind === 'armored') { parts.push(box(w * 0.85, h * 0.9, l * 0.7, 0, h * 0.45 + 0.35, 0, new Color('#2e333b'))); parts.push(box(w * 0.9, 0.2, 0.3, 0, h + 0.35, 0, RED)); }
  else { parts.push(box(w * 0.78, h * 0.6, l * 0.45, 0, h * 0.55 + 0.35, l * 0.05, kind === 'civ' ? GLASS : DARK)); if (kind !== 'civ') parts.push(box(w * 0.7, 0.08, kind === 'weak' ? 0.7 : 0.5, 0, h * 0.85 + 0.37, 0, kind === 'weak' ? AMBER : RED)); if (kind === 'weak') parts.push(box(w * 0.9, 0.06, 0.28, 0, h * 0.75 + 0.4, l * 0.46, AMBER)); }   // a Dart: low, wide spoiler, amber trim
  if (kind === 'bruiser') { parts.push(box(0.45, 0.6, 1.6, -w / 2 - 0.2, 0.7, 0, GREY)); parts.push(box(0.45, 0.6, 1.6, w / 2 + 0.2, 0.7, 0, GREY)); }
  if (kind === 'gunner') parts.push(box(0.5, 0.4, 1.4, 0, h + 0.5, -l * 0.3, new Color('#555555')));
  for (const sx of [-1, 1]) for (const sz of [-0.3, 0.32]) parts.push(box(0.32, 0.7, 0.7, sx * (w / 2 - 0.1), 0.35, sz * l, DARK));   // wheels
  const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); g.computeBoundingSphere(); return g;
}
export class CarSystem {
  constructor(scene) {
    this.scene = scene; this.inst = {}; this.proxy = new Object3D(); this.attachM = new Matrix4(); this.geo = {}; this.mat = {}; this.free = {}; this.live = []; this.pos = new Vector3(); this.meshOf = new Map(); this.stamp = 0; this.boom = new Explosions(); this.lastBoomE = null;
    for (const k of ['player', 'civ', 'weak', 'bruiser', 'gunner', 'armored', 'truck']) { this.geo[k] = carGeometry(k); this.free[k] = []; }
    for (const [k, c] of Object.entries(KIND_COL)) this.mat[k] = new MeshStandardMaterial({ color: new Color(c), vertexColors: true, roughness: 0.55, metalness: 0.25 });
    for (let i = 0; i < CIV_TINTS.length; i++) this.mat['civ' + i] = new MeshStandardMaterial({ color: new Color(CIV_TINTS[i]), vertexColors: true, roughness: 0.6, metalness: 0.2 });
    // in-game the paint carries a little cyan self-light so the white reads under the night key light, where a flat white goes slate
    // the player is a parent group holding the code hero (hero.js) and, once loaded, the imported model (heroModel.js); one shows
    this.codeHero = buildHero({ paint: '#f4f6fa', emissive: '#bfeeff', emissiveIntensity: 0.22, envMapIntensity: 2.2, metalness: 0.25 }); this.codeHero.traverse(o => { o.frustumCulled = false; });
    this.player = new Group(); this.player.add(this.codeHero); this.player.userData.pods = this.codeHero.userData.pods; this.heroGlb = null; scene.add(this.player);
    // readability: a cyan silhouette drawn only where the depth test fails, so the player shows through whatever covers it
    this.outline = new Mesh(this.geo.player, new MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.5, transparent: true, opacity: 0.55, depthFunc: 4 /* GreaterDepth */, depthWrite: false })); this.outline.renderOrder = 30; this.outline.position.y = -0.35; this.player.add(this.outline);
    // the hood gatling (assets/models/wpn_gatling.glb, Jack's model) loads asynchronously; prewarm waits for `ready`
    this.gat = null; this.barrelA = 0; this.lastT = 0; this.ready = loadGatling().then(g => { this.gat = g; this.player.add(g); }).catch(e => { this.gatError = String(e && e.message || e); });
  }
  // swap in the imported hero (or back to the code hero with useCode); the gun pods only exist on the code hero
  // swap in the imported hero (or back to the code hero with useCode); the gun pods only exist on the code hero; the see-through
  // outline takes the shape of whichever body shows (the imported body's own geometry, or the old box for the code hero)
  setHeroModel(mesh, useCode = false) { if (this.heroGlb) this.player.remove(this.heroGlb); this.heroGlb = mesh; if (mesh) this.player.add(mesh); this.codeHero.visible = useCode || !mesh; if (mesh) mesh.visible = !useCode; this.player.userData.pods = this.codeHero.visible ? this.codeHero.userData.pods : [];
    const glb = mesh && !useCode; this.outline.geometry = glb ? mesh.userData.body.geometry : this.geo.player; this.outline.position.y = glb ? 0 : -0.35; this.outline.scale.setScalar(glb ? 1.015 : 1); }
  // the imported enemy types (enemyModels.js): one InstancedMesh per type
  setEnemyModels(map) { for (const [k, v] of Object.entries(map)) if (v.mesh) this.inst[k] = v.mesh; }
  emit(im, o, tint, body) { if (im.count >= im.instanceMatrix.count) return; o.updateMatrix(); im.setMatrixAt(im.count, o.matrix);
    if (im.userData.aTint) { const c = body || CIV_BODY[0]; im.userData.aTint.setXYZW(im.count, c.r, c.g, c.b, tint); } else im.instanceColor.setXYZ(im.count, tint, tint, tint); im.count++;
    const at = im.userData.attach; if (at && at.mesh.count < at.mesh.instanceMatrix.count) { this.attachM.multiplyMatrices(o.matrix, at.local); at.mesh.setMatrixAt(at.mesh.count, this.attachM); at.mesh.instanceColor.setXYZ(at.mesh.count, tint, tint, tint); at.mesh.count++; } }   // an attached part (the Mule's arm)
  acquire(kind) { let m = this.free[kind].pop(); if (!m) { m = new Mesh(this.geo[kind], this.mat[kind]); m.castShadow = true; m.frustumCulled = false; } this.scene.add(m); return m; }
  release(m) { this.scene.remove(m); this.free[m.userData.kind].push(m); }
  place(mesh, G, x, s, yaw, lift) { toWorld(G.road, x, s, this.pos); this.slopeA = Math.atan(G.road.out.slope); mesh.position.copy(this.pos); mesh.position.y += lift; mesh.rotation.set(this.slopeA, -(G.road.frame(s).psi + yaw), 0, 'YXZ'); mesh.scale.set(1, 1, 1); }   // Stop 5: a car sits on the slope it is on
  // a crash-physics wreck (Stop 3): its body pose is in the straightened road frame (crash.js), so turn it by the road heading at its s;
  // the box centre is c.h above the road and the model stands on its own y = 0, so step down half the box height along the body's up
  placeBody(mesh, G, x, s, c) { toWorld(G.road, x, s, this.pos); QY.setFromAxisAngle(UP, -G.road.frame(s).psi); QB.set(c.qx, c.qy, c.qz, c.qw); mesh.quaternion.copy(QY).multiply(QB);
    OFF.set(0, -(c.bodyH || 1.3) / 2, 0).applyQuaternion(mesh.quaternion); mesh.position.copy(this.pos); mesh.position.x += OFF.x; mesh.position.y += c.h + OFF.y; mesh.position.z += OFF.z;
    const cr = c.crush || 0; mesh.scale.set(1, 1 - 0.3 * cr, 1); }
  // cars that exist this frame get a mesh; the rest go back to the pool. c.mesh is render-side only (the hash never reads it).
  update(G, alpha, fx, elapsed) {
    const stamp = ++this.stamp;   // no per-frame allocation: meshes seen this frame carry the stamp
    this.dmgBudget = 10; for (const k in this.inst) { this.inst[k].count = 0; if (this.inst[k].userData.attach) this.inst[k].userData.attach.mesh.count = 0; } tickEnemyLights(elapsed);
    for (const c of G.cars) {
      // a type with an imported model is placed through a proxy and written into its InstancedMesh; the rest use pooled meshes
      if (!c.alive) continue; const inst = this.inst[c.kind]; let m; if (inst) m = this.proxy; else { m = this.meshOf.get(c); if (!m) { m = this.acquire(c.kind); m.userData.kind = c.kind; this.meshOf.set(c, m); } }
      m.userData.stamp = stamp; const cx = lerp(c.px, c.x, alpha), cy = lerp(c.py, c.y, alpha); const w = c.w * M, l = c.l * M;
      if (c.wrecked) { const civ = c.civCrash && !c.boom; m.material = civ ? this.mat['civ' + Math.max(0, CIV_TINTS.indexOf(c.tint))] : this.mat.wreck;
        if (c.qw !== undefined && c.bodyH) this.placeBody(m, G, cx, cy, c); else { this.place(m, G, cx, cy, c.spin, 0); m.rotation.z = Math.sin(c.flip * Math.PI * 2) * 0.5; m.rotation.x = Math.sin(c.flip * Math.PI) * 0.2; }
        // Stop 3 brightness: a wreck is scorched, not black (0.55 and lit up by the fire), a spun-out civilian keeps its paint
        const lit = 1 + this.boom.boost(m.position.x, m.position.z); if (inst) this.emit(inst, m, (civ ? 0.85 : 0.55) * lit, c.kind === 'civ' ? CIV_BODY[Math.max(0, CIV_TINTS.indexOf(c.tint))] : null);
        if (!c.boomed) { c.boomed = true; if (c.boom !== false && c.debrisT > 2.3 && Math.abs(c.y - G.dist) < 1800) this.boom.spawn(m.position.x, m.position.y, m.position.z, c.kind, c.id || 0.5); }   // once, at the moment it becomes a wreck (render-side flag, never read by the sim)
      this.wreckFx(c, m.position, fx, elapsed); fx.shadow(this.pos, w, l, this.pos.y); if (!c.civCrash || c.boom) { const e = clamp((c.debrisT + 1.5) / 4, 0, 1); if (e > 0) fx.glow(m.position.x, m.position.y + 0.7, m.position.z, Math.max(w, l) * 0.55, 1, 0.35, 0.08, 0.35 * e); }   // the hot shell glows: a wreck reads on the night road
      continue; }
      m.material = c.kind === 'civ' ? this.mat['civ' + Math.max(0, CIV_TINTS.indexOf(c.tint))] : this.mat[c.kind]; m.rotation.z = 0; m.rotation.x = 0;
      this.place(m, G, cx, cy, (c.lean || 0) * Math.PI / 180 + (c.spin || 0), 0); fx.shadow(m.position, w, l); if (inst) this.emit(inst, m, 1 + this.boom.boost(m.position.x, m.position.z), c.kind === 'civ' ? CIV_BODY[Math.max(0, CIV_TINTS.indexOf(c.tint))] : null);
      const p = m.position;
      const fx_ = Math.sin(-m.rotation.y), fz_ = -Math.cos(-m.rotation.y); const rx = Math.cos(-m.rotation.y), rz = Math.sin(-m.rotation.y);
      if (c.kind === 'truck') { if (!c.loaded) fx.glow(p.x - fx_ * l * 0.5, p.y + 2.6, p.z - fz_ * l * 0.5, 1.2, 0.24, 1, 0.48, 0.4 + 0.4 * Math.sin(elapsed * 6)); continue; }   // friendly green
      if (c.kind === 'civ') { if (c.blink > 0 && Math.floor(c.blink * 8) % 2 === 0) { const sx = c.blinkDir < 0 ? -1 : 1; fx.glow(p.x + rx * sx * w / 2, p.y + 0.9, p.z + rz * sx * w / 2, 0.6, 1, 0.7, 0.28, 0.9); } continue; }
      // enemies: red headlights, brake lights flashing in the tell, a white flash when hit
      const df = clamp((FADE_FAR - (c.y - G.dist)) / FADE_SPAN, 0, 1);   // enemies far up the road arrive without their lights, so nothing glows in the distance before it is a car
      if (df > 0) for (const sx of [-1, 1]) { const hx = p.x + fx_ * l * 0.5 + rx * sx * w * 0.35, hz = p.z + fz_ * l * 0.5 + rz * sx * w * 0.35; fx.glow(hx, p.y + 0.7, hz, c.kind === 'armored' ? 1.1 : 0.9, 1, 0.23, 0.23, 0.9 * df); fx.streak(hx + fx_ * 1.6, p.y, hz + fz_ * 1.6, 1, 0.25, 0.25, 0.5 * df, -m.rotation.y); }
      this.damageFx(c, p, fx_, fz_, rx, rz, w, l, fx, elapsed);
      const brake = c.state === 'tell' && Math.floor(c.t * 12) % 2 === 0; if (brake) for (const sx of [-1, 1]) fx.glow(p.x - fx_ * l * 0.5 + rx * sx * w * 0.35, p.y + 0.8, p.z - fz_ * l * 0.5 + rz * sx * w * 0.35, 0.8, 1, 0.42, 0.42, 1);
      if (c.hitFlash > 0) fx.glow(p.x, p.y + 1, p.z, w * 1.2, 1, 1, 1, 0.8);
      if (c.state === 'tell' || c.state === 'swerve' || c.state === 'sight') { const pulse = 0.55 + 0.45 * Math.sin(elapsed * 18); fx.ring(p.x, p.y + 0.04, p.z, Math.max(w, l) * 0.6, 0xff3b3b, pulse, 1); fx.glow(p.x, p.y + 0.8, p.z, l * 0.8, 1, 0.23, 0.23, 0.35 * pulse); }
      if (c.state === 'tell') { const dir = G.x < c.x ? -1 : 1; fx.marker(G, cx + dir * 36, cy, 'arrow', dir, 0.5 + 0.5 * Math.sin(elapsed * 20)); }
      if (c.kind === 'gunner' && c.state === 'sight') fx.sightLine(G, c.sightX, c.y, c.sightX, c.y + 700, 0.5 + 0.5 * Math.sin(elapsed * 30));
    }
    { const dtB = this.lastBoomE === null ? 0 : Math.min(0.1, Math.max(0, elapsed - this.lastBoomE)); this.lastBoomE = elapsed; this.boom.update(fx, dtB); }
    for (const [c, m] of this.meshOf) if (m.userData.stamp !== stamp) { this.release(m); this.meshOf.delete(c); }
    for (const k in this.inst) { const im = this.inst[k]; for (const m of im.userData.attach ? [im, im.userData.attach.mesh] : [im]) { m.visible = m.count > 0; if (m.count) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; if (m.userData.aTint) m.userData.aTint.needsUpdate = true; } } }
  }
  // damage you can read at a glance (hp as a fraction of the car's own): light smoke under 2/3, sparks and dark smoke under 1/3, fire under 1/6
  damageFx(c, p, fx_, fz_, rx, rz, w, l, fx, elapsed) {
    const f = c.maxHp ? c.hp / c.maxHp : 1; if (f > 0.67 || this.dmgBudget <= 0) return; const id = (c.id || 0) * 41;
    const lvl = f > 0.34 ? 1 : f > 0.17 ? 2 : 3; this.dmgBudget--;
    const n = lvl === 1 ? 2 : 3; const grey = lvl === 1 ? 0.62 : 0.2;
    for (let i = 0; i < n; i++) { const k = i / n; fx.puff(p.x - fx_ * (l * 0.35 + i * 1.1) + Math.sin(elapsed * 7 + id + i) * 0.35, p.y + 1.1 + i * 0.7 + (elapsed * 1.7 + k + id) % 1, p.z - fz_ * (l * 0.35 + i * 1.1), 0.7 + i * 0.35, lvl === 1 ? 0.4 : 0.55, grey, grey, grey + 0.02, id + i); }
    if (lvl >= 2 && Math.sin(elapsed * 31 + id * 5) > 0.15) { const sx = Math.sin(elapsed * 13 + id) > 0 ? 1 : -1; const bx = p.x + rx * sx * w * 0.3 - fx_ * l * 0.1, bz = p.z + rz * sx * w * 0.3 - fz_ * l * 0.1; fx.spark(bx, p.y + 0.7, bz, 1, 0.78, 0.3); fx.spark(bx + 0.2, p.y + 0.9, bz - 0.1, 1, 0.5, 0.15); }
    if (lvl === 3) { const fl = 0.7 + 0.3 * Math.sin(elapsed * 23 + id) * Math.sin(elapsed * 11); fx.glow(p.x + fx_ * l * 0.2, p.y + 1.1, p.z + fz_ * l * 0.2, 1.7 * fl, 1, 0.5, 0.12, 0.85 * fl); fx.glow(p.x + fx_ * l * 0.2, p.y + 1.6 + 0.3 * fl, p.z + fz_ * l * 0.2, 0.9, 1, 0.8, 0.3, 0.6 * fl); }
  }
  // a wreck burns, then smoulders, for as long as it lies there
  wreckFx(c, pos, fx, elapsed) {
    const life = clamp((c.debrisT + 3.5) / 6, 0, 1); if (life <= 0 || this.dmgBudget <= 0) return; this.dmgBudget--; const id = (c.id || 0) * 37; const z = ({ armored: 1.9, gunner: 1.3, bruiser: 1.25, truck: 1.3 })[c.kind] || 1;
    if (c.civCrash && !c.boom) { for (let i = 0; i < 3; i++) { const k = ((elapsed * 0.8 + i / 3 + id) % 1); fx.puff(pos.x + Math.sin(elapsed * 2 + i + id) * 0.4 * k, pos.y + 1.2 + k * 4, pos.z + Math.cos(elapsed * 1.7 + i) * 0.4 * k, 0.9 + k * 2, 0.45 * life * (1 - k * 0.7), 0.55, 0.55, 0.57, id + i); } return; }   // a spun-out civilian steams and smokes, no fire
    for (let i = 0; i < 4; i++) { const k = ((elapsed * 0.9 + i / 4 + id) % 1); fx.puff(pos.x + Math.sin(elapsed * 3 + i + id) * 0.5 * k, pos.y + 1 + k * 7 * z, pos.z + Math.cos(elapsed * 2.3 + i) * 0.4 * k, (1.1 + k * 2.4) * z, 0.6 * life * (1 - k * 0.7), 0.16, 0.16, 0.17, id + i); }
    if (c.debrisT > -2.2) { const fl = 0.75 + 0.25 * Math.sin(elapsed * 19 + id), f2 = 0.7 + 0.3 * Math.sin(elapsed * 13 + id * 2); const fade = clamp((c.debrisT + 2.2) / 1.6, 0, 1);   // the wreck burns for about five seconds, big ones longer and taller
      fx.glow(pos.x, pos.y + 1.2, pos.z, 1.8 * fl * z, 1, 0.45, 0.1, 0.75 * fl * fade); fx.poolAt(pos.x, pos.y - (c.h ? c.h - (c.bodyH || 1.3) / 2 : 0), pos.z, 1, 0.5, 0.18, 0.55 * fl * fade, 9 * z, 0, 1); /* Stop 3: the fire lights the road round it */ fx.glow(pos.x + 0.5, pos.y + 2.2 * z, pos.z, 1.1 * f2 * z, 1, 0.7, 0.2, 0.55 * f2 * fade); fx.glow(pos.x - 0.4, pos.y + 3.2 * z, pos.z + 0.3, 0.8 * fl * z, 1, 0.5, 0.12, 0.4 * fl * fade); }
  }
  updatePlayer(G, rx, rdist, fx, st, elapsed) {
    // the imported hero turns its wheels with the road speed and lights its tail bar under braking
    const dtE = Math.min(0.1, Math.max(0, elapsed - (this.lastE ?? elapsed))); this.lastE = elapsed;
    if (this.heroGlb && this.heroGlb.visible) this.heroGlb.userData.tick(dtE, (st.phase === 'over' ? 0 : G.speed) * M, !!(G.in && G.in.brake) || !!G.braking);
    const m = this.player; const spin = G.gunSpin || 0; const z = G.jumpZ; const lift = z * 3.5; const lean = (st.lean !== undefined ? st.lean : G.lean) * Math.PI / 180;
    this.place(m, G, rx, rdist, lean, lift); m.scale.set((2 - G.sq), G.sq, 1 + z * 0.1);
    // Stop 3: the body. Roll with the lateral load and squat or dive with the speed change (G.body, stepped in the sim); in a hard turn the
    // inside wheels lift and the car pivots on its outside wheels (two wheels); a big hit throws it once round its long axis (G.roll)
    const B = G.body; if (B && st.phase !== 'over') { const D2R = Math.PI / 180; let rz = B.roll * D2R, rxx = -B.pitch * D2R + (G.air > 0 ? Math.atan2(G.fvz, Math.max(250, G.fwd)) : this.slopeA); const R = G.roll;   // in the air the nose follows the flight path, on the ground the slope
      const tilt = B.tilt * D2R; let dx = 0, dy = 0; if (tilt > 0.001) { const th = -B.twoDir * tilt, px = B.twoDir * 34 * M / 2; rz += th; dx = px * (1 - Math.cos(th)); dy = -px * Math.sin(th); }
      if (R) { rz += R.a; dy += R.lift; }
      m.rotation.x = rxx; m.rotation.z = rz; const yw = -m.rotation.y; m.position.x += Math.cos(yw) * dx; m.position.z += Math.sin(yw) * dx; m.position.y += dy; }
    // the hood gatling: the barrel cluster spins with G.gunSpin (a full turn takes about 0.3 s at speed), the cyan trim glows brighter
    // with every muzzle flash, brass leaves the ejection port on every round, and a flash blooms at the muzzle
    m.updateMatrixWorld(true);
    if (this.gat) {
      const u = this.gat.userData; const dtR = Math.min(0.05, Math.max(0, elapsed - this.lastT)); this.lastT = elapsed;
      this.barrelA += spin * 24 * dtR;
      const flash = G.flashT2 > 0 ? Math.min(1, G.flashT2 / 0.06) : 0;
      u.glow.value = 0.45 + 0.9 * spin + 6 * flash;   // the cyan texels glow brighter as the barrels come up to speed, and flare with every round
      if (st.phase === 'playing' && G.shots !== this.lastShots) { u.eject.getWorldPosition(V3); fx.brass(V3.x, V3.y, V3.z, m.rotation.y, G.shots - (this.lastShots || 0), G.speed * M); }
      this.lastShots = G.shots;
      u.muzzle.getWorldPosition(V3); const fwx = Math.sin(-m.rotation.y), fwz = -Math.cos(-m.rotation.y), rwx = Math.cos(-m.rotation.y), rwz = Math.sin(-m.rotation.y);
      if (spin > 0.08) for (let i = 0; i < 6; i++) { const a = this.barrelA + i * Math.PI / 3, rr = 0.11; fx.glow(V3.x - fwx * 0.1 + rwx * Math.cos(a) * rr, V3.y + Math.sin(a) * rr, V3.z - fwz * 0.1 + rwz * Math.cos(a) * rr, 0.07, 0.6, 1.0, 1.1, 0.5 * spin); }   // six barrel glints, a ring that turns with the spin
      if (flash > 0) { const k = G.shots % 2 ? 1 : 0.8;
        fx.glow(V3.x, V3.y, V3.z, 0.5 * k, 4.5, 3.8, 2.4, flash); fx.glow(V3.x + fwx * 0.4, V3.y, V3.z + fwz * 0.4, 1.4 * k, 3.0, 1.6, 0.5, flash * 0.9); fx.glow(V3.x + fwx * 1.2, V3.y, V3.z + fwz * 1.2, 0.8, 1.6, 0.9, 0.3, flash * 0.6);
        fx.glow(V3.x - fwx * 0.7, V3.y, V3.z - fwz * 0.7, 1.0, 0.25, 1.0, 1.4, flash * 0.7); }   // the cyan trim blooms
    }
    // Stop 5: BOOST: twin flames from the exhausts (a white core, an orange body, a long red tail), a hot glow behind the car and a streak on the road
    if (G.bstT > 0 && st.phase === 'playing') { const fl = 0.8 + 0.2 * Math.sin(elapsed * 70), kk = Math.min(1, G.bstT / 0.25) * Math.min(1, (G.bstDur - G.bstT) / 0.06 + 0.4); const fw = Math.sin(-m.rotation.y), fz2 = -Math.cos(-m.rotation.y), rw = Math.cos(-m.rotation.y), rz2 = Math.sin(-m.rotation.y);
      for (const sx of [-1, 1]) { const bx = m.position.x - fw * (60 * M * 0.5 + 0.3) + rw * sx * 34 * M * 0.3, bz = m.position.z - fz2 * (60 * M * 0.5 + 0.3) + rz2 * sx * 34 * M * 0.3, by = m.position.y + 0.55; fx.glow(bx - fw * 0.3, by, bz - fz2 * 0.3, 0.9 * fl, 3, 2.6, 2, kk); fx.glow(bx - fw * 1.8 * fl, by, bz - fz2 * 1.3 * fl, 1.7 * fl, 1, 0.5, 0.1, 0.95 * kk); fx.glow(bx - fw * 3.8 * fl, by, bz - fz2 * 2.8 * fl, 1.5, 1, 0.22, 0.04, 0.7 * kk); fx.glow(bx - fw * 6.2 * fl, by, bz - fz2 * 4.6 * fl, 1.2, 0.8, 0.1, 0.05, 0.45 * kk); if (Math.sin(elapsed * 41 + sx) > 0.2) fx.spark(bx - fw * 2.2, by + 0.1, bz - fz2 * 2.2, 1, 0.7, 0.25); }
      fx.glow(m.position.x - fw * 5, m.position.y + 0.6, m.position.z - fz2 * 5, 3.4, 1, 0.4, 0.1, 0.32 * kk); fx.poolAt(m.position.x - fw * 4, m.position.y - lift, m.position.z - fz2 * 4, 1, 0.5, 0.15, 0.5 * kk, 5, -m.rotation.y, 2.2); }
    m.visible = !(st.phase === 'playing' && G.flashT > 0 && Math.floor(elapsed * 16) % 2 === 0);
    const p = m.position; fx.shadow(p, 34 * M * (1 - z * 0.2), 60 * M * (1 - z * 0.2), p.y - lift);
    const fx_ = Math.sin(-m.rotation.y), fz_ = -Math.cos(-m.rotation.y); const rx_ = Math.cos(-m.rotation.y), rz_ = Math.sin(-m.rotation.y); const w = 34 * M, l = 60 * M;
    // close-ups (the title, a front view): the road camera is 60+ m away, so the headlight sprites, the wet-road streaks and the readability
    // glow were sized for that; within 40 m they fade, most of all when the camera faces the nose (they washed the front of the car out)
    let near = 0, face = 0; const cp = this.camPos; if (cp) { const dx = cp.x - p.x, dy = cp.y - p.y, dz = cp.z - p.z, d = Math.hypot(dx, dy, dz) || 1; near = clamp((40 - d) / 20, 0, 1); face = near * clamp((fx_ * dx + fz_ * dz) / d * 1.5, 0, 1); }
    const hk = 1 - 0.8 * face;
    HEAD_K.value = 1 - 0.6 * face;
    // headlights (pale yellow #fff3c4), brighter when the gun fires; tail lights, bright under braking; the cyan body glow that keeps the player readable
    for (const sx of [-1, 1]) { if (G.flashT2 > 0) fx.glow(p.x + fx_ * l * 0.42 + rx_ * sx * w * 0.5, p.y + 0.6, p.z + fz_ * l * 0.42 + rz_ * sx * w * 0.5, 2.4 * (1 - 0.5 * near), 1, 0.85, 0.5, hk); fx.glow(p.x + fx_ * l * 0.5 + rx_ * sx * w * 0.35, p.y + 0.7, p.z + fz_ * l * 0.5 + rz_ * sx * w * 0.35, 1.0 - 0.5 * near, 1, 0.95, 0.77, 0.7 * hk); fx.glow(p.x - fx_ * l * 0.5 + rx_ * sx * w * 0.35, p.y + 0.8, p.z - fz_ * l * 0.5 + rz_ * sx * w * 0.35, G.braking ? 1.2 : 0.6, 1, 0.3, 0.3, G.braking ? 1 : 0.6); }
    // the cyan readability glow: half strength on the imported hero, whose body is cyan itself (from above it washed the paint out)
    fx.glow(p.x, p.y + 0.8, p.z, 4.0, G.nitro > 0 ? 1 : 0.22, G.nitro > 0 ? 0.82 : 0.9, G.nitro > 0 ? 0.25 : 1, (G.nitro > 0 ? 0.5 : (this.heroGlb && this.heroGlb.visible ? 0.15 : 0.3)) * (1 - 0.85 * near));
    fx.poolAt(p.x + fx_ * 9, p.y - lift, p.z + fz_ * 9, 1, 0.95, 0.75, 0.22 * (1 - 0.7 * face), 6, -m.rotation.y, 2.4);   // headlight pool on the road ahead
    for (const sx of [-1, 1]) { fx.streak(p.x - fx_ * (l * 0.5 + 1.6) + rx_ * sx * w * 0.35, p.y - lift, p.z - fz_ * (l * 0.5 + 1.6) + rz_ * sx * w * 0.35, 1, 0.12, 0.1, G.in && G.in.brake ? 0.7 : 0.35, -m.rotation.y); fx.streak(p.x + fx_ * (l * 0.5 + 2.5) + rx_ * sx * w * 0.35, p.y - lift, p.z + fz_ * (l * 0.5 + 2.5) + rz_ * sx * w * 0.35, 0.9, 0.95, 1, 0.3 * (1 - face), -m.rotation.y, 4.5); }   // tail and head lights on the wet road
    if (G.drifting && st.phase === 'playing') fx.ring(p.x, p.y - lift + 0.03, p.z, 36 * M, G.driftTier >= 3 ? 0xff7a2a : G.driftTier === 2 ? 0xffd23f : 0xffffff, 0.8, Math.min(1, G.driftCharge / T.drift.tiers[2]));
    if (G.slamCd > 0) fx.ring(p.x, p.y - lift + 0.03, p.z, 30 * M, 0xffffff, 0.5, 1 - G.slamCd / T.slam.cooldown);
    if (G.air > 0 && G.air < 0.4) fx.ring(p.x, p.y - lift + 0.03, p.z, 26 * M, 0xffffff, 0.8, 1);
    if (G.smoke > 0 || G.armor === 1 || G.limp) { const a = G.limp ? 0.7 : G.armor === 1 ? 0.45 : Math.min(0.5, G.smoke * 0.3); if (G.limp) { const dk = 0.25 + 0.1 * Math.sin(elapsed * 6); for (let i = 0; i < 3; i++) fx.puff(p.x - fx_ * (1.2 + i * 1.1), p.y + 1.6 + i * 0.7 + (elapsed * 1.4 + i / 3) % 1, p.z - fz_ * (1.2 + i * 1.1), 0.7 + i * 0.4, 0.5, dk, dk, dk + 0.02, i + 1); if (Math.sin(elapsed * 27) > 0.3) fx.spark(p.x - fx_ * 1.5, p.y + 0.8, p.z - fz_ * 1.5, 1, 0.7, 0.25); } for (let i = 0; i < 4; i++) fx.puff(p.x - fx_ * (0.5 + i * 0.9) + Math.sin(elapsed * 9 + i) * 0.3, p.y + 1 + i * 0.4, p.z - fz_ * (0.5 + i * 0.9), 0.5 + i * 0.25, a * 0.6); }
  }
  reset() { for (const [, m] of this.meshOf) this.release(m); this.meshOf.clear(); }
}
