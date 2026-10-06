// Stills from a replay at chosen sim times, stepped synchronously (software GL cannot run the page loop at pace). The last second before
// each time is drawn at 24 fps so effects that live on the frame clock (explosions, fire) are in step with the sim.
//   node tools/capture.mjs <outPrefix> <replay.json> --at=5,34,36.2 [--page=dist/shunt.html] [--q=look=night] [--boom]
//   --old: the v24 light settings (exposure, fill, key, env, grade, no car rim) on this build, for a same-frame brightness comparison
//   --boom: after each time, wait for the next explosion within 450 pt of the car and shoot it 0.25 s in
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const files = args.filter(a => !a.startsWith('--')); const out = files[0], rep = JSON.parse(fs.readFileSync(files[1], 'utf8'));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const pageFile = opt.page ? path.resolve(opt.page) : path.join(here, '..', 'dist', 'shunt.html');
const times = String(opt.at || '5').split(',').map(Number);
fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
await page.goto('file://' + pageFile + '?scale=1.5' + (opt.q ? '&' + opt.q : '')); await page.waitForFunction(() => window.__shunt && window.__shunt.G, null, { timeout: 30000 }); await page.waitForTimeout(1500);
await page.evaluate((r) => { window.__shunt.loadReplay(r); }, rep);
if (opt.old) await page.evaluate(() => { const R = window.__shunt.renderer(); Object.assign(R.P, { exposure: 1.15, hemiIntensity: 1.1, hemiSky: '#3a4a8a', hemiGround: '#1a1420', sunIntensity: 1.8, envIntensity: 0.7, gradeContrast: 1.08, gradeLift: 0, rimIntensity: 0 }); R.applyLook(); });
for (const t of times) {
  const r = await page.evaluate(({ t, boom }) => { const sh = window.__shunt, G = sh.G;
    while (G.t < t - 1 && !G.rep.ended) sh.runSteps(1);
    while (G.t < t && !G.rep.ended) { sh.runSteps(5); sh.renderFrame(1 / 24); }
    if (boom) { let k = 0; while (!G.rep.ended && k++ < 120 * 30) { sh.runSteps(5); sh.renderFrame(1 / 24); if (G.fx.some(f => f.big && Math.abs(f.y - G.dist) < 450 && f.t > 0.18)) break; } }
    sh.renderFrame(1 / 24); const st = sh.renderer().stats(); return { t: G.t, calls: st.calls, tris: st.triangles }; }, { t, boom: !!opt.boom });
  const file = out + '-' + String(t).replace('.', '_') + '.png'; const t0 = Date.now(); await page.screenshot({ path: file, timeout: 180000 }); console.log('shot ms', Date.now() - t0);
  console.log(path.basename(file), 'sim t', r.t.toFixed(2), 'calls', r.calls, 'tris', r.tris);
}
await browser.close();
