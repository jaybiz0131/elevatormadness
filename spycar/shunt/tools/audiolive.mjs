// Runs the real frame loop with the audio context live (no gesture needed in headless) through gas, a drift, a burnout, the gatling and a hard stop, and reports any page error and the drive graph state.
//   node tools/audiolive.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 300))); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1&seed=3'); await page.waitForFunction(() => window.__shunt && window.__shunt.G, null, { timeout: 30000 }); await page.waitForTimeout(800);
await page.evaluate(() => { const a = window.__shunt.audio; a.init(); a.resume(); window.__shunt.startPlaying(); });
const put = (thr, fire, eb) => page.evaluate(({ thr, fire, eb }) => { const inp = window.__shunt.input; inp.raw = true; inp.puckId = 77; inp.puckThr = thr; inp.puckFire = fire; inp.puckEb = eb; }, { thr, fire, eb });
const seq = [[1, false, false, 2500], [1, true, false, 1500], [1, true, true, 1500], [-1, false, false, 2500], [1, true, true, 3000], [1, false, false, 1500]];
for (const [thr, fire, eb, ms] of seq) { await put(thr, fire, eb); await page.waitForTimeout(ms); }
const st = await page.evaluate(() => { const a = window.__shunt.audio; const g = window.__shunt.G; return { state: a.state(), drive: !!a.drive, t: +g.t.toFixed(1), speed: Math.round(g.speed), shots: g.shots, bo: g.burnouts }; });
console.log(JSON.stringify(st), errors.length ? errors : 'no errors'); await browser.close();
