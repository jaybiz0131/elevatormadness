// Postcard shots: plays the beauty route (?shots=1 loads the recorded skilled run) and screenshots fixed sim-time moments from the
// gameplay camera, for one look.  node tools/shots.mjs <outDir> [look] [--page=dist/shunt.html] [--quick]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, '..', 'shots'); const look = process.argv[3] || 'night';
const opt = Object.fromEntries(process.argv.slice(4).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; }));
const pageFile = opt.page ? path.resolve(opt.page) : path.join(here, '..', 'dist', 'shunt.html');
// the eight moments (sim seconds on the beauty route, seed 3): see design/style-guide.md
export const MOMENTS = opt.quick ? [['cruise', 5], ['hairpin', 20.6]] : [['cruise', 5.0], ['sweeper-drift', 14.6], ['hairpin-entry', 20.6], ['combat-side-by-side', 25.3], ['wreck-explosion', 28.55], ['boost', 30.4], ['skyline', 36.0], ['hud', 33.7]];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + pageFile + '?shots=1&look=' + look);
await page.waitForFunction(() => window.__shunt && window.__shunt.G && window.__shunt.G.rep, null, { timeout: 20000 });
const t0 = Date.now();
for (const [name, t] of MOMENTS) {
  await page.waitForFunction((t) => window.__shunt.G.t >= t || window.__shunt.phase === 'over', t, { timeout: 120000, polling: 16 });
  const st = await page.evaluate(() => ({ t: window.__shunt.G.t, phase: window.__shunt.phase, stats: window.__shunt.renderer().stats() }));
  await page.screenshot({ path: path.join(out, `${look}-${name}.png`) });
  console.log(look, name, 'at', st.t.toFixed(2), 's', st.phase, 'calls', st.stats.calls, 'tris', st.stats.triangles, 'scale', st.stats.scale.toFixed(2));
}
console.log('wall', ((Date.now() - t0) / 1000).toFixed(1), 's; errors', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
