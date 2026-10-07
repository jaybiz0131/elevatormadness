// Drives the gray-box in headless Chromium and logs the audit's metrics:
// wrecks per minute with and without input, accidental Slams per minute, time with 2+ cars
// on screen, longest quiet gap, armor lost per minute, cause of death, slams landed.
//
//   node playtest.mjs <outDir> <seconds> [mode]
//   mode: active  (default) rams enemies, Slams in the Bruiser hold/tell window, takes ramps and trucks, fires specials
//         passive  holds the lane with a thumb down, never Slams: checks that damage and death work
//         idle     never touches the screen after the run starts: the "game plays itself" test (gate: < 5 wrecks/min)
//         novice   a weak driver: no gas, holds FIRE all the time, aims late, brakes late for corners, never Slams or drifts
//         casual   steers at the nearest enemy, holds GAS when the lane is clear, holds FIRE when an enemy is ahead, never drifts or Slams, thumb limited to 220 pt/s
//         sweep    makes ordinary fast lane changes with real pointer events at 450, 600 and 900 pt/s and counts
//                  the flicks the detector sees and the Slams that fire (gate: < 1 accidental Slam per 10 min)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PACE } from './pace.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'out');
const seconds = parseFloat(process.argv[3] || '120');
const mode = process.argv[4] || 'active';
// --seed=N fixes the run seed; --record=path writes the per-step input replay and state hashes when the run ends
const opt = Object.fromEntries(process.argv.slice(5).filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('=', 2); const k = i < 0 ? a.slice(2) : a.slice(2, i), v = i < 0 ? undefined : a.slice(i + 1); return [k, v === undefined ? true : v]; }));
const pageUrl = opt.page ? ((opt.page.startsWith('http') ? '' : 'file://') + path.resolve(opt.page)) : 'file://' + path.join(here, '..', 'dist', 'shunt.html');
const seed = opt.seed !== undefined ? Number(opt.seed) : null;
const shots = !opt.noshots;   // --noshots: screenshots wait for web fonts, which can block for seconds behind a proxy
// software GL only for the three.js build: canvas pages run far lighter without it
const browser = await chromium.launch(/r=canvas/.test(opt.query || '') ? {} : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// bots run the lite renderer (half resolution, no shadows or post) unless --full: the sim must run at pace on software GL
const lite = !opt.full && !/r=canvas/.test(opt.query || ''); if (lite) opt.query = (opt.query ? opt.query + '&' : '') + 'lite=1';
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: lite ? 1 : 2, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|net::/.test(m.text())) errors.push('console: ' + m.text()); });
await page.addInitScript(() => { if (new URLSearchParams(location.search).get('fine')) globalThis.__fineHash = true; });
await page.addInitScript(PACE);
await page.goto(pageUrl + '?' + [seed !== null ? 'seed=' + seed : '', opt.query || ''].filter(Boolean).join('&'));   // --query=r=canvas&wall=1 adds page options
await page.waitForTimeout(600);
if (shots) try { await page.screenshot({ path: path.join(out, 'shunt-title.png'), timeout: 10000 }); } catch (e) { console.log('title screenshot skipped'); }
await page.evaluate(({ rec, mode }) => { window.__shunt.startPlaying(); window.__shunt.G.wreckLog = []; if (rec) window.__shunt.record(mode); }, { rec: !!opt.record, mode });
let samples = 0, twoPlus = 0, maxGap = 0, sweepN = 0, sweepSlamsBefore = 0;
const t0 = Date.now();
let sweepTimer = 0, pointerDown = false, driftTimer = 0, cornerShot = false;
const SPEEDS = [450, 600, 750, 900], bySpeed = {}; for (const sp of SPEEDS) bySpeed[sp] = { n: 0, flicks: 0, slams: 0 };
async function sweep(speed, distance) {
  // one lane change: the thumb starts still, moves `distance` stage points at `speed` pt/s on the wall clock, then rests
  if (!pointerDown) { await page.mouse.move(195, 700); await page.mouse.down(); pointerDown = true; }
  const before = await page.evaluate(() => ({ cur: window.__shunt.input.cur || { x: 195, y: 700 }, flicks: window.__shunt.G.flicks, slams: window.__shunt.G.slams }));
  const cur = before.cur; const dir = cur.x > 195 ? -1 : 1; const start = Date.now();
  for (;;) { const d = Math.min(distance, speed * (Date.now() - start) / 1000); await page.mouse.move(cur.x + dir * d, 700); if (d >= distance) break; await page.waitForTimeout(8); }
  const after = await page.evaluate(() => ({ flicks: window.__shunt.G.flicks, slams: window.__shunt.G.slams }));
  const b = bySpeed[speed]; b.n++; b.flicks += after.flicks - before.flicks; b.slams += after.slams - before.slams;
  sweepN++;
}
let paceT = Date.now();
for (let i = 0; i < seconds * 10; i++) {
  if (opt.pace && i < 25) { const now = Date.now(); console.log('tick', i, 'wall ms', now - paceT); paceT = now; }
  const s = await page.evaluate((mode) => {
    const g = window.__shunt.G; const near = g.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'truck' && c.y > g.dist - 300 && c.y < g.dist + 900);
    const enemies = near.filter(c => c.kind !== 'civ' && c.kind !== 'armored').sort((a, b) => Math.abs(a.y - g.dist) - Math.abs(b.y - g.dist));
    const civs = near.filter(c => c.kind === 'civ' && c.y > g.dist - 30 && c.y < g.dist + 260);
    const road = g.road.at(g.dist); const center = road.center, width = road.width; let want = center, slam = 0;
    const e = enemies[0];
    if (e) { if (Math.abs(e.y - g.dist) < 80 && Math.abs(e.x - g.x) < 100 && Math.abs(e.x - g.x) > 30 && g.slamCd <= 0 && (e.state === 'hold' || e.state === 'tell' || e.kind !== 'bruiser')) slam = Math.sign(e.x - g.x); want = e.y > g.dist + 60 ? e.x : g.x + Math.sign(e.x - g.x || 1) * -40; }
    // traffic: if a civilian blocks the wanted spot within 450 pt, take the nearest lane that is open over that stretch (weave lines leave one gap)
    { const blockers = g.cars.filter(c => c.alive && !c.wrecked && (c.kind === 'civ' || c.kind === 'armored') && c.y > g.dist + 10 && c.y < g.dist + 450); const nl = g.road.laneCount(g.dist + 250); const wide = (c) => c.kind === 'armored' ? 86 : 46;
      if (blockers.some(c => Math.abs(c.x - want) < wide(c))) { let best = null; for (let i = 0; i < nl; i++) { const lx = g.road.laneX(g.dist + 250, i); if (blockers.some(c => Math.abs(c.x - lx) < wide(c))) continue; if (best === null || Math.abs(lx - g.x) < Math.abs(best - g.x)) best = lx; } if (best !== null) want = best; else for (const c of civs) if (Math.abs(c.x - want) < 40) want = c.x + (c.x < center ? 70 : -70); } }
    const truck = g.cars.find(c => c.kind === 'truck' && !c.loaded && c.y > g.dist); if (truck && truck.y - g.dist < 600) want = truck.x;
    const ramp = g.ramps.find(r => !r.used && r.y > g.dist); if (ramp && ramp.y - g.dist < 450) want = ramp.x;
    const barrier = g.barriers.find(b => !b.hit && b.y > g.dist && b.y - g.dist < 400); if (barrier && !ramp) want = center - width / 2 + 30;
    // drift plan: an enemy beside or just ahead at speed → hold the pad and steer into it for a drift slam; a civ dead ahead → brake
    let drift = 0, brake = false; if (e && g.speed > 500 && Math.abs(e.y - g.dist) < 140 && Math.abs(e.x - g.x) > 30 && Math.abs(e.x - g.x) < 130 && !g.drifting) drift = Math.sign(e.x - g.x);
    if (g.drifting) drift = g.driftDir; if (g.drifting && g.driftT > 1.8) drift = 0;
    const ahead = civs.find(c => Math.abs(c.x - g.x) < 30 && c.y - g.dist > 40 && c.y - g.dist < 90); if (ahead && !g.drifting && g.speed > 400) brake = true;
    // corners: a hard corner ahead and too fast for grip → brake, then drift through it toward the inside
    const cn = g.road.cornerAhead(g.dist, 2.2 * g.speed); if (cn && cn.hard) { const inCorner = g.dist >= cn.s0 - 60 && g.dist <= cn.s1; if (inCorner) { const w = g.road.at(g.dist).width; want = 195 + cn.dir * (w / 2 - 40); if (g.speed > cn.vmax * 0.9 && !g.drifting && !drift) drift = cn.dir; else if (g.drifting) drift = g.driftDir; } }
    if (cn && cn.hard && g.dist > cn.s0 - 140 && g.dist < cn.apex + 40) brake = true;   // Stop 4: the brake-tap drift, held from just before the turn-in to the apex
    
    if (mode === 'novice' && Math.floor(g.t * 10) % 2 === 0) { const lunge = g.cars.find(c => c.alive && (c.state === 'tell') && Math.abs(c.y - g.dist) < 110 && Math.abs(c.x - g.x) < 120); if (lunge) want = g.x + (lunge.x > g.x ? -80 : 80); }   // a weak driver sometimes sees the flash and moves
    if (mode === 'novice' || mode === 'casual') { slam = 0; drift = 0; brake = !!(cn && cn.hard && g.speed > cn.vmax * 1.05 && cn.s0 - g.dist < 1.3 * g.speed && g.dist < cn.s1); }   // a weak driver: no Slam, no drift, late braking
    // gas: a clear lane ahead and no hard corner coming; fire: a live enemy within the gun's reach and roughly ahead
    const clearAhead = !civs.some(c => Math.abs(c.x - g.x) < 40 && c.y - g.dist > 0 && c.y - g.dist < 320) && !(cn && cn.hard && g.dist > cn.s0 - 2.2 * g.speed && g.dist < cn.s1); const gas = (mode === 'active' || mode === 'casual') && clearAhead && !brake && !drift;
    const fire = (mode === 'novice') || (mode === 'active' || mode === 'casual') && g.cars.some(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && c.y > g.dist - 40 && c.y < g.dist + 800 && Math.abs(c.x - g.x) < 160);   // the gatling has no aim help and a one second spin-up: the bot holds FIRE while any enemy is about, and steers into its lane
    return { phase: window.__shunt.phase, t: g.t, x: g.x, want, slam, drift, brake, gas, fire, speed: g.speed, drifting: g.drifting, tier: g.driftTier, score: g.score, armor: g.armor, armorLost: g.armorLost, kills: g.kills, passive: g.passiveWrecks, carKills: g.carKills, gunKills: g.gunKills, slams: g.slams, flicks: g.flicks, misses: g.flickMisses, special: g.special, lastEvent: g.lastEvent, near: near.length, cause: g.killedBy, gun: g.gun, wave: g.wave };
  }, mode);
  if (s.phase === 'won' || s.phase === 'victory') { console.log('CITY REACHED at', s.t.toFixed(1), 's: score', s.score, 'kills', s.kills, 'armor', s.armor); break; }
  if (s.phase === 'over' || (opt.sync && s.phase === 'dying')) { console.log('DIED at', s.t.toFixed(1), 's:', s.cause, '| score', s.score, 'kills', s.kills, 'slams', s.slams); await page.waitForTimeout(900); if (shots) try { await page.screenshot({ path: path.join(out, 'shunt-over.png'), timeout: 10000 }); } catch (e) {} break; }
  if (s.phase === 'playing') { samples++; if (s.near >= 2) twoPlus++; if (s.t > 3 && s.t - s.lastEvent > maxGap) maxGap = s.t - s.lastEvent; }
  if (mode === 'sweep') { sweepTimer += 0.1; if (sweepTimer >= 1.5) { sweepTimer = 0; const speed = SPEEDS[sweepN % SPEEDS.length]; await sweep(speed, 62 + 62 * (Math.floor(sweepN / SPEEDS.length) % 2)); } }
  else if (mode === 'drift') { driftTimer += 0.1; await page.evaluate(({ phaseT }) => { const inp = window.__shunt.input; const g = window.__shunt.G; if (inp.id === null) inp.down(1, 200, 700, performance.now()); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center; const dir = Math.floor(phaseT / 4) % 2 ? -1 : 1; const k = phaseT % 4; if (k < 2.2 && g.speed > 400) { inp.brake = true; inp.cur = { x: 200 + dir * 60, y: 700 }; } else { inp.brake = false; inp.cur = { x: 200, y: 700 }; } }, { phaseT: driftTimer }); }
  else if (mode !== 'idle') await page.evaluate(({ want, slam, drift, brake, gas, fire, mode }) => { const inp = window.__shunt.input; const g = window.__shunt.G; if (inp.id === null) inp.down(1, 200, 700, performance.now()); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center; inp.gas = !!gas; inp.fireHeld = !!fire; if (mode === 'passive') { inp.cur = { x: 200, y: 700 }; inp.brake = false; inp.gas = false; inp.fireHeld = false; return; } if (drift) { inp.brake = !g.drifting; inp.cur = { x: 200 + drift * 60, y: 700 }; return; }   /* a brake TAP starts the drift; steering holds it */ inp.brake = brake; let dx = Math.max(-70, Math.min(70, (want - g.targetX) / 1.4)); if (mode === 'casual') { const last = window.__co || 0; dx = last + Math.max(-22, Math.min(22, dx - last)); window.__co = dx; }   /* casual: the thumb moves at most 220 pt/s (22 pt per 0.1 s tick) */ inp.cur = { x: 200 + dx, y: 700 }; if (slam) window.__shunt.trySlam(slam); if (g.special && g.special.ammo > 0 && (g.special.kind !== 'missiles' || g.cars.some(c => c.alive && !c.wrecked && (c.kind === 'armored' || c.kind === 'bruiser') && c.y > g.dist))) window.__shunt.fireSpecial(); }, { want: s.want, slam: s.slam, drift: s.drift, brake: s.brake, gas: s.gas, fire: s.fire, mode });
  // Stop 5 abilities: the skilled bot boosts on free straights, drops a mine for a pursuer close behind; the casual bot only boosts (late); the weak bot uses none
  // driver control: the throttle (and the skilled bot's e-brake drift) for every bot that drives
  if (mode !== 'idle' && mode !== 'sweep' && s.phase === 'playing') await page.evaluate((mode) => window.__pace(window.__shunt.G, window.__shunt.input, mode === 'active' ? 'skilled' : mode === 'casual' ? 'casual' : 'weak'), mode);
  if ((mode === 'active' || mode === 'casual') && s.phase === 'playing') await page.evaluate((mode) => { const sh = window.__shunt, g = sh.G, inp = sh.input; const cn5 = g.road.cornerAhead(g.dist, 900);
    if (g.bst >= (mode === 'active' ? 0.85 : 0.99) && !cn5 && g.bstT <= 0 && g.air <= 0) inp.boostReq = true;
    if (mode !== 'active') return;
    const behind = g.cars.filter(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser' || c.kind === 'gunner') && c.y < g.dist - 40 && c.y > g.dist - 520).sort((a, b) => b.y - a.y)[0];
    if (behind && g.mineAmmo > 0 && g.t - (window.__lm || -9) > 2.5 && behind.y > g.dist - 380 && Math.abs(behind.x - g.x) < 60) { inp.mineReq = true; window.__lm = g.t; } }, mode);
  // --sync: step the sim 0.1 s synchronously per tick instead of waiting on the frame clock (the frame loop stops simulating
  // after the first runSteps), so bots run at sim pace whatever the renderer costs; recordings are then paced in sim time
  if (opt.sync) { await page.evaluate(() => window.__shunt.runSteps(12)); await page.waitForTimeout(1); } else await page.waitForTimeout(100);
  if (shots && i % 300 === 150) try { await page.screenshot({ path: path.join(out, `shunt-${Math.round(s.t)}s.png`), timeout: 10000 }); } catch (e) {}
  if (shots && mode === 'active' && !cornerShot && s.t > 19 && s.t < 40) { const inHairpin = await page.evaluate(() => { const g = window.__shunt.G; const c = g.road.at(g.dist).corner; return !!(c && c.type === 'hairpin'); }); if (inHairpin) { cornerShot = true; await page.screenshot({ path: path.join(out, 'shunt-hairpin.png') }); } }
  if (i % 100 === 0) console.log('t', s.t.toFixed(1), 'spd', Math.round(s.speed), s.drifting ? 'DRIFT T' + s.tier : '', 'score', s.score, 'armor', s.armor, 'kills', s.kills, '(car', s.carKills, 'gun', s.gunKills, 'passive', s.passive + ')', 'slams', s.slams, 'flicks', s.flicks, 'misses', s.misses, 'special', s.special ? s.special.kind + ':' + s.special.ammo : '-', 'near', s.near, s.wave);
}
const f = await page.evaluate(() => { const g = window.__shunt.G; return { flips: g.flipDone, face: g.face, dist: Math.round(g.dist), burnouts: g.burnouts, uturns: g.uturns, pileups: g.pileups, comboPeak: g.comboPeak, airs: g.airs, boosts: g.boosts, mines: g.minesDropped, mineWrecks: g.mineWrecks, nearMisses: g.nearMisses, timeScore: g.timeScore, scoreScore: g.scoreScore, t: g.t, kills: g.kills, passive: g.passiveWrecks, carKills: g.carKills, gunKills: g.gunKills, slams: g.slams, flicks: g.flicks, misses: g.flickMisses, armorLost: g.armorLost, score: g.score, drifts: g.drifts, driftSlams: g.driftSlams, turbos: g.turbos, driftPoints: g.driftPoints, tierMax: g.driftTierMax, topSpeed: g.topSpeed, avgSpeed: g.speedSum / Math.max(1, g.speedN), limp: g.limpCount, repaired: g.repaired, speedLoss: g.speedLoss, bursts: g.killBursts, grade: g.grade, rating: g.rating, won: g.won, prog: g.prog }; });
const min = f.t / 60;
console.log('--- metrics (' + mode + ') ---');
console.log('run length:', f.t.toFixed(1), 's   score', f.score);
console.log('wrecks per minute (player caused):', (f.kills / min).toFixed(1), ' car', (f.carKills / min).toFixed(1), ' gun', (f.gunKills / min).toFixed(1), '  (idle target < 5; skilled 3x idle)');
console.log('passive wrecks per minute (no credit):', (f.passive / min).toFixed(1));
console.log('slams landed:', f.slams, ' flicks seen:', f.flicks, ' flicks with no target:', f.misses, '  (sweep target: < 1 Slam per 10 min)');
if (mode === 'sweep') { console.log('lane changes made:', sweepN, ' slams fired:', f.slams, '=> Slams per minute', (f.slams / min).toFixed(2)); for (const sp of SPEEDS) console.log('  at', sp, 'pt/s:', bySpeed[sp].n, 'changes,', bySpeed[sp].flicks, 'flicks seen,', bySpeed[sp].slams, 'slams fired'); }
console.log('limp', f.limp, 'repaired', f.repaired, 'speed lost to hits', Math.round(f.speedLoss), 'kill bursts', f.bursts, 'finish', f.won ? f.grade + ' (' + f.rating.toFixed(2) + ')' : 'no (' + (100 * f.prog).toFixed(0) + '%)');
console.log('STATS', JSON.stringify({ mode, seed, t: +f.t.toFixed(1), won: f.won, flips: f.flips, face: f.face, dist: f.dist, uturns: f.uturns, avgSpeed: Math.round(f.avgSpeed), score: f.score, kills: f.kills, pileups: f.pileups, comboPeak: f.comboPeak, nearMisses: f.nearMisses, airs: f.airs, boosts: f.boosts, mines: f.mines, mineWrecks: f.mineWrecks, armorLost: f.armorLost, grade: f.grade, rating: +f.rating.toFixed(2) }));
console.log('armor lost per minute:', (f.armorLost / min).toFixed(2));
console.log('corners:', await page.evaluate(() => window.__shunt.G.cornerLog.map(c => c.type + ' vmax ' + c.vmax + ' apex ' + c.apexSpeed + (c.drift ? ' drift' : '') + (c.scraped ? ' SCRAPED' : '')).join(' ; ')));
console.log('driving: drifts', f.drifts, ' drift slams', f.driftSlams, ' mini-turbos', f.turbos, ' best tier', f.tierMax, ' drift points', f.driftPoints, ' top speed', Math.round(f.topSpeed), ' avg speed', Math.round(f.avgSpeed));
console.log('time with 2+ cars on screen:', (100 * twoPlus / Math.max(1, samples)).toFixed(0) + '%  (target 85%+)');
console.log('longest gap with no event:', maxGap.toFixed(2), 's  (target <= 3 s)');
console.log('wreck log:', await page.evaluate(() => (window.__shunt.G.wreckLog || []).join(' ; ')));
console.log('errors', errors.length ? errors : 'none');
if (opt.record) { const fs = await import('node:fs'); const r = await page.evaluate((mode) => window.__shunt.exportReplay(mode), mode); fs.writeFileSync(opt.record, JSON.stringify(r)); console.log('replay written:', opt.record, 'steps', r.steps, 'runs', r.runs.length, 'hashes', r.hashes.length / 2, 'seed', r.seed); }
await browser.close();
