// Lists the Stop 6 moments of a replay (cloak on and off, chips, facade fires, wall blows) so clips can be cut: node tools/s6events.mjs replays/x.json
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const rep = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1'); await page.waitForTimeout(400);
const tl = await page.evaluate((r) => { const sh = window.__shunt; sh.loadReplay(r); const G = sh.G; const tl = []; let co = false, ch = 0, fi = 0, bo = 0, ls = 0, wf = 0, ln = 0;
  for (let i = 0; i < r.steps; i++) { sh.runSteps(1); const t = +G.t.toFixed(1);
    if (G.cloakOn !== co) { tl.push([t, G.cloakOn ? 'cloakOn' : 'cloakOff', G.cloakOn ? 'lost ' + G.lostSeen : '']); co = G.cloakOn; }
    if (G.chips >= ch + 5) { tl.push([t, 'chips', G.chips]); ch = G.chips; } if (G.facadeFires !== fi) { tl.push([t, 'facadeFire', G.facadeFires]); fi = G.facadeFires; }
    if (G.wallBooms !== bo) { tl.push([t, 'wallBoom', G.wallBooms]); bo = G.wallBooms; } if (G.wideShots !== wf) { tl.push([t, 'wideShot']); wf = G.wideShots; } if (G.in.fire && G.in.thr > 0.5 && !ln) { ln = 1; tl.push([t, 'gas+fire first']); } }
  return tl; }, rep);
console.log(JSON.stringify(tl)); await browser.close();
