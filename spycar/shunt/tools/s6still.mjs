// Stills of the Stop 6 street effects with the sim state set by hand (no driving): fires, scars and a chip burst on the right-hand facade ahead of a car
// parked at the kerb. node tools/s6still.mjs <outPrefix> [--cam=pitch,dist,fov,yaw,screenY] [--seed=3] [--t=0.4,1.5,5]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const out = path.resolve(args.find(a => !a.startsWith('--')));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
page.on('console', m => { if (m.text().startsWith('DBG')) console.log(m.text()); }); page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?scale=1.5&seed=' + (opt.seed || 3) + (opt.cam ? '&cam=' + opt.cam : '')); await page.waitForFunction(() => window.__shunt && window.__shunt.G, null, { timeout: 30000 }); await page.waitForTimeout(1500);
await page.evaluate(() => { const sh = window.__shunt; sh.startPlaying(); sh.runSteps(600); const G = sh.G; for (const c of G.cars) c.alive = false; G.bullets.length = 0; window.__drive = () => { const inp = sh.input; inp.raw = true; inp.puckId = 77; inp.puckThr = sh.G.speed > 15 ? -1 : 0; inp.puckFire = false; inp.puckEb = false; }; });
const times = String(opt.t || '0.3,1.2,4').split(',').map(Number);
await page.evaluate(() => { const sh = window.__shunt, G = sh.G; for (let i = 0; i < 700; i++) { window.__drive(); sh.runSteps(1); }   const ch = sh.renderer().fx.chaos, V = { x: 0, y: 0, z: 0 }; let best = null; for (let q = G.dist + 80; q < G.dist + 600 && !best; q += 10) for (const side of [-1, 1]) { const F = ch.face(G, side, q, V, {}); if (F && F.top < 11) { best = { side, s: q }; break; } }
  const side = best.side, s = best.s + 10; window.__best = best; G.dist = best.s - 70; G.pdist = G.dist; G.x = 195 + side * 40; G.px = G.x; G.targetX = G.x; for (const c of G.cars) c.alive = false; G.cars.length = 0;
  for (let i = 0; i < 12; i++) G.scars.push({ side, s: s + i * 3 - 12, h: 1 + (i * 0.37) % 2.8, kind: 0, t: 0.05 * i, seed: (i * 0.618) % 1 });
  G.scars.push({ side, s: s + 40, h: 3, kind: 1, t: 0.2, seed: 0.4 }); G.fires.push({ side, s: s + 40, h: 2.2, w: 5, t: 0.5, life: 9, seed: 0.3 }); G.fires.push({ side, s: s + 80, h: 1.6, w: 4, t: 4, life: 9, seed: 0.7 }); G.scars.push({ side, s: s + 80, h: 2.6, kind: 1, t: 4, seed: 0.9 }); });
let k = 0; for (const t of times) { await page.evaluate((t) => { const sh = window.__shunt, G = sh.G; const n = Math.round(t * 120); for (let i = 0; i < n; i++) { window.__drive(); sh.runSteps(1); } for (let f = 0; f < 6; f++) sh.renderFrame(1 / 24); const ch = sh.renderer().fx.chaos; console.log('DBG', JSON.stringify({ st: ch.stats, sc: G.scars.length, fi: G.fires.length, d: Math.round(G.dist), s0: G.scars[0] && Math.round(G.scars[0].s), calls: sh.renderer().stats().calls })); }, t); await page.screenshot({ path: out + '-' + (k++) + '.png' }); }
await browser.close();
