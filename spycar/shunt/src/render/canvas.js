// The Sprint C canvas renderer, moved verbatim. It reads G and the view state; it never writes the simulation.
import { S } from '../settings.js';
import { H, REF, T, clamp, fmt, hashI, lerp } from '../sim/constants.js';
import { PUFF_LIFE } from '../sim/physics.js';
import { DISTRICTS } from '../sim/road.js';
import { G, REPLAY_FRAMES } from '../sim/state.js';
import { decayPresentation } from '../sim/step.js';
import { isTouch, view } from '../ui/dom.js';
let ctx = null, phase = 'title', elapsed = 0, best = 0, bestDaily = 0, dailyMode = false;
export function createCanvasRenderer(cv) {
  ctx = cv.getContext('2d');
  return { kind: 'canvas', render, reset() { camPsi = 0; camZoom = 1; camLook = 0; camRoll = 0; camLane = LANE; }, resize() { cv.width = view.SW * view.dpr; cv.height = H * view.dpr; }, stats() { return null; } };
}
const PY = 0.22, PX = 0.07, LANE = 0.30;
const ahead = (v) => v * H * (1 + PY * v);
function vFor(a) { const A = PY * H, B = H, C = -a; return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A); }
let camZoom = 1, camLook = 0, camRoll = 0, camLane = 0.30, camPsi = 0;
// The camera sits on the road at `scroll`, heading camPsi (a spring toward the road heading 0.4 s ahead so the player sees the exit).
// Objects are taken from road space to world space, then into camera space, then through the same fake perspective as before.
const cam = { s: 0, psi: 0, X: 0, Y: 0, fx: 0, fy: 1, rx: 1, ry: 0 };
function setCamera(scroll, psi) { const fr = G.road.frame(scroll); cam.s = scroll; cam.X = fr.X; cam.Y = fr.Y; cam.psi = psi; cam.fx = Math.sin(psi); cam.fy = Math.cos(psi); cam.rx = Math.cos(psi); cam.ry = -Math.sin(psi); }
const WP = { X: 0, Y: 0 };
function project(x, s, scroll) {
  G.road.world(x, s, WP); const dx = WP.X - cam.X, dy = WP.Y - cam.Y; const f = dx * cam.fx + dy * cam.fy, r = dx * cam.rx + dy * cam.ry;
  const v = vFor(f); const ls = (1 - PX * v) * camZoom; const sy = H - v * H; const scale = ls / (1 + 2 * PY * v) * (1 + 2 * PY * LANE) / (1 - PX * LANE);
  return { x: view.SW / 2 + (r - camLook) * ls, y: H * 0.7 + (sy - H * 0.7) * camZoom, s: scale, v, f };
}
function roadYaw(s) { return G.road.frame(s).psi - cam.psi; }   // how a thing sitting on the road at s is rotated on screen
const C = { lane: 'rgba(255,255,255,0.55)', railPost: '#5d6675', player: '#37e6ff', playerDark: '#0d7a8c', enemy: '#1a1b1f', enemyAccent: '#ff3b3b', truck: '#2fd36a', pickup: '#ffd23f', hazard: '#ff9f1c', ramp: '#f4f6f8' };
function rrect(x, y, w, h, r, fill, stroke, lw) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); } }
function shadow(p, w, l) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(p.x + 4 * p.s, p.y + 6 * p.s, w * 0.55 * p.s, l * 0.5 * p.s, 0, 0, Math.PI * 2); ctx.fill(); }
const glowCache = new Map();
function glowSprite(col) { let c = glowCache.get(col); if (c) return c; c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); glowCache.set(col, c); return c; }
function glow(x, y, r, col, a) { const prev = ctx.globalAlpha; ctx.globalAlpha = prev * a; ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = prev; }
// Road as polygons (audit, "Smooth movement" 1): the road is sampled every 40 world pt on a world-aligned grid, so lane dashes,
// rail posts and texture bands sit at fixed world positions and glide by exactly the distance travelled each frame. OV is the
// overscan that keeps the edges covered while the renderer shakes the camera.
const OV = 32, SEG = 40, MAXS = 64;
const RS = { wy: new Float64Array(MAXS), sy: new Float64Array(MAXS), l: new Float64Array(MAXS), r: new Float64Array(MAXS), c: new Float64Array(MAXS), w: new Float64Array(MAXS), ls: new Float64Array(MAXS), n: new Int8Array(MAXS), count: 0 };
function quad(x0a, y0, x0b, x1a, y1, x1b, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x0a, y0); ctx.lineTo(x0b, y0); ctx.lineTo(x1b, y1); ctx.lineTo(x1a, y1); ctx.closePath(); ctx.fill(); }
const RP = { lx: new Float64Array(MAXS), ly: new Float64Array(MAXS), rx: new Float64Array(MAXS), ry: new Float64Array(MAXS), f: new Float64Array(MAXS), order: new Int16Array(MAXS) };
function quad4(x0, y0, x1, y1, x2, y2, x3, y3, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill(); }
function strip(i, a0, a1, b0, b1, fill) {   // a quad between lateral offsets a (at sample i) and b (at sample i+1), both given as [x0, x1]
  const p0 = project(a0, RS.wy[i], 0), p1 = project(a1, RS.wy[i], 0), p2 = project(b1, RS.wy[i + 1], 0), p3 = project(b0, RS.wy[i + 1], 0);
  quad4(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, fill);
}
function propHash(s) { return hashI(G.road.seed, Math.round(s / 160)) / 4294967296; }
function drawRoad(scroll, district) {
  const D = DISTRICTS[district], DN = DISTRICTS[(district + 1) % 4];
  // sample the road on the world grid along s, from behind the camera (overscan) to past the top of the screen
  const y0 = Math.floor((scroll - 240) / SEG) * SEG, yTop = scroll + ahead(1.45); let n = 0;
  for (let wy = y0; wy <= yTop && n < MAXS; wy += SEG, n++) {
    const a = G.road.at(wy); RS.wy[n] = wy; RS.w[n] = a.width; RS.n[n] = Math.round(a.lanes); RS.c[n] = REF;
    const pl = project(REF - a.width / 2, wy, 0), pr = project(REF + a.width / 2, wy, 0); RP.lx[n] = pl.x; RP.ly[n] = pl.y; RP.rx[n] = pr.x; RP.ry[n] = pr.y; RS.ls[n] = pl.s; RP.f[n] = pl.f; RS.sy[n] = (pl.y + pr.y) / 2;
  }
  RS.count = n;
  // segments are painted far to near so a hairpin's near road covers its far road
  for (let i = 0; i + 1 < n; i++) RP.order[i] = i; const ord = Array.from(RP.order.subarray(0, Math.max(0, n - 1))); ord.sort((a, b) => RP.f[b] - RP.f[a]);
  ctx.fillStyle = D.shoulder; ctx.fillRect(-OV, -OV, view.SW + 2 * OV, H + 2 * OV);
  for (const i of ord) {
    const wy = RS.wy[i]; const dist = wy >= G.nextDistrictY ? DN : D; const dark = Math.floor(wy / 320) % 2 === 0; const w0 = RS.w[i], w1 = RS.w[i + 1];
    if (dist !== D) strip(i, REF - 900, REF + 900, REF - 900, REF + 900, dist.shoulder);   // the next district's shoulder colour past the boundary
    const a = G.road.at(wy); const crest = a.elev > 0.5 ? a.slope : 0;
    let gap = null; for (const g of G.gaps) if (wy >= g.y0 && wy < g.y1) gap = g;
    strip(i, REF - w0 / 2, REF + w0 / 2, REF - w1 / 2, REF + w1 / 2, dark ? dist.dark : dist.road);
    if (crest) strip(i, REF - w0 / 2, REF + w0 / 2, REF - w1 / 2, REF + w1 / 2, crest > 0 ? 'rgba(255,255,255,' + Math.min(0.12, crest * 0.4) + ')' : 'rgba(0,0,0,' + Math.min(0.25, -crest * 0.8) + ')');
    if (gap) { strip(i, REF - w0 / 2 + 40, REF + w0 / 2, REF - w1 / 2 + 40, REF + w1 / 2, '#0b0d12'); strip(i, REF - w0 / 2, REF - w0 / 2 + 40, REF - w1 / 2, REF - w1 / 2 + 40, '#5a5a44'); }
    // lane dashes: 40 on, 40 off, on the world grid; skipped where the lane count changes between samples
    if (!gap && Math.floor(wy / SEG) % 2 === 0 && RS.n[i] === RS.n[i + 1]) { const ln = RS.n[i]; for (let k = 1; k < ln; k++) { const x0 = REF - w0 / 2 + w0 * k / ln, x1 = REF - w1 / 2 + w1 * k / ln; strip(i, x0 - 1.5, x0 + 1.5, x1 - 1.5, x1 + 1.5, C.lane); } }
    // rails as continuous strips; tyre walls (thicker, darker) on the outside of hard corners
    const cn = a.corner; const tyres = cn && cn.hard;
    strip(i, REF - w0 / 2 - 6, REF - w0 / 2 - 2, REF - w1 / 2 - 6, REF - w1 / 2 - 2, dist.rail); strip(i, REF + w0 / 2 + 2, REF + w0 / 2 + 6, REF + w1 / 2 + 2, REF + w1 / 2 + 6, dist.rail);
    if (tyres) { const o = -cn.dir; strip(i, REF + o * (w0 / 2 + 7), REF + o * (w0 / 2 + 19), REF + o * (w1 / 2 + 7), REF + o * (w1 / 2 + 19), '#2b2d31'); }
    // rumble strip on the inside of every corner: red and white, 10 pt wide
    if (cn) { const d = cn.dir; strip(i, REF + d * (w0 / 2 - 10), REF + d * w0 / 2, REF + d * (w1 / 2 - 10), REF + d * w1 / 2, Math.floor(wy / 20) % 2 ? '#d93a3a' : '#f2f2f2'); }
    for (const m of G.medians) if (wy >= m.y0 && wy < m.y1) { const a0 = G.road.laneX(wy, m.lane0) - 6, b0 = G.road.laneX(wy, m.lane0 + m.lanes - 1) + 6; const wy1 = RS.wy[i + 1]; const a1 = G.road.laneX(wy1, m.lane0) - 6, b1 = G.road.laneX(wy1, m.lane0 + m.lanes - 1) + 6; strip(i, a0, b0, a1, b1, '#8a8f99'); strip(i, a0 + 2, a0 + 4, a1 + 2, a1 + 4, '#c9ced6'); }
  }
  // near layer: rail posts every 120 pt, and roadside props every 160 pt (poles, trees, boards) so speed reads in a top-down view
  ctx.fillStyle = C.railPost;
  for (let i = 0; i < n; i++) if (RS.wy[i] % 120 === 0) { const wy = RS.wy[i], w = RS.w[i]; for (const side of [-1, 1]) { const p = project(REF + side * (w / 2 + 11), wy, 0); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(wy)); ctx.scale(p.s, p.s); ctx.fillStyle = C.railPost; ctx.fillRect(-3.5, -3, 7, 6); ctx.restore(); } }
  for (let i = 0; i < n; i++) { const wy = RS.wy[i]; if (wy % 160 !== 0) continue; const h = propHash(wy); const a = G.road.at(wy); if (a.corner && a.corner.hard) continue; const side = h < 0.5 ? -1 : 1; const kind = Math.floor(h * 1000) % 3; const off = 50 + ((h * 7919) % 1) * 110;
    const p = project(REF + side * (a.width / 2 + off), wy, 0); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(wy)); ctx.scale(p.s, p.s);
    if (kind === 0) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(6, 6, 18, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = district === 1 ? '#6f7a3c' : district === 3 ? '#3f6a55' : '#3c6b45'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); }   // tree
    else if (kind === 1) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2, 2, 4, 30); ctx.fillStyle = '#aab2bf'; ctx.fillRect(-2, -16, 4, 32); ctx.fillStyle = district === 2 ? '#ffd27a' : '#dde3ea'; ctx.fillRect(-5, -20, 10, 6); }   // lamp post
    else { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-22, 4, 48, 8); ctx.fillStyle = '#2a2d33'; ctx.fillRect(-24, -8, 48, 14); ctx.fillStyle = ['#ff6b6b', '#ffd23f', '#37e6ff', '#cfe6ff'][Math.floor(h * 97) % 4]; ctx.fillRect(-20, -5, 40, 8); }   // billboard
    ctx.restore(); }
  // corner furniture: a painted arrow 2 s ahead, a board naming the corner, chevron boards along the outside, spectators at hairpins
  for (let i = Math.max(0, G.road.ci2 || 0); i < G.road.corners.length; i++) { const cn = G.road.corners[i]; if (cn.s1 < scroll - 200) continue; if (cn.warnS - 200 > yTop) break;
    const col = cn.hard ? '#ff3b3b' : '#ffd23f';
    if (cn.warnS > scroll - 100 && cn.warnS < yTop) { const p = project(REF, cn.warnS, 0); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(cn.warnS)); ctx.scale(p.s, p.s); ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.beginPath(); const d = cn.dir; ctx.moveTo(-10 * d, 40); ctx.lineTo(-10 * d, -10); ctx.lineTo(-26 * d, -10); ctx.lineTo(8 * d, -40); ctx.lineTo(42 * d, -10); ctx.lineTo(26 * d, -10); ctx.lineTo(26 * d, 40); ctx.closePath(); ctx.fill(); ctx.restore();
      const b = project(REF - cn.dir * (G.road.at(cn.warnS).width / 2 + 40), cn.warnS + 60, 0); ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(roadYaw(cn.warnS)); ctx.scale(b.s, b.s); rrect(-34, -11, 68, 22, 3, col, '#111'); ctx.fillStyle = cn.hard ? '#fff' : '#222'; ctx.font = '700 12px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cn.type === 'hairpin' ? 'HAIRPIN' : cn.type === 'hard' ? 'HARD ' + (cn.dir > 0 ? 'RIGHT' : 'LEFT') : cn.type === 'fast' ? 'BEND' : 'view.SWEEP', 0, 0); ctx.restore(); }
    for (let cs = cn.s0; cs <= cn.s1; cs += T.corner.chevronEvery) { if (cs < scroll - 100 || cs > yTop) continue; const w = G.road.at(cs).width; const p = project(REF - cn.dir * (w / 2 + 26), cs, 0); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(cs)); ctx.scale(p.s, p.s); rrect(-14, -9, 28, 18, 2, col); ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6 * cn.dir, -5); ctx.lineTo(4 * cn.dir, 0); ctx.lineTo(-6 * cn.dir, 5); ctx.stroke(); ctx.restore(); }
    if (cn.type === 'hairpin') for (let cs = cn.s0 + 30; cs < cn.s1; cs += 34) { if (cs < scroll - 100 || cs > yTop) continue; const w = G.road.at(cs).width; const hsp = hashI(G.road.seed, Math.round(cs)) / 4294967296; const p = project(REF - cn.dir * (w / 2 + 48 + hsp * 24), cs, 0); ctx.fillStyle = ['#e8d8c0', '#f0b0a0', '#a0c8f0', '#f0e080', '#c0e0b0'][Math.floor(hsp * 50) % 5]; ctx.beginPath(); ctx.arc(p.x, p.y, 4 * p.s, 0, Math.PI * 2); ctx.fill(); }
  }
  // skid ribbons: continuous lines under the rear wheels, darker with slip, fading over 6 s
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of G.ribbons) { const pts = r.pts; if (pts.length < 6) continue; const fade = r.done ? clamp(1 - r.t / 6, 0, 1) : 1; ctx.beginPath(); let first = true; for (let i = 0; i < pts.length; i += 3) { if (pts[i + 1] < scroll - 100) continue; const p = project(pts[i], pts[i + 1], scroll); if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y); } const p0 = project(pts[0], pts[1], scroll); ctx.lineWidth = 6 * p0.s; ctx.strokeStyle = r.brake ? 'rgba(25,22,22,' + 0.5 * fade + ')' : 'rgba(18,18,22,' + 0.7 * fade + ')'; ctx.stroke(); }
  for (const m of G.marks) { const p = project(m.x, m.y, scroll); ctx.globalAlpha = Math.min(1, m.t / (m.scorch ? 3 : 2.5)) * 0.6; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(m.y)); if (m.scorch) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(0, 0, 22 * p.s, 30 * p.s, 0, 0, Math.PI * 2); ctx.fill(); if (m.t > 2) { ctx.fillStyle = 'rgba(255,120,30,' + (m.t - 2) * 0.6 + ')'; ctx.beginPath(); ctx.ellipse(0, 0, 10 * p.s, 14 * p.s, 0, 0, Math.PI * 2); ctx.fill(); } } else { ctx.fillStyle = '#15171b'; ctx.fillRect(-12 * p.s, -4, 4 * p.s, 10 * p.s); ctx.fillRect(8 * p.s, -4, 4 * p.s, 10 * p.s); } ctx.restore(); ctx.globalAlpha = 1; }
  for (const s of G.slicks) { const p = project(s.x, s.y, scroll); ctx.fillStyle = 'rgba(10,10,20,0.75)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, s.r * 1.4 * p.s, s.r * p.s, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(120,80,200,0.5)'; ctx.lineWidth = 1; ctx.stroke(); }
  for (const g of G.signs) { if (g.y < scroll || g.y > scroll + ahead(1)) continue; const p = project(REF, g.y, scroll); ctx.save(); ctx.translate(p.x, p.y - 30 * p.s); ctx.rotate(roadYaw(g.y)); ctx.scale(p.s, p.s); rrect(-80, -18, 160, 36, 4, '#1f6b3a', '#dfe'); ctx.fillStyle = '#fff'; ctx.font = '700 ' + (g.big ? 20 : 15) + 'px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.text, 0, 0); ctx.restore(); }
}
function drawRamp(rp, scroll) {
  const p = project(rp.x, rp.y, scroll);
  const warnY = rp.y - G.speed * T.ramp.warn; if (warnY > scroll && !rp.used) { const w = project(rp.x, warnY, scroll); ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(roadYaw(warnY)); ctx.scale(w.s, w.s); ctx.fillStyle = C.ramp; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-18, 12 + i * 14); ctx.lineTo(0, -2 + i * 14); ctx.lineTo(18, 12 + i * 14); ctx.lineTo(18, 18 + i * 14); ctx.lineTo(0, 4 + i * 14); ctx.lineTo(-18, 18 + i * 14); ctx.closePath(); ctx.fill(); } ctx.restore(); }
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(rp.y)); ctx.scale(p.s, p.s); const w = rp.w;
  const g = ctx.createLinearGradient(0, 40, 0, -60); g.addColorStop(0, '#6b7280'); g.addColorStop(1, '#f4f6f8'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w / 2, 40); ctx.lineTo(w / 2, 40); ctx.lineTo(w / 2 - 6, -60); ctx.lineTo(-w / 2 + 6, -60); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.pickup; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-w / 2 + 12, 20 - i * 28); ctx.lineTo(0, 2 - i * 28); ctx.lineTo(w / 2 - 12, 20 - i * 28); ctx.stroke(); }
  ctx.restore();
  if (rp.crate && !rp.crate.taken) { const cpos = project(rp.x, rp.y + 240, scroll); ctx.save(); ctx.translate(cpos.x, cpos.y - 70 * cpos.s - Math.sin(elapsed * 4) * 4); ctx.scale(cpos.s * 1.4, cpos.s * 1.4); rrect(-12, -12, 24, 24, 4, C.pickup, '#fff'); glow(0, 0, 30, 'rgba(255,210,63,0.5)', 0.8); ctx.restore(); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cpos.x, cpos.y, 14 * cpos.s, 7 * cpos.s, 0, 0, Math.PI * 2); ctx.fill(); }
}
function drawCar(c, scroll, cx, cy) {
  const p = project(cx, cy, scroll); const isCiv = c.kind === 'civ'; const w = c.w, l = c.l;
  shadow(p, w, l);
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.s, p.s);
  if (c.wrecked) { ctx.rotate(roadYaw(cy) + c.spin); const fl = 1 - 0.5 * Math.abs(Math.sin(c.flip * Math.PI * 2)); ctx.scale(fl, 1); ctx.globalAlpha = 0.9; rrect(-w / 2, -l / 2, w, l, 4, '#3a2a2a', '#111'); if (c.debrisT > 0.5) { ctx.fillStyle = 'rgba(255,120,40,' + (c.debrisT - 0.5) + ')'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); return; }
  ctx.rotate(roadYaw(cy) + (c.lean || 0) * Math.PI / 180 + (c.spin || 0));
  if (c.kind === 'truck') { rrect(-w / 2, -l / 2, w, l, 6, C.truck, '#eafff0'); if (!c.loaded) { const g = ctx.createLinearGradient(0, -l / 2 - 30, 0, -l / 2 + 30); g.addColorStop(0, '#bfffd6'); g.addColorStop(1, '#1f8f48'); ctx.fillStyle = g; ctx.fillRect(-w / 2 + 6, -l / 2 - 30, w - 12, 60); ctx.strokeStyle = C.pickup; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, -l / 2 - 14); ctx.lineTo(0, -l / 2 + 2); ctx.lineTo(12, -l / 2 - 14); ctx.stroke(); } ctx.fillStyle = '#1c2a22'; ctx.fillRect(-w / 2 + 8, l / 2 - 30, w - 16, 22); ctx.globalCompositeOperation = 'lighter'; glow(0, l / 2 + 10, 14, 'rgba(255,210,63,0.9)', 0.4 + 0.4 * Math.sin(elapsed * 6)); ctx.restore(); return; }
  if (isCiv) { rrect(-w / 2, -l / 2, w, l, 10, c.tint, 'rgba(255,255,255,0.8)'); rrect(-w / 2 + 6, -l / 2 + 12, w - 12, 16, 4, 'rgba(60,70,90,0.5)'); if (c.blink > 0 && Math.floor(c.blink * 8) % 2 === 0) { ctx.fillStyle = '#ffb347'; ctx.fillRect(c.blinkDir < 0 ? -w / 2 - 3 : w / 2 - 2, -l / 2 + 4, 5, 8); } if (c.honk > 0) { ctx.fillStyle = '#fff'; ctx.font = '700 14px Rajdhani'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -l / 2 - 8); } ctx.restore(); return; }
  if (c.kind === 'armored') { rrect(-w / 2, -l / 2, w, l, 6, '#20242b', C.enemyAccent, 3); ctx.fillStyle = '#2e333b'; ctx.fillRect(-w / 2 + 10, -l / 2 + 12, w - 20, l - 40); ctx.fillStyle = C.enemyAccent; ctx.fillRect(-w / 2 + 4, -4, w - 8, 8); for (const sx of [-w / 2 + 8, w / 2 - 18]) { ctx.fillStyle = C.enemyAccent; ctx.fillRect(sx, l / 2 - 10, 10, 5); } ctx.globalCompositeOperation = 'lighter'; glow(-w / 2 + 12, l / 2 - 6, 14, 'rgba(255,59,59,0.9)', 0.8); glow(w / 2 - 12, l / 2 - 6, 14, 'rgba(255,59,59,0.9)', 0.8); ctx.restore(); return; }
  // enemies: dark body, red roof stripe, glowing red headlights (ahead = +y = screen up)
  const body = new Path2D(); body.moveTo(-w / 2, -l / 2 + 8); body.lineTo(-w / 2 + 6, -l / 2); body.lineTo(w / 2 - 6, -l / 2); body.lineTo(w / 2, -l / 2 + 8); body.lineTo(w / 2, l / 2); body.lineTo(-w / 2, l / 2); body.closePath();
  ctx.fillStyle = c.hitFlash > 0 ? '#ffffff' : (c.kind === 'weak' ? '#3a3d46' : C.enemy); ctx.fill(body); ctx.strokeStyle = C.enemyAccent; ctx.lineWidth = c.kind === 'weak' ? 1.5 : 2; ctx.stroke(body);
  ctx.fillStyle = C.enemyAccent; ctx.fillRect(-w / 2 + 6, -8, w - 12, 7);                                     // red roof stripe
  if (c.kind === 'bruiser') { ctx.fillStyle = '#6a6f7a'; ctx.fillRect(-w / 2 - 6, -10, 6, 20); ctx.fillRect(w / 2, -10, 6, 20); }   // side rams, 2x thick
  if (c.kind === 'gunner') { ctx.fillStyle = '#555'; ctx.fillRect(-4, -l / 2 - 6, 8, 16); }
  const brake = c.state === 'tell' && Math.floor(c.t * 12) % 2 === 0; ctx.fillStyle = brake ? '#ff6a6a' : '#7a1b1b'; ctx.fillRect(-w / 2 + 3, l / 2 - 7, 9, 4); ctx.fillRect(w / 2 - 12, l / 2 - 7, 9, 4);
  ctx.globalCompositeOperation = 'lighter'; glow(-w / 2 + 7, -l / 2 + 2, 12, 'rgba(255,59,59,0.9)', 0.9); glow(w / 2 - 7, -l / 2 + 2, 12, 'rgba(255,59,59,0.9)', 0.9);
  ctx.restore();
  // tell arrow on the road pointing at the player
  if (c.state === 'tell') { const dir = G.x < c.x ? -1 : 1; ctx.save(); ctx.translate(p.x + dir * 36 * p.s, p.y); ctx.scale(p.s, p.s); ctx.fillStyle = 'rgba(255,59,59,' + (0.5 + 0.5 * Math.sin(elapsed * 20)) + ')'; ctx.beginPath(); ctx.moveTo(dir * 16, 0); ctx.lineTo(-dir * 6, -12); ctx.lineTo(-dir * 6, 12); ctx.closePath(); ctx.fill(); ctx.restore(); }
  if (c.kind === 'gunner' && c.state === 'sight') { const a = project(c.sightX, c.y, scroll), b = project(c.sightX, c.y + 700, scroll); ctx.save(); ctx.strokeStyle = 'rgba(255,40,40,' + (0.5 + 0.5 * Math.sin(elapsed * 30)) + ')'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); }
}
function drawPlayer(scroll, px, py, alpha, zOverride, leanOverride) {
  const p = project(px, py, scroll); const z = zOverride !== undefined ? zOverride : G.jumpZ; const lift = z * 90; const lean = leanOverride !== undefined ? leanOverride : G.lean;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 6, 34 * 0.6 * p.s * (1 - z * 0.2), 60 * 0.5 * p.s * (1 - z * 0.2), 0, 0, Math.PI * 2); ctx.fill();
  if (G.air > 0 && G.air < 0.4) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y, 26 * p.s, 14 * p.s, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (G.smoke > 0 || G.armor === 1) { const a = G.armor === 1 ? 0.45 : Math.min(0.5, G.smoke * 0.3); ctx.fillStyle = 'rgba(80,80,80,' + a + ')'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(p.x - 6 + Math.sin(elapsed * 9 + i) * 6, p.y + 30 + i * 12, 6 + i * 2.5, 0, Math.PI * 2); ctx.fill(); } }
  if (G.slamCd > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y + 8, 30 * p.s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - G.slamCd / T.slam.cooldown)); ctx.stroke(); }
  // drift charge: a thin ring under the car that fills through the tiers (the sparks do the rest)
  if (G.drifting && phase === 'playing') { const dr = T.drift; const k = clamp(G.driftCharge / dr.tiers[2], 0, 1); ctx.strokeStyle = G.driftTier >= 3 ? '#ff7a2a' : G.driftTier === 2 ? '#ffd23f' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y + 6, 36 * p.s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); }
  if (G.braking && phase === 'playing') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(p.x, p.y + 34 * p.s, 30 * p.s, 'rgba(255,40,40,0.9)', 0.7); ctx.restore(); }
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y - lift); ctx.rotate(roadYaw(py)); ctx.scale(p.s * (1 + z * 0.25) * (2 - G.sq), p.s * (1 + z * 0.25) * G.sq); ctx.rotate(lean * Math.PI / 180);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(0, 4, 44, G.nitro > 0 ? 'rgba(255,210,63,0.5)' : 'rgba(55,230,255,0.45)', 0.9); ctx.restore();
  const body = new Path2D(); body.moveTo(-17, 26); body.lineTo(17, 26); body.lineTo(15, -16); body.lineTo(0, -30); body.lineTo(-15, -16); body.closePath();
  ctx.fillStyle = C.player; ctx.fill(body); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(body);
  rrect(-10, -14, 20, 22, 5, C.playerDark);
  if (G.flashT2 > 0) { ctx.fillStyle = '#fff6c8'; ctx.fillRect(-12, -36, 5, 8); ctx.fillRect(7, -36, 5, 8); }
  ctx.fillStyle = G.braking ? '#ff5a5a' : '#8a1d1d'; ctx.fillRect(-14, 22, 8, 3); ctx.fillRect(6, 22, 8, 3);   // tail lights, bright under braking
  ctx.restore();
  if (G.t < 20 && !hadRunBefore()) for (let i = 0; i < T.armor; i++) rrect(p.x - 20 + i * 14, p.y + 44, 10, 5, 2, i < G.armor ? C.player : 'rgba(255,255,255,0.15)');
}
function hadRunBefore() { if (hadRunCache !== null) return hadRunCache; hadRunCache = hadRunBeforeRead(); return hadRunCache; }
let hadRunCache = null;
function hadRunBeforeRead() { try { return Number(localStorage.getItem('shunt-runs') || 0) > 1; } catch (e) { return true; } }
function drawHUD() {
  const top = 14 + (window.safeTop || 0);
  ctx.save(); ctx.textBaseline = 'middle';
  ctx.font = '700 30px Rajdhani, "Avenir Next Condensed", sans-serif'; ctx.fillStyle = C.ramp; ctx.textAlign = 'left'; ctx.fillText(fmt(G.score), 18, top + 18);
  ctx.font = '600 13px Rajdhani, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('BEST ' + fmt(Math.max(G.score, dailyMode ? bestDaily : best)), 18, top + 40);
  const low = G.armor === 1 && Math.sin(elapsed * 8) > 0; for (let i = 0; i < T.armor; i++) rrect(18 + i * 22, top + 52, 18, 8, 3, i < G.armor ? (low ? '#ff3b3b' : C.player) : 'rgba(255,255,255,0.15)');
  // speedometer: speed is the player's to manage now
  if (phase !== 'over') { ctx.font = '700 15px Rajdhani, sans-serif'; ctx.fillStyle = G.speed > 850 ? C.pickup : 'rgba(255,255,255,0.85)'; ctx.textAlign = 'left'; ctx.fillText(String(Math.round(G.speed)), 18, top + 74); ctx.font = '600 10px Rajdhani, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('PT/S' + (G.turboT > 0 ? '  TURBO' : G.slipBoostT > 0 ? '  DRAFT' : G.nitro > 0 ? '  NITRO' : ''), 18 + ctx.measureText(String(Math.round(G.speed))).width + 24, top + 75); }
  // combo sits next to the score, in the corner, so the top centre (where threats arrive) stays clear (audit, UI section)
  if (G.combo > 1) { ctx.font = '700 30px Rajdhani, "Avenir Next Condensed", sans-serif'; const sw = ctx.measureText(fmt(G.score)).width; const cx = 18 + sw + 14; const k = clamp(G.comboT / T.combo.window, 0, 1); ctx.textAlign = 'left'; const size = Math.min(40, 24 + G.combo * 2); ctx.font = '700 ' + size + 'px Rajdhani, "Avenir Next Condensed", sans-serif'; ctx.fillStyle = C.pickup; ctx.fillText('×' + G.combo, cx, top + 18); rrect(cx, top + 36, 56, 6, 3, 'rgba(255,255,255,0.15)'); rrect(cx, top + 36, 56 * k, 6, 3, G.comboT < 0.5 ? '#ff3b3b' : C.pickup); }
  if (phase === 'over') { ctx.font = '700 13px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText('● REPLAY', view.SW / 2, top + 18); }
  // off-screen threats: red chevrons at the bottom for enemies behind, white at the top for the supply truck
  for (const c of G.cars) { if (!c.alive || c.wrecked) continue; if ((c.kind === 'bruiser' || c.kind === 'gunner') && c.y < G.dist - 300) { const x = view.SW / 2 + (c.x - REF); ctx.fillStyle = 'rgba(255,59,59,' + (0.5 + 0.5 * Math.sin(elapsed * 12)) + ')'; ctx.beginPath(); ctx.moveTo(x, H - 18); ctx.lineTo(x - 12, H - 36); ctx.lineTo(x + 12, H - 36); ctx.closePath(); ctx.fill(); } if (c.kind === 'truck' && !c.loaded && c.y > G.dist + ahead(1)) { const x = view.SW / 2 + (c.x - REF); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, top + 70); ctx.lineTo(x - 10, top + 84); ctx.lineTo(x + 10, top + 84); ctx.closePath(); ctx.fill(); } }
  if (G.vignette > 0) { const g = ctx.createRadialGradient(view.SW / 2, H / 2, H * 0.3, view.SW / 2, H / 2, H * 0.75); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(255,30,30,' + G.vignette * 0.45 + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, view.SW, H); }
  if (G.speedLines > 0 || G.speed > 550) { const a = G.speedLines > 0 ? 0.5 : (G.speed - 550) / 300; ctx.strokeStyle = 'rgba(255,255,255,' + a * 0.5 + ')'; ctx.lineWidth = 2; for (let i = 0; i < 10; i++) { const x = (i % 2 ? view.SW - 10 - i * 7 : 10 + i * 7); const y = ((elapsed * 900 + i * 173) % H); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60); ctx.stroke(); } }
  if (G.ghostThumb > 0 && isTouch) { const k = (elapsed * 1.6) % 1; ctx.globalAlpha = 0.7 * Math.sin(k * Math.PI); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(view.SW * 0.3 - 50 + k * 100, H * 0.86, 22, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.font = '700 15px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SLIDE TO STEER', view.SW * 0.3, H * 0.86 + 44); }
  ctx.restore();
}
const noise1 = (t) => Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.3) * 0.4;
function render(dt, st) {
  phase = st.phase; elapsed = st.elapsed; best = st.best; bestDaily = st.bestDaily; dailyMode = st.dailyMode;
  // shake inside the renderer (audit, hard truth 10): a directional kick that decays without overshoot, plus trauma² noise,
  // capped at 16 pt and 2 degrees, drawn with overscan so the edges never show
  const k = G.kick; const shakeOn = S.shake && !S.motion;
  const tr = shakeOn ? G.trauma * G.trauma : 0; const shx = shakeOn ? k.x + 16 * tr * noise1(elapsed * 31) : 0, shy = shakeOn ? k.y + 16 * tr * noise1(elapsed * 29 + 7) : 0, rot = (2 * Math.PI / 180) * tr * noise1(elapsed * 23 + 3);
  if (phase === 'over') decayPresentation(dt);   // no steps run on the death card, so the shake and flashes settle here
  // show more road at speed: zoom out up to 20% and let the car sit lower; pull out 5% and roll 5° into a drift
  const targetZoom = (G.air > 0 ? 1 - 0.15 * G.jumpZ : 1 - 0.2 * clamp((G.speed - 480) / 420, 0, 1)) + (G.punch > 0 ? 0.04 : 0) - (G.drifting ? 0.05 : 0); camZoom += (targetZoom - camZoom) * Math.min(1, dt * 6);
  const targetRoll = G.drifting ? -G.driftDir * 5 * Math.PI / 180 : 0; camRoll += (targetRoll - camRoll) * Math.min(1, dt * 5);
  const targetLane = LANE - 0.07 * clamp((G.speed - 480) / 420, 0, 1); camLane += (targetLane - camLane) * Math.min(1, dt * 3);
  camLook += (clamp(G.vx / T.maxLateral, -1, 1) * 20 - camLook) * Math.min(1, dt * 4);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.save(); ctx.translate(view.SW / 2 + shx, H * 0.7 + shy); ctx.rotate(rot + (phase === 'over' ? 0 : camRoll)); ctx.translate(-view.SW / 2, -H * 0.7);
  if (phase === 'over') renderReplay(); else renderWorld(dt);
  ctx.restore();
  if (phase !== 'title') drawHUD();
}
// Death replay (audit, hard truth 9): the last 1.5 s before the wreck, at 60% speed, framed with the car high on the screen so
// the death card's buttons sit below it. Holds on the final frame for half a second, then loops.
function renderReplay() {
  const R = G.replay; if (R.count === 0) { renderWorld(0); return; }
  const span = R.count / 30 / 0.6 + 0.5; const t = G.replayT % span; const idx = Math.min(R.count - 1, Math.floor(t * 0.6 * 30));
  const f = R.frames[(R.head - R.count + idx + REPLAY_FRAMES * 2) % REPLAY_FRAMES];
  const scroll = f.y - ahead(0.72); setCamera(scroll, G.road.frame(f.y).psi);
  drawRoad(scroll, f.district);
  for (let i = 0; i < f.n; i++) { const c = f.cars[i]; if (c.y < f.y - 300) continue; drawCar(c, scroll, c.x, c.y); }
  drawPlayer(scroll, f.x, f.y, 1, f.jumpZ, f.lean);
}
function renderWorld(dt) {
  // interpolate between the last two physics states (audit, "Smooth movement" 2): alpha = accumulator / step
  const alpha = clamp(G.acc * 120, 0, 1); const rx = lerp(G.px, G.x, alpha), rdist = lerp(G.pdist, G.dist, alpha);
  const scroll = rdist - ahead(camLane);
  // the camera heads where the road heads 0.4 s ahead (capped at 25° of lead), on a critically damped spring
  { const here = G.road.frame(rdist).psi; const lead = G.road.frame(rdist + 0.4 * G.speed).psi; const target = here + clamp(lead - here, -0.44, 0.44); camPsi += (target - camPsi) * Math.min(1, dt * 6); setCamera(scroll, camPsi); }
  drawRoad(scroll, G.district);
  const items = [];
  for (const rp of G.ramps) items.push({ y: rp.y, d: () => drawRamp(rp, scroll) });
  for (const b of G.barriers) items.push({ y: b.y, d: () => { if (b.hit) return; const x0 = G.road.laneX(b.y, b.lane0) - T.laneW / 2, x1 = G.road.laneX(b.y, b.lane0 + b.lanes - 1) + T.laneW / 2; const p0 = project((x0 + x1) / 2, b.y, scroll); const bw = (x1 - x0); ctx.save(); ctx.translate(p0.x, p0.y); ctx.rotate(roadYaw(b.y)); ctx.scale(p0.s, p0.s); ctx.fillStyle = '#ff9f1c'; ctx.fillRect(-bw / 2, -8, bw, 16); ctx.fillStyle = '#222'; for (let x = -bw / 2; x < bw / 2; x += 24) ctx.fillRect(x, -8, 12, 16); ctx.restore(); } });
  for (const b of G.barrels) if (b.alive) items.push({ y: b.y, d: () => { const p = project(b.x, b.y, scroll); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(b.y)); ctx.scale(p.s, p.s); rrect(-8, -11, 16, 22, 3, '#ff9f1c', '#222'); ctx.fillStyle = '#222'; ctx.fillRect(-8, -3, 16, 5); ctx.restore(); } });
  for (const cn of G.cones) if (cn.alive) items.push({ y: cn.y, d: () => { const p = project(cn.x, cn.y, scroll); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.s, p.s); ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-4, -2, 8, 3); ctx.restore(); } });
  for (const c of G.cars) items.push({ y: c.y, d: () => drawCar(c, scroll, lerp(c.px, c.x, alpha), lerp(c.py, c.y, alpha)) });
  for (const cr of G.crates) items.push({ y: cr.y, d: () => { const p = project(cr.x, cr.y, scroll); ctx.save(); ctx.translate(p.x, p.y - Math.sin(cr.t * 5) * 4); ctx.scale(p.s, p.s); rrect(-10, -10, 20, 20, 4, cr.kind === 'armor' ? C.player : cr.kind === 'oil' ? '#9b7bff' : C.pickup, '#fff'); glow(0, 0, 24, 'rgba(255,210,63,0.5)', 0.7); ctx.restore(); } });
  items.sort((a, b) => b.y - a.y);
  for (const it of items) { if (it.y < scroll - 120 || it.y > scroll + ahead(1.25)) continue; it.d(); }
  // tyre smoke: each puff grows from 8 to 48 pt over 1.4 s and fades from 55%
  for (const p of G.puffs) { const s = project(p.x, p.y, scroll); const k = p.t / PUFF_LIFE; ctx.globalAlpha = 0.55 * (1 - k) * (1 - k * 0.3); ctx.fillStyle = '#c9ccd2'; ctx.beginPath(); ctx.arc(s.x, s.y, (8 + 40 * k) * s.s, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
  for (const d of G.debris) { const p = project(d.x, d.y, scroll); ctx.fillStyle = d.col; if (d.smoke) { ctx.globalAlpha = d.t; ctx.beginPath(); ctx.arc(p.x, p.y, d.s * p.s, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; } else ctx.fillRect(p.x - d.s / 2, p.y - d.s / 2, d.s * p.s, d.s * p.s * 0.7); }
  for (const b of G.bullets) { const by = lerp(b.py === undefined ? b.y : b.py, b.y, alpha); const p = project(b.x, by, scroll); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(by)); ctx.fillStyle = b.knock ? '#ffb070' : '#fff2a8'; ctx.fillRect(-(b.knock ? 3 : 1.5), -14 * p.s, b.knock ? 6 : 3, 18 * p.s); ctx.restore(); }
  for (const m of G.missiles) { const my = lerp(m.py === undefined ? m.y : m.py, m.y, alpha); const p = project(m.x, my, scroll); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(roadYaw(my)); ctx.fillStyle = C.pickup; ctx.fillRect(-3, -12 * p.s, 6, 18 * p.s); glow(0, 10 * p.s, 8, 'rgba(255,160,60,0.9)', 0.8); ctx.restore(); }
  for (const s of G.sparks) { const p = project(s.x, s.y, scroll); ctx.globalAlpha = 1 - s.t / 0.4; ctx.fillStyle = s.col || '#ffdc78'; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); } ctx.globalAlpha = 1;
  for (const f of G.fx) { const p = project(f.x, f.y, scroll); const k = f.t / f.life; ctx.save(); ctx.globalCompositeOperation = 'lighter'; if (f.flame) { ctx.fillStyle = `rgba(255,${150 + 80 * k},60,${1 - k})`; ctx.beginPath(); ctx.moveTo(p.x - 5, p.y); ctx.lineTo(p.x + 5, p.y); ctx.lineTo(p.x, p.y + 18 * p.s * (1 + k)); ctx.closePath(); ctx.fill(); } else if (f.line) { const a = project(f.x0, f.y0, scroll); ctx.strokeStyle = `rgba(255,120,80,${1 - k})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } else if (f.ring) { ctx.strokeStyle = `rgba(200,200,200,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p.x, p.y, 20 + 50 * k, 10 + 25 * k, 0, 0, Math.PI * 2); ctx.stroke(); } else if (f.burst) { ctx.strokeStyle = `rgba(255,220,100,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 10 + 30 * k, 0, Math.PI * 2); ctx.stroke(); } else { const R = (f.player ? 90 : 60) * p.s; glow(p.x, p.y, R * (0.5 + k), f.orange ? 'rgba(255,140,30,1)' : 'rgba(255,170,60,1)', (1 - k)); glow(p.x, p.y, R * 0.4 * (0.5 + k), 'rgba(255,245,200,1)', (1 - k)); for (let i = 0; i < 10; i++) { const a = i * 2.4 + f.x; const d = 70 * p.s * k; ctx.fillStyle = `rgba(255,170,60,${1 - k})`; ctx.fillRect(p.x + Math.cos(a) * d - 2, p.y + Math.sin(a) * d * 0.7 - 2, 4, 4); } } ctx.restore(); }
  drawPlayer(scroll, rx, rdist, phase === 'dying' ? 0.6 : (G.flashT > 0 && Math.floor(elapsed * 16) % 2 === 0 ? 0.3 : 1));
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (const p of G.pops) { const s = project(p.x, p.y, scroll); const k = p.t; ctx.globalAlpha = 1 - k * k; ctx.font = '700 ' + (p.small ? 15 : 21) + 'px Rajdhani, "Avenir Next Condensed", sans-serif'; ctx.fillStyle = p.bad ? '#b8bcc6' : C.pickup; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.fillText(p.text, s.x, s.y - 24 - k * 40); } ctx.restore();
}
