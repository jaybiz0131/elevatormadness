import { STEP, T, clamp } from './constants.js';
import { say } from './events.js';
import { G, makeCar } from './state.js';
export function spawnCar(kind, lane, yAhead, opts = {}) {
  const y = G.dist + yAhead; lane = clamp(lane, 0, G.road.laneCount(y) - 1);
  const c = makeCar(kind, G.road.laneX(y, lane), y, { lane });
  if (kind === 'civ') { c.factor = 0.55 + G.rng() * 0.2; c.tint = ['#cfe6ff', '#fff1c9', '#cdebdc', '#e9d9ff'][Math.floor(G.rng() * 4)]; }
  if (kind === 'weak') c.factor = 0.8 + G.rng() * 0.1;
  if (kind === 'bruiser' || kind === 'gunner') { c.factor = 1; c.side = G.rng() < 0.5 ? -1 : 1; }
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
export function nearLane(y) { const pl = playerLane(); const n = G.road.laneCount(y); const opts = [pl, pl - 1, pl + 1].filter(i => i >= 0 && i < n); return opts[Math.floor(G.rng() * opts.length)]; }
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
export function spawnOnramp() { const side = G.rng() < 0.5 ? -1 : 1; const y = G.dist + 300; const a = G.road.at(y), ac = a.center, aw = a.width; const kind = G.t / 60 >= 1 && G.rng() < 0.4 ? 'gunner' : 'bruiser'; const c = spawnCar(kind, side < 0 ? 0 : G.road.laneCount(y) - 1, 300); c.x = c.px = ac + side * (aw / 2 + 40); c.vx = -side * 160; c.sideWarn = side; }

// Scripted first 60 s (review section 7), then the director.
export function script() {
  const t = G.t, s = G.script;
  if (s === 0 && t >= 0.2) { G.script = 1; spawnRamp(170, playerLane(), 'none'); }   // 0-3 s: burnout, then a jump off the garage ramp, no text
  else if (s === 1 && t >= 3) { G.script = 2; G.ghostThumb = 5; const pl = playerLane(); for (let i = 0; i < 6; i++) { const lane = clamp(pl + (i % 2 ? 1 : -1), 0, G.road.laneCount(G.dist + 500) - 1); G.cones.push({ x: G.road.laneX(G.dist + 500 + i * 170, lane), y: G.dist + 500 + i * 170, alive: true }); } }   // 3-10 s: steer, a lane of cones to weave through
  else if (s === 2 && t >= 10) { G.script = 3; const b = spawnCar('bruiser', playerLane() === 0 ? 1 : playerLane() - 1, 360); b.slowDuel = true; b.teach = true; }   // 10-20 s: a slow Bruiser holds beside you; time slows until the flick
  else if (s === 3 && t >= 20) { G.script = 4; G.teach = 'drift'; }   // 20-35 s: the first hairpin; time slows at the entry until the pad is held
  else if (s === 4 && t >= 35) { G.script = 5; spawnCar('truck', playerLane(), 560, { gives: 'missiles' }); say('Supply truck', '', 1200); }   // 35-50 s: special
  else if (s === 5 && t >= 42) { G.script = 6; spawnCar('armored', Math.max(0, playerLane() - 1), 900); say('Armored truck', 'missiles only', 1300); }
  else if (s === 6 && t >= 50) { G.script = 7; const pl = playerLane(); spawnCar('bruiser', pl, 600); spawnCar('weak', fodderLane(G.dist + 800), 800); spawnCar('civ', freeLane(G.dist + 1000, [pl]), 1000); const l = freeLane(G.dist + 700, [pl]); spawnBarrels(760, l); }   // 50-60 s: everything together
  else if (s === 7 && t >= 60) { G.script = 8; G.scripted = false; G.nextTruck = t + T.truckEvery; G.nextBarrel = t + 10; G.nextClosure = t + 15; G.nextFork = t + 30; G.nextOnramp = t + 20; G.waveT = 40; G.wave = 'pressure'; }
  // teaching moments: slow time until the player does the thing, three seconds at most
  if (G.teachT > 0) { G.teachT -= STEP; if (G.teachT <= 0) { G.teach = null; G.slowmo = 0; } }
  if (G.teach === 'slam' && G.teachT <= 0) { const b = G.cars.find(c => c.teach && c.alive && !c.wrecked); if (b && (b.state === 'hold' || b.state === 'tell') && Math.abs(b.y - G.dist) < 60) { G.teachT = 3; G.slowmo = 3; G.slowmoRate = 0.35; say('Flick to Slam', ['a fast sideways flick', 'double-tap an arrow, or Q / E'], 2500); } }
  if (G.teach === 'drift' && G.teachT <= 0) { const ca = G.road.cornerAhead(G.dist, 500); if (ca && ca.type === 'hairpin' && G.dist >= ca.s0 - 420) { G.teachT = 3; G.slowmo = 3; G.slowmoRate = 0.3; say('Hold to drift', ['hold the pad and steer', 'hold Shift and steer'], 2500); } }
  if (G.teachT > 0 && ((G.teach === 'slam' && G.slams > 0) || (G.teach === 'drift' && G.drifting))) { G.teach = null; G.teachT = 0; G.slowmo = 0; say(null); }
  population(2, 1);
  if (t > 8 && t - G.lastEvent > 2.6) spawnCar('weak', fodderLane(G.dist + 600), 600 + G.rng() * 150);   // 3-second rule holds inside the script too
}
export function population(minCars, minEnemies) {
  const onScreen = G.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'truck' && c.y > G.dist - 300 && c.y < G.dist + 900);
  const enemies = onScreen.filter(c => c.kind !== 'civ').length;
  const minute = G.t / 60; const cap = minute < 1 ? 2 : minute < 3 ? 3 : minute < 5 ? 4 : 5;
  const burst = G.lastSpawnBurst.filter(t => G.t - t < 1.5).length;
  if (burst >= 2) return;
  if (enemies < minEnemies && enemies < cap) { spawnEnemy(); return; }
  if (onScreen.length < minCars) { spawnCar('civ', freeLane(G.dist + 800, [playerLane()]), 800 + G.rng() * 200); }
}
export function spawnEnemy() {
  const minute = G.t / 60; const pool = ['weak', 'bruiser']; if (minute >= 1) pool.push('gunner'); if (minute >= 3) pool.push('armored');
  const kind = pool[Math.floor(G.rng() * pool.length)];
  const behind = (kind === 'bruiser' || kind === 'gunner') && G.rng() < 0.4;
  const y = behind ? -420 : 700 + G.rng() * 300;
  spawnCar(kind, kind === 'weak' ? fodderLane(G.dist + y) : freeLane(G.dist + y, []), y);
  G.lastSpawnBurst.push(G.t); if (G.lastSpawnBurst.length > 8) G.lastSpawnBurst.shift();
}
export function director() {
  const minute = G.t / 60; const technical = G.road.at(G.dist).sector.kind === 'technical'; const cap = technical ? 2 : minute < 1 ? 2 : minute < 3 ? 3 : minute < 5 ? 4 : 5;
  const onScreen = G.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'truck' && c.y > G.dist - 300 && c.y < G.dist + 900);
  const enemies = onScreen.filter(c => c.kind !== 'civ').length;
  G.waveT -= 0; // wave clock is advanced in simulate
  const pressure = G.wave === 'pressure' && !technical;   // technical sectors: light traffic, the corners are the content
  population(pressure ? 3 : 2, 1);
  if (G.t >= G.nextSpawn) {
    G.nextSpawn = G.t + (pressure ? 1.4 + G.rng() * 1.2 : 2.5 + G.rng() * 1.5);
    const civShare = technical ? 0.6 : minute < 1 ? 0.4 : minute < 3 ? 0.35 : 0.3;
    if (G.rng() < civShare || !pressure || enemies >= cap) { if (onScreen.length < (minute < 1 ? 5 : minute < 3 ? 6 : 8)) spawnCar('civ', freeLane(G.dist + 900, [playerLane()]), 850 + G.rng() * 300); }
    else spawnEnemy();
  }
  if (technical) { if (G.t - G.lastEvent > 2.6) spawnCar('weak', fodderLane(G.dist + 600), 600 + G.rng() * 150); return; }   // no ramps, trucks, barrels, closures or forks inside a technical sector; corners and a little fodder carry it
  if (G.t >= G.nextRamp) { G.nextRamp = G.t + T.ramp.every[0] + G.rng() * (T.ramp.every[1] - T.ramp.every[0]); const setups = ['jam', 'gap', 'block', 'crate']; spawnRamp(900, nearLane(G.dist + 900), setups[G.rampIndex++ % 4]); }
  if (G.t >= G.nextTruck) { G.nextTruck = G.t + T.truckEvery; spawnCar('truck', nearLane(G.dist + 900), 900); say('Supply truck', '', 900); }
  if (G.t >= G.nextBarrel) { G.nextBarrel = G.t + T.barrelEvery; spawnBarrels(900, freeLane(G.dist + 900, [])); }
  if (G.t >= G.nextClosure) { G.nextClosure = G.t + T.closureEvery; spawnClosure(1000); }
  if (G.t >= G.nextFork) { G.nextFork = G.t + T.forkEvery[0] + G.rng() * (T.forkEvery[1] - T.forkEvery[0]); spawnFork(1000); }
  if (G.t >= G.nextOnramp) { G.nextOnramp = G.t + T.onrampEvery; spawnOnramp(); }
  if (!pressure && G.waveReward !== G.waveN) { G.waveReward = G.waveN; if (G.rng() < 0.5) spawnCar('truck', nearLane(G.dist + 800), 800); else G.crates.push({ x: G.road.laneX(G.dist + 800, playerLane()), y: G.dist + 800, vy: 0, t: 0, kind: ['gun', 'armor', 'ammo'][Math.floor(G.rng() * 3)], speed: G.speed * 0.6 }); }
  // 3-second rule: a quiet road gets a weak car in the lane (fodder does not count against the heavy-enemy cap)
  if (G.t - G.lastEvent > 2.6) { if (enemies < cap) spawnEnemy(); else spawnCar('weak', fodderLane(G.dist + 600), 600 + G.rng() * 150); }
}
export function event() { G.lastEvent = G.t; }
