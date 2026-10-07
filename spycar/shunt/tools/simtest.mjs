// Sync sim run with a scripted driver (no frame clock, lite renderer): counts what Stop 3 added and times the sim step.
//   node tools/simtest.mjs [--seed=5] [--secs=120] [--mode=gunner|weak|tap]   (tap: brake-tap drifts through every hard corner) [--record=file.json] [--page=dist/shunt.html]
// gunner: holds FIRE at whatever is ahead and steers at it (the showcase driver); weak: same but steers late and gently (a weak driver)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const s5 = !!opt.s5; const seed = Number(opt.seed || 5), secs = Number(opt.secs || 120), mode = opt.mode || 'gunner';
const pageFile = opt.page ? path.resolve(opt.page) : path.join(here, '..', 'dist', 'shunt.html');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
await page.goto('file://' + pageFile + '?lite=1&seed=' + seed + (opt.q ? '&' + opt.q : '')); await page.waitForFunction(() => window.__shunt && window.__shunt.G, null, { timeout: 30000 }); await page.waitForTimeout(500);
const r = await page.evaluate(({ secs, mode, rec, s5 }) => {
  const sh = window.__shunt; sh.startPlaying(); if (rec) sh.record(mode); const G = sh.G; G.wreckLog = [];
  const drive = () => { const g = sh.G, inp = sh.input; if (inp.id === null) inp.down(1, 200, 700, 0); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center;
    const e = g.cars.filter(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser' || c.kind === 'gunner') && c.y > g.dist + 40 && c.y < g.dist + 700).sort((a, b) => a.y - b.y)[0];
    const civ = g.cars.find(c => c.alive && !c.wrecked && c.kind === 'civ' && c.y > g.dist && c.y < g.dist + 260 && Math.abs(c.x - g.x) < 40);
    let want = e ? e.x : g.road.at(g.dist).center;
    if (mode === 'ram') { const rc = g.cars.filter(c => c.alive && !c.wrecked && c.kind === 'civ' && c.y > g.dist + 30 && c.y < g.dist + 900).sort((a, b) => a.y - b.y)[0]; if (rc) want = rc.x; }   // ram: runs into the nearest civilian ahead if (civ && !e) want = civ.x + (civ.x < 195 ? 70 : -70);
    // in a corner the road slides the car outward: steer into it (harder for the skilled driver, which starts drifts)
    const k = g.road.at(g.dist).k; if (Math.abs(k) > 1 / 900) want += Math.sign(k) * (mode === 'weak' ? 40 : 110);
    // tap: the Stop 4 brake-tap drift. Into a hard corner: steer toward the inside and hold BRAKE from a little before the turn-in until the apex
    const cnb = g.road.cornerAhead(g.dist, 520); inp.brake = false;
    if (mode === 'tap' && cnb && cnb.hard && g.dist > cnb.s0 - 140 && g.dist < cnb.apex + 40) { inp.brake = true; want = 195 + cnb.dir * (g.road.at(g.dist).width / 2 - 50); }
    inp.fireHeld = !!e || g.cars.some(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && c.y > g.dist - 50 && c.y < g.dist + 800);
    // Stop 5 abilities (--s5=1): BOOST on a free straight, a mine when a pursuer is close behind, 
    if (s5) { const behind = g.cars.filter(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser' || c.kind === 'gunner') && c.y < g.dist - 40 && c.y > g.dist - 520).sort((a, b) => b.y - a.y)[0];
      const cn5 = g.road.cornerAhead(g.dist, 900);
      if (g.bst > 0.85 && !cn5 && g.bstT <= 0 && g.air <= 0) inp.boostReq = true;
      if (behind && g.mineAmmo > 0 && g.t - (window.__lm || -9) > 2.5 && behind.y > g.dist - 380 && Math.abs(behind.x - g.x) < 60) { inp.mineReq = true; window.__lm = g.t; } }
    const lim = mode === 'weak' ? 40 : 90; inp.cur = { x: 200 + Math.max(-lim, Math.min(lim, (want - g.targetX) / 1.4)), y: 700 }; };
  const t0 = performance.now(); let steps = 0, maxBodies = 0, maxKin = 0, twoT = 0, driftT = 0, liftT = 0;
  let nanT = null; const tl = []; let pa = false, pb = false, pt = 0, pm = 0, pk = 0, pp = 0;
  while (G.t < secs && !G.won) { drive(); sh.runSteps(1); steps++; { if (nanT === null && !Number.isFinite(G.air + G.fz + G.fvz + G.jumpZ + G.speed + G.x + G.dist + G.bst)) nanT = +G.t.toFixed(2); const a = G.air > 0 && G.hang > 0.05; if (a && !pa) tl.push([+G.t.toFixed(1), 'air', Math.round(G.speed)]); pa = a || (pa && G.air > 0); const b = G.bstT > 0; if (b && !pb) tl.push([+G.t.toFixed(1), 'boost']); pb = b; if (G.mineHits !== pm) { tl.push([+G.t.toFixed(1), 'mineHit']); pm = G.mineHits; } if (G.pileups !== pp) { tl.push([+G.t.toFixed(1), 'pileup']); pp = G.pileups; } if (G.minesDropped !== pk) { tl.push([+G.t.toFixed(1), 'mine']); pk = G.minesDropped; } } if (G.launches && !window.__firstL) window.__firstL = G.t; if (sh.CRASH) { maxBodies = Math.max(maxBodies, sh.CRASH.bodies); maxKin = Math.max(maxKin, sh.CRASH.kin); } if (G.body && G.body.two) twoT += 1 / 120; if (G.drifting) driftT += 1 / 120; if (G.autoLift) liftT += 1 / 120; }
  const ms = (performance.now() - t0) / steps;
  const out = { nanT, maxAirT: tl.filter(x => x[1] === 'air').length, tl: tl.slice(0, 80), s5: { airs: G.airs, airBest: +G.airBest.toFixed(2), boosts: G.boosts, bst: +G.bst.toFixed(2), mines: G.minesDropped, mineHits: G.mineHits, mineWrecks: G.mineWrecks, mineAmmo: G.mineAmmo, rating: G.rating, grade: G.grade, crests: sh.G.road.crests.length }, launches: G.launches || 0, firstLaunch: window.__firstL || null, t: +G.t.toFixed(1), won: G.won, dist: Math.round(G.dist), kills: G.kills, pileups: G.pileups, civCrashes: G.civCrashes, wallSlams: G.wallSlams, rolls: G.rolls, twoWheels: G.twoWheels, twoT: +twoT.toFixed(1), drifts: G.drifts, driftT: +driftT.toFixed(1), liftT: +liftT.toFixed(1), wallHits: G.wallHits, armorLost: G.armorLost, limps: G.limpCount, score: G.score, grade: G.grade, msPerStep: +ms.toFixed(4), crashMs: sh.CRASH ? +sh.CRASH.stepMs.toFixed(4) : 0, maxBodies, maxKin, events: sh.CRASH ? sh.CRASH.events : 0, line: sh.crashLine ? sh.crashLine() : '', wrecks: G.wreckLog.filter(l => /ROLL|WRECKHIT/.test(l)).concat(G.wreckLog.slice(0, 6)).concat(["ALL"], G.wreckLog) };
  if (rec) out.replay = sh.exportReplay(mode);
  return out;
}, { secs, mode, rec: !!opt.record, s5 });
if (opt.record) { fs.writeFileSync(opt.record, JSON.stringify(r.replay)); delete r.replay; }
console.log(JSON.stringify(r, null, 1)); if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
