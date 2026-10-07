import { REF, T, clamp, hashI, mulberry32, smooth } from './constants.js';
export const DISTRICTS = [
  { name: 'COASTAL', sign: 'COAST HWY', road: '#3a3d45', dark: '#33363d', shoulder: '#262a31', rail: '#9aa3b2' },
  { name: 'DESERT', sign: 'DESERT 0.5 MI', road: '#4a4038', dark: '#423931', shoulder: '#2e2520', rail: '#c9a46a' },
  { name: 'CITY', sign: 'DOWNTOWN', road: '#30333c', dark: '#2a2d35', shoulder: '#1c1f26', rail: '#7e8aa6' },
  { name: 'MOUNTAIN', sign: 'PASS 0.5 MI', road: '#3b4040', dark: '#333838', shoulder: '#222828', rail: '#aab5b5' },
];
export class Road {
  // The road is a function of distance s: curvature k(s) (1/radius, + is a right turn), lane count, elevation. Simulation stays in
  // road space (s along the road, x across it, centre always REF). A table integrated every 20 pt gives heading and world position
  // for rendering: forward = (sin psi, cos psi), right = (cos psi, -sin psi).
  constructor(seed) {
    this.seed = seed; this.pieces = []; this.corners = []; this.crests = []; this.hills = [{ s: -2400, e: 0 }, { s: 2200, e: 0 }]; this.hi = 0; this.sectors = []; this.end = -2400; this.curSector = null;
    this.step = 20; this.s0 = -2400; this.n = 0; this.cap = 4096; this.psi = new Float64Array(this.cap); this.X = new Float64Array(this.cap); this.Y = new Float64Array(this.cap);
    this.pi = 0; this.ci = 0; this.out = { center: REF, lanes: 4, width: 4 * T.laneW, k: 0, sector: null, corner: null, elev: 0, slope: 0, curv: 0 };
    this.fr = { psi: 0, X: 0, Y: 0 }; this.ensure(3000);
  }
  ensure(sMax) { while (this.end < sMax + 3000) this.buildSector(); this.integrate(sMax + 3000); }
  addPiece(len, k0, k1, kind, corner) { const p = { s0: this.end, s1: this.end + len, k0, k1, kind, sector: this.curSector, corner: corner || null }; this.pieces.push(p); this.end = p.s1; return p; }
  addStraight(len) { if (len > 0) this.addPiece(len, 0, 0, 'straight'); }
  addCorner(type, R, angleDeg, dir) {
    const k = dir / R, tr = T.corner.transition, arc = angleDeg * Math.PI / 180 * R;
    const c = { type, R, dir, k, s0: this.end, s1: this.end + tr * 2 + arc, apex: this.end + tr + arc / 2, vmax: Math.sqrt(T.drive.grip * R), warnS: this.end - T.corner.warn * T.drive.cruise, hard: type === 'hard' || type === 'hairpin', index: this.corners.length };
    this.corners.push(c); this.addPiece(tr, 0, k, 'in', c); this.addPiece(arc, k, k, 'arc', c); this.addPiece(tr, k, 0, 'out', c); return c;
  }
  buildSector() {
    const i = this.sectors.length; const rng = mulberry32(hashI(this.seed, 1000 + i));
    let kind, len, lanes;
    if (i === 0) { kind = 'combat'; len = 9000 - this.end; lanes = 4; }   // lead-in straight: the first hairpin lands around 20 s in
    else { kind = this.sectors[i - 1].kind === 'combat' ? 'technical' : 'combat'; len = kind === 'combat' ? 14000 + rng() * 7000 : 7000 + rng() * 5000; lanes = kind === 'combat' ? 4 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2); }
    const sector = { kind, s0: this.end, s1: this.end + len, lanes, lanes0: i ? this.sectors[i - 1].lanes : 4, index: i }; this.sectors.push(sector); this.curSector = sector;
    if (kind === 'combat') {
      while (this.end < sector.s1 - 2600) { const st = 1500 + rng() * 2000; this.addStraight(st); this.addCorner('sweeper', 1200 + rng() * 800, 20 + rng() * 25, rng() < 0.5 ? -1 : 1); }
      this.addStraight(sector.s1 - this.end);
    } else {
      this.addStraight(700); const n = 3 + Math.floor(rng() * 4); let dir = rng() < 0.5 ? -1 : 1;   // the lane change settles before the first corner
      for (let c = 0; c < n && this.end < sector.s1 - 900; c++) {
        const r = rng(); const type = (i === 1 && c === 0) ? 'hairpin' : r < 0.25 ? 'hairpin' : r < 0.6 ? 'hard' : 'fast';
        const R = type === 'hairpin' ? 160 + rng() * 20 : type === 'hard' ? 300 : 500 + rng() * 200; const angle = type === 'hairpin' ? 120 + rng() * 50 : type === 'hard' ? 70 + rng() * 30 : 40 + rng() * 30;
        this.addCorner(type, R, angle, dir); dir = rng() < 0.6 ? -dir : dir; this.addStraight(250 + rng() * 350);
      }
      this.addStraight(Math.max(200, sector.s1 - this.end)); sector.s1 = this.end;
    }
    this.buildHills(sector, mulberry32(hashI(this.seed, 3000 + i)));
  }
  // Stop 5: the height profile. Control points (s, e) joined by cosine easing, so every point is a flat top or a flat bottom: the car climbs, goes over a crest
  // and drops into a dip. Combat sectors alternate long rolling hills (the road stays under the car) with jump crests: a long climb, then a short steep drop
  // the car cannot follow at speed, so it leaves the ground at the top (speed^2 x curvature over the pull of gravity, see physics.js) and the road falls
  // away ahead of it, hiding what is in the dip. Technical sectors only roll gently. The first 2,200 pt (the garage ramp and the opening) are flat.
  buildHills(sector, rng) {
    const H = this.hills; const big = sector.kind === 'combat'; let s = H[H.length - 1].s, e = H[H.length - 1].e;
    while (s < sector.s1 - 2000) {
      const jump = big && (rng() < 0.4 || (sector.index === 0 && s < 3000)); let dh, L1, L2;
      if (jump) { dh = 30 + rng() * 26; L1 = 1000 + rng() * 500; L2 = 320 + rng() * 160; if (sector.index === 0 && s < 3000) { dh = 42; L1 = 1100; L2 = 380; } this.crests.push({ s: s + L1, curv: (dh / 2) * Math.pow(Math.PI / L2, 2) }); }
      else if (big) { dh = 14 + rng() * 20; L1 = 900 + rng() * 500; L2 = L1 * (0.85 + rng() * 0.3); }
      else { dh = 6 + rng() * 10; L1 = 700 + rng() * 300; L2 = L1; }
      const low = rng() * 8; H.push({ s: s + L1, e: e + dh }); H.push({ s: s + L1 + L2, e: low }); s += L1 + L2; e = low;
      if (rng() < 0.5) { const f = 300 + rng() * 600; s += f; H.push({ s, e }); }   // a flat stretch between hills
    }
    H.push({ s: Math.max(s, sector.s1), e });
  }
  piece(s) { const P = this.pieces; let j = Math.min(this.pi, P.length - 1); while (j > 0 && s < P[j].s0) j--; while (j + 1 < P.length && s >= P[j].s1) j++; this.pi = j; return P[j]; }
  kAt(s) { const p = this.piece(s); const t = clamp((s - p.s0) / (p.s1 - p.s0), 0, 1); return p.k0 + (p.k1 - p.k0) * t; }
  at(s) {
    if (s > this.end - 3000) this.ensure(s);
    const p = this.piece(s); const t = clamp((s - p.s0) / (p.s1 - p.s0), 0, 1); const o = this.out;
    o.k = p.k0 + (p.k1 - p.k0) * t; o.sector = p.sector; o.corner = p.corner;
    const sec = p.sector; o.lanes = sec.lanes0 + (sec.lanes - sec.lanes0) * smooth((s - sec.s0) / 600); o.width = o.lanes * T.laneW; o.center = REF;
    // the height profile: cosine easing between control points, so the slope is zero at every crest and every dip
    const Hh = this.hills; let j = Math.min(this.hi, Hh.length - 2); while (j > 0 && s < Hh[j].s) j--; while (j + 2 < Hh.length && s >= Hh[j + 1].s) j++; this.hi = j;
    { const a = Hh[j], b = Hh[j + 1]; const L = b.s - a.s; const u = clamp((s - a.s) / L, 0, 1); o.elev = a.e + (b.e - a.e) * 0.5 * (1 - Math.cos(Math.PI * u)); o.slope = (b.e - a.e) * 0.5 * Math.PI / L * Math.sin(Math.PI * u); o.curv = (b.e - a.e) * 0.5 * Math.pow(Math.PI / L, 2) * Math.cos(Math.PI * u); }
    return o;
  }
  integrate(sMax) {
    const need = Math.ceil((sMax - this.s0) / this.step) + 2; if (need > this.cap) { let cap = this.cap; while (cap < need) cap *= 2; const g = (a) => { const b = new Float64Array(cap); b.set(a); return b; }; this.psi = g(this.psi); this.X = g(this.X); this.Y = g(this.Y); this.cap = cap; }
    if (this.n === 0) { this.psi[0] = 0; this.X[0] = 0; this.Y[0] = 0; this.n = 1; }
    while (this.n < need) { const i = this.n; const sMid = this.s0 + (i - 0.5) * this.step; const k = this.kAt(sMid); const psi = this.psi[i - 1] + k * this.step; this.psi[i] = psi; const pm = (this.psi[i - 1] + psi) / 2; this.X[i] = this.X[i - 1] + Math.sin(pm) * this.step; this.Y[i] = this.Y[i - 1] + Math.cos(pm) * this.step; this.n++; }
  }
  frame(s) {
    if (s > this.s0 + (this.n - 2) * this.step) this.ensure(s);
    const u = Math.max(0, (s - this.s0) / this.step); const i = Math.min(this.n - 2, Math.floor(u)); const t = u - i; const f = this.fr;
    f.psi = this.psi[i] + (this.psi[i + 1] - this.psi[i]) * t; f.X = this.X[i] + (this.X[i + 1] - this.X[i]) * t; f.Y = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * t; return f;
  }
  world(x, s, out) { const f = this.frame(s); const d = x - REF; out.X = f.X + Math.cos(f.psi) * d; out.Y = f.Y - Math.sin(f.psi) * d; return out; }
  cornerAhead(s, within) { for (let i = Math.max(0, this.ci2 || 0); i < this.corners.length; i++) { const c = this.corners[i]; if (c.s1 < s - 200) { this.ci2 = i; continue; } if (c.s0 > s + within) return null; if (c.s1 >= s) return c; } return null; }
  laneCount(y) { return Math.round(this.at(y).lanes); }
  laneX(y, i) { const a = this.at(y); const n = Math.round(a.lanes); i = clamp(i, 0, n - 1); return a.center - a.width / 2 + (i + 0.5) * (a.width / n); }
  laneOf(y, x) { const a = this.at(y); const n = Math.round(a.lanes); return clamp(Math.floor((x - (a.center - a.width / 2)) / (a.width / n)), 0, n - 1); }
}
