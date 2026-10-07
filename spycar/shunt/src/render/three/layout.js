// Street layout, pure: where every building, shopfront model, rooftop unit and landmark stands, decided from (road seed, chunk index) alone.
// No three.js, no DOM: city.js turns the records into meshes, tools/buildcheck.mjs runs the same functions in node and fails the build if a
// building touches the driving surface. Units: pt along and across the road (s, x), metres for sizes (M = 0.075 m per pt); world positions are
// the road's plane coordinates (X, Y) in pt, so forward = (sin psi, cos psi) and right = (cos psi, -sin psi).
//
// The rule (Jack: "some buildings still sit in the road"): every footprint, detail box and model footprint is tested, in its true oriented shape,
// against the road strip (rail edge to rail edge, w/2 + 2 pt either side of the centre) of the WHOLE road, not only the stretch it stands beside, so
// a hairpin's far arm or a later loop of the road counts. A plot that fails is shortened (up to 58 %), pushed back a few metres, or dropped.
// The test uses a private copy of the road (Road is a pure function of its seed), so a chunk's layout never depends on how far the sim has
// generated the road, or on the order the chunks are asked for.
import { REF, T, hashI } from '../../sim/constants.js';
import { Road } from '../../sim/road.js';

export const M = 4.5 / 60;             // metres per pt (scale.js has the same number)
export const LAYOUT_CHUNK = 400;       // pt per chunk: must equal CHUNK in road.js (city.js asserts it)
export const MIN_CLEARANCE = 40;       // pt: the hard limit between any building part and the road edge (the pavement is 40 pt wide)
export const WANT = 52;                // pt: what the generator aims for (anything below is shortened, pushed back or dropped)
export const WANT_LANDMARK = 45;       // landmarks sit at their authored distance (the radio tower is 49 pt clear on a straight)
const CAP = 200;                       // clearances are only measured up to this
// the three landmarks: one each, at fixed distances along every road (pt), on one side, set back `off` pt from the road edge, turned to
// face the road; `clear` is the half-length of the plot kept free of street buildings
export const LANDMARKS = [
  { name: 'radio_tower', s: 4200, side: -1, off: 330, clear: 340, yaw: 0 },
  { name: 'hotel_tower', s: 9000, side: 1, off: 300, clear: 280, yaw: Math.PI / 2 },
  { name: 'parking_garage', s: 15000, side: -1, off: 160, clear: 300, yaw: -Math.PI / 2 },
];
// the imported models' real sizes in metres [x, y, z] after propModels.js has scaled them (checked against assets/models/*.glb by buildcheck.mjs)
export const MODEL_SIZE = { storefront: [6, 5.61, 3.374], rooftop_ac: [2.6, 1.592, 1.489], hotel_tower: [33.176, 70, 33.152], radio_tower: [41.835, 80, 41.014], parking_garage: [40, 20.608, 12.515] };
const MODELS = ['storefront', 'rooftop_ac', 'radio_tower', 'hotel_tower', 'parking_garage'];
const hash = (seed, i, salt = 0) => hashI(seed ^ Math.imul(salt + 1, 0x27d4eb2f), i) / 4294967296;
const has = (opts, name) => !opts.glb || !!opts.glb[name];   // no glb map: every model is assumed present (the worst case for the check)
const sigOf = (opts) => { let n = opts.legacy ? 1 : 0; if (opts.horizon) n += 4096 * Math.round(opts.horizon / 100); for (let i = 0; i < MODELS.length; i++) if (has(opts, MODELS[i])) n |= 2 << i; return n * 100000 + Math.round((opts.sfDepth || MODEL_SIZE.storefront[2]) * 1000); };

// ---------------------------------------------------------------------------------------------------------------------------------------------
// per-seed context: a private Road, its edge samples every 10 pt and a spatial hash of the road quads
const INDEX_START = -2400, INDEX_END = 128000, STEP = 10, CELL = 128;   // a run is 120,000 pt (T.goal.city) and the street is built 4,000 pt ahead
const ctxs = new Map();
function ctxFor(seed) {
  let c = ctxs.get(seed); if (c) return c;
  if (ctxs.size >= 6) ctxs.delete(ctxs.keys().next().value);
  c = buildCtx(seed); ctxs.set(seed, c); return c;
}
const cellKey = (ix, iy) => (ix + 16384) * 32768 + (iy + 16384);
function buildCtx(seed) {
  const road = new Road(seed); road.ensure(INDEX_END + 4000);
  const N = Math.round((INDEX_END - INDEX_START) / STEP) + 1;
  const lx = new Float64Array(N), ly = new Float64Array(N), rx = new Float64Array(N), ry = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const s = INDEX_START + i * STEP; const hw = road.at(s).width / 2 + 2; const f = road.frame(s); const c = Math.cos(f.psi), sn = Math.sin(f.psi);
    lx[i] = f.X - c * hw; ly[i] = f.Y + sn * hw; rx[i] = f.X + c * hw; ry[i] = f.Y - sn * hw;
  }
  const qb = new Float64Array(4 * N);   // quad i bounds: minx, maxx, miny, maxy
  const grid = new Map();
  for (let i = 0; i < N - 1; i++) {
    const x0 = Math.min(lx[i], rx[i], lx[i + 1], rx[i + 1]), x1 = Math.max(lx[i], rx[i], lx[i + 1], rx[i + 1]), y0 = Math.min(ly[i], ry[i], ly[i + 1], ry[i + 1]), y1 = Math.max(ly[i], ry[i], ly[i + 1], ry[i + 1]);
    qb[4 * i] = x0; qb[4 * i + 1] = x1; qb[4 * i + 2] = y0; qb[4 * i + 3] = y1;
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) for (let iy = Math.floor(y0 / CELL); iy <= Math.floor(y1 / CELL); iy++) { const key = cellKey(ix, iy); const a = grid.get(key); if (a) a.push(i); else grid.set(key, [i]); }
  }
  const hard = road.corners.filter(k => k.hard);
  return { seed, road, N, lx, ly, rx, ry, qb, grid, stamp: new Int32Array(N), stampN: 0, hard, centers: new Map(), cache: new Map(), lmCache: new Map(), tmp: new Float64Array(8) };
}
export function dropLayoutCache() { ctxs.clear(); }

// ---- geometry ----
// distance from a point to a segment
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy; let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = ax + dx * t - px, ey = ay + dy * t - py; return Math.sqrt(ex * ex + ey * ey); }
// do two convex quads (8 numbers each, in loop order) overlap (separating axis test)
function overlap(A, B) {
  for (let pass = 0; pass < 2; pass++) { const P = pass ? B : A;
    for (let e = 0; e < 4; e++) { const x1 = P[2 * e], y1 = P[2 * e + 1], x2 = P[2 * ((e + 1) & 3)], y2 = P[2 * ((e + 1) & 3) + 1]; const nx = y2 - y1, ny = x1 - x2;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let v = 0; v < 4; v++) { const pa = A[2 * v] * nx + A[2 * v + 1] * ny, pb = B[2 * v] * nx + B[2 * v + 1] * ny; if (pa < a0) a0 = pa; if (pa > a1) a1 = pa; if (pb < b0) b0 = pb; if (pb > b1) b1 = pb; }
      if (a1 < b0 || b1 < a0) return false; } }
  return true;
}
// distance between two convex quads: 0 if they overlap, else the smallest vertex-to-edge distance
function quadDist(A, B, best) {
  if (overlap(A, B)) return 0;
  for (let v = 0; v < 4; v++) for (let e = 0; e < 4; e++) { const e2 = (e + 1) & 3;
    let d = segDist(A[2 * v], A[2 * v + 1], B[2 * e], B[2 * e + 1], B[2 * e2], B[2 * e2 + 1]); if (d < best) best = d;
    d = segDist(B[2 * v], B[2 * v + 1], A[2 * e], A[2 * e + 1], A[2 * e2], A[2 * e2 + 1]); if (d < best) best = d; }
  return best;
}
// The clearance of a convex quad P (Float64Array(8), world plane pt) from the road strip of the whole road, in pt: 0 when it touches or overlaps
// the strip, capped at `cap`. When `info` is given, info.s is the s of the nearest road quad (-1 if none within the cap) and info.d the distance. i0..i1 limit it to road quads (10 pt each, from s = -2400) in that index range: roadWindow(s, h).
export function roadClearance(ctxOrSeed, P, cap = CAP, info = null, i0 = 0, i1 = Infinity) {
  const c = typeof ctxOrSeed === 'object' ? ctxOrSeed : ctxFor(ctxOrSeed);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let v = 0; v < 4; v++) { const x = P[2 * v], y = P[2 * v + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const { grid, qb, lx, ly, rx, ry, stamp } = c; const st = ++c.stampN; const Q = c.tmp; let best = cap, bi = -1;
  for (let ix = Math.floor((x0 - cap) / CELL); ix <= Math.floor((x1 + cap) / CELL); ix++) for (let iy = Math.floor((y0 - cap) / CELL); iy <= Math.floor((y1 + cap) / CELL); iy++) {
    const a = grid.get(cellKey(ix, iy)); if (!a) continue;
    for (let j = 0; j < a.length; j++) { const i = a[j]; if (i < i0 || i > i1 || stamp[i] === st) continue; stamp[i] = st;
      const gx = Math.max(0, qb[4 * i] - x1, x0 - qb[4 * i + 1]), gy = Math.max(0, qb[4 * i + 2] - y1, y0 - qb[4 * i + 3]); if (gx * gx + gy * gy >= best * best) continue;
      Q[0] = lx[i]; Q[1] = ly[i]; Q[2] = lx[i + 1]; Q[3] = ly[i + 1]; Q[4] = rx[i + 1]; Q[5] = ry[i + 1]; Q[6] = rx[i]; Q[7] = ry[i];
      const d = quadDist(P, Q, best); if (d < best) { best = d; bi = i; if (d === 0) { if (info) { info.s = INDEX_START + i * STEP; info.d = 0; } return 0; } } } }
  if (info) { info.s = bi >= 0 ? INDEX_START + bi * STEP : -1; info.d = best; }
  return best;
}
export const roadContext = (seed) => ctxFor(seed);
// the quad index range [i0, i1] of the road within h pt of s (h = undefined or Infinity: the whole road)
export const roadWindow = (s, h) => h && h < Infinity ? [Math.max(0, Math.floor((s - h - INDEX_START) / STEP)), Math.ceil((s + h - INDEX_START) / STEP)] : [0, Infinity];
// a quad of across extent a and along extent b (pt) centred at (cx, cy), across axis (ux, uy), along axis (vx, vy)
function quad(cx, cy, ux, uy, vx, vy, a, b) { const ha = a / 2, hb = b / 2, q = new Float64Array(8);
  q[0] = cx - ux * ha - vx * hb; q[1] = cy - uy * ha - vy * hb; q[2] = cx + ux * ha - vx * hb; q[3] = cy + uy * ha - vy * hb; q[4] = cx + ux * ha + vx * hb; q[5] = cy + uy * ha + vy * hb; q[6] = cx - ux * ha + vx * hb; q[7] = cy - uy * ha + vy * hb; return q; }
// the world plane position and heading of road-space (x, s)
function placeAt(R, x, s, out) { const f = R.frame(s); const d = x - REF; out.X = f.X + Math.cos(f.psi) * d; out.Y = f.Y - Math.sin(f.psi) * d; out.psi = f.psi; return out; }
const PL = { X: 0, Y: 0, psi: 0 }, PL2 = { X: 0, Y: 0, psi: 0 };

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the footprints of everything a building record puts on the ground, as [{ k: kind, q: Float64Array(8) world pt }]: the body with its parapet, the
// lit shopfront and awning boxes, roof units, the shopfront model and the rooftop AC model (drawn exactly where city.js puts them)
export function buildingParts(road, rec) {
  const R = road.world ? road : ctxFor(road.seed).road; const out = [];
  placeAt(R, rec.x, rec.sc, PL); const psi = PL.psi, cx = PL.X, cy = PL.Y; const ux = Math.cos(psi), uy = -Math.sin(psi), vx = Math.sin(psi), vy = Math.cos(psi);
  out.push({ k: 'body', q: quad(cx, cy, ux, uy, vx, vy, (rec.depth + 0.3) / M, (rec.L + 0.3) / M) });
  for (const d of rec.details) { if (d.n === 'parapet') continue; const px = cx + ux * (d.x / M) - vx * (d.z / M), py = cy + uy * (d.x / M) - vy * (d.z / M); out.push({ k: d.n, q: quad(px, py, ux, uy, vx, vy, d.w / M, d.d / M) }); }
  if (rec.front) { const f = rec.front; placeAt(R, f.x, f.s, PL2); const p2 = PL2.psi; out.push({ k: 'front', q: quad(PL2.X, PL2.Y, Math.cos(p2), -Math.sin(p2), Math.sin(p2), Math.cos(p2), f.depth / M, MODEL_SIZE.storefront[0] / M) }); }
  for (const r of rec.roofs) { placeAt(R, r.x, r.s, PL2); const th = PL2.psi + r.yaw; out.push({ k: 'roof', q: quad(PL2.X, PL2.Y, Math.cos(th), -Math.sin(th), Math.sin(th), Math.cos(th), MODEL_SIZE.rooftop_ac[0] / M, MODEL_SIZE.rooftop_ac[2] / M) }); }
  return out;
}
// the corners of a landmark's footprint
function landmarkQuad(R, lm, x) { placeAt(R, x, lm.s, PL); const th = PL.psi + lm.yaw; const sz = MODEL_SIZE[lm.name]; return quad(PL.X, PL.Y, Math.cos(th), -Math.sin(th), Math.sin(th), Math.cos(th), sz[0] / M, sz[2] / M); }

// ---------------------------------------------------------------------------------------------------------------------------------------------
// corner helpers, the same rules the sim and the old city used
// the sim's rule (crash.js buildingSide): round a hard corner the inside of the bend has no building wall, 1300 pt before to 700 pt after it
function wallAt(ctx, s, side) {
  const cn = ctx.road.at(s).corner;
  if (!cn) { for (const c of ctx.hard) { if (c.s0 > s + 700) break; if (s > c.s0 - 1300 && s < c.s1 + 700) return side !== c.dir; } return true; }
  return !(cn.hard && side === cn.dir);
}
function hardNear(ctx, s) { for (const c of ctx.hard) { if (c.s0 - 1300 >= s) break; if (s > c.s0 - 1300 && s < c.s1 + 700) return true; } return false; }
// the centre of a corner's arc in world metres: of the two points R either side of the apex, the one that is R from the road a little way along it
function cornerCenter(ctx, c) {
  let r = ctx.centers.get(c); if (r) return r; const R = ctx.road, a = c.apex;
  const pt = (x, s) => { R.world(x, s, PL); return { x: PL.X * M, y: R.at(s).elev * M, z: -PL.Y * M }; };
  const A = pt(REF - c.R, a), B = pt(REF + c.R, a), Q = pt(REF, a + c.R * 0.5); const dist = (p, q) => Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2);
  const inside = Math.abs(dist(A, Q) - c.R * M) < Math.abs(dist(B, Q) - c.R * M) ? A : B; r = { x: inside.x, z: inside.z }; ctx.centers.set(c, r); return r;
}
// round a tight bend a building on the inside lands on the road's other arc: another stretch of road within 230 pt of the plot, or the plot inside the bend itself
function tightClash(ctx, side, s, len, w) {
  const R = ctx.road; const sc = s + len / 2; R.world(REF + side * (w / 2 + T.city.setback + 8 / M), sc, PL); const vx = PL.X * M, vz = -PL.Y * M;
  for (let s2 = Math.max(0, s - 1400); s2 <= s + 1400; s2 += 40) { if (Math.abs(s2 - sc) < 250) continue; const w2 = R.at(s2).width; R.world(REF, s2, PL); if (Math.hypot(vx - PL.X * M, vz + PL.Y * M) < (w2 / 2 + 230) * M) return true; }
  for (const c of ctx.hard) { if (sc < c.s0 - 300) break; if (sc > c.s1 + 300) continue; const ctr = cornerCenter(ctx, c); if (Math.hypot(vx - ctr.x, vz - ctr.z) < (c.R + 150) * M) return true; }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// one candidate building for a plot: s (plot start), the hashes, and the sub-interval [sa, sa + lenC] of the plot it fills, pushed back pb pt
function makeRecord(ctx, opts, side, s, len, h, tight, sa, lenC, pb) {
  const R = ctx.road, seed = ctx.seed; const sc = sa + lenC / 2; const w = R.at(sc).width; const sfDepth = opts.sfDepth || MODEL_SIZE.storefront[2];
  const tower = h.h3 > 0.72 && !tight; const depth = tower ? 16 + h.h2 * 12 : 8 + h.h2 * 6;
  const height = tower ? 24 + (h.h3 - 0.72) * 70 : tight ? Math.min(7, 3 + h.h3 * 5) : 5 + h.h3 * 12;
  const x = REF + side * (w / 2 + (tower ? 330 + 120 * h.h2 : T.city.setback) + pb + depth / 2 / M);
  const L = lenC * M * 0.92, fx = -side * depth / 2;   // the box runs along the road with its depth across; the road-facing facade is at x = -side * depth / 2
  const glbFront = !tower && has(opts, 'storefront') && L >= 7, glbRoof = !tower && has(opts, 'rooftop_ac');
  const details = []; let front = null; const roofs = [];
  if (glbFront) front = { x: x - side * (depth / 2 + sfDepth / 2 - 1.5) / M, s: sc, yaw: side * Math.PI / 2, depth: sfDepth };   // shopfront model, its back 1.5 m into the facade
  if (glbRoof) { const hr = hash(seed, Math.round(s) + side * 7, 5); roofs.push({ x: x + side * (hr - 0.5) * depth * 0.4 / M, s: sc - 0.25 * L / M, y: height + 0.6, yaw: hr * 6.283 }); }
  if (!tower && !glbFront) { details.push({ n: 'shop', w: 0.25, h: 2.6, d: L * 0.86, x: fx - side * 0.1, y: 1.5, z: 0, sw: h.h1 > 0.5 ? 'warm' : 'cool', white: true }, { n: 'awning', w: 1.4, h: 0.18, d: L * 0.9, x: fx - side * 0.7, y: 3.1, z: 0, sw: 'roof' }); }   // lit shopfront and an awning over it
  details.push({ n: 'parapet', w: depth + 0.3, h: 0.6, d: L + 0.3, x: 0, y: height + 0.3, z: 0, sw: 'roof' });
  for (let r = 0; r < (tower ? 3 : glbRoof ? 0 : 2); r++) { const hr = hash(seed, Math.round(s) + side * 7 + r * 13, 5); details.push({ n: 'unit', w: 1.6 + hr * 1.6, h: 1.0 + hr, d: 2 + hr * 2, x: (hr - 0.5) * depth * 0.5, y: height + 0.6 + (0.5 + hr / 2), z: (r - 1) * L * 0.28, sw: 'roof', bright: true }); }
  const rec = { side, s, plotLen: len, len: lenC, sc, x, pb, depth, height, tower, tight, L, h1: h.h1, h2: h.h2, h3: h.h3, front, roofs, details, faceX: x - side * depth / 2 / M, shortened: lenC < len - 0.5, clr: CAP, parts: null, footprint: null, yaw: 0, psi: 0, cx: 0, cz: 0 };
  rec.parts = buildingParts(R, rec); const body = rec.parts[0].q; rec.footprint = [[body[0], body[1]], [body[2], body[3]], [body[4], body[5]], [body[6], body[7]]];
  placeAt(R, x, sc, PL); rec.psi = PL.psi; rec.yaw = -PL.psi; rec.cx = PL.X * M; rec.cz = -PL.Y * M; return rec;
}
// the smallest clearance over a record's parts; stops early (returning the value found) once it is below `want`
function recClearance(ctx, rec, want, win) {
  const body = roadClearance(ctx, rec.parts[0].q, want + 40, null, win[0], win[1]); if (body < want) return body; let m = body;
  if (body < want + 40) for (let i = 1; i < rec.parts.length; i++) { const d = roadClearance(ctx, rec.parts[i].q, want + 40, null, win[0], win[1]); if (d < m) { m = d; if (m < want) return m; } }
  return m;
}
// candidate (fill fraction of the plot, push back in pt) in order of preference
const CANDS = [[1, 0], [1, 16], [0.85, 0], [1, 32], [0.7, 0], [0.7, 16], [0.55, 0], [0.55, 16], [0.42, 0]];
const MIN_LEN = 90;     // pt: the shortest building (6.2 m)
// walls: the sim has a wall wherever buildingSide() is true, per 200 pt segment centre; a building may only stand where there is one
function wallsCover(ctx, side, a, b) { for (let k = Math.floor(a / 200); k <= Math.floor(b / 200); k++) if (!wallAt(ctx, k * 200 + 100, side)) return false; return true; }

// ---------------------------------------------------------------------------------------------------------------------------------------------
// layoutChunk(road, k, opts): the buildings of chunk k (s from k * 400 to k * 400 + 400), both sides.
//   opts.glb      which imported models exist ({ storefront, rooftop_ac, radio_tower, hotel_tower, parking_garage } truthy or not); absent = all
//   opts.sfDepth  the storefront model's depth in metres (default its real 3.374)
//   opts.horizon  only road within this many pt (along s) of a plot counts; default the whole road (a stretch more than 4,500 pt away is never on screen with it)
//   opts.legacy   true: the OLD generator (no road test, no inside-of-hard-corner rule, no shortening), kept so buildcheck.mjs --legacy can show the old failures
// returns { k, seed, buildings: [record], removed: [{ side, s, len, reason }], stats: { plots, placed, shortened, pushed, removed } }; the result is cached
// and must not be mutated.
//
// A record: { side, s (plot start), plotLen, len (pt, shortened plots are shorter than the plot), sc (centre s), x (road-space centre), pb (push back, pt),
//   depth, height, tower, tight, L (box length, m), h1, h2, h3 (hashes: tint, signs, ...), yaw (three.js rotateY at the centre = -psi), psi, cx, cz (centre, three.js m),
//   faceX (the road-facing facade, road-space x), front (storefront model { x, s, yaw, depth } or null: when set there are no lit shop and awning boxes),
//   roofs (rooftop AC models), details [{ n, w, h, d, x, y, z, sw, white, bright }] (box-local metres, x across, z along: the shop, awning, parapet and roof units),
//   footprint [[X, Y] x4] (body with parapet, world plane pt, loop order), parts [{ k, q }] (every box on the ground), clr (clearance found, pt, capped), shortened }
export function layoutChunk(road, k, opts = {}) {
  const ctx = ctxFor(road.seed); const key = k + ':' + sigOf(opts); const hit = ctx.cache.get(key); if (hit) return hit;
  if (ctx.cache.size > 600) ctx.cache.clear();
  const R = ctx.road, seed = ctx.seed; const legacy = !!opts.legacy; const s0 = k * LAYOUT_CHUNK; const buildings = [], removed = [];
  const stats = { plots: 0, placed: 0, shortened: 0, pushed: 0, removed: 0 };
  for (const side of [-1, 1]) {
    let s = s0;
    while (s < s0 + LAYOUT_CHUNK - 40) {
      const h = { h1: hash(seed, Math.round(s) + side * 7, 1), h2: hash(seed, Math.round(s) + side * 7, 2), h3: hash(seed, Math.round(s) + side * 7, 3) };
      const len = 120 + h.h1 * 160; const next = s + len + 20 + h.h2 * 40; const sc = s + len / 2; stats.plots++;
      const drop = (reason) => { removed.push({ side, s, len, reason }); stats.removed++; s = next; };
      // a landmark's plot stays clear of street buildings on its side
      if (LANDMARKS.some(lm => has(opts, lm.name) && lm.side === side && Math.abs(sc - lm.s) < lm.clear)) { drop('landmark'); continue; }
      const w = R.at(sc).width;
      // no towers round a hard corner (1,300 pt before to 700 pt after it): the chase camera swings across the inside of the bend and used to end up inside a
      // 40 m block; here every building is 7 m or less, well under the camera's height
      const tight = hardNear(ctx, sc);
      if (tight && tightClash(ctx, side, s, len, w)) { drop('clash'); continue; }   // the old test, kept: the camera looks across a bend and a rooftop in it hid the road
      let rec = null;
      if (legacy) rec = makeRecord(ctx, opts, side, s, len, h, tight, s, len, 0);
      else {
        let bestC = null, bestD = -1; const win = roadWindow(sc, opts.horizon);
        for (const [f, pb] of CANDS) {
          const lenC = len * f; if (lenC < MIN_LEN) continue; bestC = null; bestD = -1;
          for (const off of f === 1 ? [0] : [(1 - f) / 2, 0, 1 - f]) {   // a shorter building: centred, at the start of the plot or at its end
            const sa = s + off * len; if (!wallsCover(ctx, side, sa, sa + lenC)) continue;
            const r = makeRecord(ctx, opts, side, s, len, h, tight, sa, lenC, pb); const d = recClearance(ctx, r, WANT, win); if (d >= WANT && d > bestD) { bestD = d; bestC = r; } }
          if (bestC) { bestC.clr = bestD; rec = bestC; break; }
        }
      }
      if (!rec) { drop(legacy ? 'none' : (wallsCover(ctx, side, s, s + len) ? 'road' : 'open')); continue; }
      buildings.push(rec); stats.placed++; if (rec.shortened) stats.shortened++; if (rec.pb) stats.pushed++;
      s = next;
    }
  }
  const res = { k, seed, buildings, removed, stats }; ctx.cache.set(key, res); return res;
}

// landmarkLayout(road, opts): the landmarks that stand, [{ name, side, s, x (road-space centre), off, yaw, moved (pt pushed back), q (footprint, world plane pt) }].
// A landmark beside a hard corner is left out (as before); one whose footprint would be closer than 45 pt to the road is pushed back until it is clear.
export function landmarkLayout(road, opts = {}) {
  const ctx = ctxFor(road.seed); const key = 'lm' + sigOf(opts); const hit = ctx.lmCache.get(key); if (hit) return hit; const R = ctx.road; const out = [];
  for (const lm of LANDMARKS) {
    if (!has(opts, lm.name)) continue;
    if (ctx.hard.some(c => lm.s > c.s0 - 1300 && lm.s < c.s1 + 900)) continue;   // a tower beside a hard corner would stand between the camera and the road
    const w = R.at(lm.s).width; let found = null; const win = roadWindow(lm.s, opts.horizon);
    for (let moved = 0; moved <= (opts.legacy ? 0 : 400) && !found; moved += 20) { const x = REF + lm.side * (w / 2 + lm.off + moved); const q = landmarkQuad(R, lm, x); if (opts.legacy || roadClearance(ctx, q, WANT_LANDMARK + 20, null, win[0], win[1]) >= WANT_LANDMARK) found = { x, q, moved }; }
    if (!found) continue;   // no room at any distance: left out
    out.push({ name: lm.name, side: lm.side, s: lm.s, x: found.x, off: lm.off + found.moved, yaw: lm.yaw, moved: found.moved, q: found.q });
  }
  ctx.lmCache.set(key, out); return out;
}

// facadeAt(road, side, s, opts): the street facade of the building standing at s on `side` (-1 left, +1 right), or null where there is a gap between
// buildings, no building at all, or the plot was removed. Returns { height (m), faceX (road-space x of the road-facing facade at s, pt), yaw (three.js
// rotateY of the building), psi, tower, rec }. faceX is solved on the building's straight face, so toWorld(road, faceX, s) lies on the wall even in a bend.
export function facadeAt(road, side, s, opts = {}) {
  const ctx = ctxFor(road.seed); const R = ctx.road; const k = Math.floor(s / LAYOUT_CHUNK); let found = null, fd = Infinity;
  for (let kk = k - 1; kk <= k; kk++) for (const b of layoutChunk(road, kk, opts).buildings) { if (b.side !== side) continue; const half = b.len * 0.92 / 2; const d = Math.abs(s - b.sc); if (d <= half && d < fd) { fd = d; found = b; } }
  if (!found) return null; const b = found;
  placeAt(R, b.x, b.sc, PL); const psi = PL.psi, Cx = PL.X, Cy = PL.Y; const ux = Math.cos(psi), uy = -Math.sin(psi);
  const f = R.frame(s); const nx = Math.cos(f.psi), ny = -Math.sin(f.psi); const faceU = -side * b.depth / 2 / M;
  const den = nx * ux + ny * uy; const faceX = REF + (faceU - ((f.X - Cx) * ux + (f.Y - Cy) * uy)) / den;
  return { height: b.height, faceX, yaw: -psi, psi, tower: b.tower, rec: b };
}
