// Landmark shots: plays the beauty route (?shots=1) and, as the run reaches each landmark, takes a high wide view of it with the HUD
// hidden; prints draw calls and triangles.   node tools/landmarkshots.mjs <outDir> [extra query]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html'); const out = process.argv[2] || 'shots'; fs.mkdirSync(out, { recursive: true });
const extra = process.argv[3] ? '&' + process.argv[3] : '';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, cam, dist] of [['landmark-radio', '35,190,50,-35', 3000], ['landmark-hotel', '35,200,50,30', 7900], ['landmark-garage', '35,150,50,-35', 13900]]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto('file://' + pageFile + '?shots=1&cam=' + cam + extra);
  await p.waitForFunction((d) => window.__shunt && window.__shunt.G && window.__shunt.G.dist >= d, dist, { timeout: 1200000, polling: 50 });
  await p.evaluate(() => { document.getElementById('ui').style.visibility = 'hidden'; window.__shunt.G.hitStop = 30; }); await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({ dist: window.__shunt.G.dist, s: window.__shunt.renderer().stats() }));
  await p.screenshot({ path: path.join(out, name + '.png') }); console.log(name, JSON.stringify({ dist: Math.round(st.dist), calls: st.s.calls, tris: st.s.triangles })); await p.close();
}
await b.close();
