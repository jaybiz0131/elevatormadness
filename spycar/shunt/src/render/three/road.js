// Road mesh from the Sprint C world transform. The road is built in chunks of 400 pt along s, sampled every 10 pt: asphalt with the
// 320 pt texture bands and crest shading, lane dashes on the 40 pt world grid, rails as low walls, tyre walls on the outside of hard
// corners, the red and white rumble strip on the inside of every corner. One merged geometry and one draw call per chunk; chunks
// are recycled as the player moves on. Vertex colours carry the look so the material can change without rebuilding.
import { BufferGeometry, BufferAttribute, Mesh, MeshStandardMaterial, Color, Group, PlaneGeometry, DoubleSide } from 'three';
import { REF, T, hashI } from '../../sim/constants.js';
import { DISTRICTS } from '../../sim/road.js';
import { M, toWorld } from './scale.js';
export const CHUNK = 400, SAMPLE = 10;
const col = (hex) => new Color(hex);
const PAL = DISTRICTS.map(d => ({ road: col(d.road), dark: col(d.dark), shoulder: col(d.shoulder), rail: col(d.rail) }));
export const ROAD_COL = { walk: col('#2c2f38'), lane: col('#c4c9d2'), tyre: col('#2b2d31'), rumbleR: col('#d93a3a'), rumbleW: col('#f2f2f2'), railPost: col('#5d6675') };
const tmp = { x: 0, y: 0, z: 0 }, tmp2 = { x: 0, y: 0, z: 0 }, tmpc = new Color();
// smooth value noise over (x, s) from the road seed: the puddle mask is its upper band
let noiseSeed = 0;
function vnoise(x, s) { const gx = x / 60, gs = s / 90; const ix = Math.floor(gx), is = Math.floor(gs); const fx = gx - ix, fs = gs - is; const h = (a, b) => hashI(noiseSeed, a * 7919 + b * 104729 + 12345) / 4294967296; const u = fx * fx * (3 - 2 * fx), v = fs * fs * (3 - 2 * fs); return (h(ix, is) * (1 - u) + h(ix + 1, is) * u) * (1 - v) + (h(ix, is + 1) * (1 - u) + h(ix + 1, is + 1) * u) * v; }
const puddle = (x, s) => { const n = vnoise(x, s); return n < 0.5 ? 0 : Math.min(1, (n - 0.5) / 0.16); };
// asphalt is drawn much darker than the district's flat colour so the lights, cars and neon carry the frame (style guide: road stays dark)
const ASPHALT = 0.38;
class Builder {
  constructor() { this.pos = []; this.col = []; this.nrm = []; this.wet = []; this.idx = []; this.n = 0; this.wetOn = false; }
  vert(p, c, nx, ny, nz, w = 0) { this.pos.push(p.x, p.y, p.z); this.col.push(c.r, c.g, c.b); this.nrm.push(nx, ny, nz); this.wet.push(w); return this.n++; }
  // a quad between road-space lateral offsets [a0,a1] at s0 and [b0,b1] at s1, lifted by h metres; flat, facing up
  strip(road, a0, a1, s0, b0, b1, s1, c, h = 0, c2) {
    const W = this.wetOn; const i0 = this.vert(lift(toWorld(road, a0, s0, tmp), h), c, 0, 1, 0, W ? 0.02 + 0.98 * puddle(a0, s0) : 0), i1 = this.vert(lift(toWorld(road, a1, s0, tmp), h), c, 0, 1, 0, W ? 0.02 + 0.98 * puddle(a1, s0) : 0);
    const i2 = this.vert(lift(toWorld(road, b1, s1, tmp), h), c2 || c, 0, 1, 0, W ? 0.02 + 0.98 * puddle(b1, s1) : 0), i3 = this.vert(lift(toWorld(road, b0, s1, tmp), h), c2 || c, 0, 1, 0, W ? 0.02 + 0.98 * puddle(b0, s1) : 0);
    this.idx.push(i0, i1, i2, i0, i2, i3);   // counter-clockwise seen from above: the face points up
  }
  // a vertical face along the road at lateral offset x, from height h0 to h1, normal toward the road centre
  wall(road, x0, s0, x1, s1, h0, h1, c, inward) {
    const n = inward; const i0 = this.vert(lift(toWorld(road, x0, s0, tmp), h0), c, n, 0, 0), i1 = this.vert(lift(toWorld(road, x0, s0, tmp), h1), c, n, 0, 0);
    const i2 = this.vert(lift(toWorld(road, x1, s1, tmp), h1), c, n, 0, 0), i3 = this.vert(lift(toWorld(road, x1, s1, tmp), h0), c, n, 0, 0);
    if (inward < 0) this.idx.push(i0, i1, i2, i0, i2, i3); else this.idx.push(i0, i2, i1, i0, i3, i2);
  }
  geometry() { const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3)); g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3)); g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3)); g.setAttribute('wet', new BufferAttribute(new Float32Array(this.wet), 1)); g.setIndex(this.idx); g.computeBoundingSphere(); return g; }
}
function lift(p, h) { p.y += h; return p; }
export function buildChunk(G, k, material) {
  const road = G.road; const b = new Builder(); const s0 = k * CHUNK; noiseSeed = road.seed;
  for (let s = s0; s < s0 + CHUNK; s += SAMPLE) {
    const s1 = s + SAMPLE; const a = road.at(s); const w0 = a.width, n0 = Math.round(a.lanes), cn = a.corner, crest = a.elev > 0.5 ? a.slope : 0; const a1 = road.at(s1); const w1 = a1.width, n1 = Math.round(a1.lanes);
    const di = s >= G.nextDistrictY ? (G.district + 1) % 4 : G.district; const P = PAL[di];
    const dark = Math.floor(s / 320) % 2 === 0; tmpc.copy(dark ? P.dark : P.road).multiplyScalar(ASPHALT);
    if (crest > 0) tmpc.lerp(ROAD_COL.rumbleW, Math.min(0.12, crest * 0.4)); else if (crest < 0) tmpc.multiplyScalar(1 - Math.min(0.25, -crest * 0.8));
    b.wetOn = true; for (let q = 0; q < 4; q++) { const x0 = REF - w0 / 2 + w0 * q / 4, x1 = REF - w0 / 2 + w0 * (q + 1) / 4, y0 = REF - w1 / 2 + w1 * q / 4, y1 = REF - w1 / 2 + w1 * (q + 1) / 4; b.strip(road, x0, x1, s, y0, y1, s1, tmpc); } b.wetOn = false;   // asphalt in four strips so the puddle mask has lateral resolution
    if (Math.floor(s / 40) % 2 === 0 && n0 === n1) for (let j = 1; j < n0; j++) { const x0 = REF - w0 / 2 + w0 * j / n0, x1 = REF - w1 / 2 + w1 * j / n1; b.strip(road, x0 - 1.5, x0 + 1.5, s, x1 - 1.5, x1 + 1.5, s1, ROAD_COL.lane, 0.01); }
    // rails: a 0.5 m kerb wall with a lit top, both sides; tyre walls outside hard corners; rumble strip inside every corner
    for (const side of [-1, 1]) { const o0 = REF + side * (w0 / 2 + 2), o1 = REF + side * (w1 / 2 + 2), q0 = REF + side * (w0 / 2 + 6), q1 = REF + side * (w1 / 2 + 6);
      b.strip(road, Math.min(o0, q0), Math.max(o0, q0), s, Math.min(o1, q1), Math.max(o1, q1), s1, P.rail, 0.5); b.wall(road, o0, s, o1, s1, 0, 0.5, P.rail, -side); }
    if (cn && cn.hard) { const o = -cn.dir; const t0 = REF + o * (w0 / 2 + 7), u0 = REF + o * (w0 / 2 + 19), t1 = REF + o * (w1 / 2 + 7), u1 = REF + o * (w1 / 2 + 19); b.strip(road, Math.min(t0, u0), Math.max(t0, u0), s, Math.min(t1, u1), Math.max(t1, u1), s1, ROAD_COL.tyre, 0.8); b.wall(road, t0, s, t1, s1, 0, 0.8, ROAD_COL.tyre, -o); }
    for (const side of [-1, 1]) { const p0 = REF + side * (w0 / 2 + 6), q0 = REF + side * (w0 / 2 + 46), p1 = REF + side * (w1 / 2 + 6), q1 = REF + side * (w1 / 2 + 46); b.strip(road, Math.min(p0, q0), Math.max(p0, q0), s, Math.min(p1, q1), Math.max(p1, q1), s1, ROAD_COL.walk, 0.15); b.wall(road, q0, s, q1, s1, 0, 0.15, ROAD_COL.walk, side); }   // sidewalk, 3.5 m, kerb 15 cm
    if (cn) { const d = cn.dir; const r0 = REF + d * (w0 / 2 - 10), e0 = REF + d * w0 / 2, r1 = REF + d * (w1 / 2 - 10), e1 = REF + d * w1 / 2; b.strip(road, Math.min(r0, e0), Math.max(r0, e0), s, Math.min(r1, e1), Math.max(r1, e1), s1, Math.floor(s / 20) % 2 ? ROAD_COL.rumbleR : ROAD_COL.rumbleW, 0.012); }
  }
  const m = new Mesh(b.geometry(), material); m.receiveShadow = true; m.frustumCulled = true; m.userData.k = k; return m;
}
export class RoadMesh {
  constructor(scene) {
    this.group = new Group(); scene.add(this.group); this.chunks = new Map();
    this.material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, side: DoubleSide });
    // wet asphalt, all in the shader: world-space value noise gives the aggregate grain (albedo and roughness break-up at 0.4 m and
    // 3 m), the wet attribute marks puddles (near-mirror, darker), and the rest of the asphalt keeps a damp sheen scaled by the look's
    // wet value. Kerbs, walls and paint carry wet = 0 and stay matte. No textures, so nothing to load or compress.
    this.wetUniform = { value: 1 };
    this.material.onBeforeCompile = (sh) => {
      sh.uniforms.uWet = this.wetUniform;
      sh.vertexShader = 'attribute float wet; varying float vWet; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWet = wet; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying float vWet; varying vec3 vWP; uniform float uWet;
float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rh(i), rh(i + vec2(1, 0)), f.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
 float isAsphalt = step(0.01, vWet);   // asphalt carries wet = 0.02 + 0.98 x puddle; kerbs, paint and walls carry 0
 float grain = rn(vWP.xz * 2.5) * 0.6 + rn(vWP.xz * 0.33) * 0.4; float fine = rh(floor(vWP.xz * 18.0));
 diffuseColor.rgb *= mix(1.0, 0.82 + 0.3 * grain + 0.08 * (fine - 0.5), isAsphalt);`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
 float puddleK = max(0.0, vWet - 0.02) / 0.98 * uWet; float damp = isAsphalt * uWet * (0.55 + 0.45 * smoothstep(0.35, 0.75, grain));
 roughnessFactor = mix(roughnessFactor, 0.32, damp); roughnessFactor = mix(roughnessFactor, 0.035, puddleK);
 diffuseColor.rgb *= 1.0 - 0.25 * damp - 0.45 * puddleK;`);
    };
    // the shoulder: one big ground plane that follows the camera, in the district's shoulder colour
    this.ground = new Mesh(new PlaneGeometry(2400, 2400), new MeshStandardMaterial({ color: PAL[0].shoulder.clone().multiplyScalar(0.6), roughness: 1 })); this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -0.02; this.ground.receiveShadow = true; scene.add(this.ground);
  }
  update(G, rdist, camPos) {
    const k0 = Math.floor((rdist - 500) / CHUNK), k1 = Math.floor((rdist + 1700) / CHUNK);
    for (let k = k0; k <= k1; k++) if (!this.chunks.has(k)) { const m = buildChunk(G, k, this.material); this.chunks.set(k, m); this.group.add(m); }
    for (const [k, m] of this.chunks) if (k < k0 - 1 || k > k1 + 1) { this.group.remove(m); m.geometry.dispose(); this.chunks.delete(k); }
    this.ground.position.x = camPos.x; this.ground.position.z = camPos.z; this.ground.material.color.copy(PAL[G.district].shoulder).multiplyScalar(0.6);
  }
  setLook(P) { this.material.roughness = 0.92 - 0.2 * P.wet; this.material.metalness = 0.1 * P.wet; this.material.envMapIntensity = 0.4 + 1.4 * P.wet; this.wetUniform.value = P.wet; }
  reset() { for (const [, m] of this.chunks) { this.group.remove(m); m.geometry.dispose(); } this.chunks.clear(); }
}
