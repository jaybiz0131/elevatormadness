// Build gate: no building may touch the driving surface.   node tools/buildcheck.mjs [--seeds=N] [--large=N] [--quiet] [--legacy] [--list=N] [--horizon=PT]
// For seeds 1..N (default 40) plus N large seeds (default 10: random seeds are any uint32 and the daily seed is a hash of the date), the road is
// generated out to 125,000 pt, every chunk's layout is built with render/three/layout.js (the very functions city.js places buildings with) and
// every footprint (body with parapet, shop and awning boxes, roof units, the shopfront and rooftop models, the landmarks) is measured against
// the road strip (rail edge to rail edge, w/2 + 2 pt either side) of the WHOLE road, so a hairpin's far arm and any loop that comes back count.
// Exits 1 when anything is closer than 40 pt. Every measurement is repeated by an independent brute-force routine (different algorithm).
// --legacy runs the same test against the OLD generator (the placement city.js used before layout.js) and classifies its offenders: the proof of
// the bug. It exits 0 (a report, not a gate) unless --strict is added.   --list=N prints N offenders (default 12 in the gate, 30 in --legacy).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Road } from '../src/sim/road.js';
import { REF, fnv1a, hashI } from '../src/sim/constants.js';
import { layoutChunk, landmarkLayout, buildingParts, roadClearance, roadContext, roadWindow, LANDMARKS, MODEL_SIZE, MIN_CLEARANCE, LAYOUT_CHUNK, M } from '../src/render/three/layout.js';

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? Number(a.split('=')[1]) : d; };
const flag = (n) => process.argv.includes('--' + n);
const NSEEDS = arg('seeds', 40), NLARGE = arg('large', 10), QUIET = flag('quiet'), LEGACY = flag('legacy'), HORIZON = arg('horizon', 0), LIST = arg('list', LEGACY ? 30 : 12);
const ROAD_END = 125000, NEAR = 60, ELEVEN = LEGACY ? 'legacy' : 'new';
const seeds = []; for (let i = 1; i <= NSEEDS; i++) seeds.push(i);
const dates = ['2026-10-07', '2026-10-08', '2026-12-25', '2027-01-01', '2026-02-14']; for (let i = 0; i < NLARGE; i++) seeds.push(i < dates.length ? fnv1a(dates[i]) : hashI(0xB1D6E, i) >>> 0);
const CONFIGS = [['models', undefined], ['no-models', {}]];   // the game with every imported model loaded, and with none (loading failed)
const t0 = Date.now(); const log = (...a) => { if (!QUIET) console.log(...a); };

// ---- the models: is MODEL_SIZE still what the files say? (a bigger model than layout.js assumes would make every footprint too small) ----
let modelNote = 'models not checked';
try {
  const dir = fileURLToPath(new URL('../../../assets/models/', import.meta.url));
  if (fs.existsSync(dir)) {
    const { NodeIO } = await import('@gltf-transform/core'); const { getBounds } = await import('@gltf-transform/functions'); const { EXTMeshoptCompression } = await import('@gltf-transform/extensions');
    const io = new NodeIO().registerExtensions([EXTMeshoptCompression]); const spec = { storefront: ['x', 6], rooftop_ac: ['x', 2.6], hotel_tower: ['y', 70], radio_tower: ['y', 80], parking_garage: ['x', 40] }; let bad = 0, n = 0;
    for (const [name, [ax, m]] of Object.entries(spec)) {
      const f = dir + name + '.glb'; if (!fs.existsSync(f)) continue; const b = getBounds((await io.read(f)).getRoot().listScenes()[0]); const sz = [0, 1, 2].map(i => b.max[i] - b.min[i]); const k = m / sz['xyz'.indexOf(ax)]; const real = sz.map(v => v * k); n++;
      for (const i of [0, 2]) if (real[i] > MODEL_SIZE[name][i] * 1.03 + 0.05) { bad++; console.log(`MODEL SIZE MISMATCH ${name}: file is ${real.map(v => v.toFixed(2)).join(' x ')} m, layout.js MODEL_SIZE says ${MODEL_SIZE[name].join(' x ')} (update MODEL_SIZE)`); break; }
    }
    modelNote = bad ? 'MODEL SIZES STALE' : `${n} model files match MODEL_SIZE`; if (bad) process.exitCode = 1;
  }
} catch (e) { modelNote = 'models not checked (' + String(e.message || e).slice(0, 60) + ')'; }

// ---- an independent measure: point-in-polygon, segment crossing and segment-segment distances, brute force over the whole road (no grid, no SAT) ----
const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
const inQuad = (q, x, y) => { let pos = 0, neg = 0; for (let e = 0; e < 4; e++) { const c = cross(q[2 * e], q[2 * e + 1], q[2 * ((e + 1) & 3)], q[2 * ((e + 1) & 3) + 1], x, y); if (c > 0) pos++; else if (c < 0) neg++; } return pos === 0 || neg === 0; };
const ptSeg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + dx * t - px, ay + dy * t - py); };
const segX = (a, b, c, d) => cross(a[0], a[1], b[0], b[1], c[0], c[1]) * cross(a[0], a[1], b[0], b[1], d[0], d[1]) < 0 && cross(c[0], c[1], d[0], d[1], a[0], a[1]) * cross(c[0], c[1], d[0], d[1], b[0], b[1]) < 0;
function bruteDist(P, ctx, cap, i0 = 0, i1 = ctx.N - 1) {   // P Float64Array(8); only road quads i0..i1
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let v = 0; v < 4; v++) { x0 = Math.min(x0, P[2 * v]); x1 = Math.max(x1, P[2 * v]); y0 = Math.min(y0, P[2 * v + 1]); y1 = Math.max(y1, P[2 * v + 1]); }
  let best = cap; const Q = new Float64Array(8); const pe = (q, e) => [[q[2 * e], q[2 * e + 1]], [q[2 * ((e + 1) & 3)], q[2 * ((e + 1) & 3) + 1]]];
  for (let i = Math.max(0, i0); i < Math.min(ctx.N - 1, i1 + 1); i++) {
    const a0 = ctx.qb[4 * i], a1 = ctx.qb[4 * i + 1], b0 = ctx.qb[4 * i + 2], b1 = ctx.qb[4 * i + 3]; const gx = Math.max(0, a0 - x1, x0 - a1), gy = Math.max(0, b0 - y1, y0 - b1); if (gx * gx + gy * gy >= best * best) continue;
    Q[0] = ctx.lx[i]; Q[1] = ctx.ly[i]; Q[2] = ctx.lx[i + 1]; Q[3] = ctx.ly[i + 1]; Q[4] = ctx.rx[i + 1]; Q[5] = ctx.ry[i + 1]; Q[6] = ctx.rx[i]; Q[7] = ctx.ry[i];
    let d = Infinity, hit = false;
    for (let v = 0; v < 4 && !hit; v++) if (inQuad(Q, P[2 * v], P[2 * v + 1]) || inQuad(P, Q[2 * v], Q[2 * v + 1])) hit = true;
    for (let e = 0; e < 4 && !hit; e++) for (let f = 0; f < 4 && !hit; f++) { const [p, q] = pe(P, e), [r, s] = pe(Q, f); if (segX(p, q, r, s)) hit = true; }
    if (hit) return 0;
    for (let e = 0; e < 4; e++) for (let v = 0; v < 4; v++) { const [r, s] = pe(Q, e), [p, q] = pe(P, e); d = Math.min(d, ptSeg(P[2 * v], P[2 * v + 1], r[0], r[1], s[0], s[1]), ptSeg(Q[2 * v], Q[2 * v + 1], p[0], p[1], q[0], q[1])); }
    if (d < best) best = d;
  }
  return best;
}

// ---- classification of an offender: what it is, and which stretch of road it touches (its own, one close by in s, or one far along the road) ----
function nearCorner(R, s) { let best = null, bd = Infinity; for (const c of R.corners) { if (c.s0 > s + 2000) break; const d = s < c.s0 ? c.s0 - s : s > c.s1 ? s - c.s1 : 0; if (d < bd) { bd = d; best = c; } } return bd <= 900 ? best : null; }
const cornerName = (c, side) => (c.type === 'hairpin' ? 'hairpin' : c.type === 'hard' ? 'hard corner' : c.type === 'fast' ? 'fast corner' : 'sweeper') + (side === c.dir ? ' inside' : ' outside');
function classify(ctx, rec, worst) {
  const R = ctx.road; if (worst.k === 'landmark') return { cls: 'landmark (' + worst.name + ')', arm: 'own' };
  const sc = rec.sc, i = (s) => Math.round((s - -2400) / 10);
  const W = [[700, 'own stretch (<= 700 pt along the road)'], [1400, 'near arm (700-1400 pt along)'], [4500, 'arm 1400-4500 pt along (on screen at the same time)']]; let arm = 'arm > 4500 pt along (never on screen together)';
  for (const [w, name] of W) if (bruteDist(worst.q, ctx, 60, i(sc - w), i(sc + w)) < 40) { arm = name; break; }
  let cls; if (worst.k !== 'body') cls = worst.k === 'front' ? 'storefront model' : worst.k === 'awning' ? 'awning' : worst.k === 'roof' ? 'rooftop model' : worst.k === 'shop' ? 'shopfront box' : 'roof unit';
  else if (rec.tower) cls = 'tower';
  else { const c = nearCorner(R, sc); if (c) cls = cornerName(c, rec.side); else { const sec = R.at(sc).sector; cls = sec && sc < sec.s0 + 700 && sec.lanes !== sec.lanes0 ? 'lane transition' : 'straight'; } }
  return { cls, arm };
}

// ---- run ----
const totals = { buildings: 0, removed: {}, shortened: 0, pushed: 0, offenders: 0, near: 0, min: Infinity, minWhere: '', parts: 0, mismatches: 0, brute: 0 };
const lmStat = { placed: 0, moved: 0, noRoom: 0, cornerSkipped: 0 }; const classes = {}, arms = {}; const offenders = []; const perSeed = [];
for (const seed of seeds) {
  for (const [cfgName, glb] of CONFIGS) {
    const opts = { glb, legacy: LEGACY, horizon: HORIZON || undefined }; const road = new Road(seed); const ctx = roadContext(seed); const R = ctx.road; const lay0 = Date.now();
    const row = { seed, cfg: cfgName, placed: 0, removed: {}, shortened: 0, pushed: 0, min: Infinity, minWhere: '', near: 0, off: 0 };
    const consider = (rec, parts, label, meta) => {   // parts: [{ k, q, name? }]
      let worst = null; const win = roadWindow(meta.s, HORIZON);
      for (const p of parts) { const info = {}; const d = roadClearance(ctx, p.q, 120, info, win[0], win[1]); totals.parts++; if (!worst || d < worst.d) worst = { d, k: p.k, s: info.s, name: p.name, q: p.q }; }
      const bd = bruteDist(worst.q, ctx, 120, win[0], win[1]); if (Math.abs(bd - worst.d) > 0.01) { totals.mismatches++; if (totals.mismatches < 6) console.log(`MEASURE MISMATCH seed ${seed} ${label}: grid ${worst.d.toFixed(3)} vs brute force ${bd.toFixed(3)}`); } totals.brute++;
      if (worst.d < row.min) { row.min = worst.d; row.minWhere = label + ' ' + worst.k; }
      if (worst.d < totals.min) { totals.min = worst.d; totals.minWhere = `seed ${seed} ${label} (${worst.k})`; }
      if (worst.d < NEAR) { row.near++; totals.near++; }
      if (worst.d < MIN_CLEARANCE) { row.off++; totals.offenders++; const { cls, arm } = meta.landmark ? classify(ctx, null, { k: 'landmark', name: meta.name }) : classify(ctx, rec, worst); classes[cls] = (classes[cls] || 0) + 1; arms[arm] = (arms[arm] || 0) + 1; row.cls = row.cls || {}; row.cls[cls] = (row.cls[cls] || 0) + 1; offenders.push({ seed, cfg: cfgName, label, clr: worst.d, cls: cls + ' / ' + arm, s: meta.s }); }
    };
    for (let k = -2; k * LAYOUT_CHUNK < ROAD_END; k++) {
      const lay = layoutChunk(road, k, opts);
      for (const r of lay.removed) row.removed[r.reason] = (row.removed[r.reason] || 0) + 1;
      for (const rec of lay.buildings) {
        row.placed++; if (rec.shortened) row.shortened++; if (rec.pb) row.pushed++;
        const parts = buildingParts(road, rec);   // recomputed from the record's fields and the game-style road, not taken from rec.parts
        for (let i = 0; i < parts.length; i++) { const a = parts[i].q, b = rec.parts[i] && rec.parts[i].q; if (!b) { totals.mismatches++; break; } for (let j = 0; j < 8; j++) if (Math.abs(a[j] - b[j]) > 1e-6) { totals.mismatches++; if (totals.mismatches < 6) console.log(`PART MISMATCH seed ${seed} chunk ${k}: private road and game road disagree`); i = parts.length; break; } }
        consider(rec, parts, `chunk ${k} side ${rec.side > 0 ? '+' : '-'} s ${Math.round(rec.sc)}`, { s: rec.sc });
      }
    }
    { const lms = landmarkLayout(road, opts); if (!glb) { const want = LANDMARKS.filter(lm => !ctx.hard.some(c => lm.s > c.s0 - 1300 && lm.s < c.s1 + 900)).length; lmStat.placed += lms.length; lmStat.moved += lms.filter(l => l.moved).length; lmStat.noRoom += want - lms.length; lmStat.cornerSkipped += LANDMARKS.length - want; } }
    for (const lm of landmarkLayout(road, opts)) { consider(null, [{ k: 'landmark', q: lm.q, name: lm.name }], `landmark ${lm.name}${lm.moved ? ' (pushed back ' + lm.moved + ' pt)' : ''}`, { landmark: true, name: lm.name, s: lm.s }); }
    row.ms = Date.now() - lay0; perSeed.push(row);
    totals.buildings += row.placed; totals.shortened += row.shortened; totals.pushed += row.pushed; for (const [r, n] of Object.entries(row.removed)) totals.removed[r] = (totals.removed[r] || 0) + n;
    const clr = (v) => v === Infinity ? '-' : v.toFixed(1);
    log(`seed ${String(seed).padStart(10)} ${cfgName.padEnd(9)} placed ${String(row.placed).padStart(4)} removed ${JSON.stringify(row.removed).replace(/"/g, '')} shortened ${String(row.shortened).padStart(3)} pushed ${row.pushed} min clearance ${clr(row.min).padStart(6)} pt (${row.minWhere}) within ${NEAR}: ${row.near}  OFFENDERS ${row.off}${row.cls ? ' ' + JSON.stringify(row.cls).replace(/"/g, '') : ''}  ${row.ms} ms`);
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nbuildcheck (${ELEVEN} generator${HORIZON ? ', ONLY road within ' + HORIZON + ' pt along counts (what-if, not the gate)' : ''}): ${seeds.length} seeds x ${CONFIGS.length} configs, road to ${ROAD_END} pt, ${totals.buildings} buildings, ${totals.parts} parts measured (${totals.brute} re-measured by brute force, ${totals.mismatches} mismatches); ${modelNote}`);
console.log(`  removed ${JSON.stringify(totals.removed).replace(/"/g, '')}; shortened ${totals.shortened}; pushed back ${totals.pushed}; landmarks (models loaded): ${lmStat.placed} placed, ${lmStat.moved} pushed back, ${lmStat.noRoom} left out for lack of room, ${lmStat.cornerSkipped} skipped beside a hard corner (old rule)`);
console.log(`  minimum clearance ${totals.min === Infinity ? '-' : totals.min.toFixed(1)} pt at ${totals.minWhere}; within ${NEAR} pt: ${totals.near}; closer than ${MIN_CLEARANCE} pt (OFFENDERS): ${totals.offenders}; ${secs} s`);
if (totals.offenders) {
  console.log('  offenders by what they are: ' + Object.entries(classes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', '));
  console.log('  offenders by the road they touch: ' + Object.entries(arms).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', '));
  const bySeed = perSeed.filter(r => r.off).map(r => `${r.seed}${r.cfg === 'models' ? '' : '/nm'}:${r.off}`); console.log('  offenders per seed: ' + bySeed.join(' '));
  console.log('OFFENDERS (seed, config, where, clearance pt, class):'); for (const o of offenders.sort((a, b) => a.clr - b.clr).slice(0, LIST)) console.log(`  seed ${o.seed} [${o.cfg}] ${o.label}: ${o.clr.toFixed(1)} pt  ${o.cls}`);
  if (offenders.length > LIST) console.log(`  ... and ${offenders.length - LIST} more (--list=N)`);
}
if (totals.mismatches) { console.log('BUILD CHECK FAILED: the grid measure and the brute-force measure disagree'); process.exitCode = 1; }
const GATE = !LEGACY || flag('strict');   // --legacy --strict: the old generator also fails the gate (proves the gate bites)
if (GATE && totals.offenders) { console.log(`BUILD CHECK FAILED: ${totals.offenders} building part(s) closer than ${MIN_CLEARANCE} pt to the road`); process.exitCode = 1; }
else if (GATE && !process.exitCode) console.log(`build check passed: every building at least ${MIN_CLEARANCE} pt from the road (smallest ${totals.min.toFixed(1)} pt)`);
