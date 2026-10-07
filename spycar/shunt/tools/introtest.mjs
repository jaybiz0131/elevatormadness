// The opening scene in the sim (sync, lite): the hero's pose through the script, GO at 4.4 s, the clock of the run at 0 there, the first enemies and when they reach the car; and a skip.
//   node tools/introtest.mjs [--seed=3]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1&seed=' + (opt.seed || 3)); await page.waitForFunction(() => window.__shunt && window.__shunt.G); await page.waitForTimeout(600);
const r = await page.evaluate(() => { const sh = window.__shunt; const out = []; sh.startPlaying(); const G = sh.G;
  const put = (thr) => { const inp = sh.input; inp.raw = true; inp.puckId = 77; inp.puckThr = thr; inp.puckFire = false; inp.puckEb = false; };
  let t = 0; const row = (tag) => out.push(`${tag} intro=${G.intro ? G.intro.t.toFixed(2) : 'off'} G.t=${G.t.toFixed(2)} hidden=${G.heroHidden} x=${Math.round(G.x)} s=${Math.round(G.dist)} yaw=${(G.flipA * 57.3).toFixed(0)} speed=${Math.round(G.speed)} slip=${G.slip.toFixed(2)} puffs=${G.puffs.length} cars=${G.cars.length}`);
  for (let i = 0; i < 560; i++) { put(0); sh.runSteps(1); if (i % 30 === 0) row('step ' + i); if (!G.intro) break; }
  row('GO'); const goStep = G.steps; const t0 = G.t;
  let firstEnemy = null, hit = null, spawned = null, dmg0 = G.armorLost;
  for (let i = 0; i < 1200; i++) { put(1); sh.runSteps(1); const en = G.cars.filter(c => c.alive && (c.kind === 'weak' || c.kind === 'bruiser' || c.kind === 'gunner')); if (en.length && spawned === null) spawned = +G.t.toFixed(2); const near = en.find(c => Math.abs(c.y - G.dist) < 90 && Math.abs(c.x - G.x) < 120); if (near && firstEnemy === null) firstEnemy = +G.t.toFixed(2); if (G.armorLost > dmg0 && hit === null) hit = +G.t.toFixed(2); }
  out.push(`after GO: first enemies on the road at ${spawned} s, within 90 pt of the car at ${firstEnemy} s, first hit at ${hit} s (G.t, seconds after GO)`);
  return out; });
console.log(r.join('\n'));
// skip
await page.addInitScript(() => { try { localStorage.setItem('shunt-settings', JSON.stringify({ introSeen: true })); } catch (e) {} });
await page.reload(); await page.waitForFunction(() => window.__shunt && window.__shunt.G); await page.waitForTimeout(600);
const sk = await page.evaluate(() => { const sh = window.__shunt; sh.startPlaying(); const G = sh.G; sh.input.introOn = true; sh.input.introSkipOK = true; for (let i = 0; i < 200; i++) sh.runSteps(1); const before = G.intro ? G.intro.t : -1; sh.input.skipReq = true; sh.runSteps(2); return { before: +before.toFixed(2), after: G.intro ? 'still' : 'ended', skips: G.introSkips, x: Math.round(G.x), s: Math.round(G.dist), hidden: G.heroHidden, t: G.t }; });
console.log('skip at', JSON.stringify(sk)); if (errors.length) console.log('ERRORS', errors); await browser.close();
