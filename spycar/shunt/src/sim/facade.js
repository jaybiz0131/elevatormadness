// Stop 6: the street takes damage. The sim keeps three small lists (nothing else reads them; the renderer draws them as decals, flames and falling glass):
//   G.scars  decals on a building face: side (-1 left, +1 right), s along the road, h metres up, kind (0 chip, 1 scorch), t age;
//   G.fires  a burning stretch of facade: side, s, h, w metres wide, t age, life;
//   G.heatCells  how hot each 48 pt cell of facade is: chips and blasts heat it, it cools, and over the limit it catches fire.
// Everything is capped (T.facade) and only ever updated inside the fixed step, so replays and hashes agree.
import { REF, T, clamp } from './constants.js';
import { facadeAt } from '../render/three/layout.js';
import { G } from './state.js';
// the building facing the road at (side, s), or null in a gap (the same plots the city draws: layout.js, default options)
export const facadeOf = (side, s) => facadeAt(G.road, side, s);
// a round that crossed the road edge and the pavement and met the building at (side, s): chip, dust and glass where it hit, and the cell warms
export function addChip(side, s, bx) {
  G.chips++; const h = 0.9 + G.rng() * 3.1; addScar(side, s, h, 0); addHeat(s, side, 1, h);
}
export function addScar(side, s, h, kind) {
  const F = T.facade; const sc = { side, s, h, kind, t: 0, seed: G.rng() }; if (G.scars.length >= F.scars) G.scars.shift(); G.scars.push(sc); return sc;
}
export function addHeat(s, side, v, h) {
  const F = T.facade, key = Math.floor(s / F.cell) * 2 + (side > 0 ? 1 : 0); let c = null; for (const q of G.heatCells) if (q.k === key) { c = q; break; }
  if (!c) { c = { k: key, v: 0 }; G.heatCells.push(c); } c.v += v;
  if (c.v >= F.fireAt) { c.v = 0; ignite(side, s, h); }
}
// the facade catches fire (not twice in the same stretch, and no more than T.facade.fires at once)
export function ignite(side, s, h) {
  const F = T.facade; for (const f of G.fires) if (f.side === side && Math.abs(f.s - s) < 70 && f.t < f.life) return;
  if (G.fires.length >= F.fires) return;
  G.fires.push({ side, s, h: clamp(h || 1.5, 0.8, 4), w: 3.5 + G.rng() * 3, t: 0, life: F.fire[0] + G.rng() * (F.fire[1] - F.fire[0]), seed: G.rng() }); G.facadeFires++; addScar(side, s, clamp(h || 1.5, 0.8, 4) + 1.2, 1);
}
export function facadeStep(dt) {
  const F = T.facade;
  for (const f of G.scars) f.t += dt; for (const f of G.fires) f.t += dt;
  let n = 0; for (const f of G.scars) if (f.t < F.scarLife) G.scars[n++] = f; G.scars.length = n;
  n = 0; for (const f of G.fires) if (f.t < f.life + 3 && Math.abs(f.s - G.dist) < 4000) G.fires[n++] = f; G.fires.length = n;
  n = 0; for (const c of G.heatCells) { c.v -= F.cool * dt; if (c.v > 0.05) G.heatCells[n++] = c; } G.heatCells.length = n;
}
