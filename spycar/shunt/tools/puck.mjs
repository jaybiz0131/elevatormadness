// The control puck with real pointer events (Stop 6 mapping): touching it anywhere is GAS; sliding right adds the gatling, sliding left the e-brake, and neither
// ever cancels the gas; a pull down brakes (harder pull needed in the side zones) and then reverses; lifting off coasts. Prints a table and exits 1 on a failure.
//   node tools/puck.mjs <outDir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const out = path.resolve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1&intro=0&seed=3'); await page.waitForFunction(() => window.__shunt && window.__shunt.G); await page.waitForTimeout(800);
await page.evaluate(() => { window.__shunt.startPlaying(); window.__shunt.runSteps(80); });
const st = () => page.evaluate(() => { const g = window.__shunt.G; return { thr: +g.in.thr.toFixed(2), fire: g.in.fire, eb: g.in.ebrake, speed: Math.round(g.speed), shots: g.shots }; });
const steps = (n) => page.evaluate((n) => window.__shunt.runSteps(n), n);
const b = await page.locator('#puck').boundingBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2, R = b.width * 0.4; const rows = []; let fails = 0;
const check = async (name, x, y, want) => { await page.mouse.move(x, y, { steps: 3 }); await steps(20); const s = await st(); const ok = want(s); if (!ok) fails++; rows.push((ok ? 'ok   ' : 'FAIL ') + name.padEnd(34) + JSON.stringify(s)); return s; };
await page.mouse.move(cx, cy); await page.mouse.down(); await steps(2);
await check('touch the middle', cx, cy, s => s.thr === 1 && !s.fire && !s.eb);
await steps(240); await check('middle, 2 s later: still gaining', cx, cy, s => s.thr === 1 && s.speed > 500);
await check('up', cx, cy - R, s => s.thr === 1 && !s.fire && !s.eb);
await check('right, level (FIRE)', cx + R * 0.8, cy, s => s.thr === 1 && s.fire && !s.eb);
await check('right and low (FIRE, thumb sagging)', cx + R * 0.8, cy + R * 0.45, s => s.thr === 1 && s.fire);
await check('left, level (E-BRAKE)', cx - R * 0.8, cy, s => s.thr === 1 && s.eb && !s.fire);
await check('left and low (E-BRAKE, sagging)', cx - R * 0.8, cy + R * 0.45, s => s.thr === 1 && s.eb);
await check('down-right hard (fire and brake)', cx + R * 0.45, cy + R * 0.9, s => s.thr < 0 && s.fire);
await page.screenshot({ path: path.join(out, 'puck-gas-fire.png') });
await check('centre, slightly low (still gas)', cx, cy + R * 0.2, s => s.thr === 1);
await check('pull down (brake)', cx, cy + R, s => s.thr <= -0.9);
await steps(400); await check('held down: stopped, now reversing', cx, cy + R, s => s.speed < 0);
await page.mouse.move(cx, cy, { steps: 3 }); await steps(240); const g1 = await st(); rows.push('     gas again after reversing ' + JSON.stringify(g1)); if (!(g1.speed > 100)) fails++;
await page.mouse.up(); await steps(5); const rel = await st(); const coast = rel.thr === 0 && !rel.fire && !rel.eb; if (!coast) fails++; rows.push((coast ? 'ok   ' : 'FAIL ') + 'lift off: coast'.padEnd(34) + JSON.stringify(rel));
await page.evaluate(() => { document.getElementById('ui').classList.add('simplemode'); document.getElementById('ui').classList.remove('puckmode'); });
const gb = await page.locator('#gas').boundingBox(); await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down(); await steps(120); const sg = await st(); rows.push((sg.thr === 1 ? 'ok   ' : 'FAIL ') + 'simple buttons: GAS'.padEnd(34) + JSON.stringify(sg)); if (sg.thr !== 1) fails++;
await page.screenshot({ path: path.join(out, 'simple-buttons.png') }); await page.mouse.up();
console.log(rows.join('\n')); console.log(fails ? fails + ' FAILED' : 'ALL OK'); if (errors.length) console.log('ERRORS', errors);
await browser.close(); process.exit(fails ? 1 : 0);
