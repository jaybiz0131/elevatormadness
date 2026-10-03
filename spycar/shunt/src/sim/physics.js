import { REF, T, clamp, fmt, lerp } from './constants.js';
import { event, playerLane } from './director.js';
import { emit, hap, say, sfx } from './events.js';
import { DISTRICTS } from './road.js';
import { G, compact, recordReplay } from './state.js';
export function physics(dt, playing) {
  // previous state for interpolated rendering (audit, "Smooth movement" 2)
  G.px = G.x; G.pdist = G.dist; for (const c of G.cars) { c.px = c.x; c.py = c.y; }
  const road = G.road.at(G.dist), rc = road.center, rw = road.width;   // road.at() returns a reused object: copy the numbers
  // --- player steering: target from the thumb; eased; 50% authority in the air; Slam burst overrides
  G.roadVx = G.prevRc === undefined ? 0 : (rc - G.prevRc) / dt; G.prevRc = rc;   // how fast the road itself is sliding sideways under the car
  G.targetX = rc + G.in.off;
  { const off = G.targetX - rc; G.steerVx = G.prevOff === undefined ? 0 : (off - G.prevOff) / dt; G.prevOff = off; }   // how fast the thumb is moving the target across the road
  const lim = rw / 2 - T.sizes.player[0] / 2 - 2;
  G.rawTargetX = G.targetX; G.targetX = clamp(G.targetX, rc - lim, rc + lim);
  driveSpeed(dt, playing);
  if (G.slamT > 0) { G.slamT -= dt; G.vx = G.slamDir * T.slam.speed; G.x += G.vx * dt; G.heading = G.phi = G.slamDir * 0.2; if (G.rng() < 0.6) addMark(G.x - G.slamDir * 10, G.dist - 20, 3, true); if (G.slamT <= 0) { emit({ k: 'rebase', d: G.x - G.slamX0 }); G.targetX = G.x; G.heading = G.phi = 0; } }   // the thumb keeps relative control from where the Slam ended
  else driveSteer(dt, playing);
  G.fwd = G.speed * Math.cos(G.phi);
  if (G.slamCd > 0) G.slamCd -= dt;
  if (G.in.slam) trySlam(G.in.slam); if (G.in.special) fireSpecial(); G.flicks += G.in.flicks;
  if (playing) gun(dt);   // inside the fixed step, so the gun obeys slow motion and hit-stop (audit, hard truth 11)
  // rails: scrape = sparks, small speed loss, capped graze points (bug 6)
  const left = rc - rw / 2 + T.sizes.player[0] / 2, right = rc + rw / 2 - T.sizes.player[0] / 2;
  let scraping = false;
  if (G.x < left) { G.x = left; G.vx = Math.max(G.vx, 0); scraping = true; } if (G.x > right) { G.x = right; G.vx = Math.min(G.vx, 0); scraping = true; }
  G.scraping = scraping && G.air <= 0 && playing; if (G.scraping && G.drifting) G.driftDirty = true;
  // Hairpins must matter (Sprint 3D step 6, behind G.cfg.hairpinWall): a car that reaches the outside rail of a hard corner well over grip
  // speed, neither braking nor drifting, hits the barrier: a hard hit, a big speed loss, sparks, some damage. Once per corner.
  // Over grip for wideFor seconds (accumulated) runs the car wide: it is put against the outer rail and takes the hit there.
  if (G.cfg.hairpinWall && playing && G.air <= 0) { const cnw = G.road.at(G.dist).corner; const over = cnw && cnw.hard && !cnw.wallHit && !G.drifting && !G.braking && G.speed * G.speed * Math.abs(cnw.k) > T.drive.grip * T.wall.over;
    if (over) G.wideT += dt; else G.wideT = 0;
    if (over && G.wideT >= T.wall.wideFor) {
    cnw.wallHit = true; G.wallHits++; G.wideT = 0; G.wallT = T.wall.stun; const o = -cnw.dir; G.speed = Math.max(T.drive.minSpeed, G.speed * T.wall.keep); G.boost = 0; G.slideVx = 0; G.vx = -o * 140; G.x = (o < 0 ? left : right) - o * 14; G.heading = G.phi = 0; const dTarget = G.x - G.targetX; G.targetX = G.x; emit({ k: 'rebase', d: dTarget });
    damage(T.wall.damage, null, 'Hit the barrier'); spark(G.x + o * 17, G.dist, 18); sfx.crunch(true); hap([40, 30, 60]); kickShake(o * 10, 0, 0.8); G.hitStop = Math.max(G.hitStop, 0.08); G.sq = 0.88; say('Too fast', 'brake or drift', 900); event();
    const row = cornerRow(cnw); if (row) row.wall = true; } }
  else G.wideT = 0;
  if (scraping && G.air <= 0 && playing) { G.grazeT += dt; spark(G.x + (G.x <= left + 0.5 ? -17 : 17), G.dist, 1); G.boost = Math.max(G.boost - 40 * dt, -40); if (G.grazeT > 0.25 && G.grazePaid < T.score.grazeCap) { G.grazeT = 0; G.grazePaid++; addScore(T.score.graze, G.x, G.dist, true); } } else { G.grazeT = 0; if (!scraping) G.grazePaid = 0; }
  // median / barrier for the player
  for (const m of G.medians) if (G.dist > m.y0 - 30 && G.dist < m.y1 + 30) { const mx0 = G.road.laneX(G.dist, m.lane0) - 6, mx1 = G.road.laneX(G.dist, m.lane0 + m.lanes - 1) + 6; const hw = T.sizes.player[0] / 2; if (G.x + hw > mx0 && G.x - hw < mx1) { if (G.x < (mx0 + mx1) / 2) G.x = mx0 - hw; else G.x = mx1 + hw; G.vx = 0; if (G.slamT > 0) G.slamT = 0; spark(G.x, G.dist, 2); } }
  for (const b of G.barriers) if (!b.hit && G.air <= 0 && Math.abs(G.dist - b.y) < 36) { const x0 = G.road.laneX(b.y, b.lane0) - T.laneW / 2, x1 = G.road.laneX(b.y, b.lane0 + b.lanes - 1) + T.laneW / 2; if (G.x > x0 && G.x < x1) { b.hit = true; damage(1, null, 'Hit a roadblock'); G.boost = -120; spark(G.x, G.dist + 30, 10); } }
  for (const g of G.gaps) if (!g.done && G.air <= 0 && G.dist > g.y0 && G.dist < g.y1 && playing) { g.done = true; G.detour = 2.5; G.combo = 0; G.comboT = 0; say('Detour', 'you missed the jump', 1200); sfx.horn(); }
  G.relVx = G.vx - G.roadVx;   // sideways speed relative to the road: what shunts and skids read
  G.lean = G.heading * 180 / Math.PI;   // the body points where it is heading; the slip angle is visible as the difference from the motion
  G.sq += (1 - G.sq) * Math.min(1, dt * 10);
  const prevDist = G.dist; G.dist += G.fwd * dt; G.road.ensure(G.dist + 2400);
  if (playing) { G.topSpeed = Math.max(G.topSpeed, G.speed); G.speedSum += G.speed * dt; G.speedN += dt; driveEffects(dt); }
  if (playing) { G.distScore += (G.dist - prevDist); while (G.distScore >= T.score.distancePer) { G.distScore -= T.score.distancePer; G.score += 1; } }
  // jump
  if (G.air > 0) { G.air -= dt; const k = 1 - G.air / G.airTotal; G.jumpZ = Math.sin(k * Math.PI) * (G.crestAir ? 0.35 : 1); if (G.air <= 0) { const crest = G.crestAir; G.crestAir = false; if (crest) { G.jumpZ = 0; G.sq = 0.94; sfx.land(); hap(15); } else land(); } }
  // hill crests: at speed the car goes light over the top and gets a little air
  if (playing && G.air <= 0 && G.speed > T.corner.crestSpeed) { const C = G.road.crests; for (let i = Math.max(0, G.road.ci - 1); i < C.length; i++) { const cs = C[i].s; if (cs > G.dist + 50) break; if (prevDist < cs && G.dist >= cs) { G.air = G.airTotal = 0.25 + 0.25 * clamp((G.speed - 600) / 300, 0, 1); G.crestAir = true; sfx.launch(); hap([10, 20]); break; } } }
  // rumble strip on the inside of a corner: a buzz and a light judder
  { const rc0 = G.road.at(G.dist); const cn = rc0.corner; if (cn && playing && G.air <= 0) { const inside = REF + cn.dir * (rc0.width / 2 - 17); if (Math.abs(G.x - inside) < 9) { G.rumbleT -= dt; if (G.rumbleT <= 0) { G.rumbleT = T.corner.rumbleEvery; G.kick.y += 2; hap(5); sfx.tone('square', 90, 90, 0.03, 0.04); } } }
    // corner callouts for the first hairpins and hard corners, 2 s ahead, four words at most
    const ca = G.road.cornerAhead(G.dist, T.corner.warn * G.speed); if (ca && ca.hard && ca.called !== true && G.dist >= ca.warnS) { ca.called = true; event(); if (G.cornerCalls < 3) { G.cornerCalls++; say(ca.type === 'hairpin' ? 'Hairpin' : 'Hard corner', ca.type === 'hairpin' ? 'brake or drift' : 'lift or drift', 1100); } if (ca.type === 'hairpin') G.hairpins++; G.cornerLog.push({ type: ca.type, index: ca.index, vmax: Math.round(ca.vmax), entry: 0, apexSpeed: 0, drift: false, scraped: false }); }
    // the log row for the corner the car is in (the next corner is announced before this one's apex, so never "the last row")
    if (cn) { const L = cornerRow(cn); if (L) { if (cn.hard && Math.abs(G.dist - cn.apex) < 30 && !L.apexSpeed) L.apexSpeed = Math.round(G.speed); if (G.drifting) L.drift = true; if (G.scraping) L.scraped = true; if (L.enterT === undefined) { L.enterT = G.t; L.s0 = cn.s0; L.s1 = cn.s1; } if (G.braking) L.braked = true; } }
    for (let i = G.cornerLog.length - 1; i >= 0 && i >= G.cornerLog.length - 4; i--) { const L = G.cornerLog[i]; if (L.enterT !== undefined && L.exitT === undefined && G.dist > L.s1 + 500) L.exitT = G.t; } }   // the window includes 500 pt of exit, where a hit costs its time
  if (G.invuln > 0) G.invuln -= dt;
  // --- cars
  for (const c of G.cars) {
    if (!c.alive) continue; c.t += dt; if (c.hitCd > 0) c.hitCd -= dt; if (c.honk > 0) c.honk -= dt; if (c.hitFlash > 0) c.hitFlash -= dt;
    if (c.creditT > 0 && !c.wrecked) { c.creditT -= dt; if (c.creditT <= 0) { c.credit = false; c.how = null; c.shunted = false; } }   // the player's credit for a push lasts 1.5 s
    if (c.wrecked) { c.debrisT -= dt; c.y += c.speed * dt; c.x += c.vx * dt; c.vx *= Math.exp(-dt * 2.2); c.speed += (G.speed * 0.3 - c.speed) * Math.min(1, dt * 1.5); c.spin += (3 + Math.abs(c.vx) / 60) * dt; c.flip = Math.min(1, c.flip + dt * 2); if (c.y < G.dist - 500 || c.debrisT < -3) c.alive = false; continue; }
    const a = G.road.at(c.y); const hw = c.w / 2; const l = a.center - a.width / 2 + hw, r = a.center + a.width / 2 - hw;
    // traffic model: each car has a world speed
    if (c.kind === 'civ' || c.kind === 'weak' || c.kind === 'truck' || c.kind === 'armored') {
      const kc = Math.abs(G.road.at(c.y).k); const slow = 1 - T.corner.trafficSlow * clamp(kc * 250, 0, 1);   // traffic slows for corners
      c.speed += (G.cruise * c.factor * slow - c.speed) * Math.min(1, dt * 2);
      // civilians change lanes occasionally with a blinker first
      if (c.kind === 'civ' && playing) { c.laneTimer -= dt; if (c.laneTimer <= 0 && c.blink === 0) { const n = G.road.laneCount(c.y); const dir = c.lane === 0 ? 1 : c.lane === n - 1 ? -1 : (G.rng() < 0.5 ? -1 : 1); c.blink = 0.6; c.blinkDir = dir; } if (c.blink > 0) { c.blink -= dt; if (c.blink <= 0) { c.lane = clamp(c.lane + c.blinkDir, 0, G.road.laneCount(c.y) - 1); c.laneTimer = 4 + G.rng() * 4; c.blink = 0; } } }
      if (c.lane >= G.road.laneCount(c.y)) c.lane = G.road.laneCount(c.y) - 1;   // bug 9
      const tx = c.kind === 'armored' ? (G.road.laneX(c.y, c.lane) + G.road.laneX(c.y, Math.min(c.lane + 1, G.road.laneCount(c.y) - 1))) / 2 : G.road.laneX(c.y, c.lane);
      if (Math.abs(c.vx) < 60) c.x += (tx - c.x) * Math.min(1, dt * 2.5);
    } else if (c.kind === 'bruiser' || c.kind === 'gunner') {
      if (c.lane >= G.road.laneCount(c.y)) c.lane = G.road.laneCount(c.y) - 1;
      enemyAI(c, dt, playing);
    }
    if (c.wrecked || c.shunted || c.spinOut > 0) { const kk = G.road.at(c.y).k; c.vx += -Math.sign(kk) * c.speed * c.speed * Math.abs(kk) * dt; }   // no grip: the corner throws it outward
    c.x += c.vx * dt; c.vx *= Math.exp(-dt * 2.5);
    c.y += c.speed * dt;
    // rails and walls: a car moving sideways fast enough wrecks on them
    if (c.x < l || c.x > r) { if ((Math.abs(c.vx) > T.shuntThreshold || c.slammed) && c.kind !== 'civ' && c.kind !== 'truck') { wreck(c, c.slammed ? 'slam' : 'rail'); continue; } c.x = clamp(c.x, l, r); c.vx *= -0.2; }
    for (const m of G.medians) if (c.y > m.y0 - 30 && c.y < m.y1 + 30) { const mx0 = G.road.laneX(c.y, m.lane0) - 6, mx1 = G.road.laneX(c.y, m.lane0 + m.lanes - 1) + 6; if (c.x + hw > mx0 && c.x - hw < mx1) { if ((Math.abs(c.vx) > T.shuntThreshold || c.slammed) && c.kind !== 'civ' && c.kind !== 'truck') { wreck(c, 'wall'); break; } c.x = c.x < (mx0 + mx1) / 2 ? mx0 - hw : mx1 + hw; c.vx = 0; } }
    if (c.y < G.dist - 700 || c.y > G.dist + 2600) c.alive = false;
  }
  compact(G.cars, isAlive);
  // --- car-to-car collisions with mass push-out (cars never overlap)
  const live = G.cars;
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) carPair(live[i], live[j]);
  if (playing && G.air <= 0) for (const c of live) if (c.alive) contactPlayer(c);
  // barrels: cars and the player (the player gets the credit for a barrel they drive into; a civilian or enemy setting one off pays nothing)
  for (const b of G.barrels) { if (!b.alive) continue; for (const c of live) if (c.alive && !c.wrecked && Math.abs(c.x - b.x) < c.w / 2 + 8 && Math.abs(c.y - b.y) < c.l / 2 + 8 && (Math.abs(c.vx) > 80 || c.kind !== 'civ')) { explodeBarrel(b, c.credit); break; } if (b.alive && G.air <= 0 && Math.abs(G.x - b.x) < 25 && Math.abs(G.dist - b.y) < 38) explodeBarrel(b, true); }
  for (const cn of G.cones) if (cn.alive && G.air <= 0 && Math.abs(G.x - cn.x) < 22 && Math.abs(G.dist - cn.y) < 34) { cn.alive = false; cn.vx = Math.sign(G.x - cn.x || 1) * -200; spark(cn.x, cn.y, 2); sfx.ping(false); addDebris(cn.x, cn.y, (G.rng() * 2 - 1) * 200, G.speed * 0.4, 1.2, '#ff9f1c', 8, false); }
  // oil slicks: any car crossing spins out; the player's slick, so the player gets the credit
  for (const s of G.slicks) { s.t -= dt; for (const c of live) if (c.alive && !c.wrecked && c.kind !== 'truck' && Math.abs(c.x - s.x) < 30 && Math.abs(c.y - s.y) < 40 && !c.spun) { c.spun = true; c.vx = (G.rng() < 0.5 ? -1 : 1) * 300; c.shunted = true; creditCar(c, 'oil'); c.spinOut = 1.0; if (c.kind === 'civ') c.penalised = true; } }
  compact(G.slicks, s => s.t > 0);
  // bullets
  for (const b of G.bullets) { b.py = b.y; b.y += (b.vy === undefined ? T.bulletSpeed : b.vy) * dt; b.x += (b.vx || 0) * dt; b.life = (b.life || 0) + dt; }
  compact(G.bullets, b => { if (b.y > G.dist + 900 || b.y < G.dist - 400 || b.life > 0.8 || Math.abs(b.x - REF) > 700) return false; for (const c of live) { if (!c.alive || c.wrecked || c.kind === 'civ' || c.kind === 'truck') continue; if (Math.abs(b.x - c.x) < c.w / 2 && Math.abs(b.y - c.y) < c.l / 2) { gunHit(c, b); return false; } } for (const br of G.barrels) if (br.alive && Math.abs(b.x - br.x) < 12 && Math.abs(b.y - br.y) < 14) { explodeBarrel(br, true); return false; } return true; });
  // missiles: arc, smoke, splash 40 pt
  for (const m of G.missiles) { let target = null, best = 1e9; for (const c of live) { if (!c.alive || c.wrecked || c.kind === 'civ' || c.kind === 'truck' || c.y <= m.y - 20) continue; const d = Math.hypot(c.x - m.x, c.y - m.y); if (d < best) { best = d; target = c; } } m.t += dt; m.py = m.y; if (target) m.x += (target.x - m.x) * Math.min(1, dt * 5); m.y += (700 + 400 * Math.min(1, m.t * 2)) * dt; if (G.rng() < 0.7) addDebris(m.x + (G.rng() - 0.5) * 6, m.y - 10, 0, G.speed * 0.5, 0.5, 'rgba(200,200,200,0.5)', 6, true); if (target && Math.abs(m.x - target.x) < 22 && Math.abs(m.y - target.y) < target.l / 2 + 10) { m.dead = true; G.fx.push({ x: m.x, y: m.y, t: 0, life: 0.5, big: true }); for (const c of live) if (c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && Math.abs(c.x - m.x) < 40 + c.w / 2 && Math.abs(c.y - m.y) < 40 + c.l / 2) wreck(c, 'missile', true); } if (m.y > G.dist + 1200) m.dead = true; }
  compact(G.missiles, m => !m.dead);
  // chain-wreck queue on the game clock (bug 8)
  compact(G.queue, q => { q.t -= dt; if (q.t <= 0) { q.fn(); return false; } return true; });
  // ramps, trucks, crates
  for (const rp of G.ramps) { if (!rp.used && G.air <= 0 && G.dist >= rp.y - 20 && prevDist < rp.y + 20 && Math.abs(G.x - rp.x) < rp.w / 2 + 4) { rp.used = true; launch(rp); } if (rp.crate && !rp.crate.taken && G.air > 0 && Math.abs(G.dist - (rp.y + 240)) < 60 && Math.abs(G.x - rp.x) < 40) { rp.crate.taken = true; pickup('crate', rp.x, rp.y + 240); } }
  compact(G.ramps, rp => rp.y > G.dist - 500);
  for (const c of live) if (c.kind === 'truck' && c.alive && !c.loaded && G.air <= 0 && Math.abs(G.x - c.x) < c.w / 2 - 4) { const rampY = c.y - c.l / 2; if (prevDist <= rampY + 10 && G.dist >= rampY - 40) { c.loaded = true; truckLoad(c); } }
  for (const cr of G.crates) { cr.t += dt; cr.y += (cr.speed !== undefined ? cr.speed : G.speed * 0.3) * dt; if (Math.abs(cr.y - G.dist) < 250) cr.x += (G.x - cr.x) * Math.min(1, dt * 1.5); if (Math.abs(cr.x - G.x) < 26 && Math.abs(cr.y - G.dist) < 42) { cr.dead = true; pickup(cr.kind, cr.x, cr.y); } }
  compact(G.crates, cr => !cr.dead && cr.y > G.dist - 300);
  const behind = G.dist - 300;
  compact(G.barrels, b => b.y > behind); compact(G.cones, c => c.y > behind); compact(G.medians, m => m.y1 > behind); compact(G.gaps, g => g.y1 > behind); compact(G.barriers, b => b.y > behind); compact(G.signs, s => s.y > behind);
  for (const d of G.debris) { d.t -= dt; d.x += d.vx * dt; d.y += d.speed * dt; d.vx *= Math.exp(-dt * 2); } compact(G.debris, d => { if (d.t > 0) return true; pool.debris.push(d); return false; });
  for (const m of G.marks) m.t -= dt; compact(G.marks, m => { if (m.t > 0 && m.y > G.dist - 400) return true; pool.marks.push(m); return false; });
  for (const f of G.fx) f.t += dt; compact(G.fx, f => f.t < f.life);
  for (const p of G.pops) p.t += dt; compact(G.pops, p => p.t < 1.0);
  for (const s of G.sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; } compact(G.sparks, s => { if (s.t < 0.4) return true; pool.sparks.push(s); return false; });
  if (G.smoke > 0) G.smoke -= dt; if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  if (G.ghostThumb > 0) G.ghostThumb -= dt;
  if (playing && G.special && G.special.ammo > 0 && !G.pulsed && G.special.kind === 'missiles' && G.cars.some(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && c.y > G.dist && c.y < G.dist + 600)) { G.pulsed = true; emit({ k: 'pulse' }); }
  // districts
  if (G.dist > G.nextDistrictY - G.speed * 3 && G.signShown !== G.district + 1) { G.signShown = G.district + 1; G.signs.push({ y: G.nextDistrictY - 100, text: DISTRICTS[(G.district + 1) % 4].sign, big: true }); }
  if (G.dist > G.nextDistrictY) { G.district = (G.district + 1) % 4; G.districtsPassed++; G.nextDistrictY += T.drive.cruise * T.districtEvery; }
  if (playing) recordReplay(dt);   // last 1.5 s at 30 Hz into the pre-allocated ring, shown on the death card
}
export const isAlive = c => c.alive;
function cornerRow(cn) { for (let i = G.cornerLog.length - 1; i >= 0; i--) if (G.cornerLog[i].index === cn.index) return G.cornerLog[i]; return null; }
export function creditCar(c, how) { c.credit = true; c.how = how; c.creditT = 1.5; }
// pools for the short-lived particles so a busy second does not allocate thousands of throwaway objects
export const pool = { sparks: [], debris: [], marks: [], puffs: [], ribbons: [] };
export function addDebris(x, y, vx, speed, t, col, s, smoke) { const d = pool.debris.pop() || {}; d.x = x; d.y = y; d.vx = vx; d.speed = speed; d.t = t; d.col = col; d.s = s; d.smoke = smoke; G.debris.push(d); }
export function addMark(x, y, t, skid) { const m = pool.marks.pop() || {}; m.x = x; m.y = y; m.t = t; m.skid = skid; m.scorch = !skid; G.marks.push(m); }
// ---------------- driving model (audit, Sprint B) ----------------
// Speed: auto throttle to the district's cruise speed; the pedal pad brakes at 900 pt/s² down to 260; a drift costs 5% a second;
// mini-turbo, slipstream, nitro and the transient `boost` (clean landings, scrapes, hits) sit on top; 900 pt/s is the flat-out cap.
export function driveSpeed(dt, playing) {
  const D = T.drive;
  G.cruise = Math.min(D.top, D.cruise * Math.pow(D.districtGain, G.districtsPassed));
  if (!playing) { G.speed += (G.cruise * 0.5 - G.speed) * Math.min(1, dt * 2); G.braking = false; return; }
  if (G.burnout > 0) { G.burnout -= dt; G.speed = 0; G.braking = false; if (G.burnout <= 0) { G.speed = 320; say('Go', '', 600, true); sfx.launch(); hap([10, 30]); } return; }
  let target = G.cruise; const gas = G.in.gas && G.wallT <= 0;
  if (gas) target = D.top;
  if (G.turboT > 0) { G.turboT -= dt; target += G.turbo; if (G.turboT <= 0) G.popT = 0.35; }
  if (G.slipBoostT > 0) { G.slipBoostT -= dt; target += D.slipBoost; }
  if (G.nitro > 0) { G.nitro -= dt; target = D.nitro; if (G.nitro <= 0) G.popT = 0.5; }
  if (G.detour > 0) { G.detour -= dt; target *= 0.8; }
  target = Math.min(target, G.nitro > 0 ? D.nitro : D.top);
  if (G.wallT > 0) { G.wallT -= dt; target = D.minSpeed; G.turboT = 0; G.slipBoostT = 0; }   // grinding the rail after a barrier hit: no throttle until the stun ends
  const braking = G.in.brake && !G.drifting && G.air <= 0;
  // brake: down to minSpeed at the brake rate; keep holding and the car stops and backs up (reverse), as long as the pad is held
  if (braking) { if (!G.braking) sfx.brake(); G.braking = true; if (G.speed > D.minSpeed) G.speed = Math.max(D.minSpeed, G.speed - D.brake * dt); else G.speed = Math.max(-D.reverse, G.speed - D.reverseAccel * dt); }
  else { G.braking = false; const accel = gas ? D.accel : D.accel * 0.6;
    if (G.speed < target) G.speed = Math.min(target, G.speed + accel * dt);   // throttle: pulling toward cruise by itself, toward top on the gas
    else G.speed += (target - G.speed) * Math.min(1, dt * (gas ? 1.5 : D.coast)); }   // off the gas the car coasts back to cruise gently
  G.reversing = G.speed < 0; if (G.reversing && G.drifting) endDrift(false);
  if (G.drifting) G.speed -= G.speed * T.drift.loss * dt;
  if (G.spinning) G.speed -= G.speed * T.spin.loss * dt;
  // transient boost (set by landings, scrapes and hits) applied over about a third of a second
  if (G.boost !== 0) { const k = Math.min(1, dt * 3); G.speed += G.boost * k; G.boost -= G.boost * k; if (Math.abs(G.boost) < 2) G.boost = 0; }
  G.speed = clamp(G.speed, G.air > 0 ? G.speed : -D.reverse, D.nitro);
  if (G.popT > 0) G.popT -= dt;
}
// Steering: the thumb sets a target lateral position; the car reaches it by yawing (30° in grip, 240°/s), and sideways speed is
// speed × sin(heading), so faster means more agile. The velocity direction follows the body through the tyres; asking for more
// than 1,500 pt/s² of sideways acceleration makes the rear let go. Drift: pad held while steering (or auto-drift on a hard turn):
// rear grip drops to 35%, the tail swings out to 35–55° and the thumb holds the angle with small counter-steer.
export function driveSteer(dt, playing) {
  const D = T.drive, dr = T.drift; const authority = G.air > 0 ? T.ramp.steerAir : 1;
  if (G.burnout > 0) { G.heading = G.phi = 0; G.vx = 0; return; }
  const u = clamp((G.targetX - G.x) / (T.laneW * 1.1), -1, 1);   // steering demand from the thumb
  const padHeld = playing && G.in.brake;
  if (!G.drifting && G.driftExitT <= 0 && G.air <= 0 && G.speed > 350) {
    if ((padHeld && Math.abs(u) > 0.3) || (G.cfg.autoDrift && G.slipping && Math.abs(u) > 0.85 && G.speed > 560)) startDrift(Math.sign(u));
  }
  if (G.drifting) {
    G.driftT += dt; const counter = u * G.driftDir < -0.5;   // thumb swung hard the other way: the player is straightening up
    const hold = padHeld || (G.cfg.autoDrift && Math.abs(u) > 0.12 && !counter);
    // the 360: thumb held hard out in the drift direction, at speed, for `arm` seconds: the drift becomes a spin
    // "turned too much": the thumb dragged past where the road lets the car go (the raw target beyond the clamped one by a lane)
    if (G.air > 0 && !G.crestAir) endDrift(false); else if (!G.spinning && (!hold || counter)) endDrift(true);   // a hill crest no longer drops the drift (Sprint 4: crests come fast at 1,300 pt/s)
  }
  // "turned too much": pad held and the thumb dragged a lane past where the road lets the car go, at speed, for `arm` seconds:
  // the car spins (from a drift, or straight from grip against the rail: the drift starts on the spot)
  { const overX = G.rawTargetX - G.targetX; const dir = Math.sign(overX); const over = Math.abs(overX) > T.laneW * T.spin.over && (!G.drifting || dir === G.driftDir);
    if (padHeld && over && !G.spinning && G.speed > T.spin.speed && G.air <= 0 && G.burnout <= 0) { G.spinArm += dt; if (G.spinArm >= T.spin.arm) { if (!G.drifting) startDrift(dir); startSpin(dir); } } else G.spinArm = 0; }
  if (G.spinning) { spinStep(dt); return; }
  if (G.driftExitT > 0) G.driftExitT -= dt;
  if (G.drifting) {
    // in a drift the thumb steers the path with 70% authority while the body sits at the slip angle beyond it: 35° with the
    // thumb centred, up to 55° with it held out; the player holds the angle with small counter-steering movements
    const phiTarget = u * D.maxHeading * 0.7 * Math.PI / 180; const rate = D.turnRate * 0.7 * Math.PI / 180 * dt;
    G.phi += clamp(phiTarget - G.phi, -rate, rate);
    const slipTarget = G.driftDir * (35 + 20 * clamp(u * G.driftDir, 0, 1)) * Math.PI / 180; const srate = dr.turnRate * Math.PI / 180 * dt;
    G.slip += clamp(slipTarget - G.slip, -srate, srate); G.heading = G.phi + G.slip; G.slipping = true;
  } else {
    let headingTarget = u * D.maxHeading * Math.PI / 180; const tau = G.driftExitT > 0 ? dr.exitTau : D.tau;
    if (G.driftExitT > 0) headingTarget += G.wobble * Math.sin(G.driftExitT / dr.exit * Math.PI) * 5 * Math.PI / 180;   // one light wobble on exit
    const rate = D.turnRate * Math.PI / 180 * authority * dt; G.heading += clamp(headingTarget - G.heading, -rate, rate);
    // the velocity direction follows the body through the tyres; asking for more than 1,500 pt/s² sideways makes the rear let go
    let dphi = (G.heading - G.phi) * (1 - Math.exp(-dt / tau)); const maxD = D.grip * dt / Math.max(60, G.speed);
    G.slipping = false; if (Math.abs(dphi) > maxD) { dphi = Math.sign(dphi) * maxD; G.slipping = true; }
    G.phi += dphi; G.slip = G.heading - G.phi;
  }
  // corners: the road pushes the car outward at speed² × curvature; the tyres hold 1,500 pt/s² (30% more while drifting, the rear
  // sliding but the fronts biting); anything beyond that slides the car toward the outside wall
  const k = G.road.at(G.dist).k; const demand = G.speed * G.speed * Math.abs(k); const budget = G.air > 0 ? 0 : D.grip * (G.drifting ? T.corner.driftGrip : 1);
  const excess = Math.max(0, demand - budget); if (excess > 0) { G.slideVx += -Math.sign(k) * excess * dt; G.slipping = true; } else G.slideVx *= Math.exp(-dt / 0.25);
  if (Math.abs(G.slideVx) < 1) G.slideVx = 0;
  G.vx = G.speed * Math.sin(G.phi) + G.slideVx; G.x += G.vx * dt;
  if (G.drifting) driftStep(dt);
}
export function startDrift(dir) { G.drifting = true; G.driftDir = dir; G.driftT = 0; G.driftCharge = 0; G.driftTier = 0; G.driftBank = 0; G.driftBankSlip = 0; G.driftDirty = false; G.drifts++; }
export function driftStep(dt) {
  const dr = T.drift; const slipDeg = Math.abs(G.slip) * 180 / Math.PI;
  const kk = Math.abs(G.road.at(G.dist).k); const cornerMul = 1 + T.corner.driftBonus * clamp(kk * 300, 0, 1);   // drifting a hairpin pays double
  if (slipDeg > dr.minSlip) { G.driftCharge += dt; G.driftBank += slipDeg * (G.speed / 100) * dt * dr.bankRate * cornerMul; }
  const tier = G.driftCharge >= dr.tiers[2] ? 3 : G.driftCharge >= dr.tiers[1] ? 2 : G.driftCharge >= dr.tiers[0] ? 1 : 0;
  if (tier > G.driftTier) { G.driftTier = tier; G.driftTierMax = Math.max(G.driftTierMax, tier); sfx.chirp(); hap(8); }
  // drift slam: an enemy beside the car on the tail side takes a tail hit at Slam power
  if (slipDeg > dr.slamSlip) { const s = -G.driftDir; const hw = (T.sizes.player[0] + 40) / 2 + 12;
    for (const c of G.cars) { if (!c.alive || c.wrecked || c.kind === 'civ' || c.kind === 'truck' || c.kind === 'armored' || c.hitCd > 0) continue; const dx = (c.x - G.x) * s, dy = c.y - G.dist; if (dx > 0 && dx < hw + c.w / 2 && Math.abs(dy) < (c.l + 60) / 2 + 6) {
      c.hitCd = 0.6; const power = Math.max(T.shuntMin, Math.abs(G.relVx) * T.shuntMul) * T.slam.power; c.vx = s * power; c.shunted = true; c.slammed = true; c.spin = 0.4 * s; creditCar(c, 'slam'); G.slams++; G.driftSlams++;
      spark(G.x + s * 17, G.dist - 20, 14); sfx.crunch(true); hap(60); kickShake(-s * 8, 0, 0.5); G.hitStop = Math.max(G.hitStop, 0.06); say('Drift Slam', '', 500); event(); } } }
}
export function endDrift(clean) {
  const dr = T.drift; const tier = G.driftTier; G.drifting = false; G.driftExitT = dr.exit; G.wobble = -G.driftDir;
  if (tier > 0) { G.turbo = dr.turbo[tier - 1]; G.turboT = dr.turboFor[tier - 1]; G.turbos++; sfx.turbo(tier); G.punch = 0.1; G.speedLines = G.turboT; hap([10, 20, 40]); for (let i = 0; i < 10 + tier * 6; i++) driftSpark(tier, (G.rng() * 2 - 1) * 400); }
  if (clean && !G.driftDirty && G.driftBank >= 10) { const pts = Math.round(G.driftBank); G.driftPoints += pts; addScore(pts, G.x, G.dist + 20, false, tier ? 'DRIFT T' + tier : 'DRIFT'); }
  else if (G.driftDirty && G.driftBank >= 10) G.pops.push({ x: G.x, y: G.dist + 20, text: 'DRIFT LOST', t: 0, bad: true });
}
// Tyre smoke, skid ribbons, drift sparks, burnout and the rail screech (audit, "Tire smoke, skid marks and every driving effect")
export const PUFF_LIFE = 1.4;
export function addPuff(x, y, vx, fwd) { const p = pool.puffs.pop() || {}; p.x = x; p.y = y; p.vx = vx; p.speed = fwd; p.t = 0; p.seed = G.rng() * 6.28; G.puffs.push(p); }
export function driftSpark(tier, vxExtra) { const s = pool.sparks.pop() || {}; const side = G.rng() < 0.5 ? -1 : 1; s.x = G.x + side * 12; s.y = G.dist - 22; s.vx = (G.rng() * 2 - 1) * 200 + (vxExtra || 0) - G.driftDir * 120; s.vy = -G.speed * 0.6 + (G.rng() * 2 - 1) * 150; s.t = 0; s.col = tier >= 3 ? '#ff7a2a' : tier === 2 ? '#ffd23f' : '#ffffff'; G.sparks.push(s); }
export function driveEffects(dt) {
  const slipDeg = Math.abs(G.slip) * 180 / Math.PI; const onGround = G.air <= 0;
  // tyre smoke per rear wheel: 0 puffs/s in grip, 40/s at 20° of slip, 90/s at 45°; burnouts and hard braking smoke too
  let rate = slipDeg < 8 ? 0 : slipDeg < 20 ? lerp(10, 40, (slipDeg - 8) / 12) : lerp(40, 90, clamp((slipDeg - 20) / 25, 0, 1));
  if (G.burnout > 0) rate = 90; if (G.braking && G.speed > 420) rate = Math.max(rate, 30);
  if (onGround && rate > 0) { G.puffAcc += rate * 2 * dt; const ca = Math.cos(G.heading), sa = Math.sin(G.heading); while (G.puffAcc >= 1) { G.puffAcc -= 1; const side = G.rng() < 0.5 ? -1 : 1; addPuff(G.x + side * 12 * ca - (-24) * sa, G.dist - 24 * ca + side * 12 * sa, (G.rng() * 2 - 1) * 40 + G.vx * 0.2, G.fwd * 0.3 + (G.rng() - 0.5) * 40); } }
  else if (rate === 0) G.puffAcc = 0;
  // skid ribbons: a continuous line under each rear wheel while slipping, drifting or braking hard; darker with more slip
  const skidding = onGround && (slipDeg > 8 || (G.braking && G.speed > 420) || G.burnout > 0);
  if (skidding) { const dark = G.braking && slipDeg <= 8 ? 0.55 : clamp(0.35 + slipDeg / 60, 0.35, 0.9); const ca = Math.cos(G.heading), sa = Math.sin(G.heading);
    for (const side of [-1, 1]) { const key = side < 0 ? 'ribL' : 'ribR'; let r = G[key]; if (!r) { r = pool.ribbons.pop() || { pts: [] }; r.pts.length = 0; r.t = 0; r.done = false; r.brake = G.braking && slipDeg <= 8; G[key] = r; G.ribbons.push(r); }
      const wx = G.x + side * 12 * ca + 24 * sa, wy = G.dist - 24 * ca + side * 12 * sa; const n = r.pts.length; if (n < 3 || Math.hypot(wx - r.pts[n - 3], wy - r.pts[n - 2]) >= 6) { r.pts.push(wx, wy, dark); if (r.pts.length > 360) { r.pts.splice(0, 3); } } } }
  else { if (G.ribL) { G.ribL.done = true; G.ribL = null; } if (G.ribR) { G.ribR.done = true; G.ribR = null; } }
  // drift sparks stream from the rear wheels, colour by tier; a few on every drift
  if (G.drifting && onGround) { G.sparkAcc += (G.driftTier === 0 ? 14 : 30 + G.driftTier * 14) * dt; while (G.sparkAcc >= 1) { G.sparkAcc -= 1; driftSpark(G.driftTier, 0); } }
  // slipstream: 0.8 s directly behind any car gives +120 pt/s for 1 s
  let drafting = false; for (const c of G.cars) { if (!c.alive || c.wrecked) continue; const dy = c.y - G.dist; if (Math.abs(c.x - G.x) < 22 && dy > (c.l + 60) / 2 && dy < 200) { drafting = true; break; } }
  if (drafting && G.slipT >= 0) { G.slipT += dt; if (G.slipT >= T.drive.slipFor) { G.slipT = -1; G.slipBoostT = T.drive.slipBoostFor; sfx.draft(); hap(10); G.pops.push({ x: G.x, y: G.dist + 40, text: 'DRAFT', t: 0 }); G.speedLines = Math.max(G.speedLines, 0.6); } }
  else if (!drafting) G.slipT = 0;
  // exhaust pops when lifting off a boost
  if (G.popT > 0 && G.rng() < dt * 12) { sfx.pop(); G.fx.push({ x: G.x - 8 + G.rng() * 16, y: G.dist - 34, t: 0, life: 0.12, flame: true }); }
  for (const p of G.puffs) { p.t += dt; p.x += p.vx * dt + Math.sin(p.seed + p.t * 3) * 8 * dt; p.y += p.speed * dt; p.vx *= Math.exp(-dt * 1.5); }
  compact(G.puffs, p => { if (p.t < PUFF_LIFE && p.y > G.dist - 500) return true; pool.puffs.push(p); return false; });
  for (const r of G.ribbons) if (r.done) r.t += dt;
  compact(G.ribbons, r => { if (!(r.done && r.t > 6) && !(r.pts.length && r.pts[r.pts.length - 2] < G.dist - 500)) return true; pool.ribbons.push(r); return false; });
}
export function enemyAI(c, dt, playing) {
  const py = G.dist, px = G.x; const closeCap = T.bruiser.closeCap, dropCap = T.bruiser.dropCap;
  const slotY = () => c.kind === 'gunner' ? py - 230 : py + 6;
  const slotLane = () => { const pl = playerLane(); const n = G.road.laneCount(c.y); let l = pl + c.side; if (l < 0 || l >= n) { c.side = -c.side; l = pl + c.side; } return clamp(l, 0, n - 1); };
  // chase speed: player speed plus a closing term toward the slot, capped
  const target = slotY(); const closing = clamp((target - c.y) * 1.6, -dropCap, closeCap);
  const kc = Math.abs(G.road.at(c.y).k); const gripMax = kc > 1e-5 ? Math.sqrt(T.drive.grip * 1.1 / kc) : 1e9;   // chasers stay in grip through corners
  const wanted = Math.min(gripMax, Math.max(G.speed + closing, G.cruise * 0.5)); c.speed += (wanted - c.speed) * Math.min(1, dt * 3);
  if (c.spinOut > 0) { c.spinOut -= dt; c.spin += 8 * dt; return; } else c.spin *= Math.exp(-dt * 6);
  if (!playing) return;
  if (c.kind === 'bruiser') {
    if (c.state === 'approach') { c.lane = slotLane(); const tx = G.road.laneX(c.y, c.lane); c.x += (tx - c.x) * Math.min(1, dt * 4); if (Math.abs(c.y - target) < 40 && Math.abs(c.x - tx) < 8) { c.state = 'hold'; c.t = 0; c.holdFor = c.slowDuel ? 2.2 : T.bruiser.hold[0] + G.rng() * (T.bruiser.hold[1] - T.bruiser.hold[0]); if (c.teach && G.teach === null && G.script === 3) G.teach = 'slam'; } }
    else if (c.state === 'hold') { const tx = G.road.laneX(c.y, c.lane) + G.vx * 0.05; c.x += (tx - c.x) * Math.min(1, dt * 4); if (c.t >= c.holdFor) { c.state = 'tell'; c.t = 0; c.lean = 0; sfx.sight(); } }
    else if (c.state === 'tell') { c.lean = (c.t / T.bruiser.tell) * (px < c.x ? -1 : 1) * 8; if (c.t >= T.bruiser.tell) { c.state = 'swerve'; c.t = 0; c.dir = px < c.x ? -1 : 1; c.swerveLeft = T.bruiser.lunge; event(); } }
    else if (c.state === 'swerve') { const stepX = Math.min(c.swerveLeft, T.bruiser.lungeSpeed * dt); c.x += c.dir * stepX; c.swerveLeft -= stepX; if (c.swerveLeft <= 0 || c.t > 0.5) { c.state = 'recover'; c.t = 0; c.lean = 0; } }
    else if (c.state === 'recover') { const tx = G.road.laneX(c.y, c.lane); c.x += (tx - c.x) * Math.min(1, dt * 3); if (c.t >= T.bruiser.recover) { c.state = 'approach'; c.t = 0; c.side = G.rng() < 0.3 ? -c.side : c.side; } }
  } else if (c.kind === 'gunner') {
    // sits behind, red sight line for 0.8 s, fires along it, then repositions
    c.lane = c.lane === undefined ? playerLane() : c.lane; const tx = G.road.laneX(c.y, c.lane); c.x += (tx - c.x) * Math.min(1, dt * 3);
    if (c.cd > 0) c.cd -= dt;
    if (c.state !== 'sight' && c.cd <= 0 && Math.abs(c.y - target) < 120 && c.y < py) { c.state = 'sight'; c.sight = 0; c.sightX = c.x; sfx.sight(); event(); }
    if (c.state === 'sight') { c.sight += dt; if (c.sight >= T.gunner.sight) { c.state = 'approach'; c.cd = T.gunner.cooldown; c.lane = playerLane(); G.fx.push({ x: c.sightX, y: c.y + 300, t: 0, life: 0.25, line: true, x0: c.sightX, y0: c.y }); sfx.cannon(); if (G.air <= 0 && Math.abs(G.x - c.sightX) < 22 && G.dist > c.y) damage(1, c, 'Shot by a Gunner van'); } }
  }
}
export function carPair(a, b) {
  if (!a.alive || !b.alive) return;
  const dx = b.x - a.x, dy = b.y - a.y; const hw = (a.w + b.w) / 2, hl = (a.l + b.l) / 2;
  if (Math.abs(dx) >= hw || Math.abs(dy) >= hl) return;
  const px = hw - Math.abs(dx), py = hl - Math.abs(dy);
  const ma = a.wrecked ? a.mass * 0.5 : a.mass, mb = b.wrecked ? b.mass * 0.5 : b.mass; const sa = mb / (ma + mb), sb = ma / (ma + mb);
  if (px < py) { const s = Math.sign(dx || 1); a.x -= s * px * sa; b.x += s * px * sb;
    const rel = a.vx - b.vx; if (Math.abs(rel) > T.shuntThreshold || a.slammed || b.slammed || a.wrecked || b.wrecked) { const mover = Math.abs(a.vx) > Math.abs(b.vx) ? a : b, other = mover === a ? b : a; other.vx += mover.vx * mover.mass / other.mass * 0.8; mover.vx *= 0.3; resolveShunt(mover, other); } else { const t = a.vx; a.vx = b.vx * 0.5; b.vx = t * 0.5; }
  } else { const s = Math.sign(dy || 1); a.y -= s * py * sa; b.y += s * py * sb; const ahead = s > 0 ? b : a, behind = s > 0 ? a : b; if (behind.speed > ahead.speed) { const v = behind.speed; behind.speed = ahead.speed; ahead.speed = v * 0.5 + ahead.speed * 0.5; } if ((behind.wrecked || behind.slammed) && !ahead.wrecked && ahead.kind !== 'civ' && ahead.kind !== 'truck') wreck(ahead, 'chain', behind.credit); }
}
export function resolveShunt(mover, other) {
  // a shunted or wrecked enemy hitting things: civ → mover wrecks, civ bumps (no penalty); enemy → both wreck (chain); truck → mover wrecks.
  // Credit follows the push: a car the player shunted carries the player's credit into everything it hits; enemy-on-enemy accidents pay nothing.
  const moverEnemy = mover.kind !== 'civ' && mover.kind !== 'truck'; const credit = mover.credit;
  if (mover.wrecked) { if (!other.wrecked && other.kind !== 'civ' && other.kind !== 'truck' && other.kind !== 'armored') wreck(other, 'chain', credit); if (other.kind === 'civ') { other.honk = 0.5; other.penalised = true; } return; }
  if (!(mover.shunted || mover.slammed || moverEnemy)) return;
  if (other.kind === 'civ') { other.honk = 0.5; other.penalised = true; if (moverEnemy && (mover.shunted || mover.slammed)) wreck(mover, mover.slammed ? 'slam' : 'shunt'); }
  else if (other.kind === 'truck' || other.kind === 'armored') { if (moverEnemy && (mover.shunted || mover.slammed)) wreck(mover, 'wall'); }
  else if (moverEnemy && (mover.shunted || mover.slammed)) { if (credit) addScore(T.score.shuntEnemy, other.x, other.y, false, 'INTO ENEMY'); wreck(mover, mover.slammed ? 'slam' : 'shunt'); G.queue.push({ t: 0.1, fn: () => { if (other.alive && !other.wrecked) wreck(other, 'chain', credit); } }); }
}
export function contactPlayer(c) {
  // Close Call: passing a civilian within 12 pt at speed, without touching it
  if (c.kind === 'civ' && !c.wrecked && !c.closeCalled && !c.penalised && G.speed > 380) { const gapX = Math.abs(c.x - G.x) - (c.w + 34) / 2; if (gapX >= 0 && gapX <= 12 && Math.abs(c.y - G.dist) < (c.l + 60) / 2) { c.closeCalled = true; addScore(T.score.closeCall, c.x, c.y, false, 'CLOSE CALL'); G.comboT = Math.min(T.combo.window, G.comboT + 0.5); sfx.ping(false); event(); } }
  if (c.wrecked) { const dx = c.x - G.x, dy = c.y - G.dist; if (Math.abs(dx) < (c.w + 34) / 2 && Math.abs(dy) < (c.l + 60) / 2) { c.vx += Math.sign(dx || 1) * 200; G.vx -= Math.sign(dx || 1) * 60; spark(G.x, G.dist, 2); } return; }
  const dx = c.x - G.x, dy = c.y - G.dist; const hw = (c.w + 34) / 2, hl = (c.l + 60) / 2;
  if (Math.abs(dx) >= hw || Math.abs(dy) >= hl) return;
  const side = (hw - Math.abs(dx)) < (hl - Math.abs(dy));
  const s = Math.sign(dx || 1);
  if (c.kind === 'truck') { if (!side && dy > 0) { G.x -= s * 2; G.speed *= 0.98; G.boost = -40; } else { c.x += s * (hw - Math.abs(dx)); G.x -= s * 2; } return; }
  if (c.kind === 'civ') { if (side) { c.vx = s * 180; c.honk = 0.6; G.x -= s * (hw - Math.abs(dx)); G.vx = -s * 100; } else { c.y += (hl - Math.abs(dy)); c.honk = 0.6; G.boost = -60; } if (!c.penalised) { c.penalised = true; G.civHits++; G.driftDirty = true; addScore(T.score.civilian, c.x, c.y, true, 'CIVILIAN'); G.combo = 0; G.comboT = 0; sfx.horn(); hap([15, 40, 15]); } return; }
  if (c.kind === 'armored') { if (!side && dy > 0) { if (c.hitCd <= 0) { c.hitCd = T.rearCd; damage(1, c, 'Rammed the armored truck'); G.boost = -150; G.x -= s * 4; } } else { G.x -= s * (hw - Math.abs(dx)); G.vx = -s * 150; if (G.slamT > 0) { G.slamT = 0; damage(0, null); spark(G.x, G.dist, 6); sfx.crunch(true); } } return; }
  if (side) {
    const slamming = G.slamT > 0;
    const attacking = c.state === 'swerve' && !slamming;                         // a Bruiser landing its lunge
    const intent = slamming || (G.relVx * s > T.shuntIntent && G.steerVx * s > 0);   // the player is actually steering into the car, not being slid by the road
    if (attacking) {
      // the Bruiser's hit lands: the player takes the damage and the push; the Bruiser is not flung, so an idle driver cannot farm lunges
      damage(1, c, 'Rammed by a Bruiser'); G.x -= s * T.bruiser.push; G.vx = -s * 120; c.vx = s * 90; c.state = 'recover'; c.t = 0;
      spark(G.x + s * 17, G.dist, 8); sfx.crunch(false); hap(30); kickShake(-s * 6, 0, 0.3); G.sq = 0.9; G.hitStop = Math.max(G.hitStop, 0.02); event(); return;
    }
    if (!intent) { c.x += s * (hw - Math.abs(dx)) * 0.5; G.x -= s * (hw - Math.abs(dx)) * 0.5; c.vx = s * 60; G.vx = -s * 40; if (c.hitCd <= 0) { c.hitCd = T.rearCd; spark(G.x + s * 17, G.dist, 2); sfx.ping(false); } return; }   // a brush, nothing more
    const power = Math.max(T.shuntMin, Math.abs(G.relVx) * T.shuntMul) * (slamming ? T.slam.power : 1);
    c.vx = s * power; c.x += s * (hw - Math.abs(dx)) * 0.5; c.shunted = true; creditCar(c, slamming ? 'slam' : 'shunt'); if (slamming) { c.slammed = true; c.spin = 0.4 * s; }
    G.x -= s * (hw - Math.abs(dx)) * 0.5; G.vx = slamming ? G.vx * 0.2 : -G.vx * 0.3;
    spark(G.x + s * 17, G.dist, slamming ? 14 : 8); sfx.crunch(slamming); hap(slamming ? 60 : 30); kickShake(-s * (slamming ? 10 : 5), 0, slamming ? 0.5 : 0.3); G.sq = 0.9; G.hitStop = Math.max(G.hitStop, slamming ? 0.07 : 0.02);
    if (slamming) { G.slamT = 0; emit({ k: 'rebase', d: G.x - G.slamX0 }); G.targetX = G.x; G.slams++; say('Slam', '', 400); }   // no "+0" pop: the wreck pays, by cause
    event();
  } else if (dy > 0) {
    // rear-ending at speed: no armor loss, 10% speed loss for 0.5 s, damages the car ahead (per-car cooldown)
    if (c.hitCd <= 0) { c.hitCd = T.rearCd; c.y += (hl - Math.abs(dy)) + 10; c.speed = Math.max(c.speed, G.speed * 1.05); c.hp -= c.kind === 'weak' ? 1 : 1.5; creditCar(c, 'ram'); G.boost = -Math.min(60, G.speed * 0.1); spark(G.x, G.dist + 30, 6); sfx.crunch(false); hap(25); kickShake(0, 6, 0.25); G.sq = 0.92; event(); if (c.hp <= 0) wreck(c, 'ram', true); }
    else { c.y += (hl - Math.abs(dy)); }
  } else { c.y -= (hl - Math.abs(dy)); if (c.hitCd <= 0) { c.hitCd = T.rearCd; G.boost = 60; } }
}
// Contextual Slam (audit): fires only with an enemy within 1.4 lanes on that side and 60 pt ahead or behind. Otherwise the flick
// was just a fast lane change and the relative drag already delivers it. flickMisses counts the flicks that found no target.
export function slamTarget(dir) {
  const reach = T.slam.reachLanes * T.laneW;
  for (const c of G.cars) { if (!c.alive || c.wrecked || c.kind === 'civ' || c.kind === 'truck') continue; const dx = (c.x - G.x) * dir; if (dx > 0 && dx <= reach + c.w / 2 && Math.abs(c.y - G.dist) <= T.slam.reachY + c.l / 2) return c; }
  return null;
}
export function trySlam(dir) {
  if (!G || !G.playing || G.slamCd > 0 || G.slamT > 0) return false;
  const target = slamTarget(dir); if (!target) { G.flickMisses++; return false; }
  // the burst covers about one lane (0.11 s at 600 pt/s); a target sitting a little further out gets a slightly longer burst so the Slam connects
  const need = Math.abs(target.x - G.x) - (target.w + T.sizes.player[0]) / 2 + 8;
  G.slamT = clamp(need / T.slam.speed, T.slam.burst, T.slam.burst * 1.5); G.slamDir = dir; G.slamX0 = G.x; G.slamCd = T.slam.cooldown; sfx.slam(); hap(12); G.sq = 1.08; return true;
}
export function damage(amount, by, cause) {
  if (amount <= 0) return; if (G.invuln > 0 || G.nitro > 0) return;
  if (G.t < T.graceSeconds) amount *= 0.5;   // 30 s of half damage, then the road is dangerous
  G.driftDirty = true;
  G.damageAcc += amount; if (G.damageAcc < 1) { G.vignette = 0.5; sfx.crunch(false); return; }
  G.damageAcc -= 1; G.armor--; G.armorLost++; G.invuln = T.invuln; G.flashT = T.invuln; G.vignette = 1; G.smoke = 2.5; kickShake(0, 0, 0.9); G.hitStop = Math.max(G.hitStop, 0.04); sfx.damage(); hap([60, 30, 60]);
  G.cause = cause || (by ? 'Hit by a car' : 'Crashed'); say(G.armor > 0 ? 'Armor ' + G.armor : 'Wrecked', '', 700);
}
// The rotary guns (Sprint 4): FIRE held spins the barrels up, then rounds leave along the car's heading at the rotary rate with a
// little aim help toward the nearest enemy in range. Heat climbs per round; an overheated gun rests. Spread and cannon upgrades
// fire the same way with their own patterns. Bullets fly in their own direction (vx, vy), so a spin sprays the whole street.
export function gun(dt) {
  const R = T.rotary; const want = G.in.fire && G.air <= 0 && G.hot <= 0 && G.burnout <= 0;
  if (G.hot > 0) { G.hot -= dt; if (G.hot <= 0) { G.heat = 0; say('Guns cool', '', 500); } }
  G.gunSpin = clamp(G.gunSpin + (want ? dt / R.spinUp : -dt / (R.spinUp * 2)), 0, 1);
  G.heat = Math.max(0, G.heat - R.cool * dt);
  G.gunCd -= dt; if (!want || G.gunSpin < 0.6 || G.gunCd > 0) return;
  // direction: the body heading, bent toward the nearest live enemy within range and the assist cone
  let ang = G.heading; let best = null, bestD = 1e9;
  for (const c of G.cars) { if (!c.alive || c.wrecked || c.kind === 'civ' || c.kind === 'truck') continue; const dx = c.x - G.x, dy = c.y - G.dist; const d = Math.hypot(dx, dy); if (d > T.gunRange || d < 20) continue; const a = Math.atan2(dx, dy); let da = a - G.heading; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (Math.abs(da) < R.assist * Math.PI / 180 && d < bestD) { bestD = d; best = da; } }
  if (best !== null) ang += best;
  G.shots++; const side = G.shots % 2 ? -1 : 1; const ca = Math.cos(ang), sa = Math.sin(ang);
  const shoot = (off, dmg, knock, spreadDeg) => { const a2 = ang + (spreadDeg || 0) * Math.PI / 180; const vx = T.bulletSpeed * Math.sin(a2) + G.vx * 0.2, vy = T.bulletSpeed * Math.cos(a2) + Math.max(0, G.fwd) * 0.2; G.bullets.push({ x: G.x + ca * off + sa * 24, y: G.dist - sa * off + ca * 24, vx, vy, dmg, knock, life: 0 }); };
  const jitter = (G.rng() * 2 - 1) * R.spread;
  if (G.gun === 'spread') { G.gunCd = 1 / 6; for (const d of [-14, 0, 14]) shoot(side * 9, 1, false, d + jitter); G.heat += R.heatPer * 1.5; sfx.shot(); }
  else if (G.gun === 'cannon') { G.gunCd = 1 / 3; shoot(0, 2.5, true, jitter * 0.4); G.heat += R.heatPer * 3; sfx.cannon(); kickShake(0, 3); }
  else { G.gunCd = 1 / R.rate; shoot(side * 9, 1, false, jitter); G.heat += R.heatPer; sfx.shot(); }
  G.flashT2 = 0.05; G.kick.y += 0.4;
  if (G.heat >= 1) { G.hot = R.rest; G.gunSpin = 0; say('Overheated', 'let the guns cool', 800); sfx.ping(false); hap([20, 20, 20]); }
}
// The 360: the body turns a full circle at the spin rate while the velocity keeps the drift path; a finished circle pays
// score and a tier-3 turbo, and the body snaps back behind the velocity with the drift exit wobble.
export function startSpin(dir) { G.spinning = true; G.spinA = 0; G.spinDir = dir; G.spinArm = 0; G.driftDirty = true; sfx.slam(); hap([15, 20, 30]); say('Spin', '', 400); }
export function spinStep(dt) {
  const rate = T.spin.rate * Math.PI / 180 * dt; G.spinA += rate; G.heading = G.phi + G.spinDir * G.spinA; G.slipping = true;
  G.vx = G.speed * Math.sin(G.phi) + G.slideVx; G.x += G.vx * dt; G.slideVx *= Math.exp(-dt / 0.4);
  if (G.spinA >= Math.PI * 2) { G.spinning = false; G.spins++; G.heading = G.phi; G.slip = 0; G.driftCharge = T.drift.tiers[2]; G.driftTier = 3; G.driftDirty = false; endDrift(true); addScore(T.spin.score, G.x, G.dist + 40, false, '360'); say('360', 'spin turbo', 900, true); hap([30, 30, 60]); }
  if (G.drifting) driftStep(dt);
}
export function gunHit(c, b) { if (c.kind === 'armored') { spark(b.x, b.y, 2); sfx.ping(false); return; } c.hp -= b.dmg; c.hitFlash = 0.08; spark(b.x, b.y, 3); if (b.knock) { c.vx += (b.x < c.x ? 1 : -1) * 260 * (c.kind === 'weak' ? 1.4 : 1); c.shunted = true; creditCar(c, 'shunt'); } sfx.ping(c.hp <= 0); if (c.hp <= 0) wreck(c, 'gun', true); }
// Score by cause. `credit` (or the car's own credit flag) says the player caused this wreck: then it pays base × the cause
// multiplier (car kills 3× a gun kill, player-caused chains 2×), feeds the combo and may drop a crate. A passive wreck, an
// enemy-on-enemy accident the player had no hand in, pays nothing and counts separately.
export function wreck(c, how, credit) {
  if (c.wrecked || !c.alive) return;
  credit = !!(credit || c.credit); if ((how === 'rail' || how === 'wall') && c.how) how = c.how;   // the push that sent it into the wall is the cause
  c.wrecked = true; c.debrisT = 1.5; c.speed = Math.max(c.speed * 0.6, G.speed * 0.3); c.vx = (c.vx || 0) + (G.rng() * 2 - 1) * 80; c.flip = 0; c.credit = credit;
  G.fx.push({ x: c.x, y: c.y, t: 0, life: 0.6, big: true }); addMark(c.x, c.y, 3, false);
  for (let i = 0; i < 4; i++) addDebris(c.x, c.y, (G.rng() * 2 - 1) * 260, c.speed + (G.rng() - 0.3) * 200, 1 + G.rng(), '#3a2a2a', 6 + G.rng() * 6, false);
  if (!credit) { G.passiveWrecks++; sfx.wreck(); kickShake(0, 0, 0.35); event(); return; }
  const base = c.kind === 'bruiser' ? T.score.bruiser : c.kind === 'gunner' ? T.score.gunner : c.kind === 'armored' ? T.score.armored : T.score.weak;
  const mul = T.score.cause[how] || 1;
  const label = how === 'stomp' ? 'STOMP' : how === 'chain' ? 'CHAIN WRECK' : how === 'slam' ? 'SLAM KILL' : how === 'shunt' ? 'SHUNT' : how === 'ram' ? 'RAMMED' : how === 'oil' ? 'SPUN OUT' : how === 'wall' || how === 'rail' ? 'INTO THE WALL' : how === 'barrel' ? 'BLASTED' : '';
  G.kills++; if (how === 'gun' || how === 'missile') G.gunKills++; else G.carKills++; if (G.wreckLog) G.wreckLog.push(G.t.toFixed(1) + ' ' + c.kind + ' ' + how + ' ' + (c.state || ''));
  G.combo = Math.min(T.combo.max, G.combo + 1); G.comboT = T.combo.window; G.comboPeak = Math.max(G.comboPeak, G.combo);
  addScore(base * mul, c.x, c.y, false, label);
  const hs = how === 'stomp' ? 0.09 : how === 'chain' ? 0.09 : (how === 'slam' ? 0.07 : 0.04); G.hitStop = Math.min(0.12, Math.max(G.hitStop, hs));
  kickShake(0, 0, how === 'gun' ? 0.6 : how === 'stomp' ? 1.0 : 0.8); if (how === 'stomp') { sfx.stomp(); G.punch = 0.1; } else sfx.wreck(); if (G.combo > 1) sfx.chain(G.combo); hap(how === 'chain' ? [30, 30, 30] : how === 'stomp' ? [80, 30, 120] : 45);
  if (how === 'chain') G.slowmo = Math.max(G.slowmo, 0.3), G.slowmoRate = 0.5;
  if (G.combo >= 3) G.bestMoment = G.t;
  event();
  if (G.rng() < T.crateDrop) G.crates.push({ x: c.x, y: c.y, vy: 0, t: 0, kind: ['ammo', 'gun'][Math.floor(G.rng() * 2)], speed: G.speed * 0.3 });   // crates never carry armor
}
export function explodeBarrel(b, credit) {
  if (!b.alive) return; b.alive = false; G.fx.push({ x: b.x, y: b.y, t: 0, life: 0.6, big: true, orange: true }); sfx.wreck(); kickShake(0, 0, credit ? 0.8 : 0.4); G.hitStop = Math.max(G.hitStop, 0.04);
  let n = 0; for (const c of G.cars) if (c.alive && !c.wrecked && c.kind !== 'truck' && Math.abs(c.x - b.x) < 60 + c.w / 2 && Math.abs(c.y - b.y) < 60 + c.l / 2) { if (c.kind === 'civ') { c.honk = 0.5; c.vx += Math.sign(c.x - b.x || 1) * 200; } else { G.queue.push({ t: 0.05 * n, fn: () => wreck(c, 'barrel', credit) }); n++; } }
  if (n >= 2 && credit) addScore(T.score.barrelDouble, b.x, b.y + 40, false, 'DOUBLE');
  for (const o of G.barrels) if (o.alive && o !== b && Math.abs(o.x - b.x) < 40 && Math.abs(o.y - b.y) < 40) G.queue.push({ t: 0.08, fn: () => explodeBarrel(o, credit) });
  if (G.air <= 0 && Math.abs(G.x - b.x) < 60 && Math.abs(G.dist - b.y) < 70) damage(1, null, 'Caught in a barrel blast');
  event();
}
export function addScore(base, x, y, quiet, label) {
  const mul = quiet ? 1 : Math.max(1, G.combo); const p = Math.round(base * mul); G.score = Math.max(0, G.score + p);
  if (x !== undefined) G.pops.push({ x, y, text: (p < 0 ? '' : '+') + fmt(p) + (label ? ' ' + label : ''), t: 0, bad: p < 0, small: quiet && !label });
}
export function spark(x, y, n) { for (let i = 0; i < n; i++) { const s = pool.sparks.pop() || {}; s.x = x; s.y = y; s.vx = (G.rng() * 2 - 1) * 260; s.vy = -G.speed * 0.5 + (G.rng() * 2 - 1) * 120; s.t = 0; s.col = null; G.sparks.push(s); } }
// Shake (audit, game feel): a directional kick that decays without overshoot, plus trauma-based noise shake scaled by trauma²,
// capped at 16 pt and 2 degrees. Gun kill 0.6 (6 pt), wreck 0.8 (10 pt), stomp 1.0 (16 pt). Applied inside the renderer with overscan.
export function kickShake(x, y, trauma) { G.kick.x += x; G.kick.y += y; G.trauma = Math.min(1, Math.max(G.trauma, trauma || 0)); }
export function launch(rp) { G.air = T.ramp.air; G.airTotal = T.ramp.air; G.slowmo = T.ramp.slowmoFor; G.slowmoRate = T.ramp.slowmo; sfx.launch(); hap([10, 20, 20, 20, 30]); event(); }
export function land() {
  G.jumpZ = 0; G.sq = 0.9; sfx.land(); hap(35); kickShake(0, 4, 0.3); G.fx.push({ x: G.x, y: G.dist, t: 0, life: 0.4, ring: true });
  let stomped = false, clean = true;
  for (const c of G.cars) { if (!c.alive || c.wrecked) continue; if (Math.abs(c.x - G.x) < c.w / 2 + 10 && Math.abs(c.y - G.dist) < c.l / 2 + 20) { if (c.kind === 'civ') { c.penalised = true; G.civHits++; addScore(T.score.civilian, c.x, c.y, true, 'CIVILIAN'); G.combo = 0; sfx.horn(); clean = false; } else if (c.kind === 'truck') { clean = false; } else { wreck(c, 'stomp', true); G.stomps++; stomped = true; } } }
  if (!stomped && clean && Math.abs(G.vx) < 150) { G.boost = T.score.clean; G.speedLines = 0.6; addScore(T.score.clean, G.x, G.dist, false, 'CLEAN'); say('Clean!', '', 600); }
  event();
}
export function truckLoad(tr) { if (tr.gives === 'armor') { G.armor = Math.min(T.armor, G.armor + 1); say('Armor +1', 'the only place it comes from', 1200); } else giveSpecial(tr.gives); G.slowmo = 0.8; G.slowmoRate = 0.3; sfx.chime(); hap([20, 40, 60]); addScore(T.score.truckLoad, tr.x, tr.y - 40, false, 'LOADED'); event(); }
export const SPECIALS = { missiles: { ammo: T.missiles, name: 'Homing missiles' }, oil: { ammo: T.oil, name: 'Oil slick' }, nitro: { ammo: T.nitro, name: 'Nitro' } };
export function giveSpecial(kind) { if (G.special && G.special.kind === kind) { G.special.level = Math.min(3, G.special.level + 1); G.special.ammo = Math.min(9, G.special.ammo + SPECIALS[kind].ammo + 1); say(SPECIALS[kind].name + ' level ' + G.special.level, '', 1200); } else { G.special = { kind, ammo: SPECIALS[kind].ammo, level: 1 }; say(SPECIALS[kind].name, 'tap the button', 1500); } emit({ k: 'special', armed: true, show: true }); }
export function pickup(kind, x, y) {
  sfx.chime(); hap([15, 30, 40]); G.slowmo = Math.max(G.slowmo, 0.15); G.slowmoRate = 0.5; G.fx.push({ x, y, t: 0, life: 0.4, burst: true }); event();
  if (kind === 'crate') addScore(T.score.crate, x, y, false, 'CRATE');
  if (kind === 'armor') { G.armor = Math.min(T.armor, G.armor + 1); G.pops.push({ x, y, text: 'ARMOR +1', t: 0 }); }
  if (kind === 'ammo') { if (!G.special) giveSpecial('missiles'); else { G.special.ammo = Math.min(9, G.special.ammo + 3); G.pops.push({ x, y, text: 'AMMO +3', t: 0 }); emit({ k: 'special', armed: true }); } }
  if (kind === 'gun') { G.gun = G.gun === 'twin' ? 'spread' : G.gun === 'spread' ? 'cannon' : 'spread'; G.pops.push({ x, y, text: G.gun === 'spread' ? 'SPREAD SHOT' : 'HEAVY CANNON', t: 0 }); say(G.gun === 'spread' ? 'Spread shot' : 'Heavy cannon', '', 1000); }
  if (kind === 'oil') giveSpecial('oil'); if (kind === 'nitroPick') giveSpecial('nitro');
}
export function fireSpecial() {
  if (!G || !G.special || G.special.ammo <= 0 || !G.playing) return;
  G.special.ammo--; const lvl = G.special.level;
  if (G.special.kind === 'missiles') { G.missiles.push({ x: G.x, y: G.dist + 30, t: 0 }); if (lvl >= 2) G.missiles.push({ x: G.x + 14, y: G.dist + 20, t: -0.1 }); sfx.missile(); hap(20); }
  if (G.special.kind === 'oil') { G.slicks.push({ x: G.x, y: G.dist - 60, t: 6, r: lvl >= 2 ? 36 : 26 }); sfx.ping(false); hap(15); }
  if (G.special.kind === 'nitro') { G.nitro = lvl >= 2 ? 2.0 : 1.5; G.speedLines = G.nitro; G.invuln = Math.max(G.invuln, 0.3); sfx.nitro(); hap([20, 20, 60]); say('Nitro', '', 500); }
  emit({ k: 'special', armed: false });
}
export function die() {
  G.dead = true; G.deathT = 0; G.slowmo = 1.2; G.slowmoRate = 0.25; sfx.death(); hap([80, 40, 80, 40, 120]); kickShake(0, 0, 1.0); G.fx.push({ x: G.x, y: G.dist, t: 0, life: 1.2, big: true, player: true });
  G.killedBy = G.cause || 'Wrecked'; G.queue.length = 0; emit({ k: 'died' });
}
