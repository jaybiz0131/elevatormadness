// Screenshots of the finale and the end screen from a recorded winning run: steps the replay to near the end, then lets the live loop
// play out the arrival and the card.  node tools/wincard.mjs <outDir> <replay.json>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2], rep = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html')); await page.waitForTimeout(1000);
const info = await page.evaluate((r) => { const sh = window.__shunt; const G = sh.loadReplay(r); const end = r.steps - 120 * 8; while (G.steps < end) sh.runSteps(6); sh.renderFrame(0.05); return { t: G.t, prog: G.prog, finale: G.finale }; }, rep);
console.log('stepped to', info); await page.screenshot({ path: path.join(out, 'finale.png') });
await page.evaluate(() => window.__shunt.resume());
for (let i = 0; i < 200; i++) { const ph = await page.evaluate(() => window.__shunt.phase); if (ph === 'over' || ph === 'victory') break; await page.waitForTimeout(500); if (ph === 'won' && i % 4 === 0) await page.screenshot({ path: path.join(out, 'arrival.png') }); }
await page.waitForTimeout(800); await page.screenshot({ path: path.join(out, 'city-reached.png') });
console.log(await page.evaluate(() => ({ phase: window.__shunt.phase, stars: window.__shunt.G.stars, score: window.__shunt.G.score })));
await browser.close();
