// Renders the hero-car concept sheet: each design from a three-quarter view and the gameplay angle, composed into one image.
//   node tools/concepts.mjs <outDir> [look]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const out = process.argv[2] || path.join(here, '..', 'concepts'); const look = process.argv[3] || 'night';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = []; const W = 640, Hh = 420;
const page = await browser.newPage({ viewport: { width: W, height: Hh }, deviceScaleFactor: 1 });
page.on('pageerror', e => { if (!/studio mode/.test(e.message)) errors.push(e.message); });
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?concepts=1&look=' + look);
await page.waitForFunction(() => !!window.__studio, null, { timeout: 60000 }); await page.waitForTimeout(1500);
const names = await page.evaluate(() => window.__studio.studio.DESIGNS.map(d => d.name)); const cells = [];
for (let i = 0; i < names.length; i++) for (const view of ['front', 'top']) { await page.evaluate(({ i, view }) => window.__studio.focus(i, view), { i, view }); await page.waitForTimeout(400); const buf = await page.screenshot(); cells.push({ i, view, b64: buf.toString('base64') }); console.log('shot', names[i], view); }
await page.close();
// the sheet: a row per design, three-quarter view beside the gameplay angle
const sheet = await browser.newPage({ viewport: { width: W * 2 + 48, height: (Hh + 16) * names.length + 80 }, deviceScaleFactor: 1 });
const html = `<body style="margin:0;background:#0b0e18;font-family:Arial,sans-serif;color:#e8ecf4"><div style="padding:16px 16px 0;font:700 24px Arial">Shunt hero car concepts, first pass: silhouettes only, all in the player cyan, lit by the game's night studio. Left: three-quarter nose. Right: the gameplay angle.</div>` +
  names.map((n, i) => `<div style="display:flex;gap:16px;padding:8px 16px"><img width="${W}" height="${Hh}" src="data:image/png;base64,${cells.find(c => c.i === i && c.view === 'front').b64}"><img width="${W}" height="${Hh}" src="data:image/png;base64,${cells.find(c => c.i === i && c.view === 'top').b64}"></div>`).join('') + '</body>';
await sheet.setContent(html); await sheet.waitForTimeout(500); await sheet.screenshot({ path: path.join(out, 'hero-sheet.png'), fullPage: true });
console.log('wrote hero-sheet.png; errors', errors.length ? errors : 'none'); await browser.close();
