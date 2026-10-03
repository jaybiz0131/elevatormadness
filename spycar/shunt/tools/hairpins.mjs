// Step 6 test: a brake-or-drift bot against a floor-it bot over 20 hairpins each. Both steer round traffic; the floor-it bot never
// brakes or drifts. The sim's armor is topped up by the harness so the runs last. Prints seconds per hairpin and barrier hits.
//   node tools/hairpins.mjs [hairpins=20] [--wall=0]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html');
const need = Number(process.argv[2] || 20); const wall = process.argv.includes('--wall=0') ? '0' : '1';
const browser = await chromium.launch();
async function runBot(style) {
  const log = []; let seed = 100;
  while (log.length < need) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + pageFile + '?r=canvas&seed=' + seed + '&wall=' + wall); await page.waitForTimeout(400);
    await page.evaluate(() => window.__shunt.startPlaying());
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const s = await page.evaluate((style) => {
        const sh = window.__shunt, g = sh.G, inp = sh.input; if (sh.phase !== 'playing') return { phase: sh.phase };
        g.armor = 3; g.damageAcc = 0;   // harness: keep the run alive so the hairpins come
        const near = g.cars.filter(c => c.alive && !c.wrecked && c.y > g.dist - 60 && c.y < g.dist + 420); const road = g.road.at(g.dist); const center = road.center, width = road.width;
        let want = g.x; for (const c of near) if (Math.abs(c.x - g.x) < 44 && c.y > g.dist) want = c.x + (c.x < center ? 70 : -70);
        let drift = 0, brake = false; const cn = g.road.cornerAhead(g.dist, 2.2 * g.speed);
        if (cn && cn.hard) { const inCorner = g.dist >= cn.s0 - 60 && g.dist <= cn.s1; if (inCorner) { want = 195 + cn.dir * (width / 2 - 40); if (style === 'brake' && g.speed > cn.vmax * 0.9 && !g.drifting) drift = cn.dir; else if (g.drifting) drift = g.driftDir; } else if (style === 'brake' && g.speed > cn.vmax * 1.05) brake = true; }
        if (inp.id === null) inp.down(1, 200, 700, performance.now()); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - center;
        if (style === 'brake' && drift) { inp.brake = true; inp.cur = { x: 200 + drift * 60, y: 700 }; } else { inp.brake = style === 'brake' && brake; const dx = (want - g.targetX) / 1.4; inp.cur = { x: 200 + Math.max(-70, Math.min(70, dx)), y: 700 }; }
        return { phase: sh.phase, t: g.t, log: g.cornerLog.filter(c => c.type === 'hairpin' && c.exitT !== undefined).map(c => ({ dt: c.exitT - c.enterT, wall: !!c.wall, drift: c.drift, braked: !!c.braked, apex: c.apexSpeed, vmax: c.vmax })) };
      }, style);
      if (s.phase !== 'playing') break; if (s.log && s.log.length + log.length >= need) break; if (s.t > 200) break;
      await page.waitForTimeout(100);
    }
    const done = await page.evaluate(() => window.__shunt.G.cornerLog.filter(c => c.type === 'hairpin' && c.exitT !== undefined).map(c => ({ dt: c.exitT - c.enterT, wall: !!c.wall, drift: c.drift, braked: !!c.braked, apex: c.apexSpeed, vmax: c.vmax })));
    if (errors.length) console.log('errors', errors.slice(0, 3));
    await page.close(); for (const d of done) { if (log.length >= need) break; log.push(d); }
    console.log(style, 'seed', seed, 'hairpins so far', log.length); seed++;
  }
  return log.slice(0, need);
}
import fs from 'node:fs';
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sum = (name, L) => { const line = name + ': ' + L.length + ' hairpins; mean ' + mean(L.map(c => c.dt)).toFixed(2) + ' s per hairpin; barrier hits ' + L.filter(c => c.wall).length + ' (' + Math.round(100 * L.filter(c => c.wall).length / L.length) + '%); drifted ' + L.filter(c => c.drift).length + '; braked ' + L.filter(c => c.braked).length + '; apex mean ' + Math.round(mean(L.map(c => c.apex))) + ' (grip speed mean ' + Math.round(mean(L.map(c => c.vmax))) + ')'; console.log(line); return line; };
const outFile = process.argv.find(a => a.startsWith('--out=')); const results = {};
const floor = await runBot('floor'); results.floor = { line: sum('floor-it', floor), log: floor }; if (outFile) fs.writeFileSync(outFile.slice(6), JSON.stringify(results));
const brake = await runBot('brake'); results.brake = { line: sum('brake-or-drift', brake), log: brake }; if (outFile) fs.writeFileSync(outFile.slice(6), JSON.stringify(results));
console.log('gate: brake-or-drift faster by', (mean(floor.map(c => c.dt)) - mean(brake.map(c => c.dt))).toFixed(2), 's per hairpin (need >= 0.5); floor-it hit rate', Math.round(100 * floor.filter(c => c.wall).length / floor.length) + '% (need >= 80%)');
await browser.close();
