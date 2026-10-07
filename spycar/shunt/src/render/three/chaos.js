// Stop 6, the carnage layer: the smoke cloak round the hero and the damaged street (chips, scars, fires, walls that blow). Render only: it reads G.cloak,
// G.scars and G.fires and the wall-boom fx the sim lists, and draws them from fixed pools, so replays and hashes are untouched.
//   cloak: a pool of big soft smoke puffs (drawn in the tyre-smoke batch, sorted with the rest) that the hero pours out while G.cloak is up; they drift on the
//          wind, swell and fade. Where one sits between the camera and the car it thins (never below `CUT`), so the player still sees a ghost of their car.
//   facade: every scar is a decal (one instanced draw for all of them) with dust, falling plaster, glass and sparks for its first moments; every fire is a row
//          of flames on the building face with a plume of smoke, dying down over its last two seconds; a wall that blows gets a real fireball (explosions.js).
// Caps: CLOUD puffs, SCAR decals, `Q` pools for sparks, debris, glows and smoke. Nothing allocates per frame.
import { InstancedMesh, InstancedBufferAttribute, PlaneGeometry, ShaderMaterial, DataTexture, RGBAFormat, LinearFilter, NoColorSpace, DynamicDrawUsage, NormalBlending, DoubleSide, Object3D, Vector3 } from 'three';
import { REF, T, clamp } from '../../sim/constants.js';
import { M, toWorld } from './scale.js';
import { Q } from '../../quality.js';
import { facadeAt } from './layout.js';
const V = new Vector3(), D = new Object3D();
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const CLOUD = 96, CUT = 0.3, SCARS = 96;
// the decal atlas: left cell a chip (a pale scar, a dark crater, cracks running out), right cell soot (a plume that is wide and dark at the foot and
// streaks up the wall); alpha only plus a grey value, drawn once from a seeded generator
function decalTexture() {
  const W = 256, H = 128, d = new Uint8Array(W * H * 4); let a = 4242; const rng = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const put = (x, y, v, al) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = Math.max(d[i + 3], al); };
  for (let y = 0; y < H; y++) for (let x = 0; x < 128; x++) { const u = (x + 0.5) / 128 - 0.5, v = (y + 0.5) / H - 0.5; const r = Math.hypot(u, v * 1.0) * 2; const ang = Math.atan2(v, u); const rough = 0.82 + 0.16 * Math.sin(ang * 5 + 1.3) + 0.08 * Math.sin(ang * 11);
    const crater = Math.max(0, 1 - r / (0.42 * rough)); const halo = Math.max(0, 1 - r / 0.95); const al = Math.min(1, crater * 2.4 + halo * halo * 0.75); const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = crater > 0.05 ? 34 : 175; d[i + 3] = Math.round(255 * al); }
  for (let k = 0; k < 9; k++) { let ang = rng() * 6.283, x = 64, y = 64; const len = 18 + rng() * 34; for (let s = 0; s < len; s++) { ang += (rng() - 0.5) * 0.5; x += Math.cos(ang) * 1.1; y += Math.sin(ang) * 1.1; put(Math.round(x), Math.round(y), 20, 230); } }
  for (let y = 0; y < H; y++) for (let x = 0; x < 128; x++) { const u = (x + 0.5) / 128 - 0.5, v = (y + 0.5) / H;   // v: 0 at the top of the decal, 1 at its foot
    const w = 0.12 + 0.34 * Math.pow(v, 0.7) + 0.05 * Math.sin(v * 17 + 2); const edge = Math.max(0, 1 - Math.abs(u) / w); const streak = 0.65 + 0.35 * Math.sin(u * 60 + v * 9); const top = Math.pow(1 - v, 0.35); const al = Math.min(1, Math.pow(edge, 0.7) * streak * (0.35 + 0.65 * v) * (1 - 0.5 * top) * 1.25);
    const i = (y * W + 128 + x) * 4; d[i] = d[i + 1] = d[i + 2] = 8; d[i + 3] = Math.round(255 * al); }
  const t = new DataTexture(d, W, H, RGBAFormat); t.needsUpdate = true; t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.colorSpace = NoColorSpace; return t;
}
export class Chaos {
  constructor(scene) {
    // ---- the smoke cloak pool (struct of arrays)
    this.c = { x: new Float32Array(CLOUD), y: new Float32Array(CLOUD), z: new Float32Array(CLOUD), vx: new Float32Array(CLOUD), vy: new Float32Array(CLOUD), vz: new Float32Array(CLOUD), age: new Float32Array(CLOUD).fill(99), life: new Float32Array(CLOUD).fill(1), r0: new Float32Array(CLOUD), r1: new Float32Array(CLOUD), seed: new Float32Array(CLOUD), amp: new Float32Array(CLOUD) };
    this.cHead = 0; this.acc = 0; this.last = -1; this.prev = new Vector3(); this.hasPrev = false; this.vel = new Vector3(); this.seen = new WeakSet(); this.fc = new WeakMap(); this.live = 0;
    // ---- the decals: one instanced plane per scar, atlas cell chosen per instance
    const geo = new PlaneGeometry(1, 1); this.aCell = new InstancedBufferAttribute(new Float32Array(SCARS), 1); this.aA = new InstancedBufferAttribute(new Float32Array(SCARS), 1); this.aCell.setUsage(DynamicDrawUsage); this.aA.setUsage(DynamicDrawUsage); geo.setAttribute('aCell', this.aCell); geo.setAttribute('aA', this.aA);
    const mat = new ShaderMaterial({ uniforms: { map: { value: decalTexture() } }, vertexShader: 'attribute float aCell; attribute float aA; varying vec2 vUv; varying float vA; varying vec3 vC; void main() { vUv = (uv * vec2(0.5, 1.0)) + vec2(0.5 * aCell, 0.0); vA = aA; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying float vA; varying vec3 vC; void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vC, t.a * vA); }', transparent: true, depthWrite: false, blending: NormalBlending, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.decals = new InstancedMesh(geo, mat, SCARS); this.decals.instanceColor = new InstancedBufferAttribute(new Float32Array(SCARS * 3), 3); this.decals.instanceColor.setUsage(DynamicDrawUsage); this.decals.count = 0; this.decals.frustumCulled = false; this.decals.renderOrder = 5; scene.add(this.decals);
    this.stats = { cloud: 0, scars: 0, fires: 0 };
  }
  reset() { this.c.age.fill(99); this.live = 0; this.hasPrev = false; this.last = -1; this.seen = new WeakSet(); this.decals.count = 0; }
  // the right-hand direction of the road at s in world x, z, and the face of the building (side -1 left, +1 right) in world metres
  // the real building face under a scar or fire (layout.js: where the plot stands, how high, which way it points), looked up once per object; null where the street has a gap
  face(G, side, s, out, key) { let fa = key ? this.fc.get(key) : undefined; if (fa === undefined) { fa = facadeAt(G.road, side, s) || null; if (key) this.fc.set(key, fa); } if (!fa) return null;
    toWorld(G.road, fa.faceX, s, out); out.rx = Math.cos(fa.psi); out.rz = Math.sin(fa.psi); out.fx = Math.sin(fa.psi); out.fz = -Math.cos(fa.psi); out.yaw = -fa.psi + (side > 0 ? -Math.PI / 2 : Math.PI / 2); out.top = fa.height; return out; }
  faceRoad(G, side, s, out) { const road = G.road, w = road.at(s).width; toWorld(road, REF + side * (w / 2 + T.city.setback), s, out); const f = road.frame(s); out.rx = Math.cos(f.psi); out.rz = Math.sin(f.psi); out.fx = Math.sin(f.psi); out.fz = -Math.cos(f.psi); out.yaw = -f.psi + (side > 0 ? -Math.PI / 2 : Math.PI / 2); return out; }
  // one frame: draws into fx's batches. `n` is fx.update's running count of sorted smoke puffs; returns it. `car` and `cam` are world Vector3s.
  draw(fx, G, elapsed, cam, car, n) {
    let dt = this.last < 0 ? 0 : clamp(elapsed - this.last, 0, 0.1); this.last = elapsed;
    n = this.drawCloak(fx, G, dt, elapsed, cam, car, n); n = this.drawFacade(fx, G, dt, elapsed, cam, n); return n;
  }
  drawCloak(fx, G, dt, elapsed, cam, car, n) {
    const c = this.c; if (car) { if (this.hasPrev && dt > 0) { this.vel.set((car.x - this.prev.x) / dt, 0, (car.z - this.prev.z) / dt); const sp = this.vel.length(); if (sp > 90) this.vel.multiplyScalar(90 / sp); } else this.vel.set(0, 0, 0); this.prev.copy(car); this.hasPrev = true; }
    // pour it out: more with the cloak up, a burnout, a long drift, the 180
    const burn = G.bo > 0 ? 1 : 0, drift = G.drifting ? clamp((G.driftT - 0.15) / 0.9, 0, 1) : 0, flip = G.flip ? 1 : 0;
    const cap = Q.cloud, rate = G.playing && car ? Math.min(cap / 2.3, 75 * G.cloak + 30 * burn + 20 * drift + 22 * flip) : 0;
    this.acc += rate * dt; let emitted = 0;
    while (this.acc >= 1 && emitted < 8) { this.acc -= 1; emitted++; const i = this.cHead; this.cHead = (this.cHead + 1) % CLOUD; const sd = Math.random();
      const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 2.0; c.x[i] = car.x + Math.cos(a) * rr; c.z[i] = car.z + Math.sin(a) * rr; c.y[i] = car.y - 0.2 + Math.random() * 1.5;
      c.vx[i] = this.vel.x * 0.3 + Math.cos(a) * (0.6 + Math.random() * 1.4) + 0.6; c.vz[i] = this.vel.z * 0.3 + Math.sin(a) * (0.6 + Math.random() * 1.4) + 0.25; c.vy[i] = 0.25 + Math.random() * 0.6;
      c.age[i] = 0; c.life[i] = 2.0 + Math.random() * 1.3; c.r0[i] = 1.2 + Math.random() * 0.6; c.r1[i] = 2.7 + Math.random() * 1.0; c.seed[i] = sd * 6.2; c.amp[i] = 0.6 + 0.3 * Math.min(1, G.cloak + burn); }
    // the line from the camera to the car: puffs on it thin out (to CUT), so the car stays readable as a ghost
    const cx = car ? car.x - cam.x : 0, cy = car ? car.y - cam.y : 0, cz = car ? car.z - cam.z : 0, cl2 = cx * cx + cy * cy + cz * cz; const lim = Math.min(Q.cloud, CLOUD);
    let live = 0, drawn = 0;
    for (let i = 0; i < CLOUD; i++) { if (c.age[i] >= c.life[i]) continue; live++; c.age[i] += dt; const k = c.age[i] / c.life[i]; if (k >= 1) continue;
      const drag = Math.exp(-dt * 0.9); c.vx[i] = c.vx[i] * drag + 0.25 * dt; c.vz[i] = c.vz[i] * drag; c.x[i] += c.vx[i] * dt; c.y[i] += c.vy[i] * dt; c.z[i] += c.vz[i] * dt; c.vy[i] *= Math.exp(-dt * 0.5);
      if (drawn >= lim) continue; const e = 1 - (1 - k) * (1 - k); const r = c.r0[i] + (c.r1[i] - c.r0[i]) * e;
      let cut = 1; if (cl2 > 1) { const px = c.x[i] - cam.x, py = c.y[i] - cam.y, pz = c.z[i] - cam.z; const u = (px * cx + py * cy + pz * cz) / cl2; if (u > 0 && u < 1.02) { const qx = px - cx * u, qy = py - cy * u, qz = pz - cz * u; cut = clamp(Math.sqrt(qx * qx + qy * qy + qz * qz) / (r * 1.1 + 1), CUT, 1); } }
      const dcam = Math.hypot(c.x[i] - cam.x, c.y[i] - cam.y, c.z[i] - cam.z), near = clamp((dcam - r * 0.55) / (r * 1.5), 0.12, 1);   // a puff the camera sits inside fades, so the view never whites out
      const alpha = c.amp[i] * cut * near * Math.min(1, c.age[i] * 5) * Math.pow(1 - k, 1.35);
      const j = fx.puffs.add(c.x[i], c.y[i], c.z[i], r * 2, r * 2, 0.9, 0.9, 0.93, alpha, Math.min(6.2, (c.seed[i] + k * (c.seed[i] > 3.1 ? 0.7 : -0.7) + 6.2832) % 6.2832) + 10 * (Math.floor(c.seed[i] * 0.64) & 3), 0, 1, car ? car.y - 0.6 : 0);
      if (j >= 0 && n < 800) { fx.puffOrder[n] = j; fx.puffKey[n] = -((c.x[i] - cam.x) ** 2 + (c.y[i] - cam.y) ** 2 + (c.z[i] - cam.z) ** 2); n++; drawn++; } }
    this.live = live; this.stats.cloud = drawn; return n;
  }
  drawFacade(fx, G, dt, elapsed, cam, n) {
    const low = Q.level === 'low';
    // ---- decals
    let m = 0; const dl = this.decals; const sc = G.scars; const total = Math.min(sc.length, SCARS);
    for (let i = sc.length - total; i < sc.length; i++) { const s = sc[i]; if (Math.abs(s.s - G.dist) > 1800) continue; const F = this.face(G, s.side, s.s, V, s); if (!F) continue; const fade = Math.min(1, (T.facade.scarLife - s.t) / 6);
      const big = s.kind === 1; const w = big ? 2.4 + s.seed * 2.2 : 1.2 + s.seed * 1.1, h = big ? 2.4 + s.seed * 2.6 : w * 0.9; const y = V.y + Math.min(big ? s.h - h * 0.35 : s.h, F.top - 0.5);
      const off = 0.045 + (i % 5) * 0.004; D.position.set(V.x - F.rx * s.side * off, y, V.z - F.rz * s.side * off); D.rotation.set(0, F.yaw, 0); D.scale.set(w, h, 1); D.updateMatrix(); dl.setMatrixAt(m, D.matrix);
      this.aCell.setX(m, big ? 1 : 0); this.aA.setX(m, (big ? 0.82 : 0.9) * fade * Math.min(1, s.t * 6 + 0.2)); const tone = big ? 1 : 0.9 + 0.4 * s.seed; dl.instanceColor.setXYZ(m, tone, tone, tone); m++; }
    dl.count = m; if (m) { dl.instanceMatrix.needsUpdate = true; dl.instanceColor.needsUpdate = true; this.aCell.needsUpdate = true; this.aA.needsUpdate = true; } dl.visible = m > 0; this.stats.scars = m;
    // ---- what a fresh chip throws: a flash and sparks, dust, falling plaster, glass from the windows above (only the newest ones, so a long burst stays inside the pools)
    let fresh = 0; for (let i = sc.length - 1; i >= 0 && fresh < (low ? 10 : 22); i--) { const s = sc[i]; if (s.t > 1.5) break; if (Math.abs(s.s - G.dist) > 1400) continue; fresh++; const F = this.face(G, s.side, s.s, V, s); if (!F) continue; const t = s.t, sd = s.seed * 977; const nx = -s.side * F.rx, nz = -s.side * F.rz, y0 = V.y + Math.min(s.h, F.top - 0.5); const big = s.kind === 1;
      if (t < 0.07 && !big) fx.glow(V.x + nx * 0.15, y0, V.z + nz * 0.15, 0.55, 3.2, 2.1, 0.8, (1 - t / 0.07) * 0.9);
      if (t < 0.3) for (let q = 0; q < (big ? 6 : 3); q++) { const h = hash(sd + q * 3.1), a = (h - 0.5) * 2.4, v = 3 + 5 * hash(sd + q * 7.7); fx.spark(V.x + nx * v * t * 0.6 + F.fx * Math.sin(a) * v * t, y0 + (hash(sd + q) - 0.3) * v * t - 6 * t * t, V.z + nz * v * t * 0.6 + F.fz * Math.sin(a) * v * t, 2.0 * (1 - t / 0.3), 1.2 * (1 - t / 0.3), 0.35); }
      if (t < 1.3 && (i & 1) === 0) { const k = t / 1.3; const j = fx.puffs.add(V.x + nx * (0.3 + 0.9 * k), y0 + 0.3 + 0.9 * k, V.z + nz * (0.3 + 0.9 * k), (0.6 + 1.5 * k) * 2, (0.6 + 1.5 * k) * 2, 0.62, 0.58, 0.52, 0.45 * (1 - k) * (1 - k), sd % 6.2 + 10 * (Math.floor(sd) & 3), 0, 1, V.y); if (j >= 0 && n < 800) { fx.puffOrder[n] = j; fx.puffKey[n] = -((V.x - cam.x) ** 2 + (V.y - cam.y) ** 2 + (V.z - cam.z) ** 2); n++; } }
      for (let q = 0; q < (big ? 4 : 2); q++) { if (t > 1.1) break; const jd = fx.debris.count; if (jd >= Q.debris) break; const h = hash(sd + q * 5.3), v = 1.5 + 3 * h; const yy = Math.max(0.1, y0 + (h - 0.4) * 1.5 * t - 9 * t * t * 0.5 + 1.2 * t); D.position.set(V.x + nx * v * t * 0.8 + F.fx * (hash(sd + q * 1.9) - 0.5) * 2 * t, yy, V.z + nz * v * t * 0.8 + F.fz * (hash(sd + q * 1.9) - 0.5) * 2 * t); D.rotation.set(t * 9 + q, t * 7, q); const sz = 0.1 + 0.14 * hash(sd + q * 2.7); D.scale.set(sz, sz * 0.7, sz); D.updateMatrix(); fx.debris.setMatrixAt(jd, D.matrix); const tone = 0.25 + 0.45 * hash(sd + q * 4.4); fx.debris.instanceColor.setXYZ(jd, tone, tone * 0.95, tone * 0.85); fx.debris.count = jd + 1; }
      // glass: a few bright flecks shaken off the windows above the hit, tumbling down the wall
      if (t < 1.5) for (let q = 0; q < (big ? 8 : 4); q++) { const h = hash(sd * 1.3 + q * 2.9), y1 = s.h + 0.8 + h * (big ? 4 : 3); const yy = V.y + y1 - 7 * t * t * 0.5 - 0.7 * t * (0.5 + h); if (yy < V.y + 0.1) continue; const g = Math.max(0, 1 - t / 1.5) * (0.55 + 0.45 * Math.sin(t * 38 + q * 3)); fx.spark(V.x + nx * (0.15 + 1.1 * t * (0.4 + h)) + F.fx * (h - 0.5) * 2.6, yy, V.z + nz * (0.15 + 1.1 * t * (0.4 + h)) + F.fz * (h - 0.5) * 2.6, 0.6 * g, 0.95 * g, 1.2 * g); } }
    // ---- walls that blow: the fireball sits on the building face once (the wreck's own explosion has already played where it first blew)
    for (const f of G.fx) { if (!f.wallBoom || this.seen.has(f)) continue; this.seen.add(f); if (!fx.boomHook) continue; const F = this.face(G, f.side, f.y, V, f) || this.faceRoad(G, f.side, f.y, V); fx.boomHook(V.x - F.rx * f.side * 1.6, V.y + (f.h || 1.2), V.z - F.rz * f.side * 1.6, 'bruiser', f.x + f.y); }
    // ---- fires on the facade
    let fi = 0; for (const fr of G.fires) { if (Math.abs(fr.s - G.dist) > 1800) continue; const life = fr.life, t = fr.t; const on = t < life ? Math.min(1, t / 0.7) * clamp((life - t) / 2.2 + 0.15, 0.15, 1) : 0; const smoke = t < life + 3 ? Math.min(1, t / 1.2) * (t < life ? 1 : (life + 3 - t) / 3) : 0; if (on <= 0 && smoke <= 0) continue;
      const F = this.face(G, fr.side, fr.s, V, fr); if (!F) continue; const nx = -fr.side * F.rx, nz = -fr.side * F.rz; const sd = fr.seed * 311; const nf = low ? 4 : 7; fi++;
      for (let q = 0; q < nf && on > 0; q++) { const h = hash(sd + q * 2.3), u = (q / (nf - 1) - 0.5) * fr.w * 0.95 + (h - 0.5) * 0.7; const fl = 0.7 + 0.3 * Math.sin(elapsed * (13 + 9 * h) + q * 2.1) * Math.sin(elapsed * 7.3 + q), fl2 = 0.6 + 0.4 * Math.sin(elapsed * (19 + 7 * h) + q * 1.3);
        const px = V.x + F.fx * u + nx * 0.4, pz = V.z + F.fz * u + nz * 0.4, base = V.y + Math.max(0.4, fr.h - 0.9), tall = (1.0 + 1.9 * on) * (0.7 + 0.5 * h) * fl;
        // a tongue: a red-orange outer flame, a yellow inner one and a white-hot heart, each swaying on its own; a soft glow at the foot
        const sw = 0.18 * Math.sin(elapsed * 6.5 + q * 1.7) + 0.1 * Math.sin(elapsed * 11 + q);
        fx.glow(px, base + 0.2, pz, 0.9 + 0.5 * h, 2.2, 0.45, 0.06, 0.5 * on);
        fx.flames.add(px + F.fx * sw, base + tall * 0.62, pz + F.fz * sw, (0.9 + 0.5 * h) * (0.7 + 0.3 * fl), tall * 1.3, 2.4, 0.42, 0.06, 0.95 * on * (0.7 + 0.3 * fl), 0);
        fx.flames.add(px + F.fx * sw * 0.8, base + tall * 0.42, pz + F.fz * sw * 0.8, (0.55 + 0.3 * h) * (0.7 + 0.3 * fl2), tall * 0.85, 3.0, 1.5, 0.3, 0.9 * on * fl2, 0);
        if (!low) fx.flames.add(px + F.fx * sw * 0.5, base + tall * 0.22, pz + F.fz * sw * 0.5, 0.28 + 0.15 * h, tall * 0.4, 3.4, 3.0, 1.8, 0.8 * on, 0); }
      if (on > 0.15) fx.glow(V.x + nx * 1.2, V.y + Math.max(0.6, fr.h - 0.2), V.z + nz * 1.2, 2.6 + fr.w * 0.45, 1.6, 0.5, 0.1, 0.13 * on);   // the glow it throws on the air in front of the wall
      if (on > 0.2) fx.poolAt(V.x + nx * 3, V.y, V.z + nz * 3, 1.0, 0.42, 0.1, 0.16 * on, 7 + fr.w, 0, 1);   // the road takes some of the firelight
      for (let q = 0; q < (low ? 3 : 5) && smoke > 0; q++) { const ph = ((elapsed * 0.32 + q / 5 + (sd % 1)) % 1); const u = ((q + 0.5) / 5 - 0.5) * fr.w + Math.sin(sd + q) * 0.6; const rr = 0.9 + ph * 2.4;
        const j = fx.puffs.add(V.x + F.fx * u + nx * (0.6 + ph * 1.6), V.y + fr.h + 0.6 + ph * 7.5, V.z + F.fz * u + nz * (0.6 + ph * 1.6), rr * 2, rr * 2, 0.16 - 0.1 * ph, 0.14 - 0.09 * ph, 0.15 - 0.09 * ph, smoke * (1 - ph) * (ph < 0.12 ? ph / 0.12 : 1) * 0.8, (sd + q) % 6.2 + 10 * (q & 3), 0, 1, V.y); if (j >= 0 && n < 800) { fx.puffOrder[n] = j; fx.puffKey[n] = -((V.x - cam.x) ** 2 + (V.y - cam.y) ** 2 + (V.z - cam.z) ** 2); n++; } }
      if (on > 0.3) for (let q = 0; q < (low ? 2 : 4); q++) { const ph = ((elapsed * 0.7 + q * 0.27 + (sd % 1)) % 1); fx.spark(V.x + F.fx * ((hash(sd + q * 9) - 0.5) * fr.w) + nx * (0.5 + ph), V.y + fr.h + ph * 5, V.z + F.fz * ((hash(sd + q * 9) - 0.5) * fr.w) + nz * (0.5 + ph), 2.4 * (1 - ph) * on, 0.9 * (1 - ph) * on, 0.15 * on); } }
    this.stats.fires = fi; return n;
  }
}
