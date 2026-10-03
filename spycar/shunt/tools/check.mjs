// Step 7 checks: (1) a "zoo" frame with one of every object the renderer must show, injected into the run (harness only), screenshot;
// (2) a context-loss test: lose the WebGL context, wait, confirm frames resume with no errors; (3) budget numbers from renderer.info.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html'); const out = process.argv[2] || path.join(here, '..', 'dist');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|vibrate/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto('file://' + pageFile + '?seed=3&look=' + (process.argv[3] || 'night')); await page.waitForTimeout(800);
await page.evaluate(() => window.__shunt.startPlaying());
await page.waitForFunction(() => window.__shunt.G.t > 4, null, { timeout: 120000 });
// the zoo: every kind of car, a wreck, pickups, a barrel, cones, a crate on a ramp, a roadblock, a median, an oil slick, bullets, missiles, smoke, sparks, an explosion
await page.evaluate(() => {
  const sh = window.__shunt, G = sh.G, T = sh.T; const d = G.dist, road = G.road; const lane = (i, s) => road.laneX(s, i);
  const mk = (kind, x, y, extra) => { const c = Object.assign({ kind, x, y, px: x, py: y, w: T.sizes[kind][0], l: T.sizes[kind][1], mass: 1, vx: 0, speed: G.speed, factor: 1, hp: 3, alive: true, wrecked: false, debrisT: 0, spin: 0, flip: 0, state: 'approach', t: 0, lane: 0, blink: 0, blinkDir: 0, laneTimer: 9, hitCd: 0, shunted: false, slammed: false, credit: false, creditT: 0, how: null, penalised: false, closeCalled: false, id: 0.5, tint: '#fff1c9', side: 1, sight: 0, cd: 0, honk: 0, sq: 1, hitFlash: 0, lean: 0 }, extra || {}); G.cars.push(c); return c; };
  mk('civ', lane(0, d + 150), d + 150, { blink: 0.6, blinkDir: 1 }); mk('weak', lane(1, d + 260), d + 260); mk('bruiser', lane(2, d + 120), d + 120, { state: 'tell', t: 0.3 }); mk('gunner', lane(1, d - 230), d - 230, { state: 'sight', sightX: G.x }); mk('armored', lane(2, d + 420), d + 420); mk('truck', lane(0, d + 330), d + 330, { loaded: false });
  mk('weak', lane(3, d + 200), d + 200, { wrecked: true, debrisT: 1.2, flip: 0.3, spin: 0.5 });
  G.barrels.push({ x: lane(3, d + 300), y: d + 300, alive: true }); for (let i = 0; i < 3; i++) G.cones.push({ x: lane(0, d + 60 + i * 40) - 20, y: d + 60 + i * 40, alive: true });
  G.ramps.push({ y: d + 520, lane: 1, x: lane(1, d + 520), w: T.laneW * 1.6, used: false, setup: 'crate', crate: { taken: false } }); G.crates.push({ x: lane(2, d + 90), y: d + 90, vy: 0, t: 0.5, kind: 'ammo', speed: G.speed });
  G.barriers.push({ y: d + 600, lanes: 2, lane0: 2 }); G.medians.push({ y0: d + 640, y1: d + 760, lane0: 1, lanes: 1 }); G.slicks.push({ x: lane(3, d + 40), y: d + 40, t: 5, r: 30 });
  for (let i = 0; i < 4; i++) G.bullets.push({ x: G.x + (i % 2 ? 9 : -9), y: d + 60 + i * 50, vx: 0, dmg: 1 }); G.missiles.push({ x: G.x + 14, y: d + 160, t: 0.3 });
  G.fx.push({ x: lane(3, d + 200), y: d + 200, t: 0.1, life: 0.6, big: true }); G.fx.push({ x: G.x, y: d, t: 0.1, life: 0.4, ring: true });
  for (let i = 0; i < 12; i++) G.sparks.push({ x: G.x + 17, y: d - 10 - i * 6, vx: 100, vy: -200, t: 0.05 * i, col: i % 2 ? '#ffd23f' : null });
  for (let i = 0; i < 20; i++) G.puffs.push({ x: G.x - 12 + (i % 2) * 24, y: d - 30 - i * 10, vx: 0, speed: 0, t: i * 0.06, seed: i });
  G.pops.push({ x: G.x, y: d + 80, text: '+750 SLAM KILL', t: 0.1 }); G.special = { kind: 'missiles', ammo: 4, level: 1 }; G.combo = 3; G.comboT = 2; G.drifting = true; G.driftCharge = 1.2; G.driftTier = 1;
  sh.G.hitStop = 10;   // freeze the sim so the frame holds while the screenshot is taken
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, 'zoo.png') });
const stats = await page.evaluate(() => window.__shunt.renderer().stats()); console.log('zoo frame:', JSON.stringify(stats));
// context loss
const lost = await page.evaluate(() => { window.__shunt.G.hitStop = 0; return window.__shunt.renderer().simulateContextLoss(); });
await page.waitForTimeout(2500);
const after = await page.evaluate(async () => { const sh = window.__shunt; if (sh.phase !== 'playing') sh.startPlaying(); const t0 = sh.G.t; const f0 = sh.perf ? 0 : 0; await new Promise(r => setTimeout(r, 3000)); const r = sh.renderer(); return { phase: sh.phase, advanced: sh.G.t > t0, simSeconds: +(sh.G.t - t0).toFixed(2), lost: r.state.lost, calls: r.stats().calls }; });
console.log('context loss test:', lost ? 'lost and restored' : 'extension missing', JSON.stringify(after));
await page.screenshot({ path: path.join(out, 'after-context-loss.png') });
console.log('errors', errors.length ? errors : 'none');
await browser.close();
