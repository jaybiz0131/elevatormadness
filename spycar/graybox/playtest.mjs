// Drives the gray-box in headless Chromium and logs the audit's metrics:
// wrecks per minute with and without input, accidental Slams per minute, time with 2+ cars
// on screen, longest quiet gap, armor lost per minute, cause of death, slams landed.
//
//   node playtest.mjs <outDir> <seconds> [mode]
//   mode: active  (default) rams enemies, Slams in the Bruiser hold/tell window, takes ramps and trucks, fires specials
//         passive  holds the lane with a thumb down, never Slams: checks that damage and death work
//         idle     never touches the screen after the run starts: the "game plays itself" test (gate: < 5 wrecks/min)
//         sweep    makes ordinary fast lane changes with real pointer events at 450, 600 and 900 pt/s and counts
//                  the flicks the detector sees and the Slams that fire (gate: < 1 accidental Slam per 10 min)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'out');
const seconds = parseFloat(process.argv[3] || '120');
const mode = process.argv[4] || 'active';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|net::/.test(m.text())) errors.push('console: ' + m.text()); });
if (process.env.LOADOUT) await page.addInitScript((l) => { try { localStorage.setItem('shunt-loadout', l); } catch (e) {} }, process.env.LOADOUT);
await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, 'shunt-title.png') });
await page.evaluate(() => { window.__shunt.startPlaying(); window.__shunt.G.wreckLog = []; });
if (process.env.START_T) await page.evaluate((t) => { const g = window.__shunt.G; g.burnout = 0; g.speed = 500; window.__shunt.setTime(t); }, parseFloat(process.env.START_T));
if (mode === 'drop') await page.evaluate(() => { const g = window.__shunt.G; g.burnout = 0; g.speed = 500; g.scripted = false; g.script = 8; while (!g.road.drops.length) g.road.ensure(g.road.end); window.__shunt.skipTo(g.road.drops[0].gate - 1500); });   // straight to the first drop
let dropShots = 0;
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
for (let i = 0; i < seconds * 10; i++) {
  const s = await page.evaluate(() => {
    const g = window.__shunt.G; const near = g.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'truck' && c.y > g.dist - 300 && c.y < g.dist + 900);
    const enemies = near.filter(c => c.kind !== 'civ' && c.kind !== 'armored').sort((a, b) => Math.abs(a.y - g.dist) - Math.abs(b.y - g.dist));
    const civs = near.filter(c => c.kind === 'civ' && c.y > g.dist - 30 && c.y < g.dist + 260);
    const road = g.road.at(g.dist); const center = road.center, width = road.width; let want = center, slam = 0;
    const e = enemies[0];
    if (e) { if (Math.abs(e.y - g.dist) < 80 && Math.abs(e.x - g.x) < 100 && Math.abs(e.x - g.x) > 30 && g.slamCd <= 0 && (e.state === 'hold' || e.state === 'tell' || e.kind !== 'bruiser')) slam = Math.sign(e.x - g.x); want = e.y > g.dist + 60 ? e.x : g.x + Math.sign(e.x - g.x || 1) * -40; }
    for (const c of civs) if (Math.abs(c.x - want) < 40) want = c.x + (c.x < center ? 70 : -70);
    const truck = g.cars.find(c => c.kind === 'truck' && !c.loaded && c.y > g.dist); if (truck && truck.y - g.dist < 600) want = truck.x;
    const ramp = g.ramps.find(r => !r.used && r.y > g.dist); if (ramp && ramp.y - g.dist < 450) want = ramp.x;
    const barrier = g.barriers.find(b => !b.hit && b.y > g.dist && b.y - g.dist < 400); if (barrier && !ramp) want = center - width / 2 + 30;
    // drift plan: an enemy beside or just ahead at speed → hold the pad and steer into it for a drift slam; a civ dead ahead → brake
    let drift = 0, brake = false; if (e && g.speed > 500 && Math.abs(e.y - g.dist) < 140 && Math.abs(e.x - g.x) > 30 && Math.abs(e.x - g.x) < 130 && !g.drifting) drift = Math.sign(e.x - g.x);
    if (g.drifting) drift = g.driftDir; if (g.drifting && g.driftT > 1.8) drift = 0;
    const ahead = civs.find(c => Math.abs(c.x - g.x) < 30 && c.y - g.dist > 40 && c.y - g.dist < 170); if (ahead && !g.drifting) brake = true;
    // corners: a hard corner ahead and too fast for grip → brake, then drift through it toward the inside
    const cn = g.road.cornerAhead(g.dist, 2.2 * g.speed); if (cn && cn.hard) { const inCorner = g.dist >= cn.s0 - 60 && g.dist <= cn.s1; if (inCorner) { const w = g.road.at(g.dist).width; want = 195 + cn.dir * (w / 2 - 40); if (g.speed > cn.vmax * 0.9 && !g.drifting && !drift) drift = cn.dir; else if (g.drifting) drift = g.driftDir; } else if (g.speed > cn.vmax * 1.05) brake = true; }
    // drop plan: ride the shortcut lane, tricks on every jump (a flip, then a roll if there is time), never the edge
    let trick = null; if (g.drop && g.drop.state === 'drop') { want = g.road.laneX(g.dist, 1); if (g.air > 0 && !g.trick && g.trickQueue.length === 0) { if (g.tricksThisJump === 0) trick = 'front'; else if (g.air > 1.0) trick = 'roll'; } }
    return { sector: g.road.at(g.dist).sector.kind + '#' + g.road.at(g.dist).sector.index + ' cars' + g.cars.length + ' drop:' + (g.drop ? g.drop.state : '-'), phase: window.__shunt.phase, t: g.t, x: g.x, want, slam, drift, brake, trick, view: g.view, inDrop: !!(g.drop && g.drop.state === 'drop'), air: g.air, speed: g.speed, drifting: g.drifting, tier: g.driftTier, score: g.score, armor: g.armor, armorLost: g.armorLost, kills: g.kills, passive: g.passiveWrecks, carKills: g.carKills, gunKills: g.gunKills, slams: g.slams, flicks: g.flicks, misses: g.flickMisses, special: g.special, lastEvent: g.lastEvent, near: near.length, cause: g.killedBy, gun: g.gun, wave: g.wave };
  });
  if (s.phase === 'over') { console.log('DIED at', s.t.toFixed(1), 's:', s.cause, '| score', s.score, 'kills', s.kills, 'slams', s.slams); await page.waitForTimeout(900); await page.screenshot({ path: path.join(out, 'shunt-over.png') }); break; }
  if (s.phase === 'playing') { samples++; if (s.near >= 2) twoPlus++; if (s.t > 3 && s.t - s.lastEvent > maxGap) maxGap = s.t - s.lastEvent; }
  if (mode === 'sweep') { sweepTimer += 0.1; if (sweepTimer >= 1.5) { sweepTimer = 0; const speed = SPEEDS[sweepN % SPEEDS.length]; await sweep(speed, 62 + 62 * (Math.floor(sweepN / SPEEDS.length) % 2)); } }
  else if (mode === 'drift') { driftTimer += 0.1; await page.evaluate(({ phaseT }) => { const inp = window.__shunt.input; const g = window.__shunt.G; if (inp.id === null) inp.down(1, 200, 700, performance.now()); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center; const dir = Math.floor(phaseT / 4) % 2 ? -1 : 1; const k = phaseT % 4; if (k < 2.2 && g.speed > 400) { inp.brake = true; inp.cur = { x: 200 + dir * 60, y: 700 }; } else { inp.brake = false; inp.cur = { x: 200, y: 700 }; } }, { phaseT: driftTimer }); }
  else if (mode !== 'idle') await page.evaluate(({ want, slam, drift, brake, trick, mode }) => { const inp = window.__shunt.input; const g = window.__shunt.G; if (inp.id === null) inp.down(1, 200, 700, performance.now()); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center; if (mode === 'passive') { inp.cur = { x: 200, y: 700 }; inp.brake = false; return; } if (drift) { inp.brake = true; inp.cur = { x: 200 + drift * 60, y: 700 }; return; } inp.brake = brake; const dx = (want - g.targetX) / 1.4; inp.cur = { x: 200 + Math.max(-70, Math.min(70, dx)), y: 700 }; if (slam) window.__shunt.trySlam(slam); const sp = g.spec[g.specSlot]; const other = g.spec[g.specSlot === 'roof' ? 'rear' : 'roof']; if (sp.ammo <= 0 && other.ammo > 0) window.__shunt.swapSpecial(); else if (sp.ammo > 0 && g.cars.some(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && Math.abs(c.y - g.dist) < 500)) window.__shunt.fireSpecial();
    if (g.gadgetUses > 0 && g.armor <= 1) window.__shunt.fireGadget(); if (g.nitroCharges > 0 && g.nitro <= 0 && g.t % 20 < 0.2) window.__shunt.engineAction(); if (g.t % 15 < 0.15) window.__shunt.wheelsAction(); if (trick) window.__shunt.startTrick(trick, 1); }, { want: s.want, slam: s.slam, drift: s.drift, brake: s.brake, trick: s.trick, mode });
  await page.waitForTimeout(100);
  if (i % 300 === 150) await page.screenshot({ path: path.join(out, `shunt-${Math.round(s.t)}s.png`) });
  if (mode === 'drop' && dropShots < 4 && ((dropShots === 0 && s.view > 0.3 && s.view < 0.8) || (dropShots === 1 && s.inDrop && s.air <= 0) || (dropShots === 2 && s.inDrop && s.air > 0.8) || (dropShots === 3 && s.inDrop && s.speed > 1300))) { dropShots++; await page.screenshot({ path: path.join(out, `drop-${dropShots}.png`) }); }
  if (mode === 'active' && !cornerShot && s.t > 19 && s.t < 40) { const inHairpin = await page.evaluate(() => { const g = window.__shunt.G; const c = g.road.at(g.dist).corner; return !!(c && c.type === 'hairpin'); }); if (inHairpin) { cornerShot = true; await page.screenshot({ path: path.join(out, 'shunt-hairpin.png') }); } }
  if (i % 100 === 0) console.log('t', s.t.toFixed(1), s.sector, 'spd', Math.round(s.speed), s.drifting ? 'DRIFT T' + s.tier : '', 'score', s.score, 'armor', s.armor, 'kills', s.kills, '(car', s.carKills, 'gun', s.gunKills, 'passive', s.passive + ')', 'slams', s.slams, 'flicks', s.flicks, 'misses', s.misses, 'special', s.special ? s.special.kind + ':' + s.special.ammo : '-', 'near', s.near, s.wave);
}
const f = await page.evaluate(() => { const g = window.__shunt.G; return { t: g.t, kills: g.kills, passive: g.passiveWrecks, carKills: g.carKills, gunKills: g.gunKills, slams: g.slams, flicks: g.flicks, misses: g.flickMisses, armorLost: g.armorLost, score: g.score, drifts: g.drifts, driftSlams: g.driftSlams, turbos: g.turbos, driftPoints: g.driftPoints, tierMax: g.driftTierMax, topSpeed: g.topSpeed, avgSpeed: g.speedSum / Math.max(1, g.speedN) }; });
const min = f.t / 60;
console.log('--- metrics (' + mode + ') ---');
console.log('run length:', f.t.toFixed(1), 's   score', f.score);
console.log('wrecks per minute (player caused):', (f.kills / min).toFixed(1), ' car', (f.carKills / min).toFixed(1), ' gun', (f.gunKills / min).toFixed(1), '  (idle target < 5; skilled 3x idle)');
console.log('passive wrecks per minute (no credit):', (f.passive / min).toFixed(1));
console.log('slams landed:', f.slams, ' flicks seen:', f.flicks, ' flicks with no target:', f.misses, '  (sweep target: < 1 Slam per 10 min)');
if (mode === 'sweep') { console.log('lane changes made:', sweepN, ' slams fired:', f.slams, '=> Slams per minute', (f.slams / min).toFixed(2)); for (const sp of SPEEDS) console.log('  at', sp, 'pt/s:', bySpeed[sp].n, 'changes,', bySpeed[sp].flicks, 'flicks seen,', bySpeed[sp].slams, 'slams fired'); }
console.log('armor lost per minute:', (f.armorLost / min).toFixed(2));
console.log('corners:', await page.evaluate(() => window.__shunt.G.cornerLog.map(c => c.type + ' vmax ' + c.vmax + ' apex ' + c.apexSpeed + (c.drift ? ' drift' : '') + (c.scraped ? ' SCRAPED' : '')).join(' ; ')));
console.log('drop:', await page.evaluate(() => { const g = window.__shunt.G; return 'drops ' + g.drops + ' tricks ' + g.tricksDone + ' [' + g.trickLog.join(',') + '] stars ' + g.stars + ' falls ' + g.falls + ' heat ' + g.heat.toFixed(2) + ' overdrive ' + (g.overdrive > 0) + ' top ' + Math.round(g.topSpeed); }));
console.log('enemies wrecked:', await page.evaluate(() => JSON.stringify(window.__shunt.G.kindsWrecked) + ' scattered ' + window.__shunt.G.bikesScattered + ' convoys ' + (window.__shunt.G.convoys || 0) + ' heli ' + (window.__shunt.G.heli ? 'up' : '-') + ' boss ' + (window.__shunt.G.boss ? 'up' : '-')));
console.log('loadout:', await page.evaluate(() => JSON.stringify(window.__shunt.LOAD) + ' spec ' + JSON.stringify(window.__shunt.G.spec) + ' gadgetUses ' + window.__shunt.G.gadgetUses));
console.log('driving: drifts', f.drifts, ' drift slams', f.driftSlams, ' mini-turbos', f.turbos, ' best tier', f.tierMax, ' drift points', f.driftPoints, ' top speed', Math.round(f.topSpeed), ' avg speed', Math.round(f.avgSpeed));
console.log('time with 2+ cars on screen:', (100 * twoPlus / Math.max(1, samples)).toFixed(0) + '%  (target 85%+)');
console.log('longest gap with no event:', maxGap.toFixed(2), 's  (target <= 3 s)');
console.log('wreck log:', await page.evaluate(() => (window.__shunt.G.wreckLog || []).join(' ; ')));
console.log('errors', errors.length ? errors : 'none');
await browser.close();
