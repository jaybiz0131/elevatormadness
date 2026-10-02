// Drives play.html in headless Chromium: starts a run, steers along the river
// centreline with a simulated thumb, fires, and screenshots. Reports errors.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'out');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + path.join(here, 'play.html'));
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, 'play-attract.png') });
// take the helm: touch down near the bottom and hold still (auto-fire), nudging toward the channel centre
await page.touchscreen.tap(200, 700);
await page.waitForTimeout(100);
const stats = [];
let t0 = Date.now();
for (let i = 0; i < 60; i++) {
  const s = await page.evaluate(() => { const g = window.__moonwake.G; const c = g.gen.centerX(g.dist + 120); return { phase: window.__moonwake.phase, dist: g.dist, x: g.x, c, score: g.score, fuel: g.fuel, lives: g.lives }; });
  stats.push(s);
  if (s.phase === 'over') break;
  // simulated thumb: anchor at (200,700); displace toward the channel centre
  const dx = Math.max(-48, Math.min(48, (s.c - s.x) * 1.2));
  await page.evaluate(({ dx }) => { const inp = window.__moonwake.input; const t = performance.now() / 1000; if (inp.id === null) inp.down(1, 200, 700, t); inp.move(1, 200 + dx, 700, t); }, { dx });
  await page.waitForTimeout(100);
  if (i === 25) await page.screenshot({ path: path.join(out, 'play-mid.png') });
}
await page.screenshot({ path: path.join(out, 'play-end.png') });
const last = stats[stats.length - 1];
console.log('frames sampled', stats.length, 'final', JSON.stringify(last), 'wall ms', Date.now() - t0);
console.log('errors', errors.length ? errors : 'none');
await browser.close();
