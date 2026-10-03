// Warning time: how many seconds ahead the top of the screen reaches on the road, at the speeds the beauty run visits, in the canvas
// build (?r=canvas) and the three.js build. A new car must come into view at least as far ahead in 3D as in the canvas build.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const r of ['canvas', 'three']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto('file://' + pageFile + '?shots=1' + (r === 'canvas' ? '&r=canvas' : ''));
  await page.waitForFunction(() => window.__shunt && window.__shunt.G && window.__shunt.G.rep, null, { timeout: 20000 });
  const rows = await page.evaluate(async () => { const out = []; const sh = window.__shunt; const seen = new Set(); while (sh.G.t < 60 && sh.phase !== 'over') { const b = Math.round(sh.G.speed / 100); if (!seen.has(b) && sh.G.speed > 100) { seen.add(b); out.push({ speed: Math.round(sh.G.speed), ahead: Math.round(sh.renderer().visibleAhead(sh.G)) }); } await new Promise(r => setTimeout(r, 100)); } return out; });
  console.log(r + ':'); for (const o of rows.sort((a, b) => a.speed - b.speed)) console.log(`  speed ${o.speed} pt/s  visible ${o.ahead} pt ahead  = ${(o.ahead / o.speed).toFixed(2)} s warning`);
  await page.close();
}
await browser.close();
