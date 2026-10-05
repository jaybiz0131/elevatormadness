// Draw-call breakdown: plays the beauty route (?shots=1) to a sim time, then records one frame's draws by pass and object name.
// node tools/calls.mjs [simSeconds=5] [look=night]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html');
const at = Number(process.argv[2] || 5), look = process.argv[3] || 'night';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 300)));
await page.goto('file://' + pageFile + '?shots=1&look=' + look);
await page.waitForFunction((t) => window.__shunt && window.__shunt.G && window.__shunt.G.t >= t, at, { timeout: 600000, polling: 50 });
const r = await page.evaluate(() => new Promise((res) => {
  const R = window.__shunt.renderer(); const gl = R.renderer; const orig = gl.renderBufferDirect.bind(gl); const tally = {};
  gl.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const pass = material.isMeshDepthMaterial || material.isMeshDistanceMaterial || (camera.isOrthographicCamera && camera.parent === undefined && material.type === 'MeshDepthMaterial') ? 'shadow' : (scene && scene.isScene && scene === R.scene ? 'main' : 'post');
    const name = (object.name || object.userData.tag || (object.isInstancedMesh ? 'inst:' : '') + (object.geometry && object.geometry.type) + '/' + material.type) + (object.isInstancedMesh ? '' : '');
    const k = pass + ' ' + name; tally[k] = (tally[k] || 0) + 1; return orig(camera, scene, geometry, material, object, group);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => { gl.renderBufferDirect = orig; res({ tally, stats: R.stats() }); }));
}));
const rows = Object.entries(r.tally).sort((a, b) => b[1] - a[1]); let byPass = {}; for (const [k, n] of rows) { const p = k.split(' ')[0]; byPass[p] = (byPass[p] || 0) + n; }
for (const [k, n] of rows) console.log(String(n).padStart(4), k);
console.log('by pass', byPass, 'renderer.info calls', r.stats.calls, 'tris', r.stats.triangles);
await browser.close();
