// Driver-control checks, synchronous and scripted (no frame clock): node tools/dctest.mjs [--seed=3]
//   reverse: brake held from a stop reverses; flip: e-brake with full steer at speed swings the car round (G.face flips) and gas drives it back down
//   the road; burn: gas and e-brake at a stop is a burnout, letting go launches; stop: drive, stop, sit and shoot for 50 s and count U-turns,
//   takedowns, armor lost and the enemies within reach (stopping never stalls the action)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1&seed=' + (opt.seed || 3)); await page.waitForFunction(() => window.__shunt && window.__shunt.G); await page.waitForTimeout(400);
const r = await page.evaluate(() => {
  const sh = window.__shunt; const out = {};
  const run = (secs, f) => { const G = sh.G, inp = sh.input; const t1 = G.t + secs; while (G.t < t1) { if (inp.id === null) inp.down(1, 200, 700, 0); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = G.targetX - G.road.at(G.dist).center; inp.cur = { x: 200, y: 700 }; inp.gas = false; inp.brake = false; inp.fireHeld = false; inp.ebHeld = false; f(G, inp); sh.runSteps(1); } };
  const steer = (G, inp, x) => { inp.cur = { x: 200 + Math.max(-90, Math.min(90, (x - G.targetX) / 1.4)), y: 700 }; };
  // reverse
  sh.startPlaying(); run(1, () => {}); run(2, (G, i) => { i.brake = true; }); out.reverse = { speed: Math.round(sh.G.speed), fwd: Math.round(sh.G.fwd), dist: Math.round(sh.G.dist) };
  // flip: get to speed, then e-brake with the thumb hard over
  sh.startPlaying(); run(1, () => {}); run(4, (G, i) => { i.gas = true; }); while (sh.G.air > 0 || sh.G.road.at(sh.G.dist).curv < -2e-4) run(0.05, (G, i) => { i.gas = true; }); const pre = { speed: Math.round(sh.G.speed), face: sh.G.face };
  run(0.8, (G, i) => { i.ebHeld = true; i.cur = { x: 290, y: 700 }; }); const mid = { face: sh.G.face, speed: Math.round(sh.G.speed), flips: sh.G.flipDone };
  run(3, (G, i) => { i.gas = true; }); out.flip = { pre, mid, after: { face: sh.G.face, speed: Math.round(sh.G.speed), fwd: Math.round(sh.G.fwd) } };
  // burnout
  sh.startPlaying(); run(1.5, () => {}); run(1.4, (G, i) => { i.gas = true; i.ebHeld = true; }); const bo = { bo: +sh.G.bo.toFixed(2), speed: Math.round(sh.G.speed), fish: +sh.G.fish.toFixed(2), puffs: sh.G.puffs.length };
  run(0.6, (G, i) => { i.gas = true; }); out.burn = { during: bo, after: { speed: Math.round(sh.G.speed), turbo: sh.G.turboT > 0, burnouts: sh.G.burnouts } };
  // stop and shoot it out
  sh.startPlaying(); run(1, () => {}); run(6, (G, i) => { i.gas = true; }); run(2, (G, i) => { i.brake = G.speed > 30; });
  const s0 = { dist: Math.round(sh.G.dist), kills: sh.G.kills, armor: sh.G.armorLost }; let near = 0, n = 0, maxNear = 0; const G = sh.G;
  run(50, (G, i) => { const e = G.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && Math.abs(c.y - G.dist) < 900).sort((a, b) => Math.abs(a.y - G.dist) - Math.abs(b.y - G.dist))[0]; if (e) steer(G, i, e.x); i.fireHeld = !!e; if (G.speed > 20) i.brake = true; else if (G.speed < -20) i.gas = true;
    const k = G.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && Math.abs(c.y - G.dist) < 700).length; near += k; n++; maxNear = Math.max(maxNear, k); });
  out.stop = { distMoved: Math.round(G.dist - s0.dist), kills: G.kills - s0.kills, armorLost: G.armorLost - s0.armor, limp: G.limp, uturns: G.uturns, avgNear: +(near / n).toFixed(2), maxNear, waves: G.waveN, civs: G.cars.filter(c => c.alive && c.kind === 'civ').length };
  return out; });
console.log(JSON.stringify(r, null, 1)); if (errors.length) console.log('ERRORS', errors);
await browser.close();
