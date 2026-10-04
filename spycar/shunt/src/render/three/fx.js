// Effects, batched: additive glows (lights, flashes, pickups), tyre smoke (sorted, lit soft quads), contact shadows, ground markers
// and rings, sparks (points), debris (instanced boxes), skid marks (a ring buffer of 2,000 segments fading over 15 s), bullets and
// missiles, the Gunner sight line and the one-shot fx the sim lists (explosions, landing rings, pickup bursts, exhaust flames).
// Every batch is one draw call. Nothing here allocates per frame: pools, typed arrays and reused vectors only.
import { InstancedMesh, InstancedBufferAttribute, PlaneGeometry, BoxGeometry, ShaderMaterial, MeshBasicMaterial, Mesh, Color, DataTexture, RGBAFormat, Points, BufferGeometry, BufferAttribute, PointsMaterial, AdditiveBlending, NormalBlending, Object3D, Vector3, LineSegments, LineBasicMaterial, DoubleSide, LinearFilter, NoColorSpace, DynamicDrawUsage } from 'three';
import { lerp, clamp } from '../../sim/constants.js';
import { PUFF_LIFE } from '../../sim/physics.js';
import { M, toWorld } from './scale.js';
const V = new Vector3(), V2 = new Vector3(), D = new Object3D(), COL = new Color();
function softTexture(size, falloff) { const d = new Uint8Array(size * size * 4); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5; const r = Math.min(1, Math.hypot(dx, dy) * 2); const a = Math.pow(1 - r, falloff); const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(255 * a); } const t = new DataTexture(d, size, size, RGBAFormat); t.needsUpdate = true; t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.colorSpace = NoColorSpace; return t; }
// tyre smoke: a 2x2 atlas of billowy puffs (overlapping soft lobes under a round falloff), alpha only; seeded so it never changes
function smokeTexture() { const S = 256, H = 128, d = new Uint8Array(S * S * 4); let a = 99; const rng = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  for (let cell = 0; cell < 4; cell++) { const ox = (cell % 2) * H, oy = Math.floor(cell / 2) * H; const lobes = []; for (let i = 0; i < 13; i++) { const ang = rng() * 6.283, r = rng() * 0.24; lobes.push([0.5 + Math.cos(ang) * r, 0.5 + Math.sin(ang) * r, 0.16 + rng() * 0.17, 0.55 + rng() * 0.45]); }
    for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) { const u = (x + 0.5) / H, v = (y + 0.5) / H; let acc = 0; for (const [cx, cy, cr, w] of lobes) { const q = Math.hypot(u - cx, v - cy) / cr; if (q < 1) acc += w * (1 - q * q) * (1 - q * q); }
      const edge = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2); const al = Math.min(1, acc * 1.35) * Math.min(1, edge * 2.6); const i = ((oy + y) * S + ox + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(255 * al); } }
  const t = new DataTexture(d, S, S, RGBAFormat); t.needsUpdate = true; t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.colorSpace = NoColorSpace; return t; }
export function arrowTexture(size) { const d = new Uint8Array(size * size * 4); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const u = x / size, v = y / size; const head = u > 0.55 && Math.abs(v - 0.5) < (1 - u) * 1.1; const shaft = u > 0.1 && u <= 0.55 && Math.abs(v - 0.5) < 0.16; const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = (head || shaft) ? 255 : 0; } const t = new DataTexture(d, size, size, RGBAFormat); t.needsUpdate = true; t.colorSpace = NoColorSpace; return t; }
const VERT_BILLBOARD = `attribute float instanceAlpha; attribute float instanceParam; attribute float instanceGround; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vParam; varying float vH; varying vec2 vSun;
void main() { vUv = uv; vColor = instanceColor; vAlpha = instanceAlpha; vParam = instanceParam; vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); vec2 q = position.xy; vSun = vec2(0.0);
  #ifdef SMOKE
  // param = rotation + 10 x atlas cell; the sun is carried into the puff's own 2D frame for the self-shadow lookup
  float cellI = floor(instanceParam / 10.0); float rot = instanceParam - cellI * 10.0; float cs = cos(rot), sn = sin(rot); q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);
  vUv = (uv + vec2(mod(cellI, 2.0), floor(cellI / 2.0))) * 0.5; vec2 s2 = vec2(dot(sunDir, r), dot(sunDir, u)); vSun = vec2(cs * s2.x + sn * s2.y, -sn * s2.x + cs * s2.y);
  #endif
  vec3 p = c + r * q.x * sx + u * q.y * sy; vH = p.y - instanceGround; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const VERT_FLAT = `attribute float instanceAlpha; attribute float instanceParam; varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vParam; varying float vH; varying vec2 vSun;
void main() { vH = 1.0; vSun = vec2(0.0); vUv = uv; vColor = instanceColor; vAlpha = instanceAlpha; vParam = instanceParam; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const FRAG = `uniform sampler2D map; uniform vec3 sunDir; uniform float lit; uniform vec3 sunCol; uniform vec3 ambCol; varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vParam; varying float vH; varying vec2 vSun;
void main() { float a = texture2D(map, vUv).a;
  #ifdef RING
  vec2 d = vUv - 0.5; float r = length(d) * 2.0; float ang = atan(d.x, d.y); float frac = mod(ang / 6.2831853 + 1.0, 1.0); a = smoothstep(0.76, 0.84, r) * (1.0 - smoothstep(0.95, 1.0, r)) * step(frac, vParam);
  #endif
  vec3 col = vColor;
  #ifdef LIT
  vec2 n2 = (vUv - 0.5) * 2.0; float h = sqrt(max(0.0, 1.0 - dot(n2, n2))); vec3 n = normalize(vec3(n2.x, n2.y, h)); float l = 0.55 + 0.45 * max(0.0, dot(n, normalize(sunDir))); col *= mix(1.0, l, lit);
  #endif
  #ifdef SMOKE
  // lit like a volume: ambient from the look's sky, plus the sun where the puff is thinner toward the light (a two-tap self-shadow);
  // the bottom fades out over 0.5 m above the road so a puff never shows a hard line where it meets the asphalt
  float a2 = texture2D(map, vUv + normalize(vSun + 1e-4) * 0.045).a; float sh = clamp(0.55 + (a - a2) * 2.5 + 0.25 * length(vSun), 0.2, 1.3);
  col = vColor * (ambCol + sunCol * sh); a *= smoothstep(0.0, 0.5, vH);
  #endif
  gl_FragColor = vec4(col, a * vAlpha); }`;
class Batch {
  constructor(scene, cap, { flat = false, additive = true, ring = false, lit = false, smoke = false, map, depthTest = true, renderOrder = 0 } = {}) {
    const geo = new PlaneGeometry(1, 1); if (flat) geo.rotateX(-Math.PI / 2);
    this.alpha = new InstancedBufferAttribute(new Float32Array(cap), 1); this.param = new InstancedBufferAttribute(new Float32Array(cap), 1); this.ground = new InstancedBufferAttribute(new Float32Array(cap).fill(-1e4), 1); geo.setAttribute('instanceAlpha', this.alpha); geo.setAttribute('instanceParam', this.param); geo.setAttribute('instanceGround', this.ground); this.ground.setUsage(DynamicDrawUsage);
    this.alpha.setUsage(DynamicDrawUsage); this.param.setUsage(DynamicDrawUsage);
    const defines = {}; if (ring) defines.RING = ''; if (lit) defines.LIT = ''; if (smoke) defines.SMOKE = '';
    const mat = new ShaderMaterial({ vertexShader: flat ? VERT_FLAT : VERT_BILLBOARD, fragmentShader: FRAG, uniforms: { map: { value: map }, sunDir: { value: new Vector3(0.3, 1, 0.2) }, lit: { value: lit ? 1 : 0 }, sunCol: { value: new Color(0.5, 0.5, 0.55) }, ambCol: { value: new Color(0.45, 0.45, 0.55) } }, defines, transparent: true, depthWrite: false, depthTest, blending: additive ? AdditiveBlending : NormalBlending, side: DoubleSide });
    this.mesh = new InstancedMesh(geo, mat, cap); this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.mesh.instanceColor.setUsage(DynamicDrawUsage); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder; this.cap = cap; scene.add(this.mesh);
    this.mat = mat;
  }
  begin() { this.mesh.count = 0; }
  // billboard: position and size in metres; flat: position, size across, size along, yaw
  add(x, y, z, sx, sy, r, g, b, a, param = 1, yaw = 0, sz = 1, ground = -1e4) { const m = this.mesh; const i = m.count; if (i >= this.cap) return -1; this.ground.array[i] = ground; D.position.set(x, y, z); D.rotation.set(0, yaw, 0); D.scale.set(sx, sy, sz); D.updateMatrix(); m.setMatrixAt(i, D.matrix); m.instanceColor.setXYZ(i, r, g, b); this.alpha.setX(i, a); this.param.setX(i, param); m.count = i + 1; return i; }
  end() { const m = this.mesh; if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; this.alpha.needsUpdate = true; this.param.needsUpdate = true; this.ground.needsUpdate = true; } }
}
const SKID_N = 2000, SKID_LIFE = 15, SKID_W = 6 * M / 2;
export class FX {
  constructor(scene) {
    this.scene = scene; this.wet = 1; const soft = softTexture(64, 2.2), softHard = softTexture(64, 0.8), blob = softTexture(32, 1.2), arrow = arrowTexture(64);
    this.glows = new Batch(scene, 512, { map: soft, additive: true, depthTest: true, renderOrder: 10 });
    this.puffs = new Batch(scene, 800, { map: smokeTexture(), additive: false, smoke: true, renderOrder: 8 });
    this.shadows = new Batch(scene, 128, { map: blob, flat: true, additive: false, renderOrder: 1 });
    this.markers = new Batch(scene, 64, { map: arrow, flat: true, additive: true, renderOrder: 2 });
    this.rings = new Batch(scene, 64, { map: soft, flat: true, additive: true, ring: true, renderOrder: 3 });
    this.stamps = new Batch(scene, 256, { map: blob, flat: true, additive: false, renderOrder: 1 });
    // fake lights on the road: round pools under lamps and headlights, and stretched reflection streaks under signs and neon
    this.pools = new Batch(scene, 384, { map: soft, flat: true, additive: true, renderOrder: 2 });
    this.cones = new Batch(scene, 64, { map: softHard, additive: true, renderOrder: 9 });
    // sparks: points
    const sg = new BufferGeometry(); this.sparkPos = new BufferAttribute(new Float32Array(1024 * 3), 3); this.sparkCol = new BufferAttribute(new Float32Array(1024 * 3), 3); this.sparkPos.setUsage(DynamicDrawUsage); this.sparkCol.setUsage(DynamicDrawUsage); sg.setAttribute('position', this.sparkPos); sg.setAttribute('color', this.sparkCol); sg.setDrawRange(0, 0);
    this.sparks = new Points(sg, new PointsMaterial({ size: 0.28, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false, blending: AdditiveBlending, map: soft })); this.sparks.frustumCulled = false; this.sparks.renderOrder = 11; scene.add(this.sparks); this.sparkN = 0;
    // debris, bullets and missiles: instanced boxes
    this.debris = new InstancedMesh(new BoxGeometry(0.5, 0.3, 0.5), new MeshBasicMaterial({ color: 0xffffff }), 256); this.debris.instanceColor = new InstancedBufferAttribute(new Float32Array(256 * 3), 3); this.debris.count = 0; this.debris.frustumCulled = false; scene.add(this.debris);
    this.bullets = new InstancedMesh(new BoxGeometry(0.18, 0.18, 1.3), new MeshBasicMaterial({ color: new Color('#fff2a8') }), 128); this.bullets.count = 0; this.bullets.frustumCulled = false; scene.add(this.bullets);
    this.missiles = new InstancedMesh(new BoxGeometry(0.45, 0.45, 1.6), new MeshBasicMaterial({ color: new Color('#ffd23f') }), 32); this.missiles.count = 0; this.missiles.frustumCulled = false; scene.add(this.missiles);
    // skid marks: a ring buffer of quads with birth times; the shader fades them over 15 s
    const g = new BufferGeometry(); this.skidPos = new BufferAttribute(new Float32Array(SKID_N * 4 * 3), 3); this.skidCol = new BufferAttribute(new Float32Array(SKID_N * 4 * 4), 4); this.skidPos.setUsage(DynamicDrawUsage); this.skidCol.setUsage(DynamicDrawUsage); g.setAttribute('position', this.skidPos); g.setAttribute('aColor', this.skidCol);
    const idx = new Uint32Array(SKID_N * 6); for (let i = 0; i < SKID_N; i++) { const v = i * 4, j = i * 6; idx[j] = v; idx[j + 1] = v + 2; idx[j + 2] = v + 1; idx[j + 3] = v; idx[j + 4] = v + 3; idx[j + 5] = v + 2; } g.setIndex(new BufferAttribute(idx, 1));
    this.skidCol.array.fill(-1e9);
    this.skidMat = new ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: `attribute vec4 aColor; varying vec4 vC; uniform float uTime; void main() { float age = uTime - aColor.a; vC = vec4(aColor.rgb, clamp(1.0 - age / ${SKID_LIFE.toFixed(1)}, 0.0, 1.0) * step(0.0, age) * 0.8); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: `varying vec4 vC; void main() { gl_FragColor = vC; }`, transparent: true, depthWrite: false });
    this.skidMesh = new Mesh(g, this.skidMat); this.skidMesh.frustumCulled = false; this.skidMesh.renderOrder = 1; scene.add(this.skidMesh); this.skidHead = 0; this.ribbonState = new WeakMap();
    // the Gunner sight line and shot lines
    const lg = new BufferGeometry(); this.linePos = new BufferAttribute(new Float32Array(16 * 2 * 3), 3); this.linePos.setUsage(DynamicDrawUsage); lg.setAttribute('position', this.linePos); lg.setDrawRange(0, 0);
    this.lines = new LineSegments(lg, new LineBasicMaterial({ color: new Color('#ff3030'), transparent: true, opacity: 0.9, depthWrite: false })); this.lines.frustumCulled = false; this.lines.renderOrder = 12; scene.add(this.lines); this.lineN = 0;
    this.puffOrder = new Int32Array(800); this.puffKey = new Float32Array(800); this.puffSeq = new Int32Array(800);
    this.batches = [this.glows, this.puffs, this.shadows, this.markers, this.rings, this.stamps, this.pools, this.cones];
  }
  begin() { for (const b of this.batches) b.begin(); this.debris.count = 0; this.bullets.count = 0; this.missiles.count = 0; this.lineN = 0; this.sparkN = 0; }
  glow(x, y, z, r, cr, cg, cb, a) { this.glows.add(x, y, z, r * 2, r * 2, cr, cg, cb, a); }
  puff(x, y, z, r, a, cr = 0.78, cg = 0.8, cb = 0.82, rot = 0) { return this.puffs.add(x, y, z, r * 2, r * 2, cr, cg, cb, a, (rot % 6.2) + 10 * (Math.floor(rot * 1.7) & 3)); }
  shadow(p, w, l, y) { this.shadows.add(p.x, (y !== undefined ? y : p.y) + 0.02, p.z, w * 1.8, 1, 0, 0, 0, 0.55, 1, 0, l * 1.5); }
  marker(G, x, s, kind, dir, a) { toWorld(G.road, x, s, V); const yaw = -(G.road.frame(s).psi) + (dir > 0 ? 0 : Math.PI); this.markers.add(V.x, V.y + 0.04, V.z, 2.4, 1, 1, 0.23, 0.23, a, 1, yaw, 1.6); }
  ring(x, y, z, r, hex, a, fill) { COL.setHex(hex); this.rings.add(x, y, z, r * 2, 1, COL.r, COL.g, COL.b, a, fill, 0, r * 2); }
  sightLine(G, x0, s0, x1, s1, a) { if (this.lineN >= 16) return; toWorld(G.road, x0, s0, V); toWorld(G.road, x1, s1, V2); const i = this.lineN * 2; this.linePos.setXYZ(i, V.x, V.y + 0.6, V.z); this.linePos.setXYZ(i + 1, V2.x, V2.y + 0.6, V2.z); this.lineN++; this.lines.material.opacity = a; }
  pool(G, x, s, r, g, b, a, radius) { toWorld(G.road, x, s, V); this.pools.add(V.x, V.y + 0.03, V.z, radius * 2, 1, r, g, b, a, 1, 0, radius * 2); }
  poolAt(x, y, z, r, g, b, a, radius, yaw = 0, len = 1) { this.pools.add(x, y + 0.03, z, radius * 2, 1, r, g, b, a, 1, yaw, radius * 2 * len); }
  reflect(G, x, s, col, a, len) { if (a <= 0.01) return; toWorld(G.road, x, s, V); this.pools.add(V.x, V.y + 0.03, V.z, 2.2, 1, col.r, col.g, col.b, a, 1, -(G.road.frame(s).psi), Math.max(3, len)); }
  // a car light on the wet road: a narrow streak stretched along the car's heading, under the light, scaled by the look's wetness
  streak(x, y, z, r, g, b, a, yaw, len = 3.5) { if (this.wet <= 0.01) return; this.pools.add(x, y + 0.035, z, 0.9, 1, r, g, b, a * this.wet, 1, yaw, len); }
  cone(x, y, z, r, cr, cg, cb, a) { this.cones.add(x, y, z, r * 2, r * 2, cr, cg, cb, a); }
  spark(x, y, z, r, g, b) { const i = this.sparkN; if (i >= 1024) return; this.sparkPos.setXYZ(i, x, y, z); this.sparkCol.setXYZ(i, r, g, b); this.sparkN = i + 1; }
  // skid ribbons: the sim keeps a polyline per rear wheel; each new point becomes one quad in the ring buffer, stamped with its birth time
  skidSegment(G, x0, s0, x1, s1, dark, time) {
    toWorld(G.road, x0, s0, V); toWorld(G.road, x1, s1, V2); let dx = V2.x - V.x, dz = V2.z - V.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len; const nx = -dz * SKID_W, nz = dx * SKID_W;
    const i = this.skidHead; const v = i * 4; const y0 = V.y + 0.015, y1 = V2.y + 0.015;
    this.skidPos.setXYZ(v, V.x + nx, y0, V.z + nz); this.skidPos.setXYZ(v + 1, V.x - nx, y0, V.z - nz); this.skidPos.setXYZ(v + 2, V2.x - nx, y1, V2.z - nz); this.skidPos.setXYZ(v + 3, V2.x + nx, y1, V2.z + nz);
    const c = 0.03 + 0.06 * (1 - dark); for (let k = 0; k < 4; k++) this.skidCol.setXYZW(v + k, c, c, c + 0.01, time);
    this.skidHead = (i + 1) % SKID_N; this.skidPos.needsUpdate = true; this.skidCol.needsUpdate = true;
  }
  update(G, alpha, elapsed, cam) {
    this.skidMat.uniforms.uTime.value = elapsed;
    for (const r of G.ribbons) { let st = this.ribbonState.get(r); if (!st) { st = { n: 0 }; this.ribbonState.set(r, st); } const pts = r.pts; if (pts.length < st.n) st.n = 0;
      for (let i = Math.max(st.n, 3); i + 2 < pts.length; i += 3) this.skidSegment(G, pts[i - 3], pts[i - 2], pts[i], pts[i + 1], pts[i + 2], elapsed);
      st.n = pts.length; if (pts.length >= 360) st.n -= 3; }   // the sim drops the oldest point once a ribbon holds 120, so the newest stays at the same index
    for (const m of G.marks) { toWorld(G.road, m.x, m.y, V); const a = Math.min(1, m.t / (m.scorch ? 3 : 2.5)) * 0.6; const yaw = -(G.road.frame(m.y).psi); if (m.scorch) { this.stamps.add(V.x, V.y + 0.025, V.z, 44 * M, 1, 0.02, 0.02, 0.02, a, 1, yaw, 60 * M); if (m.t > 2) this.glows.add(V.x, V.y + 0.3, V.z, 2, 2, 1, 0.47, 0.12, (m.t - 2) * 0.6); } else { for (const sx of [-1, 1]) this.stamps.add(V.x + Math.cos(yaw) * sx * 10 * M, V.y + 0.025, V.z - Math.sin(yaw) * sx * 10 * M, 5 * M, 1, 0.02, 0.02, 0.03, a, 1, yaw, 12 * M); } }
    // tyre smoke: 0.5 m to 3 m over the puff's life (an ease-out, so it billows fast then hangs), dense at birth and thinning out;
    // each puff turns slowly from its seed and picks one of four atlas shapes; ground-faded; sorted back to front
    let n = 0; for (const p of G.puffs) { if (n >= 600) break; toWorld(G.road, p.x, p.y, V); const k = p.t / PUFF_LIFE; const e = 1 - (1 - k) * (1 - k); const r = 0.5 + 2.5 * e; const sd = p.seed || 0; const rot = (sd + k * (sd > 3.14 ? 0.9 : -0.9) + 6.2832) % 6.2832;
      const i = this.puffs.add(V.x, V.y + r * 0.45 + k * 0.6, V.z, r * 2, r * 2, 0.92, 0.92, 0.95, 0.9 * (1 - k) * (1 - k * 0.3) * Math.min(1, p.t * 12), Math.min(6.2, rot) + 10 * (Math.floor(sd * 0.64) & 3), 0, 1, V.y); if (i >= 0) { this.puffOrder[n] = i; this.puffKey[n] = -((V.x - cam.x) ** 2 + (V.y - cam.y) ** 2 + (V.z - cam.z) ** 2); n++; } }
    for (const d of G.debris) { toWorld(G.road, d.x, d.y, V); if (d.smoke) { const i = this.puffs.add(V.x, V.y + 0.3, V.z, d.s * M * 2, d.s * M * 2, 0.7, 0.7, 0.7, clamp(d.t, 0, 1) * 0.5); if (i >= 0 && n < 800) { this.puffOrder[n] = i; this.puffKey[n] = -((V.x - cam.x) ** 2 + (V.y - cam.y) ** 2 + (V.z - cam.z) ** 2); n++; } } else { const j = this.debris.count; if (j < 256) { D.position.set(V.x, V.y + 0.3 + Math.abs(Math.sin(d.t * 7)) * 0.8, V.z); D.rotation.set(d.t * 5, d.t * 3, 0); D.scale.set(d.s / 8, d.s / 8, d.s / 8); D.updateMatrix(); this.debris.setMatrixAt(j, D.matrix); COL.set(d.col.startsWith('#') ? d.col : '#777777'); this.debris.instanceColor.setXYZ(j, COL.r, COL.g, COL.b); this.debris.count = j + 1; } } }
    for (const b of G.bullets) { const by = lerp(b.py === undefined ? b.y : b.py, b.y, alpha); toWorld(G.road, b.x, by, V); const j = this.bullets.count; if (j < 128) { D.position.set(V.x, V.y + 0.7, V.z); D.rotation.set(0, -(G.road.frame(by).psi), 0); D.scale.set(b.knock ? 2 : 1, b.knock ? 2 : 1, 1); D.updateMatrix(); this.bullets.setMatrixAt(j, D.matrix); this.bullets.count = j + 1; } }
    for (const m of G.missiles) { const my = lerp(m.py === undefined ? m.y : m.py, m.y, alpha); toWorld(G.road, m.x, my, V); const j = this.missiles.count; if (j < 32) { D.position.set(V.x, V.y + 1.2, V.z); D.rotation.set(0, -(G.road.frame(my).psi), 0); D.scale.set(1, 1, 1); D.updateMatrix(); this.missiles.setMatrixAt(j, D.matrix); this.missiles.count = j + 1; } this.glow(V.x, V.y + 1.2, V.z, 0.9, 1, 0.63, 0.24, 0.8); }
    for (const s of G.sparks) { toWorld(G.road, s.x, s.y, V); COL.set(s.col || '#ffdc78'); const a = 1 - s.t / 0.4; this.spark(V.x, V.y + 0.3 + s.t * 1.5, V.z, COL.r * a, COL.g * a, COL.b * a); }
    for (const f of G.fx) { toWorld(G.road, f.x, f.y, V); const k = f.t / f.life;
      if (f.flame) this.glow(V.x, V.y + 0.5, V.z, 0.6 * (1 + k), 1, 0.6 + 0.3 * k, 0.25, 1 - k);
      else if (f.line) this.sightLine(G, f.x0, f.y0, f.x, f.y, 1 - k);
      else if (f.ring) this.ring(V.x, V.y + 0.04, V.z, (20 + 50 * k) * M, 0xc8c8c8, 1 - k, 1);
      else if (f.burst) this.ring(V.x, V.y + 0.6, V.z, (10 + 30 * k) * M, 0xffdc64, 1 - k, 1);
      else { const R = (f.player ? 90 : 60) * M * 1.5; this.glow(V.x, V.y + 1.8, V.z, R * (0.5 + k), 2.2, f.orange ? 1.1 : 1.3, f.orange ? 0.2 : 0.4, 1 - k); this.glow(V.x, V.y + 1.8, V.z, R * 0.45 * (0.5 + k), 3, 2.6, 2.0, Math.max(0, 1 - k * 2)); this.glow(V.x, V.y + 2.5 + k * 4, V.z, R * 0.6 * k, 1.2, 0.5, 0.15, (1 - k) * 0.7); this.ring(V.x, V.y + 0.05, V.z, R * 1.4 * k, 0xffb060, (1 - k) * 0.8, 1);
        for (let i = 0; i < 10; i++) { const a = i * 2.4 + f.x; const d = 70 * M * k; this.spark(V.x + Math.cos(a) * d, V.y + 1 + k * 2, V.z + Math.sin(a) * d * 0.7, 1 - k, 0.67 * (1 - k), 0.24 * (1 - k)); }
        // 12 debris pieces on ballistic arcs and a column of smoke, render-side, seeded by the wreck's position
        for (let i = 0; i < 12; i++) { const j = this.debris.count; if (j >= 256) break; const a = i * 0.524 + f.x * 0.37, sp = 5 + (i % 3) * 3; const d = sp * k * 1.6; const y = Math.max(0.15, 1 + 9 * k - 11 * k * k); D.position.set(V.x + Math.cos(a) * d, V.y + y, V.z + Math.sin(a) * d); D.rotation.set(k * 9 + i, k * 7, i); const sz = 0.5 + (i % 4) * 0.2; D.scale.set(sz, sz * 0.6, sz); D.updateMatrix(); this.debris.setMatrixAt(j, D.matrix); const hot = k < 0.3 ? 1 : 0; this.debris.instanceColor.setXYZ(j, 0.25 + hot * 0.7, 0.16 + hot * 0.3, 0.12); this.debris.count = j + 1; }
        for (let i = 0; i < 6; i++) { const kk = Math.min(1, k * 1.3 + i * 0.08); const pi = this.puffs.add(V.x + Math.sin(i * 1.7 + f.x) * (0.6 + kk), V.y + 0.8 + kk * 7 + i * 0.5, V.z + Math.cos(i * 1.3) * (0.6 + kk), 1.2 + 3.5 * kk, 1.2 + 3.5 * kk, 0.28, 0.26, 0.26, (1 - kk) * 0.5); if (pi >= 0 && n < 800) { this.puffOrder[n] = pi; this.puffKey[n] = -((V.x - cam.x) ** 2 + (V.y - cam.y) ** 2 + (V.z - cam.z) ** 2); n++; } } } }
    this.sortPuffs(n);
  }
  sortPuffs(n) {
    if (n < 2) return; const ord = this.puffOrder, key = this.puffKey, seq = this.puffSeq; for (let i = 0; i < n; i++) seq[i] = i;
    const sub = seq.subarray(0, n); sub.sort((a, b) => key[a] - key[b]);   // farthest first (keys are negative squared distances)
    const m = this.puffs.mesh; const am = m.instanceMatrix.array, ac = m.instanceColor.array, aa = this.puffs.alpha.array, ap = this.puffs.param.array, ag = this.puffs.ground.array;
    if (!this.puffScratch) this.puffScratch = { m: new Float32Array(am.length), c: new Float32Array(ac.length), a: new Float32Array(aa.length), p: new Float32Array(ap.length), g: new Float32Array(ag.length) };
    const S = this.puffScratch; S.m.set(am); S.c.set(ac); S.a.set(aa); S.p.set(ap); S.g.set(ag); const base = m.count - n;
    for (let i = 0; i < n; i++) { const src = ord[sub[i]], dst = base + i; for (let k = 0; k < 16; k++) am[dst * 16 + k] = S.m[src * 16 + k]; for (let k = 0; k < 3; k++) ac[dst * 3 + k] = S.c[src * 3 + k]; aa[dst] = S.a[src]; ap[dst] = S.p[src]; ag[dst] = S.g[src]; }
  }
  end() { for (const b of this.batches) b.end(); if (this.debris.count) { this.debris.instanceMatrix.needsUpdate = true; this.debris.instanceColor.needsUpdate = true; } if (this.bullets.count) this.bullets.instanceMatrix.needsUpdate = true; if (this.missiles.count) this.missiles.instanceMatrix.needsUpdate = true; this.sparks.geometry.setDrawRange(0, this.sparkN); if (this.sparkN) { this.sparkPos.needsUpdate = true; this.sparkCol.needsUpdate = true; } this.lines.geometry.setDrawRange(0, this.lineN * 2); if (this.lineN) this.linePos.needsUpdate = true; }
  setSun(dir) { this.puffs.mat.uniforms.sunDir.value.copy(dir); }
  // the smoke's light: the key light's colour (damped) and an ambient from the look's sky and fog, so it sits in each look
  setLook(P) { this.wet = P.wet; const u = this.puffs.mat.uniforms; u.sunCol.value.set(P.sunColor).multiplyScalar(Math.min(1, P.sunIntensity * 0.3) * (P.sunElevation > 0 ? 1 : 0.5)); u.ambCol.value.set(P.hemiSky).multiplyScalar(0.35 * P.hemiIntensity).add(COL.set(P.fog).multiplyScalar(0.4)).addScalar(0.26); }
  reset() { this.ribbonState = new WeakMap(); this.skidCol.array.fill(-1e9); this.skidCol.needsUpdate = true; this.skidHead = 0; }
}
