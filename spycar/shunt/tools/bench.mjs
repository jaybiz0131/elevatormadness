// Headless bench: opens ?bench=1 (or ?bench=soak), waits for the results and prints them. These are SwiftShader numbers, not iPhone numbers.
//   node tools/bench.mjs [soak] [look]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html');
const mode = process.argv[2] === 'soak' ? 'soak' : '1'; const look = process.argv[3] || 'night';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + pageFile + '?bench=' + mode + '&look=' + look);
const t0 = Date.now();
await page.waitForFunction(() => window.__shunt && window.__shunt.bench, null, { timeout: mode === 'soak' ? 3600000 : 900000, polling: 500 });
const r = await page.evaluate(() => window.__shunt.bench); const s = await page.evaluate(() => window.__shunt.renderer().stats());
console.log(JSON.stringify(Object.assign(r, { wallSeconds: Math.round((Date.now() - t0) / 1000), textures: s.textures, geometries: s.geometries, programs: s.programs }), null, 1));
await page.screenshot({ path: path.join(here, '..', 'dist', 'bench-' + mode + '.png') });
console.log('errors', errors.length ? errors : 'none');
await browser.close();
