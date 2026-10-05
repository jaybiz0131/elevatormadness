import { STEP, T, clamp, lerp } from './constants.js';
import { say } from './events.js';
import { G, makeCar } from './state.js';
export function spawnCar(kind, lane, yAhead, opts = {}) {
  const y = G.dist + yAhead; lane = clamp(lane, 0, G.road.laneCount(y) - 1);
  const c = makeCar(kind, G.road.laneX(y, lane), y, { lane });
  if (kind === 'civ') { c.factor = 0.55 + G.rng() * 0.2; c.tint = ['#cfe6ff', '#fff1c9', '#cdebdc', '#e9d9ff'][Math.floor(G.rng() * 4)]; }
  if (kind === 'weak' || kind === 'bruiser' || kind === 'gunner') { c.factor = 1; c.side = G.rng() < 0.5 ? -1 : 1; }
  if (kind === 'armored') { c.factor = 0.7; c.lane = Math.min(lane, G.road.laneCount(y) - 2); c.x = (G.road.laneX(y, c.lane) + G.road.laneX(y, c.lane + 1)) / 2; }
  if (kind === 'truck') { c.factor = 0.85; c.loaded = false; c.gives = opts.gives || ['missiles', 'oil', 'armor', 'nitro'][G.truckIndex++ % 4]; }   // armor is rare: supply truck only
  c.speed = G.cruise * c.factor; Object.assign(c, opts);
  G.cars.push(c);
  if (kind !== 'civ' && kind !== 'truck') { event(); if (yAhead < 0) c.rearWarn = 1.0; }
  return c;
}
export function freeLane(y, avoid = []) { const n = G.road.laneCount(y); const options = []; for (let i = 0; i < n; i++) if (!avoid.includes(i)) options.push(i); return options.length ? options[Math.floor(G.rng() * options.length)] : 0; }
export function playerLane() { return G.road.laneOf(G.dist, G.x); }
// fodder goes one or two lanes over from the player, never in the gun line, so lining up a shot is a decision (audit, combat 1)
// Judged by road offset rather than lane index, because lane indices shift where the lane count changes.
export function fodderLane(y) { const off = G.x - G.road.at(G.dist).center; const n = G.road.laneCount(y); const c = G.road.at(y).center; const opts = []; for (let i = 0; i < n; i++) { const d = Math.abs(G.road.laneX(y, i) - c - off); if (d >= T.laneW * 0.9 && d <= T.laneW * 2.2) opts.push(i); } if (!opts.length) for (let i = 0; i < n; i++) if (Math.abs(G.road.laneX(y, i) - c - off) >= T.laneW * 0.9) opts.push(i); return opts.length ? opts[Math.floor(G.rng() * opts.length)] : freeLane(y, [playerLane()]); }
export function nearLane(y) { const pl = playerLane(); const n = G.road.laneCount(y); const opts = [pl, pl - 1, pl + 1].filter(i => i >= 0 && i < n); return opts.length ? opts[Math.floor(G.rng() * opts.length)] : clamp(pl, 0, n - 1); }   // off the road (a rail scrape, a spin) the player lane can be outside 0..n-1: never return undefined (a NaN lane spawned a NaN car)
export function spawnRamp(yAhead, lane, setup) {
  const y = G.dist + yAhead; lane = clamp(lane, 0, G.road.laneCount(y) - 1);
  const rp = { y, lane, x: G.road.laneX(y, lane), w: T.laneW * 1.6, used: false, setup, crate: setup === 'crate' ? { taken: false } : null };
  G.ramps.push(rp); event();
  const pl = lane;
  if (setup === 'jam') { const n = G.road.laneCount(y + 420); let placed = 0; for (let i = 0; i < n && placed < 6; i++) { if (G.rng() < 0.85) { spawnCar(i === pl ? 'weak' : 'civ', i, yAhead + 400 + (G.rng() * 2 - 1) * 30, { factor: 0.6 }); placed++; } } }
  if (setup === 'gap') { G.gaps.push({ y0: y + 120, y1: y + 420 }); }
  if (setup === 'block') { G.barriers.push({ y: y + 380, lanes: Math.min(3, G.road.laneCount(y + 380)), lane0: Math.max(0, pl - 1) }); }
}
export function spawnBarrels(yAhead, lane) { const y = G.dist + yAhead; for (let i = 0; i < 3; i++) G.barrels.push({ x: G.road.laneX(y, lane) + (i - 1) * 16, y: y + (i % 2) * 18, alive: true }); event(); }
export function spawnClosure(yAhead) { const y = G.dist + yAhead; const n = G.road.laneCount(y); const edge = G.rng() < 0.5 ? 0 : n - 1; for (let i = 0; i < 6; i++) G.cones.push({ x: G.road.laneX(y + i * 70, edge) + (edge === 0 ? -14 + i * 5 : 14 - i * 5), y: y + i * 70, alive: true }); G.signs.push({ y: y - 150, text: edge === 0 ? '→ MERGE' : 'MERGE ←' }); }
export function spawnFork(yAhead) { const y = G.dist + yAhead; const n = G.road.laneCount(y + 300); if (n < 4) return; G.medians.push({ y0: y, y1: y + 520, lane0: Math.floor(n / 2) - 1, lanes: 1 }); const right = n - 1; if (G.rng() < 0.5) spawnCar('truck', right, yAhead + 260); else spawnRamp(yAhead + 260, right, 'crate'); G.signs.push({ y: y - 200, text: 'FORK · REWARD RIGHT' }); }
export function spawnOnramp() { const side = G.rng() < 0.5 ? -1 : 1; const y = G.dist + 300; const a = G.road.at(y), ac = a.center, aw = a.width; const kind = progress() > 0.3 && G.rng() < 0.4 ? 'gunner' : 'bruiser'; const c = spawnCar(kind, side < 0 ? 0 : G.road.laneCount(y) - 1, 300); c.x = c.px = ac + side * (aw / 2 + 40); c.vx = -side * 160; c.sideWarn = side; }

// ---------------- the pacing director (Sprint D) ----------------
// Runs every sixth tick (20 Hz). The run is a push toward the city: progress is distance over T.goal.city. Waves of enemies arrive every
// 8 to 15 s and escalate with progress (Darts, then Rams, then Gunners, then a Bulwark); whenever no attacker is in the window for
// T.pace.floor seconds a filler enemy appears at once, so the road is never quiet for as long as 5 s. Between waves: weave lines of slow
// traffic, the old road events (ramps, supply trucks, barrels, merges, forks, on-ramp enemies) and pickups when armor or missiles run low.
export const NAMES = { weak: ['Dart', 'fast and light'], bruiser: ['Ram', 'it lunges: flick to Slam'], gunner: ['Gunner', 'a red line means a shot'], armored: ['Bulwark', 'bullets bounce: missiles or go round'] };
export const isAttacker = (k) => k === 'weak' || k === 'bruiser' || k === 'gunner' || k === 'armored';
export function progress() { return clamp(G.dist / T.goal.city, 0, 1); }
const tierOf = (p) => p < 0.15 ? 0 : p < 0.4 ? 1 : p < 0.7 ? 2 : 3;
function attackers(lo, hi) { let n = 0; for (const c of G.cars) if (c.alive && !c.wrecked && isAttacker(c.kind) && c.y > G.dist + lo && c.y < G.dist + hi) n++; return n; }
// one enemy, ahead (inside the window at once) or behind (it rolls up from the bottom of the screen)
export function spawnAttacker(kind, behind, soft) {
  // the road eases off a hurt car: on one armor pip the heavy hitters become Darts; on two, at most one Ram or Gunner at a time
  if ((kind === 'bruiser' || kind === 'gunner') && (G.armor <= 1 || (G.armor === 2 && G.cars.some(c => c.alive && !c.wrecked && (c.kind === 'bruiser' || c.kind === 'gunner'))))) kind = 'weak';
  const y = behind ? -(400 + G.rng() * 40) : 650 + G.rng() * 220;
  const c = spawnCar(kind, freeLane(G.dist + y, []), y);
  if (kind === 'armored') c.factor = 0.62;
  if (soft) c.soft = true;
  if (!G.shown[kind]) { G.shown[kind] = 1; say(NAMES[kind][0], NAMES[kind][1], 1500); }
  return c;
}
// wave tables: [kind, behind] per member; a Bulwark joins every fourth wave after halfway
function waveList(p) {
  const r = G.rng(), i = G.waveIdx;
  const D = [['weak', 0], ['weak', 1]];
  if (p < 0.12) return i < 2 ? D : r < 0.5 ? D : [['weak', 0], ['weak', 0], ['weak', 1]];
  if (p < 0.3) return r < 0.34 ? [['weak', 0], ['weak', 0], ['weak', 1]] : r < 0.67 ? [['bruiser', 0], ['weak', 1]] : [['bruiser', 0], ['weak', 0]];
  if (p < 0.5) return r < 0.34 ? [['bruiser', 0], ['weak', 0], ['weak', 1]] : r < 0.67 ? [['bruiser', 0], ['bruiser', 1]] : [['gunner', 1], ['weak', 0], ['weak', 0]];
  if (p < 0.7) return r < 0.34 ? [['gunner', 1], ['bruiser', 0], ['weak', 0]] : r < 0.67 ? [['gunner', 1], ['weak', 0], ['weak', 1]] : [['bruiser', 0], ['bruiser', 0], ['weak', 1]];
  return r < 0.34 ? [['gunner', 1], ['bruiser', 0], ['weak', 0], ['weak', 1]] : r < 0.67 ? [['gunner', 1], ['gunner', 1], ['bruiser', 0]] : [['bruiser', 0], ['weak', 0], ['weak', 1]];
}
function startWave(p, cap) {
  let list = waveList(p);
  if (p > 0.5 && G.waveIdx % 4 === 3 && !G.cars.some(c => c.alive && c.kind === 'armored')) list = [['armored', 0], ['weak', 1]].concat(list.slice(0, 1));
  const have = attackers(T.pace.window[0], 1400); const room = Math.max(0, cap - have);
  if (room === 0) { G.waveT = 2; return; }   // the road is full: try again shortly
  list = list.slice(0, G.armor <= 1 ? Math.min(room, 2) : room);
  list.forEach((m, i) => { const f = () => spawnAttacker(m[0], !!m[1], false); if (i === 0) f(); else G.queue.push({ t: i * 0.7, fn: f }); });
  G.waveIdx++; G.waveN++; G.waveT = clamp(lerp(14, 9, p) + (G.rng() * 2 - 1) * 1.5, T.pace.waveMin, T.pace.waveMax);
}
function startFiller(p, finale) {
  const r = G.rng(); let kind = 'weak', behind = false;
  if (!finale) { if (p >= 0.3 && r < 0.45) kind = 'bruiser'; if (p >= 0.55 && r > 0.75) { kind = 'gunner'; behind = true; } }
  spawnAttacker(kind, behind, finale);
}
// a weave line: rows of slow traffic with one gap that wanders a lane at a time
function spawnWeave(p) {
  const n = G.road.laneCount(G.dist + 900); if (n < 3) return; let gap = Math.floor(G.rng() * n); const rows = 3, spacing = 330 - 50 * p;
  for (let r = 0; r < rows; r++) { for (let l = 0; l < n; l++) { if (l === gap) continue; if (G.rng() < 0.15 && n >= 5) continue; spawnCar('civ', l, 760 + r * spacing, { factor: 0.55 + G.rng() * 0.08, laneTimer: 999 }); } const d = Math.floor(G.rng() * 3) - 1; gap = clamp(gap + d, 0, n - 1); }
}
export function spawnCrate(kind) { const lane = nearLane(G.dist + 800); G.crates.push({ x: G.road.laneX(G.dist + 800, lane), y: G.dist + 800, vy: 0, t: 0, kind, speed: G.speed * 0.6 }); }
function pickups() {
  const needArmor = G.armor < T.armor, needAmmo = !G.special || G.special.ammo < 2;
  const crateOut = (k) => G.crates.some(c => c.kind === k && !c.dead);
  if (G.armor <= 1 && !crateOut('armor') && G.t - G.lastAidT > 12) G.pickT = Math.min(G.pickT, G.t + 1.5);   // low on armor: help is on the way
  if (G.t < G.pickT) return;
  G.pickT = G.t + T.pace.pickupEvery[0] + G.rng() * (T.pace.pickupEvery[1] - T.pace.pickupEvery[0]);
  let kind = null; if (needArmor && (G.armor <= 2 || G.rng() < 0.4) && !(needAmmo && G.t - G.lastAidT < 8)) kind = 'armor'; else if (needAmmo || (!G.special || G.special.ammo < 4)) kind = 'ammo'; else if (needArmor) kind = 'armor';
  if (!kind || crateOut(kind)) { G.pickT = G.t + 6; return; }
  spawnCrate(kind); if (kind === 'armor') G.lastAidT = G.t;
}
// hairpin teaching (kept from the old script): time slows at the first hairpin until the pad is held
function teaching() {
  if (!G.teachSet && G.t >= 8) { G.teachSet = true; G.teach = 'drift'; }
  if (G.teachT > 0) { G.teachT -= STEP; if (G.teachT <= 0) { G.teach = null; G.slowmo = 0; } }
  if (G.teach === 'drift' && G.teachT <= 0) { const ca = G.road.cornerAhead(G.dist, 500); if (ca && ca.type === 'hairpin' && G.dist >= ca.s0 - 420) { G.teachT = 3; G.slowmo = 3; G.slowmoRate = 0.3; say('Hold to drift', ['hold the pad and steer', 'hold Shift and steer'], 2500); } }
  if (G.teachT > 0 && G.teach === 'drift' && G.drifting) { G.teach = null; G.teachT = 0; G.slowmo = 0; say(null); }
}
export function director() {
  teaching();
  if (G.ticks % 6 !== 0) return;
  const dt = 6 * STEP, p = progress(); G.prog = p;
  if (!G.opened && G.t >= 0.2) { G.opened = true; spawnRamp(170, playerLane(), 'none'); }   // the jump off the garage ramp
  const technical = G.road.at(G.dist).sector.kind === 'technical';
  const cap = Math.min(T.pace.caps[tierOf(p)], technical ? 2 : 9);
  const winding = G.finale === 1 || p >= 0.97;
  // finale: at 90% of the way a heavy wave and a Bulwark; the enemies are soft (longer tells, slower guns) and an armor crate leads in
  if (p >= 0.84 && !G.leadIn) { G.leadIn = true; if (G.armor < T.armor) { spawnCrate('armor'); G.lastAidT = G.t; } if (!G.special || G.special.ammo < 2) G.queue.push({ t: 1.2, fn: () => spawnCrate('ammo') }); }
  if (p >= T.goal.finale && !G.finale) {
    G.finale = 1; say('City gate ahead', 'hold on', 1800, false);
    // heavy, but soft and forgiving: a Ram, a Gunner and Darts, fewer of them if the car is hurt or the road is already busy, and a Bulwark
    const room = Math.max(2, 6 - attackers(T.pace.window[0], 1400)); const crew = [['bruiser', 0, 0], ['weak', 0, 0.6], ['weak', 1, 1.2], ['gunner', 1, 1.8], ['weak', 0, 2.4]].slice(0, G.armor <= 1 ? 2 : room - 1);
    for (const [k, b, d] of crew) G.queue.push({ t: d, fn: () => spawnAttacker(k, !!b, true) });
    const bw = spawnAttacker('armored', false, true); bw.y = G.dist + 1500; bw.px = bw.x; bw.py = bw.y; bw.factor = 0.55; G.signs.push({ y: T.goal.city - 140, text: 'CITY GATE', big: true });
  }
  // the 5 s rule: no attacker anywhere near the screen for `floor` s (or fewer than the tier's minimum for `floorMore` s) spawns a filler
  const have = attackers(T.pace.window[0], T.pace.window[1]), need = G.finale || p < 0.1 || G.armor <= 1 ? 1 : p < 0.5 || G.armor < 3 ? 2 : 3;   // on one armor pip the road eases off
  if (have < need) { G.fillT += dt; if (G.fillT >= (have === 0 ? T.pace.floor : T.pace.floorMore) && !(p >= 0.985)) { G.fillT = 0; startFiller(p, G.finale === 1); } } else G.fillT = 0;
  G.wave = have > 0 ? 'pressure' : 'breather';
  // waves
  if (!G.finale) { G.waveT -= dt; if (G.waveT <= 0) startWave(p, cap); }
  // civilian traffic: a few cars always about, more room to weave when the road is open
  { let civs = 0; for (const c of G.cars) if (c.alive && !c.wrecked && c.kind === 'civ' && c.y > G.dist - 300 && c.y < G.dist + 1200) civs++;
    const want = technical ? 2 : p < 0.2 ? 3 : 4; if (civs < want && G.t >= G.nextSpawn && !winding) { G.nextSpawn = G.t + 0.8 + G.rng() * 0.8; spawnCar('civ', freeLane(G.dist + 900, [playerLane()]), 850 + G.rng() * 300); } }
  if (technical || winding) return;   // inside a technical sector and in the finale: the corners and the wave are the content
  if (G.t >= G.weaveT) { G.weaveT = G.t + T.pace.weaveEvery[0] + G.rng() * (T.pace.weaveEvery[1] - T.pace.weaveEvery[0]); spawnWeave(p); }
  pickups();
  if (G.t >= G.nextRamp) { G.nextRamp = G.t + T.ramp.every[0] + G.rng() * (T.ramp.every[1] - T.ramp.every[0]); const setups = ['jam', 'gap', 'block', 'crate']; spawnRamp(900, nearLane(G.dist + 900), setups[G.rampIndex++ % 4]); }
  if (G.t >= G.nextTruck) { G.nextTruck = G.t + T.truckEvery; spawnCar('truck', nearLane(G.dist + 900), 900); say('Supply truck', '', 900); }
  if (G.t >= G.nextBarrel) { G.nextBarrel = G.t + T.barrelEvery; spawnBarrels(900, freeLane(G.dist + 900, [])); }
  if (G.t >= G.nextClosure) { G.nextClosure = G.t + T.closureEvery; spawnClosure(1000); }
  if (G.t >= G.nextFork) { G.nextFork = G.t + T.forkEvery[0] + G.rng() * (T.forkEvery[1] - T.forkEvery[0]); spawnFork(1000); }
  if (G.t >= G.nextOnramp) { G.nextOnramp = G.t + T.onrampEvery; spawnOnramp(); }
}
export function event() { G.lastEvent = G.t; }
