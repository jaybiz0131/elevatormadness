// The control puck with real pointer events: thumb up is gas, down brakes and then reverses, right fires, left holds the e-brake; then the same with
// Settings > Simple buttons. Writes two screenshots: node tools/puck.mjs <outDir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const out = path.resolve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1&seed=3'); await page.waitForFunction(() => window.__shunt && window.__shunt.G); await page.waitForTimeout(800);
await page.evaluate(() => { window.__shunt.startPlaying(); window.__shunt.runSteps(80); });
const st = () => page.evaluate(() => { const g = window.__shunt.G; return { thr: g.in.thr, fire: g.in.fire, eb: g.in.ebrake, speed: Math.round(g.speed), shots: g.shots }; });
const steps = (n) => page.evaluate((n) => window.__shunt.runSteps(n), n);
const b = await page.locator('#puck').boundingBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2, R = b.width * 0.4; const res = {};
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy - R, { steps: 4 }); await steps(240); res.gas = await st();
await page.mouse.move(cx + R * 0.7, cy - R * 0.7, { steps: 4 }); await steps(60); res.gasFire = await st();
await page.screenshot({ path: path.join(out, 'puck-gas-fire.png') });
await page.mouse.move(cx, cy + R, { steps: 4 }); await steps(360); res.brakeThenReverse = await st();
await page.mouse.move(cx - R, cy, { steps: 4 }); await steps(10); res.ebrake = await st();
await page.mouse.move(cx, cy, { steps: 4 }); await steps(10); res.centre = await st();
await page.mouse.up(); await steps(5); res.released = await st();
// simple buttons
await page.evaluate(() => { const { S } = window.__shunt; }); await page.evaluate(() => { document.getElementById('ui').classList.add('simplemode'); document.getElementById('ui').classList.remove('puckmode'); });
const gb = await page.locator('#gas').boundingBox(); await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down(); await steps(120); res.simpleGas = await st();
await page.screenshot({ path: path.join(out, 'simple-buttons.png') }); await page.mouse.up();
console.log(JSON.stringify(res, null, 0)); if (errors.length) console.log('ERRORS', errors);
await browser.close();
