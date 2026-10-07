// Driver-control showcase runs, recorded as replays for tools/clip.mjs: node tools/dcscen.mjs <outDir> [--seed=3]
//   standoff.json: drive 6 s, stop, sit in the road and shoot it out for 30 s (the car turns with the thumb to aim; the e-brake 180 faces pursuers behind)
//   burnout.json: at the start, gas and e-brake together for 1.5 s, then let go
//   flip.json: get to speed on a straight, e-brake with the thumb hard over (the 180), then drive back down the road
// Prints the moments (kills, U-turns, charges, the 180, the burnout) with their times.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const out = path.resolve(process.argv[2] || '.');
const opt = Object.fromEntries(process.argv.slice(3).filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1&seed=' + (opt.seed || 3)); await page.waitForFunction(() => window.__shunt && window.__shunt.G); await page.waitForTimeout(400);
for (const scen of ['standoff', 'burnout', 'flip']) {
  const r = await page.evaluate((scen) => {
    const sh = window.__shunt; sh.startPlaying(); sh.record(scen); const log = []; let pk = 0, pu = 0, pf = 0, pb = 0, charging = new Set();
    const run = (secs, f) => { const G = sh.G, inp = sh.input; const t1 = G.t + secs; while (G.t < t1) { inp.raw = true; if (inp.id === null) inp.down(1, 200, 700, 0); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = G.targetX - G.road.at(G.dist).center; inp.cur = { x: 200, y: 700 }; inp.gas = false; inp.brake = false; inp.fireHeld = false; inp.ebHeld = false; f(G, inp); sh.runSteps(1);
      if (G.kills > pk) { log.push([+G.t.toFixed(1), 'kill']); pk = G.kills; } if (G.uturns > pu) { log.push([+G.t.toFixed(1), 'uturn']); pu = G.uturns; } if (G.flipDone > pf) { log.push([+G.t.toFixed(1), '180']); pf = G.flipDone; } if (G.burnouts > pb) { log.push([+G.t.toFixed(1), 'burnout']); pb = G.burnouts; }
      for (const c of G.cars) if (c.state === 'charge' && !charging.has(c)) { charging.add(c); log.push([+G.t.toFixed(1), 'charge ' + (c.y > G.dist ? 'ahead' : 'behind')]); } } };
    const aim = (G, i) => { const e = G.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && (c.y - G.dist) * G.face > 30 && Math.abs(c.y - G.dist) < 800).sort((a, b) => Math.abs(a.y - G.dist) - Math.abs(b.y - G.dist))[0];
      if (e) { const dx = (e.x - G.x) * G.face; i.cur = { x: 200 + Math.max(-60, Math.min(60, dx * 0.9)), y: 700 }; i.fireHeld = Math.abs(e.x - G.x) < 70; } };
    // the standoff steers toward the nearest enemy (at a stop the thumb still slides the car a little and turns the nose) and holds the trigger
    const hunt = (G, i) => { const e = G.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && Math.abs(c.y - G.dist) < 900).sort((a, b) => Math.abs(a.y - G.dist) - Math.abs(b.y - G.dist))[0];
      if (e) i.cur = { x: 200 + Math.max(-90, Math.min(90, (e.x - G.targetX) / 1.4)), y: 700 }; i.fireHeld = !!e; };
    if (scen === 'standoff') { run(1, () => {}); run(6, (G, i) => { i.gas = true; }); run(2, (G, i) => { i.brake = G.speed > 30; });
      run(30, (G, i) => { hunt(G, i); if (G.speed > 20) i.brake = true; else if (G.speed < -20) i.gas = true; }); }
    if (scen === 'burnout') { run(1.2, () => {}); run(1.6, (G, i) => { i.gas = true; i.ebHeld = true; }); run(4, (G, i) => { i.gas = true; }); }
    if (scen === 'flip') { run(1, () => {}); run(3, (G, i) => { i.gas = true; }); let k = 0; while ((sh.G.air > 0 || Math.abs(sh.G.road.at(sh.G.dist).k) > 1 / 1500 || sh.G.speed > 700) && k++ < 2000) run(1 / 60, (G, i) => { i.gas = G.speed < 650; i.brake = G.speed > 720; });
      run(0.9, (G, i) => { i.ebHeld = true; i.cur = { x: 330, y: 700 }; }); run(4, (G, i) => { i.gas = true; aim(G, i); }); }
    return { log, replay: sh.exportReplay(scen), t: sh.G.t };
  }, scen);
  fs.writeFileSync(path.join(out, scen + '.json'), JSON.stringify(r.replay)); console.log(scen, 't', r.t.toFixed(1), JSON.stringify(r.log));
}
if (errors.length) console.log('ERRORS', errors);
await browser.close();
