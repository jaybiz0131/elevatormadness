// Plays a replay through the renderer (lite) and prints what the camera director did: how many hero shots, when, which, and the gaps.
//   node tools/shots.mjs <replay.json> [camera=B]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const rep = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const cam = process.argv[3] || 'B';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1&camera=' + cam); await page.waitForFunction(() => window.__shunt && window.__shunt.renderer().state.modelsReady, null, { timeout: 120000, polling: 500 });
const r = await page.evaluate((rp) => { const sh = window.__shunt; const G = sh.loadReplay(rp); const dir = sh.renderer().director; const seen = {}; let n = 0, prev = ''; const segs = [];
  while (!G.rep.ended && n < 6000) { sh.runSteps(6); sh.renderFrame(0.05); n++; const nm = sh.renderer().roadCam.shot; seen[nm] = (seen[nm] || 0) + 0.05; if (nm !== prev) { segs.push([+G.t.toFixed(1), nm]); prev = nm; } }
  return { t: +G.t.toFixed(1), won: !!G.won, hero: dir.log, count: dir.count, seen, segs: segs.length }; }, rep);
const gaps = []; for (let i = 1; i < r.hero.length; i++) gaps.push(+(r.hero[i][0] - r.hero[i - 1][0]).toFixed(1));
console.log(JSON.stringify({ ...r, minGap: gaps.length ? Math.min(...gaps) : null }), errs.length ? errs : ''); await browser.close();
