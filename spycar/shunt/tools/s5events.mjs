// Lists the Stop 5 moments of a replay (air time, BOOST, mines, pile-ups) so clips can be cut: node tools/s5events.mjs replays/x.json
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const rep = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1'); await page.waitForTimeout(400);
const tl = await page.evaluate((r) => { const sh = window.__shunt; sh.loadReplay(r); const G = sh.G; const tl = []; let air = null, pb = false, pt = 0, pm = 0, pp = 0, pk = 0;
  for (let i = 0; i < r.steps; i++) { sh.runSteps(1); if (G.air > 0 && !air) air = { t: G.t, speed: G.speed, crest: G.crestAir }; if (G.air <= 0 && air) { tl.push([+air.t.toFixed(1), 'air', +(G.t - air.t).toFixed(2), Math.round(air.speed), air.crest ? 'crest' : 'ramp']); air = null; }
    const b = G.bstT > 0; if (b && !pb) tl.push([+G.t.toFixed(1), 'boost']); pb = b;
    if (G.mineHits !== pm) { tl.push([+G.t.toFixed(1), 'mineHit']); pm = G.mineHits; } if (G.pileups !== pp) { tl.push([+G.t.toFixed(1), 'pileup']); pp = G.pileups; } if (G.minesDropped !== pk) { tl.push([+G.t.toFixed(1), 'mine']); pk = G.minesDropped; } }
  return tl; }, rep);
console.log(JSON.stringify(tl)); await browser.close();
