// Hero model shots on the beauty route (seed 3, 5 s in, a straight): gameplay at the normal camera, a three-quarter close-up and a
// top-down, plus the hero's numbers (triangles, draw calls, frame total).   node tools/heroshots.mjs <outDir> [extra query, e.g. hero=code]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html');
const out = process.argv[2] || 'shots'; const extra = process.argv[3] ? '&' + process.argv[3] : ''; fs.mkdirSync(out, { recursive: true });
const VIEWS = (process.argv[4] ? process.argv[4].split(',') : ['gameplay', 'closeup-34', 'topdown']).map(n => [n, { gameplay: '', 'closeup-34': '&cam=20,13,36,-38,0.5', topdown: '&cam=89,16,36,0.01,0.5' }[n]]);   // argv[4]: a subset
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, q] of VIEWS) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + pageFile + '?shots=1' + q + extra);
  await page.waitForFunction(() => window.__shunt && window.__shunt.G && window.__shunt.G.t >= 5, null, { timeout: 600000, polling: 50 });
  // one frame's draw calls for the hero alone (main pass and shadow pass), counted by object name
  const r = await page.evaluate(() => new Promise((res) => { const R = window.__shunt.renderer(); const gl = R.renderer; const orig = gl.renderBufferDirect.bind(gl); let hero = 0, heroShadow = 0; const heroObjs = new Set(); R.cars.player.traverse(o => heroObjs.add(o));
    gl.renderBufferDirect = function (camera, scene, geometry, material, object, group) { if (heroObjs.has(object)) { if (material.isMeshDepthMaterial || material.isMeshDistanceMaterial) heroShadow++; else hero++; } return orig(camera, scene, geometry, material, object, group); };
    requestAnimationFrame(() => { hero = 0; heroShadow = 0; requestAnimationFrame(() => { gl.renderBufferDirect = orig; res({ hero, heroShadow, stats: R.stats(), info: R.state.heroInfo || null, heroError: R.state.heroError || null }); }); }); }));
  await page.screenshot({ path: path.join(out, `hero-${name}.png`) });
  console.log(name, JSON.stringify({ heroCalls: r.hero, heroShadowCalls: r.heroShadow, frameCalls: r.stats.calls, frameTris: r.stats.triangles, errors }));
  if (name === 'gameplay') console.log('hero', JSON.stringify(r.info), r.heroError || '');
  await page.close();
}
await browser.close();
