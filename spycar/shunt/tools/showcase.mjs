// A clean gatling showcase: a scripted driver (cruise speed, FIRE held, steers toward the nearest enemy ahead, no drifting, no Slam)
// plays a fresh run and every few steps a frame is drawn and saved. node tools/showcase.mjs <outDir> [--seed=5] [--from=2] [--len=10] [--fps=24]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const out = args.find(a => !a.startsWith('--')); const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const seed = Number(opt.seed || 5), from = Number(opt.from || 2), len = Number(opt.len || 10), fps = Number(opt.fps || 24), per = Math.round(120 / fps);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?seed=' + seed); await page.waitForTimeout(1000);
await page.evaluate(() => { window.__shunt.startPlaying(); window.__drive = () => { const sh = window.__shunt, g = sh.G, inp = sh.input; if (inp.id === null) inp.down(1, 200, 700, 0); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center;
  const e = g.cars.filter(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser' || c.kind === 'gunner') && c.y > g.dist + 40 && c.y < g.dist + 700).sort((a, b) => a.y - b.y)[0];
  const civ = g.cars.find(c => c.alive && !c.wrecked && c.kind === 'civ' && c.y > g.dist && c.y < g.dist + 260 && Math.abs(c.x - g.x) < 40);
  let want = e ? e.x : g.road.at(g.dist).center; if (civ && !e) want = civ.x + (civ.x < 195 ? 70 : -70);
  inp.fireHeld = !!e || g.gunSpin > 0.2 && g.cars.some(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && c.y > g.dist - 50 && c.y < g.dist + 800);
  inp.gas = false; inp.brake = false; inp.cur = { x: 200 + Math.max(-70, Math.min(70, (want - g.targetX) / 1.4)), y: 700 }; }; });
await page.evaluate((from) => { const sh = window.__shunt; while (sh.G.t < from) { window.__drive(); sh.runSteps(1); } }, from);
let maxCalls = 0, maxTris = 0; const n = Math.round(len * fps);
for (let f = 0; f < n; f++) {
  const r = await page.evaluate(({ per, dt }) => { const sh = window.__shunt; for (let i = 0; i < per; i++) { window.__drive(); sh.runSteps(1); } sh.renderFrame(dt); const st = sh.renderer().stats(); return { calls: st.calls, tris: st.triangles, kills: sh.G.kills, t: sh.G.t, armor: sh.G.armor, dead: sh.G.dead }; }, { per, dt: 1 / fps });
  maxCalls = Math.max(maxCalls, r.calls); maxTris = Math.max(maxTris, r.tris);
  await page.screenshot({ path: path.join(out, 'f' + String(f).padStart(4, '0') + '.png') });
  if (f % 24 === 0) console.log('frame', f, 'sim t', r.t.toFixed(1), 'kills', r.kills, 'armor', r.armor);
  if (r.dead) { console.log('died'); break; }
}
console.log('max draw calls', maxCalls, 'max triangles', maxTris); await browser.close();
