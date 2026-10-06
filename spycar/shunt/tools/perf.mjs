// Busy-frame cost: steps a replay to its busiest moment (most enemies, smoke and sparks at once, or --at=SECONDS), draws it at phone settings
// (390 x 844 at device pixel ratio 2) and reports the time per frame, draw calls and triangles for each query string given. Software GL, so
// the milliseconds are only a relative measure of what a change costs (fill rate, vertices), not an iPhone frame rate.
//   node tools/perf.mjs <replay.json> "<query1>" "<query2>" ...      e.g. "gfx=high" "gfx=low" "gfx=high&q=msaa:0"
//   options: --at=SECONDS  --frames=6  --dpr=2
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const pos = args.filter(a => !a.startsWith('--')); const [replay, ...queries] = pos;
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const rep = JSON.parse(fs.readFileSync(replay, 'utf8')); const frames = Number(opt.frames || 6), dpr = Number(opt.dpr || 2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function open(query) { const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, hasTouch: true }); page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
  await page.goto('file://' + (opt.page ? path.resolve(opt.page) : path.join(here, '..', 'dist', 'shunt.html')) + '?' + query); await page.waitForFunction(() => window.__shunt && window.__shunt.renderer().state.modelsReady, null, { timeout: 180000, polling: 500 }); return page; }
let at = opt.at ? Number(opt.at) : null;
if (at === null) { const page = await open('lite=1'); at = await page.evaluate((r) => { const sh = window.__shunt; const G = sh.loadReplay(r); let best = 0, bt = 0; for (let g = 0; g < 4000 && !G.rep.ended; g++) { sh.runSteps(12); if (!G.playing || G.t < 10) continue; let en = 0; for (const c of G.cars) if (c.alive && c.kind !== 'civ' && c.kind !== 'truck' && Math.abs(c.y - G.dist) < 900) en++; const score = en * 3 + G.puffs.length * 0.05 + G.sparks.length * 0.02 + G.debris.length * 0.1 + (G.crates.length ? 1 : 0); if (score > best) { best = score; bt = G.t; } } return bt; }, rep); await page.close(); console.log('busiest moment at', at.toFixed(1), 's'); }
console.log('query'.padEnd(34), 'ms/frame  calls  tris     scale');
for (const q of queries) {
  const page = await open(q); const res = await page.evaluate(({ r, t, n }) => { const sh = window.__shunt; const G = sh.loadReplay(r); while (G.t < t - 24 * 0.05 && !G.rep.ended) sh.runSteps(6); for (let i = 0; i < 24; i++) { sh.runSteps(6); sh.renderFrame(0.05); }
    const rr = sh.renderer(), gl = rr.renderer.getContext(), px = new Uint8Array(4); let ms = 0; let st; for (let i = 0; i < n; i++) { sh.runSteps(6); const t0 = performance.now(); sh.renderFrame(0.05); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms += performance.now() - t0; st = rr.stats(); }
    return { ms: ms / n, calls: st.calls, tris: st.triangles, scale: st.scale, t: G.t, puffs: G.puffs.length, cars: G.cars.length }; }, { r: rep, t: at, n: frames });
  console.log(q.padEnd(34), res.ms.toFixed(0).padStart(8), String(res.calls).padStart(6), String(res.tris).padStart(8), res.scale.toFixed(2).padStart(8), ' (puffs', res.puffs + ', cars', res.cars + ')'); await page.close();
}
await browser.close();
