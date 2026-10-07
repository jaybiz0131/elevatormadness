// Stop 5 input check with real pointer events: a sideways or vertical drag never fires anything, MISSILE held for a third of a second drops a mine while a tap fires the missile, and the BOOST button spends the meter.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1&seed=3'); await page.waitForFunction(() => window.__shunt && window.__shunt.G, null, { timeout: 30000 }); await page.waitForTimeout(500);
await page.evaluate(() => { window.__shunt.startPlaying(); window.__shunt.runSteps(600); });   // 5 s in: up to speed
const st = () => page.evaluate(() => { const g = window.__shunt.G; return { speed: Math.round(g.speed), mines: g.mineAmmo, missiles: g.special ? g.special.ammo : -1, bst: +g.bst.toFixed(2), bstT: +g.bstT.toFixed(2), turns: g.turns }; });
const steps = (n) => page.evaluate((n) => window.__shunt.runSteps(n), n);
const out = {};
// 1. a sideways drag is not a turn
await page.mouse.move(200, 600); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.move(300, 600, { steps: 6 }); await page.waitForTimeout(20); await page.mouse.up(); await steps(6); out.sideways = await st();
// 2. a slow vertical drag is not a turn
await page.mouse.move(200, 500); await page.mouse.down(); await page.waitForTimeout(150); for (let i = 0; i < 12; i++) { await page.mouse.move(200, 500 + i * 8); await page.waitForTimeout(60); } await page.mouse.up(); await steps(6); out.slowDrag = await st();
// 3. a quick vertical flick does nothing now (the swipe turn-around was dropped for the e-brake 180)
await page.mouse.move(200, 500); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.move(200, 600, { steps: 6 }); await page.waitForTimeout(10); await page.mouse.up(); await steps(6); out.flickDown = await st();
// 5. BOOST button
const b = await page.locator('#boost').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); await steps(6); out.boost = await st();
// 6. MISSILE tap, then MISSILE held
const m = await page.locator('#special').boundingBox(); const mx = m.x + m.width / 2, my = m.y + m.height / 2;
await page.mouse.move(mx, my); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await steps(6); out.missileTap = await st();
await page.mouse.move(mx, my); await page.mouse.down(); await page.waitForTimeout(450); await steps(6); await page.mouse.up(); await steps(6); out.missileHold = await st();
console.log(JSON.stringify(out, null, 1)); if (errors.length) console.log('ERRORS', errors);
await browser.close();
