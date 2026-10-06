// Budget sweep: plays replays synchronously and draws a full-quality frame every --every seconds of sim time (no screenshots), keeping the
// worst draw calls and triangles and the moment they happened. node tools/budget.mjs replays/feel-s1-active.json [...] [--every=0.25]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const files = args.filter(a => !a.startsWith('--')); const every = Number((args.find(a => a.startsWith('--every=')) || '--every=0.25').slice(8));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const f of files) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
  await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?scale=1'); await page.waitForFunction(() => window.__shunt && window.__shunt.renderer && window.__shunt.renderer().state.modelsReady, null, { timeout: 60000 }); await page.waitForTimeout(500);
  const r = await page.evaluate(({ rep, every }) => { const sh = window.__shunt; const G = sh.loadReplay(rep); let worst = { calls: 0, tris: 0, tc: 0, tt: 0, bodies: 0 }, next = 0.5;
    while (!G.rep.ended && sh.phase !== 'over') { sh.runSteps(6); if (G.t >= next) { next += every; sh.renderFrame(1 / 20); const st = sh.renderer().stats(); if (st.calls > worst.calls) { worst.calls = st.calls; worst.tc = +G.t.toFixed(1); } if (st.triangles > worst.tris) { worst.tris = st.triangles; worst.tt = +G.t.toFixed(1); } worst.bodies = Math.max(worst.bodies, sh.CRASH.bodies); } }
    return worst; }, { rep: JSON.parse(fs.readFileSync(f, 'utf8')), every });
  console.log(path.basename(f), 'worst draw calls', r.calls, 'at', r.tc, 's; worst triangles', r.tris, 'at', r.tt, 's; most tumbling wrecks', r.bodies);
  await page.close();
}
await browser.close();
