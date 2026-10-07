import { REF, T, clamp, fmt, lerp } from './constants.js';
import { event, playerLane, progress } from './director.js';
import { emit, hap, say, sfx } from './events.js';
import { DISTRICTS } from './road.js';
import { G, compact, recordReplay } from './state.js';
import { crashOn, crashStep, crashLaunch, setCrashHandler, impactSpeed, wreckVelocity, M as CM } from './crash.js';
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
  if (G.in.slam) trySlam(G.in.slam); if (G.in.special) fireSpecial(); if (G.in.boost) tryBoost(); if (G.in.mine) dropMine(); G.flicks += G.in.flicks;
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
    cnw.wallHit = true; G.wallHits++; G.wideT = 0; G.wallT = T.wall.stun; const o = -cnw.dir; G.speed = Math.max(T.drive.minSpeed, G.speed * T.wall.keep); G.boost = 0; G.slideVx = -o * 260; G.vx = -o * 260; G.x = (o < 0 ? left : right) - o * 22; G.heading = G.phi = 0; const dTarget = G.x - G.targetX; G.targetX = G.x; emit({ k: 'rebase', d: dTarget });
    damage(T.wall.damage, null, 'Hit the barrier'); spark(G.x + o * 17, G.dist, 18); sfx.crunch(true); hap([40, 30, 60]); kickShake(o * 10, 0, 0.8); G.hitStop = Math.max(G.hitStop, 0.08); G.sq = 0.88; say('Too fast', 'tap BRAKE and steer to drift', 900); event();
    const row = cornerRow(cnw); if (row) row.wall = true; } }
  else G.wideT = 0;
  if (scraping && G.air <= 0 && playing) { G.grazeT += dt; spark(G.x + (G.x <= left + 0.5 ? -17 : 17), G.dist, 1); G.boost = Math.max(G.boost - 40 * dt, -40); if (G.grazeT > 0.25 && G.grazePaid < T.score.grazeCap) { G.grazeT = 0; G.grazePaid++; addScore(T.score.graze, G.x, G.dist, true); } } else { G.grazeT = 0; if (!scraping) G.grazePaid = 0; }
  // median / barrier for the player
  for (const m of G.medians) if (G.dist > m.y0 - 30 && G.dist < m.y1 + 30) { const mx0 = G.road.laneX(G.dist, m.lane0) - 6, mx1 = G.road.laneX(G.dist, m.lane0 + m.lanes - 1) + 6; const hw = T.sizes.player[0] / 2; if (G.x + hw > mx0 && G.x - hw < mx1) { if (G.x < (mx0 + mx1) / 2) G.x = mx0 - hw; else G.x = mx1 + hw; G.vx = 0; if (G.slamT > 0) G.slamT = 0; spark(G.x, G.dist, 2); } }
  for (const b of G.barriers) if (!b.hit && G.air <= 0 && Math.abs(G.dist - b.y) < 36) { const x0 = G.road.laneX(b.y, b.lane0) - T.laneW / 2, x1 = G.road.laneX(b.y, b.lane0 + b.lanes - 1) + T.laneW / 2; if (G.x > x0 && G.x < x1) { b.hit = true; damage(1, null, 'Hit a roadblock'); G.boost = -120; spark(G.x, G.dist + 30, 10); } }
  for (const g of G.gaps) if (!g.done && G.air <= 0 && G.dist > g.y0 && G.dist < g.y1 && playing) { g.done = true; G.detour = 2.5; G.combo = 0; G.comboT = 0; say('Detour', 'you missed the jump', 1200); sfx.horn(); }
  G.relVx = G.vx - G.roadVx;   // sideways speed relative to the road: what shunts and skids read
  G.lean = G.heading * 180 / Math.PI;   // the body points where it is heading; the slip angle is visible as the difference from the motion
  // Stop 3: the body's load (path curvature x speed, and the speed change) drives roll, squat and the two-wheel moment; then the rollover
  { const kk = G.road.at(G.dist).k; const latA = clamp(G.speed * ((G.phi - G.prevPhi) / dt + G.speed * kk), -3000, 3000); const lonA = (G.speed - G.prevSpeed) / dt; G.prevPhi = G.phi; G.prevSpeed = G.speed; suspStep(dt, latA, lonA); rollStep(dt); }
  G.sq += (1 - G.sq) * Math.min(1, dt * 10);
  const prevDist = G.dist; G.dist += G.fwd * dt; G.road.ensure(G.dist + 2400);
  if (playing) { G.topSpeed = Math.max(G.topSpeed, G.speed); G.speedSum += G.speed * dt; G.speedN += dt; driveEffects(dt); }
  if (playing) { G.distScore += (G.dist - prevDist); while (G.distScore >= T.score.distancePer) { G.distScore -= T.score.distancePer; G.score += 1; } }
  // jump (Stop 5): ballistic. On the ground the car follows the road's height; where the road curves away faster than gravity pulls (speed^2 x curvature
  // over g) it leaves the ground on a parabola (vz = speed x slope there) until it meets the road again. A ramp is the same with a kick.
  if (G.air > 0) airStep(dt);
  else if (playing) crestCheck();
  // rumble strip on the inside of a corner: a buzz and a light judder
  { const rc0 = G.road.at(G.dist); const cn = rc0.corner; if (cn && playing && G.air <= 0) { const inside = REF + cn.dir * (rc0.width / 2 - 17); if (Math.abs(G.x - inside) < 9) { G.rumbleT -= dt; if (G.rumbleT <= 0) { G.rumbleT = T.corner.rumbleEvery; G.kick.y += 2; hap(5); sfx.tone('square', 90, 90, 0.03, 0.04); } } }
    // corner callouts for the first hairpins and hard corners, 2 s ahead, four words at most
    const ca = G.road.cornerAhead(G.dist, T.corner.warn * G.speed); if (ca && ca.hard && ca.called !== true && G.dist >= ca.warnS) { ca.called = true; event(); if (G.cornerCalls < 3) { G.cornerCalls++; say(ca.type === 'hairpin' ? 'Hairpin' : 'Hard corner', 'steer hard to drift', 1100); } if (ca.type === 'hairpin') G.hairpins++; G.cornerLog.push({ type: ca.type, index: ca.index, vmax: Math.round(ca.vmax), entry: 0, apexSpeed: 0, drift: false, scraped: false }); }
    // the log row for the corner the car is in (the next corner is announced before this one's apex, so never "the last row")
    if (cn) { const L = cornerRow(cn); if (L) { if (cn.hard && Math.abs(G.dist - cn.apex) < 30 && !L.apexSpeed) L.apexSpeed = Math.round(G.speed); if (G.drifting) L.drift = true; if (G.scraping) L.scraped = true; if (L.enterT === undefined) { L.enterT = G.t; L.s0 = cn.s0; L.s1 = cn.s1; } if (G.braking) L.braked = true; } }
    for (let i = G.cornerLog.length - 1; i >= 0 && i >= G.cornerLog.length - 4; i--) { const L = G.cornerLog[i]; if (L.enterT !== undefined && L.exitT === undefined && G.dist > L.s1 + 500) L.exitT = G.t; } }   // the window includes 500 pt of exit, where a hit costs its time
  if (G.invuln > 0) G.invuln -= dt; if (G.mercyT > 0) G.mercyT -= dt;
  // --- cars
  for (const c of G.cars) {
    if (!c.alive) continue; c.t += dt; if (c.hitCd > 0) c.hitCd -= dt; if (c.honk > 0) c.honk -= dt; if (c.hitFlash > 0) c.hitFlash -= dt;
    if (c.creditT > 0 && !c.wrecked) { c.creditT -= dt; if (c.creditT <= 0) { c.credit = false; c.how = null; c.shunted = false; } }   // the player's credit for a push lasts 1.5 s
    if (c.wrecked && (c.rb || c.rested)) { c.debrisT -= dt; if (c.y < G.dist - 500 || c.debrisT < -3.5) c.alive = false; continue; }   // a crash-physics wreck: crash.js moves it (or it lies where it came to rest)
    if (c.wrecked) { c.debrisT -= dt; c.y += c.speed * dt; c.x += c.vx * dt; c.vx *= Math.exp(-dt * 2.2); c.speed *= Math.exp(-dt * 1.6); if (c.speed < 6) c.speed = 0; c.spinV *= Math.exp(-dt * 1.8); c.spin += c.spinV * dt; c.flip = Math.min(1, c.flip + dt * 2); if (c.y < G.dist - 500 || c.debrisT < -3.5) c.alive = false; continue; }   // a wreck slides to a stop, spinning down, and stays on the road for a few seconds
    const a = G.road.at(c.y); const hw = c.w / 2; const l = a.center - a.width / 2 + hw, r = a.center + a.width / 2 - hw;
    // traffic model: each car has a world speed
    if (c.kind === 'civ' || c.kind === 'truck' || c.kind === 'armored') {
      const kc = Math.abs(G.road.at(c.y).k); const slow = 1 - T.corner.trafficSlow * clamp(kc * 250, 0, 1);   // traffic slows for corners
      c.speed += (G.cruise * c.factor * slow - c.speed) * Math.min(1, dt * 2);
      // civilians change lanes occasionally with a blinker first
      if (c.kind === 'civ' && playing) { c.laneTimer -= dt; if (c.laneTimer <= 0 && c.blink === 0) { const n = G.road.laneCount(c.y); const dir = c.lane === 0 ? 1 : c.lane === n - 1 ? -1 : (G.rng() < 0.5 ? -1 : 1); c.blink = 0.6; c.blinkDir = dir; } if (c.blink > 0) { c.blink -= dt; if (c.blink <= 0) { c.lane = clamp(c.lane + c.blinkDir, 0, G.road.laneCount(c.y) - 1); c.laneTimer = 4 + G.rng() * 4; c.blink = 0; } } }
      if (c.lane >= G.road.laneCount(c.y)) c.lane = G.road.laneCount(c.y) - 1;   // bug 9
      const tx = c.kind === 'armored' ? (G.road.laneX(c.y, c.lane) + G.road.laneX(c.y, Math.min(c.lane + 1, G.road.laneCount(c.y) - 1))) / 2 : G.road.laneX(c.y, c.lane);
      if (Math.abs(c.vx) < 60) c.x += (tx - c.x) * Math.min(1, dt * 2.5);
    } else if (c.kind === 'bruiser' || c.kind === 'gunner' || c.kind === 'weak') {
      if (c.lane >= G.road.laneCount(c.y)) c.lane = G.road.laneCount(c.y) - 1;
      enemyAI(c, dt, playing);
    }
    if (c.wrecked || c.shunted || c.spinOut > 0) { const kk = G.road.at(c.y).k; c.vx += -Math.sign(kk) * c.speed * c.speed * Math.abs(kk) * dt; }   // no grip: the corner throws it outward
    c.x += c.vx * dt; c.vx *= Math.exp(-dt * 2.5);
    c.y += c.speed * dt;
    // rails and walls: a car moving sideways fast enough wrecks on them
    if (c.x < l || c.x > r) { if ((Math.abs(c.vx) > T.shuntThreshold || c.slammed) && c.kind !== 'civ' && c.kind !== 'truck') { wreck(c, c.slammed ? 'slam' : 'rail'); continue; } c.x = clamp(c.x, l, r); c.vx *= -0.2; }
    for (const m of G.medians) if (c.y > m.y0 - 30 && c.y < m.y1 + 30) { const mx0 = G.road.laneX(c.y, m.lane0) - 6, mx1 = G.road.laneX(c.y, m.lane0 + m.lanes - 1) + 6; if (c.x + hw > mx0 && c.x - hw < mx1) { if ((Math.abs(c.vx) > T.shuntThreshold || c.slammed) && c.kind !== 'civ' && c.kind !== 'truck') { wreck(c, 'wall'); break; } c.x = c.x < (mx0 + mx1) / 2 ? mx0 - hw : mx1 + hw; c.vx = 0; } }
    if (c.y < G.dist - 700 || c.y > G.dist + T.spawn.cull) c.alive = false;
  }
  compact(G.cars, isAlive);
  // --- car-to-car collisions with mass push-out (cars never overlap)
  const live = G.cars;
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) carPair(live[i], live[j]);
  if (playing && G.air <= 0) for (const c of live) if (c.alive) contactPlayer(c);
  crashStep(dt); if (G.crashHits.length) { for (let i = 0; i < G.crashHits.length; i += 2) crashHit(G.crashHits[i], G.crashHits[i + 1]); G.crashHits.length = 0; }
  // barrels: cars and the player (the player gets the credit for a barrel they drive into; a civilian or enemy setting one off pays nothing)
  for (const b of G.barrels) { if (!b.alive) continue; for (const c of live) if (c.alive && !c.wrecked && Math.abs(c.x - b.x) < c.w / 2 + 8 && Math.abs(c.y - b.y) < c.l / 2 + 8 && (Math.abs(c.vx) > 80 || c.kind !== 'civ')) { explodeBarrel(b, c.credit); break; } if (b.alive && G.air <= 0 && Math.abs(G.x - b.x) < 25 && Math.abs(G.dist - b.y) < 38) explodeBarrel(b, true); }
  for (const cn of G.cones) if (cn.alive && G.air <= 0 && Math.abs(G.x - cn.x) < 22 && Math.abs(G.dist - cn.y) < 34) { cn.alive = false; cn.vx = Math.sign(G.x - cn.x || 1) * -200; spark(cn.x, cn.y, 2); sfx.ping(false); addDebris(cn.x, cn.y, (G.rng() * 2 - 1) * 200, G.speed * 0.4, 1.2, '#ff9f1c', 8, false); }
  // oil slicks: any car crossing spins out; the player's slick, so the player gets the credit
  for (const s of G.slicks) { s.t -= dt; for (const c of live) if (c.alive && !c.wrecked && c.kind !== 'truck' && Math.abs(c.x - s.x) < 30 && Math.abs(c.y - s.y) < 40 && !c.spun) { c.spun = true; c.vx = (G.rng() < 0.5 ? -1 : 1) * 300; c.shunted = true; creditCar(c, 'oil'); c.spinOut = 1.0; if (c.kind === 'civ') c.penalised = true; } }
  compact(G.slicks, s => s.t > 0);
  mineStep(dt, live);
  // bullets
  for (const b of G.bullets) { b.py = b.y; b.y += (b.vy === undefined ? T.bulletSpeed : b.vy) * dt; b.x += (b.vx || 0) * dt; b.life = (b.life || 0) + dt; }   // road space: the round keeps the car's own speed, so it closes on traffic at the muzzle speed
  compact(G.bullets, b => { if (b.y > G.dist + 900 || b.y < G.dist - 1100 || b.life > 0.62 || Math.abs(b.x - REF) > 700) return false; for (const c of live) { if (!c.alive || c.wrecked || c.kind === 'civ' || c.kind === 'truck') continue; if (Math.abs(b.x - c.x) < c.w / 2 && Math.abs(b.y - c.y) < c.l / 2) { gunHit(c, b); return false; } } for (const br of G.barrels) if (br.alive && Math.abs(b.x - br.x) < 12 && Math.abs(b.y - br.y) < 14) { explodeBarrel(br, true); return false; } return true; });
  // missiles: arc, smoke, splash 40 pt
  for (const m of G.missiles) { let target = null, best = 1e9; for (const c of live) { if (!c.alive || c.wrecked || c.kind === 'civ' || c.kind === 'truck' || (m.dir < 0 ? c.y >= m.y + 20 : c.y <= m.y - 20)) continue; const d = Math.hypot(c.x - m.x, c.y - m.y); if (d < best) { best = d; target = c; } } m.t += dt; m.py = m.y; if (target) m.x += (target.x - m.x) * Math.min(1, dt * 5); m.y += (700 + 400 * Math.min(1, m.t * 2)) * dt * (m.dir < 0 ? -1 : 1); if (G.rng() < 0.7) addDebris(m.x + (G.rng() - 0.5) * 6, m.y - 10, 0, G.speed * 0.5, 0.5, 'rgba(200,200,200,0.5)', 6, true); if (target && Math.abs(m.x - target.x) < 22 && Math.abs(m.y - target.y) < target.l / 2 + 10) { m.dead = true; G.fx.push({ x: m.x, y: m.y, t: 0, life: 0.5, big: true }); for (const c of live) if (c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && Math.abs(c.x - m.x) < 40 + c.w / 2 && Math.abs(c.y - m.y) < 40 + c.l / 2) wreck(c, 'missile', true); } if (m.y > G.dist + 1200 || m.y < G.dist - 1500) m.dead = true; }
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
  // Stop 3: no pedals. The car pulls to the auto speed by itself (the old gas speed); a held drift builds speed on top of it
  const gas = G.wallT <= 0 && !G.limp; let target = gas ? D.auto : G.cruise;
  // Stop 4: BRAKE is back. Held, it slows the car toward `brakeSpeed` (a drift holds a little more), so enemies pass and the road gets easy to read
  const braking = !!G.in.brake && G.air <= 0 && G.wallT <= 0 && G.burnout <= 0; if (braking && !G.brakeOn) sfx.brake(); G.brakeOn = braking;
  if (G.drifting && !braking) G.driftBuild = Math.min(T.drift.buildMax, G.driftBuild + T.drift.build * dt); else G.driftBuild *= Math.exp(-dt * 2.5);
  target += G.driftBuild;
  if (G.turboT > 0) { G.turboT -= dt; target += G.turbo; if (G.turboT <= 0) G.popT = 0.35; }
  if (G.slipBoostT > 0) { G.slipBoostT -= dt; target += D.slipBoost; }
  if (G.nitro > 0) { G.nitro -= dt; target = D.nitro; if (G.nitro <= 0) G.popT = 0.5; }
  if (G.bstT > 0) { G.bstT -= dt; target += T.boost.speed; if (G.bstT <= 0) { G.bstT = 0; G.popT = 0.5; } }   // Stop 5: BOOST sits on top of whatever else is going
  if (G.detour > 0) { G.detour -= dt; target *= 0.8; }
  target = Math.min(target, G.nitro > 0 ? D.nitro : D.auto + G.driftBuild + (G.turboT > 0 ? G.turbo : 0) + (G.bstT > 0 ? T.boost.speed : 0));   // a boost (a kill, a drift, a repair) lifts the cap, so fighting is the fast way through
  if (G.limp) { G.limpT += dt; target = Math.min(target, G.cruise * T.limp.speedK); }
  if (braking) target = Math.min(target, D.brakeSpeed * (G.drifting ? 1.25 : 1));   // limp mode: no armor, a smoking crawl until a repair crate is collected
  if (G.wallT > 0) { G.wallT -= dt; target = D.minSpeed; G.turboT = 0; G.slipBoostT = 0; }   // grinding the rail after a barrier hit: no throttle until the stun ends
  // the corner lift: a hard corner ahead that the car would not hold in grip; it lifts in time to reach `liftK` x the grip speed at the turn-in.
  // A drift skips it (the drift holds 30% more and builds speed), so drifting is the fast way round and a weak driver never hits the wall
  let lift = false;
  if (!G.drifting && G.air <= 0 && G.nitro <= 0) { const ca = G.road.cornerAhead(G.dist, Math.max(700, G.speed * 1.3)); if (ca && ca.hard) { const vmax = Math.sqrt(D.grip * ca.R) * D.liftK; const inIt = G.dist >= ca.s0 - 40;
    const need = (G.speed * G.speed - vmax * vmax) / (2 * D.liftRate); if (inIt || need > ca.s0 - G.dist - G.speed * 0.06) { target = Math.min(target, vmax); lift = G.speed > vmax + 4; } } }
  if (lift && !G.autoLift) sfx.brake(); G.autoLift = lift; G.braking = lift || braking;
  if (lift) G.speed = Math.max(target, G.speed - D.liftRate * dt);
  else if (braking && G.speed > target) G.speed = Math.max(target, G.speed - D.brakeRate * dt);
  else { const accel = G.bstT > 0 ? T.boost.accel : gas ? D.accel : D.accel * 0.6;
    if (G.speed < target) G.speed = Math.min(target, G.speed + accel * dt);
    else G.speed += (target - G.speed) * Math.min(1, dt * (gas ? 1.5 : D.coast)); }
  G.reversing = G.speed < 0; if (G.reversing && G.drifting) endDrift(false);
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
  const D = T.drive, dr = T.drift; const authority = G.roll ? T.roll.steer : G.air > 0 ? T.ramp.steerAir : 1;
  if (G.burnout > 0) { G.heading = G.phi = 0; G.vx = 0; return; }
  const u = clamp((G.targetX - G.x) / (T.laneW * 1.1), -1, 1);   // steering demand from the thumb
  const padHeld = false;   // Stop 3: no BRAKE button (the 360 and the pad drift below never arm)
  // Stop 4: the brake-tap drift. BRAKE held while steering (or while a corner the tyres cannot hold is coming and the thumb is neutral) throws the
  // car into an easy drift at once: a smaller slip angle, a held drift that forgives a thumb drifting back toward centre
  if (G.in.brake && playing && !G.drifting && G.driftExitT <= 0 && G.air <= 0 && G.speed > 350 && !G.roll && G.burnout <= 0) {
    const kk = G.road.at(G.dist).k; const want = Math.abs(u) > dr.brakeU ? Math.sign(u) : (G.speed * G.speed * Math.abs(kk) > D.grip * 0.5 ? Math.sign(kk) : 0);
    if (want) { startDrift(want); G.easyDrift = true; } }
  // Stop 3: drift is automatic. A hard steer held for a moment at speed starts it, and so does steering into a corner the tyres cannot hold
  { const kk = G.road.at(G.dist).k; const overGrip = G.speed * G.speed * Math.abs(kk) > D.grip; const inward = u * Math.sign(kk);
    if (!G.drifting && G.driftExitT <= 0 && G.air <= 0 && G.speed > 350 && playing && !G.roll && G.burnout <= 0) {
      const hard = Math.abs(u) > dr.startU, corner = overGrip && inward > dr.cornerU; G.steerT = hard || corner ? G.steerT + dt : 0;
      if (G.steerT >= dr.startFor) { G.steerT = 0; startDrift(hard ? Math.sign(u) : Math.sign(kk)); G.easyDrift = !hard; }   // a corner on its own gives the easy drift
    } else G.steerT = 0; }
  if (G.drifting) {
    G.driftT += dt; const counter = u * G.driftDir < dr.counterU;   // thumb swung the other way: the player is straightening up
    const hold = u * G.driftDir > (G.easyDrift ? dr.brakeHoldU : dr.holdU) || (G.driftT < (G.easyDrift ? 0.4 : 0.25) && !counter);
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
    const slipRange = G.easyDrift ? dr.easySlip : dr.slip; const slipTarget = G.driftDir * (slipRange[0] + (slipRange[1] - slipRange[0]) * clamp((u * G.driftDir - dr.holdU) / (1 - dr.holdU), 0, 1)) * Math.PI / 180; /* the harder the steer, the wider the drift */ const srate = dr.turnRate * Math.PI / 180 * dt;
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
  const dr = T.drift; const tier = G.driftTier; G.drifting = false; G.easyDrift = false; G.driftExitT = dr.exit; G.wobble = -G.driftDir;
  if (tier > 0 && clean && !G.driftDirty) fillBoost(T.boost.drift * tier);
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
  const py = G.dist, px = G.x; const P = c.kind === 'weak' ? T.dart : T.bruiser; const closeCap = P.closeCap, dropCap = P.dropCap; const soft = c.soft ? 1.5 : 1;   // soft: the finale's enemies are slower to strike
  if (c.slotOff === undefined) c.slotOff = c.kind === 'weak' ? (G.rng() * 2 - 1) * 60 : 0;
  const slotY = () => c.kind === 'gunner' ? py - 230 : py + 6 + c.slotOff;
  const slotLane = () => { const pl = playerLane(); const n = G.road.laneCount(c.y); let l = pl + c.side; if (l < 0 || l >= n) { c.side = -c.side; l = pl + c.side; } return clamp(l, 0, n - 1); };
  // chase speed: player speed plus a closing term toward the slot, capped
  // an enemy that arrived from beyond the fog must reach the car in a few seconds: far ahead it may brake much harder (down to 0.3 x cruise),
  // and far behind it may take corners faster than grip (up to 2x), so a fast player does not simply leave it behind
  const far = c.y - py > 1500; const target = slotY(); const closing = clamp((target - c.y) * 1.6, far ? -900 : -dropCap, closeCap);
  const kc = Math.abs(G.road.at(c.y).k); const gripMax = kc > 1e-5 ? Math.sqrt(T.drive.grip * 1.1 / kc) * (1 + clamp((py - c.y) / 400 - 0.5, 0, 1)) : 1e9;   // chasers stay in grip through corners
  const wanted = Math.min(gripMax, Math.max(G.speed + closing, G.cruise * (far ? 0.3 : 0.5))); c.speed += (wanted - c.speed) * Math.min(1, dt * 3);
  if (c.spinOut > 0) { c.spinOut -= dt; c.spin += 8 * dt; return; } else c.spin *= Math.exp(-dt * 6);
  if (!playing) return;
  if (c.kind === 'bruiser' || c.kind === 'weak') {
    if (c.state === 'approach') { c.lane = slotLane(); const tx = G.road.laneX(c.y, c.lane); c.x += (tx - c.x) * Math.min(1, dt * 4); if (Math.abs(c.y - target) < 40 && Math.abs(c.x - tx) < 8) { c.state = 'hold'; c.t = 0; c.holdFor = (P.hold[0] + G.rng() * (P.hold[1] - P.hold[0])) * soft; } }
    else if (c.state === 'hold') { const tx = G.road.laneX(c.y, c.lane) + G.vx * 0.05; c.x += (tx - c.x) * Math.min(1, dt * 4); if (c.t >= c.holdFor && G.mercyT <= 0) { c.state = 'tell'; c.t = 0; c.lean = 0; sfx.sight(); } }
    else if (c.state === 'tell') { c.lean = Math.min(1, c.t / (P.tell * soft)) * (px < c.x ? -1 : 1) * 8; if (c.t >= P.tell * soft) { c.state = 'swerve'; c.t = 0; c.dir = px < c.x ? -1 : 1; c.swerveLeft = P.lunge; event(); } }
    else if (c.state === 'swerve') { const stepX = Math.min(c.swerveLeft, P.lungeSpeed * dt); c.x += c.dir * stepX; c.swerveLeft -= stepX; if (c.swerveLeft <= 0 || c.t > 0.5) { c.state = 'recover'; c.t = 0; c.lean = 0; } }
    else if (c.state === 'recover') { const tx = G.road.laneX(c.y, c.lane); c.x += (tx - c.x) * Math.min(1, dt * 3); if (c.t >= P.recover) { c.state = 'approach'; c.t = 0; c.side = G.rng() < 0.3 ? -c.side : c.side; } }
  } else if (c.kind === 'gunner') {
    // sits behind, red sight line for 0.8 s, fires along it, then repositions
    c.lane = c.lane === undefined ? playerLane() : c.lane; const tx = G.road.laneX(c.y, c.lane); c.x += (tx - c.x) * Math.min(1, dt * 3);
    if (c.cd > 0) c.cd -= dt;
    if (c.state !== 'sight' && c.cd <= 0 && G.mercyT <= 0 && Math.abs(c.y - target) < 120 && c.y < py) { c.state = 'sight'; c.sight = 0; c.sightX = c.x; sfx.sight(); event(); }
    if (c.state === 'sight') { c.sight += dt; if (c.sight >= T.gunner.sight * (c.soft ? 1.4 : 1)) { c.state = 'approach'; c.cd = T.gunner.cooldown * soft; c.lane = playerLane(); G.fx.push({ x: c.sightX, y: c.y + 300, t: 0, life: 0.25, line: true, x0: c.sightX, y0: c.y }); sfx.cannon(); if (G.air <= 0 && Math.abs(G.x - c.sightX) < 22 && G.dist > c.y) damage(1, c, 'Shot by a Gunner'); } }
  }
}
export function carPair(a, b) {
  if (!a.alive || !b.alive) return; if (a.rb || b.rb || a.rested || b.rested) return;   // crash-physics wrecks meet cars in crash.js
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
  if (c.kind === 'civ' && !c.wrecked && !c.closeCalled && !c.penalised && G.speed > 380) { const gapX = Math.abs(c.x - G.x) - (c.w + 34) / 2; if (gapX >= 0 && gapX <= T.pace.nearMiss && Math.abs(c.y - G.dist) < (c.l + 60) / 2) { c.closeCalled = true; G.nearMisses++; fillBoost(T.boost.near); addScore(Math.round(T.score.closeCall * (1 + clamp((G.speed - 480) / 600, 0, 1))), c.x, c.y, false, 'NEAR MISS'); if (G.combo > 0) G.comboT = Math.min(T.combo.hold, G.comboT + 0.6); G.speedLines = Math.max(G.speedLines, 0.25); sfx.whoosh(); hap(8); event(); } }
  // Stop 5: a pile of wrecks left on the road past a ramp: driving into one costs half an armor pip and a lot of speed (a jump clears it)
  if (c.obst) { const dx = c.x - G.x, dy = c.y - G.dist; if (Math.abs(dx) < (c.w + 34) / 2 && Math.abs(dy) < (c.l + 60) / 2 && G.invuln <= 0) { c.obst = false; damage(0.5, null, 'Hit a wreck'); G.boost = -160; spark(G.x, G.dist + 30, 12); sfx.crunch(true); kickShake(0, 6, 0.6); G.sq = 0.9; c.vx = Math.sign(dx || 1) * 160; } return; }
  if (c.wrecked && (c.rb || c.rested)) return;   // the hero meets crash-physics wrecks in crash.js (crashHit)
  if (c.wrecked) { const dx = c.x - G.x, dy = c.y - G.dist; if (Math.abs(dx) < (c.w + 34) / 2 && Math.abs(dy) < (c.l + 60) / 2) { c.vx += Math.sign(dx || 1) * 200; G.vx -= Math.sign(dx || 1) * 60; spark(G.x, G.dist, 2); } return; }
  const dx = c.x - G.x, dy = c.y - G.dist; const hw = (c.w + 34) / 2, hl = (c.l + 60) / 2;
  if (Math.abs(dx) >= hw || Math.abs(dy) >= hl) return;
  const side = (hw - Math.abs(dx)) < (hl - Math.abs(dy));
  const s = Math.sign(dx || 1);
  if (c.kind === 'truck') { if (!side && dy > 0) { G.x -= s * 2; G.speed *= 0.98; G.boost = -40; } else { c.x += s * (hw - Math.abs(dx)); G.x -= s * 2; } return; }
  if (c.kind === 'civ') { civLaunch(c, s, side); return; }   // Stop 4: every hit on a civilian is catastrophic
  if (c.kind === 'armored') { if (!side && dy > 0) { if (c.hitCd <= 0) { c.hitCd = T.rearCd; damage(0.5, c, 'Rammed a Bulwark'); G.boost = -150; G.speed = Math.min(G.speed, Math.max(T.drive.minSpeed, c.speed * 0.85)); G.x -= s * 4; /* one hit, then the car falls in behind it: no riding the truck down to zero armor */ } } else { G.x -= s * (hw - Math.abs(dx)); G.vx = -s * 150; if (G.slamT > 0) { G.slamT = 0; damage(0, null); spark(G.x, G.dist, 6); sfx.crunch(true); } } return; }
  if (side) {
    const slamming = G.slamT > 0;
    const attacking = c.state === 'swerve' && !slamming;                         // a Bruiser landing its lunge
    const intent = slamming || (G.relVx * s > T.shuntIntent && G.steerVx * s > 0);   // the player is actually steering into the car, not being slid by the road
    if (attacking) {
      // a Ram's or Dart's lunge lands: the player takes the damage, a crunch and a shove that can be felt; the attacker is not flung, so an idle driver cannot farm lunges
      const Pn = c.kind === 'weak' ? T.dart : T.bruiser; if (!((G.body.two || (c.kind === 'bruiser' && G.body.tilt > 6)) && heroRoll(-s, 'Rolled by a ' + (c.kind === 'weak' ? 'Dart' : 'Ram')))) damage(Pn.damage, c, c.kind === 'weak' ? 'Clipped by a Dart' : 'Smashed by a Ram'); /* caught on two wheels, the hit rolls the car */ G.x -= s * Pn.push; G.slideVx = -s * Pn.shove; G.vx = -s * Pn.shove; G.boost = Math.min(G.boost, -70); c.vx = s * 90; c.state = 'recover'; c.t = 0;
      spark(G.x + s * 17, G.dist, c.kind === 'weak' ? 10 : 18); G.fx.push({ x: G.x + s * 17, y: G.dist, t: 0, life: 0.12, hit: true }); sfx.ram(c.kind === 'weak'); hap([50, 30, 70]); kickShake(-s * (c.kind === 'weak' ? 7 : 12), 3, c.kind === 'weak' ? 0.5 : 0.7); G.sq = c.kind === 'weak' ? 0.92 : 0.86; G.hitStop = Math.max(G.hitStop, c.kind === 'weak' ? 0.03 : 0.05); event(); return;
    }
    if (!intent) { c.x += s * (hw - Math.abs(dx)) * 0.5; G.x -= s * (hw - Math.abs(dx)) * 0.5; c.vx = s * 60; G.vx = -s * 40; if (c.hitCd <= 0) { c.hitCd = T.rearCd; spark(G.x + s * 17, G.dist, 2); sfx.ping(false); } return; }   // a brush, nothing more
    const power = Math.max(T.shuntMin, Math.abs(G.relVx) * T.shuntMul) * (slamming ? T.slam.power : 1);
    c.vx = s * power; c.x += s * (hw - Math.abs(dx)) * 0.5; c.shunted = true; creditCar(c, slamming ? 'slam' : 'shunt'); if (slamming) { c.slammed = true; c.spin = 0.4 * s; }
    G.x -= s * (hw - Math.abs(dx)) * 0.5; G.vx = slamming ? G.vx * 0.2 : -G.vx * 0.3;
    spark(G.x + s * 17, G.dist, slamming ? 20 : 12); G.fx.push({ x: G.x + s * 17, y: G.dist, t: 0, life: 0.12, hit: true }); sfx.ram(!slamming); hap(slamming ? 60 : 35); kickShake(-s * (slamming ? 12 : 7), 2, slamming ? 0.6 : 0.4); G.sq = 0.9; G.hitStop = Math.max(G.hitStop, slamming ? 0.07 : 0.04);
    if (slamming) { G.slamT = 0; emit({ k: 'rebase', d: G.x - G.slamX0 }); G.targetX = G.x; G.slams++; say('Slam', '', 400); }   // no "+0" pop: the wreck pays, by cause
    event();
  } else if (dy > 0) {
    // rear-ending at speed: no armor loss, 10% speed loss for 0.5 s, damages the car ahead (per-car cooldown)
    if (c.hitCd <= 0) { c.hitCd = T.rearCd; c.y += (hl - Math.abs(dy)) + 10; c.speed = Math.max(c.speed, G.speed * 1.05); c.hp -= c.kind === 'weak' ? 4.5 : 6; creditCar(c, 'ram'); G.boost = -Math.min(60, G.speed * 0.1); spark(G.x, G.dist + 30, 10); G.fx.push({ x: G.x, y: G.dist + 34, t: 0, life: 0.12, hit: true }); sfx.ram(true); hap(25); kickShake(0, 8, 0.35); G.sq = 0.92; G.hitStop = Math.max(G.hitStop, 0.03); event(); if (c.hp <= 0) wreck(c, 'ram', true); }
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
// Damage costs speed first and armor second: every hit takes a one-off speed loss (T.hurt.perPip per armor pip), which is time lost on a
// run that is a race. At zero armor the car does not die: it goes into limp mode (slower, no gas, smoking) until a repair crate is
// collected, and while limping a hit still costs speed but nothing else.
export function damage(amount, by, cause) {
  if (amount <= 0) return; if (G.invuln > 0 || G.nitro > 0) return;
  const loss = Math.max(T.hurt.min, T.hurt.perPip * amount); G.boost = Math.min(G.boost, -loss); G.speedLoss += loss;
  if (G.t < T.graceSeconds) amount *= 0.5;   // 60 s of half damage
  G.driftDirty = true; G.combo = 0; G.comboT = 0;   // a crash ends the chain
  G.mercyT = T.mercy * (G.armor <= 1 ? 2 : 1);
  if (G.limp) { G.vignette = 0.6; G.invuln = Math.max(G.invuln, 0.6); sfx.crunch(false); return; }
  G.damageAcc += amount; if (G.damageAcc < 1) { G.vignette = 0.5; G.invuln = Math.max(G.invuln, 0.5); sfx.crunch(false); return; }
  G.damageAcc -= 1; G.armor--; G.armorLost++; G.invuln = T.invuln; G.flashT = T.invuln; G.vignette = 1; G.smoke = 2.5; kickShake(0, 0, 0.9); G.hitStop = Math.max(G.hitStop, 0.04); sfx.damage(); hap([60, 30, 60]);
  G.cause = cause || (by ? 'Hit by a car' : 'Crashed');
  if (G.armor <= 0) { G.armor = 0; G.limp = true; G.limpT = 0; G.limpCount++; G.damageAcc = 0; say('Limp mode', 'grab the repair', 1600); emit({ k: 'limp', on: true }); }
  else say('Armor ' + G.armor, '', 700);
}
// The gatling (Sprint D): FIRE held spins the barrels up over a second (the whine), then rounds leave the hood muzzle along the car's own
// heading in a narrow spray, at a heavy fast rhythm. There is no aim help: the player aims by steering. Heat climbs per round; an
// overheated gun rests (the barrels keep their spin, so it is ready again quickly). Rounds keep the car's forward speed, so they always
// close on traffic at the muzzle speed.
export function gun(dt) {
  const R = T.gatling; const want = G.in.fire && G.air <= 0 && G.hot <= 0 && G.burnout <= 0 && !G.roll;
  if (G.hot > 0) { G.hot -= dt; if (G.hot <= 0) { G.heat = 0; say('Guns cool', '', 500); } }
  else G.gunSpin = clamp(G.gunSpin + (want ? dt / R.spinUp : -dt / R.spinDown), 0, 1);
  G.heat = Math.max(0, G.heat - R.cool * dt);
  G.gunCd -= dt; if (!want || G.gunSpin < 1 || G.gunCd > 0) return;
  G.gunCd = Math.max(G.gunCd, -dt) + 1 / R.rate; G.shots++;
  const h = G.heading, a2 = h + (G.rng() * 2 - 1) * R.spread * Math.PI / 180, MUZZLE = 1100; const cb = Math.cos(a2);
  G.bullets.push({ x: G.x + Math.sin(h) * R.muzzle, y: G.dist + Math.cos(h) * R.muzzle, vx: MUZZLE * Math.sin(a2) + G.vx * 0.2, vy: MUZZLE * cb + (cb < 0 ? G.fwd : Math.max(0, G.fwd)), dmg: R.dmg, knock: false, life: 0, tr: G.shots % R.tracerEvery === 0 });
  G.heat += R.heatPer; sfx.shot(); G.flashT2 = 0.06; G.kick.y += 0.3;
  if (G.heat >= 1) { G.hot = R.rest; G.gunSpin = 0.6; say('Overheated', 'let the guns cool', 800); sfx.ping(false); hap([20, 20, 20]); }
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
// every round that lands: a spark burst and flash at the impact, a tick, a tiny camera twitch; the round that kills is a wreck (below)
export function gunHit(c, b) {
  G.fx.push({ x: b.x, y: b.y, t: 0, life: 0.09, hit: true });
  if (c.kind === 'armored') { spark(b.x, b.y, 3); sfx.ping(false); return; }
  c.hp -= b.dmg; c.hitFlash = 0.08; spark(b.x, b.y, 4); sfx.hit(); G.kick.y += 0.55; G.trauma = Math.max(G.trauma, 0.08);
  if (c.hp <= 0) wreck(c, 'gun', true);
}
// Score by cause. `credit` (or the car's own credit flag) says the player caused this wreck: then it pays base × the cause
// multiplier (car kills 3× a gun kill, player-caused chains 2×), feeds the combo and may drop a crate. A passive wreck, an
// enemy-on-enemy accident the player had no hand in, pays nothing and counts separately.
export function wreck(c, how, credit) {
  if (c.wrecked || !c.alive) return;
  credit = !!(credit || c.credit); if ((how === 'rail' || how === 'wall') && c.how) how = c.how;   // the push that sent it into the wall is the cause
  c.wrecked = true; c.debrisT = 2.5; c.speed = Math.max(c.speed * 0.7, G.speed * 0.3); c.vx = (c.vx || 0) + (G.rng() * 2 - 1) * 80; c.flip = 0; c.credit = credit; c.spinV = 3 + Math.min(5, Math.abs(c.vx) / 60); c.boom = true;
  if (how === 'stomp') c.crush = 1;
  crashLaunch(c, how);   // Stop 3: the wreck becomes a rigid body and flips, tumbles and rolls (falls back to the old slide if the physics did not load)
  G.fx.push({ x: c.x, y: c.y, t: 0, life: credit ? 0.8 : 0.6, big: true, kill: credit, car: c }); addMark(c.x, c.y, 3, false);
  for (let i = 0; i < 4; i++) addDebris(c.x, c.y, (G.rng() * 2 - 1) * 260, c.speed + (G.rng() - 0.3) * 200, 1 + G.rng(), '#3a2a2a', 6 + G.rng() * 6, false);
  if (!credit) { G.passiveWrecks++; sfx.wreck(); kickShake(0, 0, 0.35); event(); return; }
  const base = c.kind === 'bruiser' ? T.score.bruiser : c.kind === 'gunner' ? T.score.gunner : c.kind === 'armored' ? T.score.armored : T.score.weak;
  const mul = T.score.cause[how] || 1;
  // Stop 3: the crash is the show. The score is a small number riding on the wreck; only a pile-up names itself
  const label = how === 'pileup' ? (c.viaCiv ? 'CIVILIAN PILE-UP' : 'PILE-UP') : how === 'mine' ? 'SHOCK MINE' : '';
  G.kills++; fillBoost(how === 'pileup' ? T.boost.pile : T.boost.kill); if (how === 'gun' || how === 'missile') G.gunKills++; else G.carKills++; if (G.wreckLog) G.wreckLog.push(G.t.toFixed(1) + ' ' + c.kind + ' ' + how + ' ' + (c.state || ''));
  // combo: a kill within `window` s of the last raises the multiplier (x2 up to x5); a kill in the last second of the hold keeps it without raising it
  if (G.combo === 0) G.combo = 1; else if (G.comboT > T.combo.hold - T.combo.window) G.combo = Math.min(T.combo.max, G.combo + 1);
  G.comboT = T.combo.hold; G.comboPeak = Math.max(G.comboPeak, G.combo); G.lastKillT = G.t;
  addScore(base * mul + (how === 'pileup' ? T.score.pileUp + (c.viaCiv ? T.score.civPile : 0) : 0), c.x, c.y, false, label, c);
  // every kill: 100 ms of hit stop (150 ms and a short slow motion when the car was the weapon), a bigger shake, a flash, a speed burst, an
  // explosion (the renderer reads the fx), a punchy sound
  // Stop 3: hit stop and slow motion kept short so the crash itself plays out (a pile-up gets no extra stop: it is already a chain of them)
  const carKill = how !== 'gun' && how !== 'missile' && how !== 'pileup'; const hs = how === 'stomp' ? 0.08 : carKill ? T.kill.carStop : 0; G.hitStop = Math.min(0.1, Math.max(G.hitStop, hs, how === 'pileup' ? 0 : T.gatling.killStop)); G.killFlash = 0.1; G.punch = 0.12;
  if (carKill && how !== 'chain') { G.slowmo = Math.max(G.slowmo, T.kill.carSlow); G.slowmoRate = T.kill.carSlowRate; }
  { const bst = T.kill.burst + T.kill.perCombo * G.combo; if (!G.limp) { G.turbo = Math.max(G.turboT > 0 ? G.turbo : 0, bst); G.turboT = Math.max(G.turboT, T.kill.burstFor); G.speedLines = Math.max(G.speedLines, 0.5); G.killBursts++; } }   // each kill gives a short speed burst: fighting is the fast way through
  kickShake((G.rng() * 2 - 1) * 3, 3, how === 'gun' ? 0.7 : how === 'stomp' ? 1.0 : 0.85); if (how === 'stomp') { sfx.stomp(); } else sfx.kill(G.combo); hap(how === 'chain' ? [30, 30, 30] : how === 'stomp' ? [80, 30, 120] : 45);
  if (how === 'chain') { G.slowmo = Math.max(G.slowmo, 0.2); G.slowmoRate = 0.6; }
  if (G.combo >= 3) G.bestMoment = G.t;
  event();
  if (G.rng() < T.crateDrop) G.crates.push({ x: c.x, y: c.y, vy: 0, t: 0, kind: 'ammo', speed: G.speed * 0.3 });   // crates never carry armor
}
export function explodeBarrel(b, credit) {
  if (!b.alive) return; b.alive = false; G.fx.push({ x: b.x, y: b.y, t: 0, life: 0.6, big: true, orange: true }); sfx.wreck(); kickShake(0, 0, credit ? 0.8 : 0.4); G.hitStop = Math.max(G.hitStop, 0.04);
  let n = 0; for (const c of G.cars) if (c.alive && !c.wrecked && c.kind !== 'truck' && Math.abs(c.x - b.x) < 60 + c.w / 2 && Math.abs(c.y - b.y) < 60 + c.l / 2) { if (c.kind === 'civ') { c.honk = 0.5; c.vx += Math.sign(c.x - b.x || 1) * 200; } else { G.queue.push({ t: 0.05 * n, fn: () => wreck(c, 'barrel', credit) }); n++; } }
  if (n >= 2 && credit) addScore(T.score.barrelDouble, b.x, b.y + 40, false, 'DOUBLE');
  for (const o of G.barrels) if (o.alive && o !== b && Math.abs(o.x - b.x) < 40 && Math.abs(o.y - b.y) < 40) G.queue.push({ t: 0.08, fn: () => explodeBarrel(o, credit) });
  if (G.air <= 0 && Math.abs(G.x - b.x) < 60 && Math.abs(G.dist - b.y) < 70) { if (!(Math.abs(G.x - b.x) < T.crash.barrelRoll && G.speed > 700 && heroRoll(Math.sign(G.x - b.x) || 1, 'Caught in a barrel blast'))) damage(1, null, 'Caught in a barrel blast'); }   // right on top of it, the blast rolls the car
  event();
}
export function addScore(base, x, y, quiet, label, car) {
  const mul = quiet ? 1 : Math.max(1, G.combo); const p = Math.round(base * mul); G.score = Math.max(0, G.score + p);
  // a kill's number rides on its wreck (car), small; the others float up from where they happened
  if (x !== undefined) G.pops.push({ x, y, text: (p < 0 ? '' : '+') + fmt(p) + (label ? ' ' + label : '') + (!car && !quiet && mul > 1 ? ' x' + mul : ''), t: 0, bad: p < 0, small: quiet && !label, big: !car && !quiet && base >= 100, car: car || null, ride: !!car });
}
export function spark(x, y, n) { for (let i = 0; i < n; i++) { const s = pool.sparks.pop() || {}; s.x = x; s.y = y; s.vx = (G.rng() * 2 - 1) * 260; s.vy = -G.speed * 0.5 + (G.rng() * 2 - 1) * 120; s.t = 0; s.col = null; G.sparks.push(s); } }
// Shake (audit, game feel): a directional kick that decays without overshoot, plus trauma-based noise shake scaled by trauma²,
// capped at 16 pt and 2 degrees. Gun kill 0.6 (6 pt), wreck 0.8 (10 pt), stomp 1.0 (16 pt). Applied inside the renderer with overscan.
export function kickShake(x, y, trauma) { G.kick.x += x; G.kick.y += y; G.trauma = Math.min(1, Math.max(G.trauma, trauma || 0)); }
// Stop 5: leaving the ground. vz is the vertical speed (pt/s up); `soft` marks a hill jump or a bounce (no slow motion, the drift survives), a ramp is not.
export function takeoff(vz, soft) { G.fz = G.road.at(G.dist).elev; G.fvz = vz; G.hang = 0; G.hop = false; G.crestAir = !!soft; G.jumpZ = 0; G.air = G.airTotal = Math.max(0.05, 2 * vz / T.hill.g); G.airEvt++; }
export function launch(rp) { takeoff(T.ramp.vz + G.fwd * G.road.at(G.dist).slope, false); G.slowmo = T.ramp.slowmoFor; G.slowmoRate = T.ramp.slowmo; sfx.launch(); hap([10, 20, 20, 20, 30]); event(); }
// the road curves away under the car faster than gravity pulls it down: it leaves the ground
function crestCheck() {
  if (G.fwd < T.hill.minSpeed || G.roll || G.t - (G.landT || -9) < 0.35) return;
  const a = G.road.at(G.dist); if (a.curv * G.fwd * G.fwd >= -T.hill.g * T.hill.k) return;
  takeoff(Math.max(-60, G.fwd * a.slope), true); sfx.launch(); hap([10, 20]);
}
function airStep(dt) {
  G.hang += dt; G.fvz -= T.hill.g * dt; G.fz += G.fvz * dt;
  const terr = G.road.at(G.dist).elev, h = G.fz - terr;
  // down on the road: falling onto it, or a slope that rose into the car faster than it was climbing (after the first 0.08 s, which is take-off)
  if ((h <= 0 && (G.fvz <= 0 || G.hang > 0.08)) || G.hang > T.hill.maxAir) { G.fz = terr; land(); return; }
  const hh = Math.max(0, h); G.jumpZ = hh * CM / 3.5; G.air = Math.max(0.001, (G.fvz + Math.sqrt(G.fvz * G.fvz + 2 * T.hill.g * hh)) / T.hill.g);
}
// A landing is never a crash: the suspension takes it (squash and a nose dip, scaled by the time in the air), sparks fly from the floor pan, a long
// jump bounces once; airtime pays by the second and charges BOOST. Landing on a car still crushes it (Stop 3).
export function land() {
  const hang = G.hang, k = clamp(hang / 1.0, 0.15, 1), soft = G.crestAir; G.landT = G.t;
  G.jumpZ = 0; G.air = 0; G.fvz = 0; G.crestAir = false; G.sq = Math.min(G.sq, 1 - 0.14 * k); G.body.pitchV -= 70 * k; G.body.rollV += (G.rng() * 2 - 1) * 30 * k;
  sfx.land(); hap(soft ? 15 + 25 * k : 35); kickShake(0, 2 + 5 * k, 0.12 + 0.25 * k); G.fx.push({ x: G.x, y: G.dist, t: 0, life: 0.4, ring: true }); G.fx.push({ x: G.x, y: G.dist, t: 0, life: 0.4, thud: true, k });
  spark(G.x - 12, G.dist, Math.round(3 + 9 * k)); spark(G.x + 12, G.dist, Math.round(3 + 9 * k));
  let stomped = false, clean = true, bounced = false;
  for (const c of G.cars) { if (!c.alive || c.wrecked) continue; if (Math.abs(c.x - G.x) < c.w / 2 + 10 && Math.abs(c.y - G.dist) < c.l / 2 + 20) { if (c.kind === 'civ') { c.penalised = true; G.civHits++; addScore(T.score.civilian, c.x, c.y, true, 'CIVILIAN'); G.combo = 0; sfx.horn(); clean = false; c.crush = 1; civCrash(c, { vx: G.vx * 0.5, vs: G.speed * 0.6, vy: 0 }, T.crash.civCrash + 1); bounced = true; } else if (c.kind === 'truck') { clean = false; } else { wreck(c, 'stomp', true); G.stomps++; stomped = true; bounced = true; } } }
  if (bounced) { takeoff(150, true); G.hop = true; G.sq = 0.8; kickShake(0, 7, 0.6); sfx.crunch(true); hap([40, 20, 60]); }
  else if (!G.hop && hang >= T.hill.hopAt) { takeoff(70, true); G.hop = true; }   // one bounce, then it settles
  if (hang >= T.hill.airMin) {
    G.airs++; G.airBest = Math.max(G.airBest, hang); fillBoost(T.boost.air * clamp(hang / 1.0, 0.4, 1)); addScore(Math.round(T.hill.airScore * hang), G.x, G.dist + 40, false, 'AIR ' + hang.toFixed(1) + 's');
    if (!stomped && clean && Math.abs(G.vx) < 150) { G.boost = Math.max(G.boost, T.score.clean); G.speedLines = 0.6; addScore(T.score.clean, G.x, G.dist, false, 'CLEAN'); say('Clean!', '', 600); } }
  event();
}
// ---- Stop 5: BOOST ----
export function fillBoost(a) { G.bst = Math.min(1, G.bst + a); }
export function tryBoost() {
  if (!G.playing || G.bstT > 0 || G.bst < T.boost.min || G.limp || G.burnout > 0 || G.wallT > 0) return false;
  G.bstDur = T.boost.dur * G.bst; G.bstT = G.bstDur; G.bst = 0; G.boosts++; G.punch = 0.3; G.speedLines = Math.max(G.speedLines, G.bstDur); G.sq = Math.min(G.sq, 0.9); G.body.pitchV += 40;
  kickShake(0, 7, 0.45); sfx.boost(); hap([20, 20, 60]); say('Boost', '', 500); event(); return true;
}
// ---- Stop 5: shock mines ----
export function dropMine() {
  if (!G.playing || G.mineAmmo <= 0 || G.burnout > 0) return false;
  G.mineAmmo--; G.minesDropped++; G.mines.push({ x: G.x, y: G.dist - 70, t: 0, dead: false }); sfx.mine(); hap(15); G.sq = Math.min(G.sq, 0.96); emit({ k: 'mines' }); return true;
}
function mineStep(dt, live) {
  const M5 = T.mine;
  for (const m of G.mines) { m.t += dt; if (m.dead || m.t < M5.arm) continue;
    for (const c of live) { if (!c.alive || c.wrecked || c.kind === 'civ' || c.kind === 'truck' || c.kind === 'armored') continue; if (Math.abs(c.x - m.x) < c.w / 2 + M5.r && Math.abs(c.y - m.y) < c.l / 2 + M5.ry) { mineHit(m, c, live); break; } } }
  compact(G.mines, m => !m.dead && m.y > G.dist - 1400 && m.y < G.dist + 1500);
}
// the pursuer that trips it is thrown up and tumbles (a takedown with the player's credit); anything near it is shocked and spins out into the wreck
function mineHit(m, c, live) {
  m.dead = true; G.mineHits++; const side = Math.sign(c.x - m.x) || (G.rng() < 0.5 ? -1 : 1);
  G.fx.push({ x: m.x, y: m.y, t: 0, life: 0.6, shock: true, big: false }); spark(m.x, m.y, 18); sfx.shock(); kickShake(0, 3, 0.35); hap(30);
  c.vx = side * 180; creditCar(c, 'mine'); wreck(c, 'mine', true); G.mineWrecks++;
  for (const o of live) { if (o === c || !o.alive || o.wrecked || o.kind === 'civ' || o.kind === 'truck' || o.kind === 'armored') continue; const dx = o.x - m.x, dy = o.y - m.y; if (Math.abs(dx) < T.mine.shock && Math.abs(dy) < T.mine.shock * 1.6) { o.spinOut = T.mine.stun; o.vx = -(Math.sign(dx) || 1) * 260; o.shunted = true; creditCar(o, 'mine'); } }   // the shock throws the neighbours in toward the tumbling wreck
}
export function truckLoad(tr) { if (tr.gives === 'armor') { G.armor = Math.min(T.armor, G.armor + 1); say('Armor +1', 'the only place it comes from', 1200); } else giveSpecial(tr.gives); G.slowmo = 0.8; G.slowmoRate = 0.3; sfx.chime(); hap([20, 40, 60]); addScore(T.score.truckLoad, tr.x, tr.y - 40, false, 'LOADED'); event(); }
export const SPECIALS = { missiles: { ammo: T.missiles, name: 'Homing missiles' }, oil: { ammo: T.oil, name: 'Oil slick' }, nitro: { ammo: T.nitro, name: 'Nitro' } };
export function giveSpecial(kind) { if (G.special && G.special.kind === kind) { G.special.level = Math.min(3, G.special.level + 1); G.special.ammo = Math.min(9, G.special.ammo + SPECIALS[kind].ammo + 1); say(SPECIALS[kind].name + ' level ' + G.special.level, '', 1200); } else { G.special = { kind, ammo: SPECIALS[kind].ammo, level: 1 }; say(SPECIALS[kind].name, 'tap the button', 1500); } emit({ k: 'special', armed: true, show: true }); }
export function pickup(kind, x, y) {
  sfx.chime(); hap([15, 30, 40]); G.slowmo = Math.max(G.slowmo, 0.15); G.slowmoRate = 0.5; G.fx.push({ x, y, t: 0, life: 0.4, burst: true }); event();
  if (kind === 'crate') { addScore(T.score.crate, x, y, false, 'CRATE'); G.mineAmmo = Math.min(T.mine.max, G.mineAmmo + 1); emit({ k: 'mines' }); }
  if (kind === 'repair') { G.armor = T.limp.armorBack; G.limp = false; G.damageAcc = 0; G.repaired++; G.smoke = 0; G.invuln = Math.max(G.invuln, 1.5); G.turbo = 220; G.turboT = 0.8; G.pops.push({ x, y, text: 'REPAIRED', t: 0, big: true }); say('Repaired', '', 900); emit({ k: 'limp', on: false }); }
  if (kind === 'armor') { G.armor = Math.min(T.armor, G.armor + 1); G.pops.push({ x, y, text: 'ARMOR +1', t: 0, big: true }); say('Armor +1', '', 900); }
  if (kind === 'ammo') { G.mineAmmo = Math.min(T.mine.max, G.mineAmmo + T.mine.crate); emit({ k: 'mines' }); if (!G.special) giveSpecial('missiles'); else { G.special.ammo = Math.min(9, G.special.ammo + 3); G.pops.push({ x, y, text: 'MISSILES +3', t: 0, big: true }); emit({ k: 'special', armed: true }); } }
  if (kind === 'oil') giveSpecial('oil'); if (kind === 'nitroPick') giveSpecial('nitro');
}
export function fireSpecial() {
  if (!G || !G.special || G.special.ammo <= 0 || !G.playing) return;
  G.special.ammo--; const lvl = G.special.level;
  if (G.special.kind === 'missiles') { const dir = 1; G.missiles.push({ x: G.x, y: G.dist + 30 * dir, t: 0, dir }); if (lvl >= 2) G.missiles.push({ x: G.x + 14, y: G.dist + 20 * dir, t: -0.1, dir }); sfx.missile(); hap(20); }
  if (G.special.kind === 'oil') { G.slicks.push({ x: G.x, y: G.dist - 60, t: 6, r: lvl >= 2 ? 36 : 26 }); sfx.ping(false); hap(15); }
  if (G.special.kind === 'nitro') { G.nitro = lvl >= 2 ? 2.0 : 1.5; G.speedLines = G.nitro; G.invuln = Math.max(G.invuln, 0.3); sfx.nitro(); hap([20, 20, 60]); say('Nitro', '', 500); }
  emit({ k: 'special', armed: false });
}
// the city: the run ends here. A bonus for arriving (and for the armor still on the car), then the stars by score.
export function win() {
  G.won = true; G.winT = 0; G.slowmo = 0.9; G.slowmoRate = 0.4; sfx.win(); hap([40, 30, 80, 30, 120]); G.killFlash = 0.3;
  const bonus = T.goal.bonus + T.goal.bonusArmor * G.armor; G.score += bonus; G.pops.push({ x: G.x, y: G.dist + 80, text: '+' + fmt(bonus) + ' CITY', t: 0, big: true });
  grade(); G.armorLeft = G.armor; emit({ k: 'won' });
}
// Stop 5: time, score, takedowns, pile-ups and the best combo, each turned into 0..1 (T.goal), weighted into the rating, which gives the letter; the stars (1, 2 or 3) have
// their own thresholds on the same rating
export function grade() {
  const Gl = T.goal, W = Gl.weights; const tk = clamp((Gl.time.slow - G.t) / (Gl.time.slow - Gl.time.fast), 0, 1), sk = clamp(G.score / Gl.scoreRef, 0, 1), kk = clamp(G.kills / Gl.killRef, 0, 1), pk = clamp(G.pileups / Gl.pileRef, 0, 1), ck = clamp(G.comboPeak / Gl.comboRef, 0, 1);
  G.rating = W.time * tk + W.score * sk + W.kills * kk + W.pile * pk + W.combo * ck; G.timeScore = tk; G.scoreScore = sk; G.gradeParts = [tk, sk, kk, pk, ck];
  for (const [min, L] of Gl.letters) if (G.rating >= min) { G.grade = L; break; }
  G.stars = G.rating >= Gl.stars[1] ? 3 : G.rating >= Gl.stars[0] ? 2 : 1;
}
export function die() {
  G.dead = true; G.deathT = 0; G.slowmo = 1.2; G.slowmoRate = 0.25; sfx.death(); hap([80, 40, 80, 40, 120]); kickShake(0, 0, 1.0); G.fx.push({ x: G.x, y: G.dist, t: 0, life: 1.2, big: true, player: true });
  G.killedBy = G.cause || 'Wrecked'; G.queue.length = 0; emit({ k: 'died' });
}
// ---------------- crash physics hits (Stop 3) ----------------
// crash.js reports every first contact of a tumbling wreck; the sim decides what it means. Speeds are m/s (impactSpeed).
setCrashHandler((c, o) => G.crashHits.push(c, o));
export function crashHit(c, o) {
  if (!c.alive) return; const C = T.crash; const v = impactSpeed(c, o);
  if (o.type === 'ground') { if ((c.vy || 0) < -5 && c.hitCd <= 0) { c.hitCd = 0.2; spark(c.x, c.y, 4); G.fx.push({ x: c.x, y: c.y, t: 0, life: 0.4, thud: true, k: Math.min(1, -c.vy / 14) }); if (Math.abs(c.y - G.dist) < 900) sfx.land(); } return; }
  if (o.type === 'wreck') { if (v > C.wallFx && c.hitCd <= 0) { c.hitCd = 0.25; spark((c.x + o.car.x) / 2, (c.y + o.car.y) / 2, 6); if (Math.abs(c.y - G.dist) < 900) sfx.crunch(false); } return; }
  if (o.type === 'rail' || o.type === 'wall') {
    if (v < C.wallFx || c.hitCd > 0) return; c.hitCd = 0.3; const wall = o.type === 'wall';
    // a wreck slamming into a building: sparks, glass, parts off the car (the renderer reads the fx); into the rail: sparks
    G.fx.push({ x: c.x, y: c.y, t: 0, life: 1.2, slam: true, side: o.side, glass: wall && v > C.wallFx + 3, parts: v > C.wallFx + 5 ? (v > 18 ? 3 : 2) : 0, k: Math.min(1, v / 25), h: c.h || 1 });
    spark(c.x + o.side * 10, c.y, wall ? 14 : 8); if (Math.abs(c.y - G.dist) < 1000) { sfx.crunch(true); if (wall && v > 12) kickShake(0, 0, 0.25); } if (wall) G.wallSlams++;
    return;
  }
  if (o.type === 'hero') {
    if (v < C.heroHit || c.hitCd > 0 || !G.playing || G.air > 0) return;   // Stop 5: a car in the air is above it c.hitCd = 0.35;
    const s = Math.sign(G.x - c.x) || 1; const w = wreckVelocity(c); const side = Math.max(0, w.vx * s) * CM;   // how fast the wreck itself is flying sideways at the car (the car steering into it does not count)
    spark((G.x + c.x) / 2, (G.dist + c.y) / 2, 10); sfx.crunch(true); hap(30); kickShake(s * 5, 2, 0.4); G.sq = Math.min(G.sq, 0.92);
    G.boost = Math.min(G.boost, -Math.min(140, v * 5)); G.slideVx += s * Math.min(240, side * 14);
    // the car bashes through: the wreck is thrown aside and up off the bumper
    if (c.rb) { const lv = c.rb.linvel(); c.rb.setLinvel({ x: lv.x - s * (5 + G.speed * CM * 0.08), y: Math.max(lv.y, 3.5), z: lv.z }, true); const av = c.rb.angvel(); c.rb.setAngvel({ x: av.x - 3, y: av.y + s * 2, z: av.z + s * 5 }, true); }
    if (side > C.heroRoll || ((c.vy || 0) < -9 && (c.h || 0) > 1.6)) heroRoll(s, 'Hit by a wreck'); else if (G.combo > 0) G.comboT = Math.min(T.combo.hold, G.comboT + 0.3);
    return;
  }
  if (o.type === 'car') {
    const d = o.car; if (!d.alive || d.wrecked) return; const s = Math.sign(d.x - c.x) || 1; const w = wreckVelocity(c);
    if (d.kind === 'truck') return;
    if (d.kind === 'civ') { if (v > C.civCrash) civCrash(d, w, v); else { d.vx += s * Math.min(220, v * 20); d.honk = 0.5; } return; }
    if (d.kind === 'armored') { if (v > C.pileUp * 2.2) { d.hp -= 6; d.hitFlash = 0.1; } return; }   // a Bulwark shrugs off most of it
    if (v > C.pileUp) { d.vx = w.vx * 0.6 + s * 120; d.speed = Math.max(d.speed * 0.6, w.vs * 0.7); G.pileups++; d.viaCiv = c.kind === 'civ'; wreck(d, 'pileup', c.credit); }
    else { d.vx += s * Math.min(260, v * 26); d.hitFlash = 0.08; }
  }
}
// Stop 4: the hero hits a civilian and it is catastrophic: the car is launched up and ahead, tumbling, and flies into whatever is in front. The wreck
// carries the player's credit, so a civilian thrown into an enemy is a takedown (a pile-up with a bonus). The hit still costs the civilian penalty
// (and a little speed) but no longer drops the combo: the carnage is the point.
export function civLaunch(c, s, side) {
  if (!c.penalised) { c.penalised = true; G.civHits++; G.driftDirty = true; addScore(T.score.civilian, c.x, c.y, true, 'CIVILIAN'); sfx.horn(); hap([15, 40, 15]); }
  if (c.wrecked || !c.alive) return; const C = T.crash;
  const rel = Math.max(8, (G.speed - c.speed) * CM + (side ? 6 : 0));   // m/s the hero closes at (a side swipe counts a little extra)
  c.wrecked = true; c.civCrash = true; c.debrisT = 2.5; c.honk = 0.8; c.boom = rel > 20; creditCar(c, 'launch');
  c.vx = (side ? s * 220 : s * 60); c.speed = Math.max(c.speed, G.speed * 0.9);
  const k = { vy: 8 + G.rng() * 4 + Math.min(4, rel * 0.08), vx: s * (side ? 9 + G.rng() * 6 : 3 + G.rng() * 6), vz: -Math.max(0, G.speed * 1.08 - c.speed) * CM };
  if (!crashLaunch(c, 'launch', k)) { c.spinV = 8; c.flip = 0; }
  G.civCrashes++; G.launches = (G.launches || 0) + 1; addMark(c.x, c.y, 3, true); G.boost = Math.min(G.boost, -60); G.sq = Math.min(G.sq, 0.9); kickShake(-s * 6, 3, 0.6); G.hitStop = Math.max(G.hitStop, 0.04); event();
  if (c.boom) { G.fx.push({ x: c.x, y: c.y, t: 0, life: 0.6, big: true }); sfx.wreck(); }
}
// a civilian knocked hard: it spins out and skids, sometimes rolls, smokes; only a heavy hit makes it explode
export function civCrash(d, w, v) {
  if (d.wrecked || !d.alive) return; const C = T.crash;
  d.wrecked = true; d.civCrash = true; d.debrisT = 2.5; d.boom = v > C.civBoom; d.penalised = true; d.honk = 0.8; d.vx = (d.vx || 0) + w.vx * 0.5; d.speed = Math.max(d.speed * 0.8, w.vs * 0.5);
  if (!crashLaunch(d, d.boom ? 'pileup' : 'spin', { roll: v > C.civRoll || G.rng() < 0.25, vy: d.boom ? 5 : 0 })) { d.spinV = 6; d.flip = 0; }
  G.civCrashes++; addMark(d.x, d.y, 3, true); if (d.boom) { G.fx.push({ x: d.x, y: d.y, t: 0, life: 0.6, big: true }); sfx.wreck(); }
}
// the hero rollover: a big hit throws the car once round its long axis; it takes the damage and lands on its wheels
export function heroRoll(dir, cause) {
  if (G.roll || G.air > 0 || !G.playing || G.burnout > 0 || G.invuln > 0.3) return false;
  G.roll = { t: 0, dir, lift: 0, a: 0 }; G.rolls++; if (G.wreckLog) G.wreckLog.push(G.t.toFixed(1) + ' ROLL ' + cause); G.invuln = 0; damage(T.roll.damage, null, cause); G.invuln = Math.max(G.invuln, T.roll.dur + 0.3);
  if (G.drifting) endDrift(false); G.slideVx += dir * 220; sfx.crunch(true); sfx.launch(); hap([60, 30, 90]); kickShake(dir * 10, 4, 0.9); G.hitStop = Math.max(G.hitStop, 0.05); say('Rolled', '', 700); event();
  return true;
}
export function rollStep(dt) {
  const R = G.roll; if (!R) return; R.t += dt; const k = Math.min(1, R.t / T.roll.dur);
  R.a = R.dir * Math.PI * 2 * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);   // ease in and out: one full turn
  R.lift = Math.sin(k * Math.PI) * T.roll.lift;
  if (k >= 1) { G.roll = null; G.sq = 0.84; spark(G.x - 14, G.dist, 8); spark(G.x + 14, G.dist, 8); sfx.land(); hap(40); kickShake(0, 5, 0.5); G.fx.push({ x: G.x, y: G.dist, t: 0, life: 0.4, thud: true, k: 1 }); }
}
// the hero's body: roll with the lateral load, squat and dive with the speed change, and the two-wheel moment in a hard turn
export function suspStep(dt, latA, lonA) {
  const P = T.susp, B = G.body; const grip = T.drive.grip;
  const rollT = Math.max(-P.rollMax, Math.min(P.rollMax, latA * P.rollK)), pitchT = Math.max(-P.pitchMax, Math.min(P.pitchMax, -lonA * P.pitchK));
  B.rollV += ((rollT - B.roll) * P.k - B.rollV * P.damp) * dt; B.roll += B.rollV * dt;
  B.pitchV += ((pitchT - B.pitch) * P.k - B.pitchV * P.damp) * dt; B.pitch += B.pitchV * dt;
  // two wheels: a hard turn in grip (not a drift, on the ground, at speed) lifts the inside wheels; when the load eases they slam back down
  const load = Math.abs(latA) / grip; const can = !G.drifting && G.air <= 0 && !G.roll && G.speed > 560 && G.playing;
  if (can && load > P.twoAt) { B.twoT += dt; if (B.twoT > P.twoFor && !B.two) { B.two = true; B.twoDir = -Math.sign(latA) || 1; B.twoHeld = 0; G.twoWheels++; sfx.tone('sawtooth', 140, 70, 0.25, 0.05); hap(12); } } else B.twoT = 0;
  if (B.two) { B.twoHeld += dt; const want = can && (load > P.twoAt * 0.7 || B.twoHeld < P.twoHold) ? P.twoMax * Math.min(1, 0.45 + load) : 0;
    B.tilt += (want - B.tilt) * Math.min(1, dt * (want > B.tilt ? 9 : 14));
    if (want === 0 && B.tilt < 1.5) { B.two = false; B.tilt = 0; G.sq = Math.min(G.sq, 0.88); spark(G.x + B.twoDir * 14, G.dist - 10, 6); spark(G.x + B.twoDir * 14, G.dist + 18, 6); sfx.land(); hap([20, 20, 30]); kickShake(0, 3, 0.3); G.fx.push({ x: G.x, y: G.dist, t: 0, life: 0.3, thud: true, k: 0.6 }); } }
  else B.tilt *= Math.exp(-dt * 12);
}
