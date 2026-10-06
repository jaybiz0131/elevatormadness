// Camera shots from a replay: the horizon on a straight (default 4 s in) and the first hairpin (at the apex), through the live camera and
// HUD. The sim is stepped synchronously and the frames are drawn by hand (software GL cannot run the loop at pace).
//   node tools/camshots.mjs <outDir> <replay.json> <label> [--q=camera=B] [--at=4] [--scale=2] [--warm=24]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const pos = args.filter(a => !a.startsWith('--')); const [out, replay, label] = pos;
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const rep = JSON.parse(fs.readFileSync(replay, 'utf8')); fs.mkdirSync(out, { recursive: true });
const query = opt.q ? '?' + opt.q : ''; const at = Number(opt.at || 4), warm = Number(opt.warm || 24);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function open() { const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(opt.scale || 2), hasTouch: true }); page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200))); await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + query); await page.waitForFunction(() => window.__shunt && window.__shunt.renderer().state.modelsReady, null, { timeout: 180000, polling: 500 }); return page; }
// pass 1: when is the car at the first hairpin apex?
let page = await open();
const hp = await page.evaluate((r) => { const sh = window.__shunt; const G = sh.loadReplay(r); for (let i = 0; i < 6000; i++) { if (G.rep.ended) return null; sh.runSteps(6); const c = G.road.at(G.dist).corner; if (c && c.type === 'hairpin' && G.dist > c.apex - 60) return +G.t.toFixed(2); } return null; }, rep);
await page.close(); console.log('first hairpin apex at', hp);
for (const [name, t] of [['horizon', at], ['hairpin', hp]]) {
  if (t === null) continue; page = await open();
  const info = await page.evaluate(({ r, t, warm }) => { const sh = window.__shunt; const G = sh.loadReplay(r); while (G.t < t - warm * 0.05 && !G.rep.ended) sh.runSteps(6); for (let i = 0; i < warm; i++) { sh.runSteps(6); sh.renderFrame(0.05); } const st = sh.renderer().stats(); const rr = sh.renderer(), pt = { x: 0, y: 0 }; rr.project(G.x, G.dist, pt); return { t: G.t, speed: G.speed, calls: st.calls, tris: st.triangles, cam: sh.S.cam, lift: +rr.camera.lift.toFixed(2), blocked: rr.camera.blocked, carScreen: [Math.round(pt.x), Math.round(pt.y)] }; }, { r: rep, t, warm });
  await page.screenshot({ path: path.join(out, `${label}-${name}.png`), timeout: 180000 }); console.log(label, name, JSON.stringify(info)); await page.close();
}
await browser.close();
