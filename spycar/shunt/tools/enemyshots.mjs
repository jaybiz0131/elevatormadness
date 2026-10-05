// Enemy model shots: places the four enemy types (and the Mule placeholder) around the hero on the beauty route, freezes the frame,
// and takes a gameplay shot (normal camera, several enemies ahead) and a top-down lineup next to the hero; prints draw calls.
//   node tools/enemyshots.mjs <outDir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html'); const out = process.argv[2] || 'shots'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ONLY = process.argv[3]; for (const [name, q, layout] of [['enemies-gameplay', '', 'ahead'], ['enemies-topdown', '&cam=89,62,40,0.01,0.5', 'lineup']]) {
  if (ONLY && name !== ONLY) continue; const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + pageFile + '?seed=3' + q);
  await page.waitForFunction(() => window.__shunt && window.__shunt.renderer && window.__shunt.renderer().state.modelsReady, null, { timeout: 60000 }); await page.waitForTimeout(500);
  await page.evaluate(() => window.__shunt.startPlaying());
  await page.waitForFunction(() => window.__shunt.G.t > 3, null, { timeout: 300000 });
  await page.evaluate((layout) => {
    const sh = window.__shunt, G = sh.G, T = sh.T, d = G.dist, road = G.road; G.cars.length = 0;
    const mk = (kind, x, y) => G.cars.push({ kind, x, y, px: x, py: y, w: T.sizes[kind][0], l: T.sizes[kind][1], mass: 1, vx: 0, speed: G.speed, factor: 1, hp: 3, alive: true, wrecked: false, debrisT: 0, spin: 0, flip: 0, state: 'approach', t: 0, lane: 0, blink: 0, blinkDir: 0, laneTimer: 9, hitCd: 0, id: 0.5, tint: '#fff1c9', side: 1, sight: 0, cd: 0, honk: 0, sq: 1, hitFlash: 0, lean: 0 });
    const lane = (i, s) => road.laneX(s, i);
    if (layout === 'ahead') { mk('weak', lane(0, d + 160), d + 160); mk('bruiser', lane(2, d + 230), d + 230); mk('gunner', lane(1, d + 330), d + 330); mk('weak', lane(3, d + 400), d + 400); mk('armored', lane(1, d + 620), d + 620); mk('truck', lane(3, d + 520), d + 520); }
    else { mk('weak', G.x - 70, d); mk('bruiser', G.x + 75, d); mk('gunner', G.x - 70, d - 150); mk('armored', G.x + 40, d + 190); }
    G.hitStop = 30;   // hold the frame
  }, layout);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => new Promise((res) => { const R = window.__shunt.renderer(); const gl = R.renderer; const orig = gl.renderBufferDirect.bind(gl); const tally = {};
    gl.renderBufferDirect = function (c, s, g, m, o, gr) { const shadow = m.isMeshDepthMaterial || m.isMeshDistanceMaterial; if (/^enemy-/.test(o.name || '')) { const k = (shadow ? 'shadow ' : '') + o.name; tally[k] = (tally[k] || 0) + 1; } return orig(c, s, g, m, o, gr); };
    requestAnimationFrame(() => { for (const k in tally) delete tally[k]; requestAnimationFrame(() => { gl.renderBufferDirect = orig; res({ tally, stats: R.stats() }); }); }); }));
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log(name, JSON.stringify({ frameCalls: r.stats.calls, tris: r.stats.triangles, enemyDraws: r.tally, errors }));
  await page.close();
}
await browser.close();
