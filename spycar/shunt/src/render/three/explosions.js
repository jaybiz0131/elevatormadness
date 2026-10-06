// Big explosions (Stop 2 finish, visual only: the crash physics comes later). When a car turns into a wreck this notices it and plays a
// render-side explosion at that spot, sized by what blew up: a white flash, a rolling fireball (layered additive glows), a shockwave ring
// (two rings on the road), a burst of hot debris on ballistic arcs, sparks, and a column of black smoke. The flash also "lights" the
// road (a big additive pool of orange on the asphalt) and brightens the cars near it for a few frames; there is no real light in the
// scene (a point light would recompile every material and cost fill on every pixel), so the temporary-light budget is zero.
// Everything is pooled sprites and instances: six explosion slots, fixed, recycled; the effect pools in fx.js are the caps. Nothing here
// reads or writes the sim, so replays and hashes are untouched.
import { Object3D } from 'three';
import { Q } from '../../quality.js';
const D = new Object3D();
const SIZE = { civ: 0.8, weak: 1.0, bruiser: 1.35, gunner: 1.5, truck: 1.6, armored: 2.2 };   // bigger enemies, bigger explosions
const LIFE = 1.7, SLOTS = 6;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export class Explosions {
  constructor() { this.slots = Array.from({ length: SLOTS }, () => ({ on: false, t: 0, x: 0, y: 0, z: 0, s: 1, seed: 0 })); this.n = 0; this.last = 0; }
  spawn(x, y, z, kind, seed) { const e = this.slots.find(q => !q.on) || this.slots.reduce((a, q) => q.t > a.t ? q : a, this.slots[0]); e.on = true; e.t = 0; e.x = x; e.y = y; e.z = z; e.s = SIZE[kind] || 1; e.seed = seed * 97 + this.n++; }
  // brightness the explosions add to a car at world (x, z): a hot flash for the first 0.35 s, within 38 m
  // Stop 3 brightness: the flash, then the fireball keeps lighting what is near it for about a second and a half
  boost(x, z) { let b = 0; for (const e of this.slots) { if (!e.on || e.t > 1.5) continue; const d = Math.hypot(x - e.x, z - e.z); const r = 26 + 16 * e.s; if (d < r) { const f = e.t < 0.35 ? 1 - e.t / 0.35 * 0.6 : 0.4 * (1 - (e.t - 0.35) / 1.15); b += (1 - d / r) * f * 1.3 * Math.min(1.6, e.s); } } return Math.min(2.2, b); }
  update(fx, dt) {
    const low = Q.level === 'low', R = low ? 0.7 : 1;   // Low: smaller flash, rings and road pool (they are the big fill-rate items), fewer lobes, debris and sparks
    for (const e of this.slots) { if (!e.on) continue; e.t += dt; if (e.t >= LIFE) { e.on = false; continue; } const a = e.t, s = e.s, k = a / LIFE, x = e.x, y = e.y, z = e.z, sd = e.seed;
      // 1. the flash: white-hot, huge, gone in 0.2 s
      if (a < 0.22) { const kf = a / 0.22; fx.glow(x, y + 2.2, z, (6 + 16 * kf) * s * R, 7, 6, 4.2, Math.pow(1 - kf, 1.4)); }
      // 2. the fireball: three offset lobes that grow, rise, and cool from white to orange to red
      const kk = clamp(a / 1.0, 0, 1), cool = 1 - kk;
      if (kk < 1) { const al = Math.pow(cool, 1.2);
        fx.glow(x, y + 2.4 + 5 * kk * s, z, (5 + 14 * kk) * s, 2.8, 1.1 - 0.8 * kk, 0.2 - 0.15 * kk, al * 0.8);
        fx.glow(x + Math.cos(sd) * 1.6 * s * kk, y + 1.2 + 2.2 * kk * s, z + Math.sin(sd) * 1.6 * s * kk, (3.8 + 10 * kk) * s, 2.6, 0.9 - 0.6 * kk, 0.15, al * 0.7);
        fx.glow(x - Math.cos(sd) * 1.4 * s * kk, y + 1.5 + 4.2 * kk * s, z - Math.sin(sd) * 1.4 * s * kk, (3.2 + 9 * kk) * s, 2.4, 0.7 - 0.4 * kk, 0.1, al * 0.7);
        fx.glow(x, y + 2.0, z, (2.4 + 4 * kk) * s, 5, 3.4, 1.4, Math.max(0, 1 - kk * 2.6));
        // a lumpy fireball: a dozen smaller hot lobes scattered through a sphere that grows and climbs, so it reads as billowing fire, not one soft glow
        const nl = low ? 6 : 12; for (let i = 0; i < nl; i++) { const h = hash(sd + i * 3.3), h2 = hash(sd * 1.7 + i * 5.1), h3 = hash(sd * 2.3 + i * 7.7); const ang = h * 6.2832, rr = (0.5 + h2) * (1.2 + 5.5 * kk) * s, up = (0.3 + h3) * (1.5 + 6 * kk) * s;
          const fade = Math.max(0, 1 - Math.max(0, kk - 0.15 - 0.4 * h3) * 1.5); fx.glow(x + Math.cos(ang) * rr, y + 1.2 + up, z + Math.sin(ang) * rr, (1.6 + 2.6 * h2 + 3.2 * kk) * s, 2.5 - 0.9 * kk, 0.95 - 0.8 * kk * (0.6 + h), 0.1, 0.5 * fade); } }
      // 3. the shockwave: two rings racing out over the road
      if (a < 0.6) { const kr = a / 0.6; fx.ring(x, y + 0.08, z, (4 + 30 * kr) * s * R, 0xffe3a8, (1 - kr) * 0.4, 1); const k2 = clamp((a - 0.07) / 0.6, 0, 1); if (a > 0.07) fx.ring(x, y + 0.1, z, (4 + 52 * k2) * s * R, 0xff9a40, (1 - k2) * 0.22, 1); }   // Stop 3: quieter rings
      // 4. the road and the walls take the light: a wide orange pool on the asphalt that fades over about a second
      if (a < 1.6) fx.poolAt(x, y, z, 1.0, 0.55, 0.22, 0.8 * Math.pow(1 - a / 1.6, 1.6), (22 + 10 * s) * R, 0, 1);   // Stop 3: lasts longer
      // 5. hot debris on arcs, glowing for the first third of a second then charred; sparks on top
      const nd = Math.round((low ? 12 : 26) * Math.min(2, s)), nsp = Math.round((low ? 14 : 34) * Math.min(2, s));
      for (let i = 0; i < nd; i++) { const j = fx.debris.count; if (j >= Q.debris) break; const h = hash(sd + i * 1.7), h2 = hash(sd * 3.1 + i * 2.3), h3 = hash(sd * 5.3 + i);
        const ang = h * 6.2832, v = (5 + 12 * h2) * (0.6 + 0.4 * s), vy = (7 + 9 * h3) * (0.7 + 0.3 * s); const py = y + 0.8 + vy * a - 9.8 * 0.5 * a * a * 1.15; const gy = Math.max(0.12, py);
        const hot = a < 0.35 ? 1 : Math.max(0, 1 - (a - 0.35) / 0.4); D.position.set(x + Math.cos(ang) * v * a * (py < 0.12 ? 0.7 : 1), gy, z + Math.sin(ang) * v * a * (py < 0.12 ? 0.7 : 1)); D.rotation.set(a * (4 + 9 * h) + i, a * (3 + 7 * h2), i); const sz = 0.6 + 1.0 * h3 * Math.min(1.6, s); D.scale.set(sz, sz * 0.55, sz * 0.8); D.updateMatrix(); fx.debris.setMatrixAt(j, D.matrix);
        fx.debris.instanceColor.setXYZ(j, 0.12 + hot * 3.2, 0.1 + hot * 1.4, 0.1 + hot * 0.3); fx.debris.count = j + 1; }
      if (a < 0.9) for (let i = 0; i < nsp; i++) { const h = hash(sd * 7.7 + i), h2 = hash(sd * 2.9 + i * 1.3); const ang = h * 6.2832, v = (9 + 16 * h2) * (0.7 + 0.3 * s); const py = y + 1 + (6 + 8 * h2) * a - 9.8 * 0.5 * a * a * 1.3; const f = 1 - a / 0.9; fx.spark(x + Math.cos(ang) * v * a, Math.max(0.15, py), z + Math.sin(ang) * v * a, 3 * f, 2 * f * f, 0.7 * f * f); }
      // 6. a black column that rises and spreads, then drifts on into the burning wreck's own smoke (cars.js)
      const np = low ? 4 : 8; for (let i = 0; i < np; i++) { const kp = clamp((a - 0.12 - i * 0.07) / 1.4, 0, 1); if (kp <= 0) continue; fx.puff(x + Math.sin(i * 1.9 + sd) * (0.8 + 2.2 * kp) * s, y + 1.5 + kp * (10 + i * 1.0) * Math.min(1.5, s), z + Math.cos(i * 1.3 + sd) * (0.8 + 2.2 * kp) * s, (2.6 + 7 * kp) * Math.min(1.7, s), 0.8 * (1 - kp * 0.85) * (1 - Math.pow(k, 4)), 0.1, 0.1, 0.11, sd + i); }
    }
  }
}
