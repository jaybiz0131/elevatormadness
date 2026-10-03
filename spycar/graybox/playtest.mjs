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
await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, 'shunt-title.png') });
await page.evaluate(() => { window.__shunt.startPlaying(); window.__shunt.G.wreckLog = []; });
let samples = 0, twoPlus = 0, maxGap = 0, sweepN = 0, sweepSlamsBefore = 0;
const t0 = Date.now();
let sweepTimer = 0, pointerDown = false;
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
    return { phase: window.__shunt.phase, t: g.t, x: g.x, want, slam, score: g.score, armor: g.armor, armorLost: g.armorLost, kills: g.kills, passive: g.passiveWrecks, carKills: g.carKills, gunKills: g.gunKills, slams: g.slams, flicks: g.flicks, misses: g.flickMisses, special: g.special, lastEvent: g.lastEvent, near: near.length, cause: g.killedBy, gun: g.gun, wave: g.wave };
  });
  if (s.phase === 'over') { console.log('DIED at', s.t.toFixed(1), 's:', s.cause, '| score', s.score, 'kills', s.kills, 'slams', s.slams); await page.waitForTimeout(900); await page.screenshot({ path: path.join(out, 'shunt-over.png') }); break; }
  if (s.phase === 'playing') { samples++; if (s.near >= 2) twoPlus++; if (s.t > 3 && s.t - s.lastEvent > maxGap) maxGap = s.t - s.lastEvent; }
  if (mode === 'sweep') { sweepTimer += 0.1; if (sweepTimer >= 1.5) { sweepTimer = 0; const speed = SPEEDS[sweepN % SPEEDS.length]; await sweep(speed, 62 + 62 * (Math.floor(sweepN / SPEEDS.length) % 2)); } }
  else if (mode !== 'idle') await page.evaluate(({ want, slam, mode }) => { const inp = window.__shunt.input; const g = window.__shunt.G; if (inp.id === null) inp.down(1, 200, 700, performance.now()); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center; if (mode === 'passive') { inp.cur = { x: 200, y: 700 }; return; } const dx = (want - g.targetX) / 1.4; inp.cur = { x: 200 + Math.max(-70, Math.min(70, dx)), y: 700 }; if (slam) window.__shunt.trySlam(slam); if (g.special && g.special.ammo > 0 && (g.special.kind !== 'missiles' || g.cars.some(c => c.alive && !c.wrecked && (c.kind === 'armored' || c.kind === 'bruiser') && c.y > g.dist))) window.__shunt.fireSpecial(); }, { want: s.want, slam: s.slam, mode });
  await page.waitForTimeout(100);
  if (i % 300 === 150) await page.screenshot({ path: path.join(out, `shunt-${Math.round(s.t)}s.png`) });
  if (i % 100 === 0) console.log('t', s.t.toFixed(1), 'score', s.score, 'armor', s.armor, 'kills', s.kills, '(car', s.carKills, 'gun', s.gunKills, 'passive', s.passive + ')', 'slams', s.slams, 'flicks', s.flicks, 'misses', s.misses, 'special', s.special ? s.special.kind + ':' + s.special.ammo : '-', 'near', s.near, s.wave);
}
const f = await page.evaluate(() => { const g = window.__shunt.G; return { t: g.t, kills: g.kills, passive: g.passiveWrecks, carKills: g.carKills, gunKills: g.gunKills, slams: g.slams, flicks: g.flicks, misses: g.flickMisses, armorLost: g.armorLost, score: g.score }; });
const min = f.t / 60;
console.log('--- metrics (' + mode + ') ---');
console.log('run length:', f.t.toFixed(1), 's   score', f.score);
console.log('wrecks per minute (player caused):', (f.kills / min).toFixed(1), ' car', (f.carKills / min).toFixed(1), ' gun', (f.gunKills / min).toFixed(1), '  (idle target < 5; skilled 3x idle)');
console.log('passive wrecks per minute (no credit):', (f.passive / min).toFixed(1));
console.log('slams landed:', f.slams, ' flicks seen:', f.flicks, ' flicks with no target:', f.misses, '  (sweep target: < 1 Slam per 10 min)');
if (mode === 'sweep') { console.log('lane changes made:', sweepN, ' slams fired:', f.slams, '=> Slams per minute', (f.slams / min).toFixed(2)); for (const sp of SPEEDS) console.log('  at', sp, 'pt/s:', bySpeed[sp].n, 'changes,', bySpeed[sp].flicks, 'flicks seen,', bySpeed[sp].slams, 'slams fired'); }
console.log('armor lost per minute:', (f.armorLost / min).toFixed(2));
console.log('time with 2+ cars on screen:', (100 * twoPlus / Math.max(1, samples)).toFixed(0) + '%  (target 85%+)');
console.log('longest gap with no event:', maxGap.toFixed(2), 's  (target <= 3 s)');
console.log('wreck log:', await page.evaluate(() => (window.__shunt.G.wreckLog || []).join(' ; ')));
console.log('errors', errors.length ? errors : 'none');
await browser.close();
