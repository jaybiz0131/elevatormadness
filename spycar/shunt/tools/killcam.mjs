// Capture tool: finds a kill sequence in a replay and renders it frame by frame (the sim is stepped, one frame is drawn per step batch),
// so a software-GL machine can make a smooth clip. Writes PNGs; encodes a webm when ffmpeg is available.
//   node tools/killcam.mjs <outDir> <replay.json> [--find] [--at=SECONDS] [--len=10] [--fps=24] [--lite]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const files = args.filter(a => !a.startsWith('--')); const out = files[0], replay = files[1];
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const pageFile = path.join(here, '..', 'dist', 'shunt.html'); const rep = JSON.parse(fs.readFileSync(replay, 'utf8'));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function open(lite) { const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: lite ? 1 : 2, hasTouch: true }); page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200))); await page.goto('file://' + pageFile + (lite ? '?lite=1' : '')); await page.waitForTimeout(800); return page; }
let at = opt.at !== undefined ? Number(opt.at) : null;
if (at === null || opt.find) {
  const page = await open(true);
  const res = await page.evaluate(({ r, gunOnly }) => { const sh = window.__shunt; const G = sh.loadReplay(r); G.wreckLog = []; const kills = []; let last = 0;
    for (let g = 0; g < 4000; g++) { if (G.rep.ended) break; sh.runSteps(1); if (G.wreckLog.length > last) { for (let k = last; k < G.wreckLog.length; k++) { const gun = / gun /.test(G.wreckLog[k]); if (!gunOnly || (gun && !G.drifting && !G.spinning && Math.abs(G.heading) < 0.3)) kills.push(+G.t.toFixed(2)); } last = G.wreckLog.length; } }
    return kills; }, { r: rep, gunOnly: !!opt.gun });
  await page.close();
  // the busiest 3 s window: most kills, then the earliest
  let best = null; for (let i = 0; i < res.length; i++) { const n = res.filter(t => t >= res[i] && t < res[i] + 3).length; if (!best || n > best.n) best = { n, t: res[i] }; }
  console.log('kills at', res.join(' '), '| busiest window starts at', best && best.t, 'with', best && best.n); if (opt.find) { await browser.close(); process.exit(0); }
  at = best ? best.t : 20;
}
const fps = Number(opt.fps || 24), len = Number(opt.len || 10), per = Math.round(120 / fps), start = Math.max(0, at - 3.0);
const page = await open(!!opt.lite);
await page.evaluate(({ r, start }) => { const sh = window.__shunt; sh.loadReplay(r); const G = sh.G; while (G.t < start && !G.rep.ended) sh.runSteps(6); }, { r: rep, start });
const n = Math.round(len * fps); const t0 = Date.now(); let maxCalls = 0, maxTris = 0;
for (let f = 0; f < n; f++) {
  const r = await page.evaluate(({ per, dt }) => { const sh = window.__shunt; const G = sh.G; sh.runSteps(per); sh.renderFrame(dt); const st = sh.renderer().stats(); return { alive: !G.rep.ended, calls: st.calls, tris: st.triangles }; }, { per, dt: 1 / fps });
  maxCalls = Math.max(maxCalls, r.calls); maxTris = Math.max(maxTris, r.tris); const alive = r.alive;
  await page.screenshot({ path: path.join(out, 'f' + String(f).padStart(4, '0') + '.png') });
  if (f % 20 === 0) console.log('frame', f, 'of', n, ((Date.now() - t0) / 1000).toFixed(0) + ' s'); if (!alive) { console.log('replay ended at frame', f); break; }
}
await browser.close();
console.log('frames in', out, '| max draw calls', maxCalls, '| max triangles', maxTris);
