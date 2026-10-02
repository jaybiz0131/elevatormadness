// Renders the look-dev page to PNGs with headless Chromium.
// Usage: node render.mjs [outDir]   (expects playwright to be resolvable)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const states = (process.argv[3] || 'night,dusk,fog').split(',');
const t = process.argv[4] || '4.2';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text()); });
for (const s of states) {
  const url = 'file://' + path.join(here, 'index.html') + `?state=${s}&t=${t}`;
  await page.goto(url);
  await page.waitForFunction(() => document.title === 'rendered', null, { timeout: 60000 });
  const file = path.join(out, `${s}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
}
await browser.close();
