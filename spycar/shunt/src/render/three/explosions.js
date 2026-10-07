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
const LIFE = 2.8, SLOTS = 6;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export class Explosions {
  constructor() { this.slots = Array.from({ length: SLOTS }, () => ({ on: false, t: 0, x: 0, y: 0, z: 0, s: 1, seed: 0 })); this.n = 0; this.last = 0; }
  spawn(x, y, z, kind, seed) { const e = this.slots.find(q => !q.on) || this.slots.reduce((a, q) => q.t > a.t ? q : a, this.slots[0]); e.on = true; e.t = 0; e.x = x; e.y = y; e.z = z; e.s = SIZE[kind] || 1; e.seed = seed * 97 + this.n++; }
  // brightness the explosions add to a car at world (x, z): a hot flash for the first 0.35 s, within 38 m
  // Stop 3 brightness: the flash, then the fireball keeps lighting what is near it for about a second and a half
  boost(x, z) { let b = 0; for (const e of this.slots) { if (!e.on || e.t > 2.2) continue; const d = Math.hypot(x - e.x, z - e.z); const r = 18 + 12 * e.s; if (d < r) { const f = 0.45 * (1 - e.t / 2.2); b += (1 - d / r) * f * 1.3 * Math.min(1.6, e.s); } } return Math.min(2.2, b); }
  // Driver control: fire first. A small orange pop instead of the white flash, then a rolling fireball (hot lobes that swirl, climb and cool from yellow
  // to deep red), flames licking at the base for a couple of seconds, a thick black column of smoke and slow embers drifting up. No shockwave rings.
  update(fx, dt) {
    const low = Q.level === 'low', R = low ? 0.7 : 1;
    for (const e of this.slots) { if (!e.on) continue; e.t += dt; if (e.t >= LIFE) { e.on = false; continue; } const a = e.t, s = e.s, k = a / LIFE, x = e.x, y = e.y, z = e.z, sd = e.seed;
      // 1. the pop: orange, small, a tenth of a second
      if (a < 0.12) { const kf = a / 0.12; fx.glow(x, y + 1.6, z, (3 + 4 * kf) * s * R, 2.4, 1.1, 0.3, 0.55 * (1 - kf)); }
      // 2. the rolling fireball: lobes on a swirl that turns over as it climbs (each lobe circles a horizontal axis), yellow-white at the core cooling to red
      const kk = clamp(a / 1.5, 0, 1);
      if (kk < 1) { const nl = low ? 9 : 16, roll = a * 3.2;
        for (let i = 0; i < nl; i++) { const h = hash(sd + i * 3.3), h2 = hash(sd * 1.7 + i * 5.1), h3 = hash(sd * 2.3 + i * 7.7); const ang = h * 6.2832, ph = h2 * 6.2832 + roll * (0.7 + 0.6 * h3);
          const rr = (0.6 + 2.6 * kk) * s * (0.6 + 0.6 * h2), up = (0.8 + 4.2 * kk * (0.6 + h3)) * s; const ox = Math.cos(ang) * (rr + Math.cos(ph) * 0.9 * s), oz = Math.sin(ang) * (rr + Math.cos(ph) * 0.9 * s), oy = up + Math.sin(ph) * 0.9 * s;
          const heat = Math.max(0, 1 - kk * (1.1 + 0.6 * h3)); const fade = Math.pow(1 - kk, 0.8);
          fx.glow(x + ox, y + 1 + oy, z + oz, (1.4 + 2.2 * h2 + 2.6 * kk) * s, 1.5 + 1.3 * heat, 0.3 + 0.9 * heat, 0.04 + 0.25 * heat * heat, 0.62 * fade); }
        fx.glow(x, y + 1.4 + 2.4 * kk * s, z, (2.2 + 4 * kk) * s, 2.2, 0.9 * (1 - kk), 0.15, 0.5 * (1 - kk)); }
      // 3. flames at the base, flickering for two seconds
      if (a < 2.2) { const f = 1 - a / 2.2; for (let i = 0; i < (low ? 3 : 6); i++) { const h = hash(sd * 4.1 + i), fl = 0.7 + 0.3 * Math.sin(a * (17 + 9 * h) + i * 2.1); fx.glow(x + (h - 0.5) * 2.4 * s, y + 0.6 + fl * 1.2 * s * (0.6 + h), z + (hash(sd + i * 9.3) - 0.5) * 2 * s, (0.8 + 0.9 * fl) * s, 2.2, 0.7 + 0.3 * fl, 0.12, 0.7 * f * fl); } }
      // 4. the road takes the firelight: a warm pool that fades with the fire
      if (a < 2.2) fx.poolAt(x, y, z, 1.0, 0.45, 0.15, 0.6 * Math.pow(1 - a / 2.2, 1.3), (14 + 8 * s) * R, 0, 1);
      // 5. a few pieces of hot debris, charred almost at once (the car's own pieces fly as physics, cars.js)
      const nd = Math.round((low ? 5 : 10) * Math.min(2, s));
      for (let i = 0; i < nd; i++) { const j = fx.debris.count; if (j >= Q.debris) break; const h = hash(sd + i * 1.7), h2 = hash(sd * 3.1 + i * 2.3), h3 = hash(sd * 5.3 + i);
        const ang = h * 6.2832, v = (4 + 8 * h2) * (0.6 + 0.4 * s), vy = (5 + 7 * h3) * (0.7 + 0.3 * s); const py = y + 0.8 + vy * a - 9.8 * 0.5 * a * a * 1.15; const gy = Math.max(0.12, py);
        const hot = a < 0.2 ? 1 : Math.max(0, 1 - (a - 0.2) / 0.3); D.position.set(x + Math.cos(ang) * v * Math.min(a, 1.4), gy, z + Math.sin(ang) * v * Math.min(a, 1.4)); D.rotation.set(a * (4 + 9 * h) + i, a * (3 + 7 * h2), i); const sz = 0.4 + 0.7 * h3 * Math.min(1.6, s); D.scale.set(sz, sz * 0.55, sz * 0.8); D.updateMatrix(); fx.debris.setMatrixAt(j, D.matrix);
        fx.debris.instanceColor.setXYZ(j, 0.08 + hot * 2.2, 0.07 + hot * 0.8, 0.07 + hot * 0.1); fx.debris.count = j + 1; }
      // 6. embers: slow orange sparks drifting up and away, flickering out
      const ne = Math.round((low ? 12 : 26) * Math.min(1.6, s));
      for (let i = 0; i < ne; i++) { const h = hash(sd * 7.7 + i), h2 = hash(sd * 2.9 + i * 1.3), h3 = hash(sd * 4.4 + i * 0.7); const life = 1.2 + 1.4 * h3; if (a > life) continue; const f = 1 - a / life, fl = 0.6 + 0.4 * Math.sin(a * 23 + i);
        const ang = h * 6.2832, v = (1.5 + 4 * h2) * s; fx.spark(x + Math.cos(ang) * v * a + Math.sin(a * 2 + i) * 0.5, y + 1 + (2 + 3.5 * h3) * a * s - 0.5 * a * a, z + Math.sin(ang) * v * a, 2.6 * f * fl, 1.1 * f * fl, 0.2 * f); }
      // 7. black smoke: a thick column from the start, rising and spreading, then drifting on into the burning wreck's own smoke (cars.js)
      const np = low ? 6 : 11; for (let i = 0; i < np; i++) { const kp = clamp((a - 0.05 - i * 0.09) / 2.0, 0, 1); if (kp <= 0) continue; fx.puff(x + Math.sin(i * 1.9 + sd) * (0.6 + 2.6 * kp) * s, y + 1.6 + kp * (11 + i * 1.2) * Math.min(1.5, s), z + Math.cos(i * 1.3 + sd) * (0.6 + 2.6 * kp) * s, (2.4 + 7.5 * kp) * Math.min(1.7, s), 0.9 * (1 - kp * 0.8) * (1 - Math.pow(k, 4)), 0.05, 0.05, 0.06, sd + i); }
    }
  }
}
