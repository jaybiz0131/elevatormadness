// Replays a recorded run headlessly and compares the state hashes.
//   node replay.mjs <replay.json> [--live] [--page=index.html]
// Default: steps the simulation synchronously (no frame clock), the fast parity check.
// --live: plays it through the normal requestAnimationFrame loop (rendering on), which proves the frame clock has no say.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
const live = process.argv.includes('--live');
const pageArg = process.argv.find(a => a.startsWith('--page=')); const pageFile = pageArg ? pageArg.slice(7) : path.join(here, 'index.html');
const rep = JSON.parse(fs.readFileSync(file, 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto((pageFile.startsWith('http') ? '' : 'file://') + pageFile);
await page.waitForTimeout(400);
const t0 = Date.now();
let got;
if (!live) got = await page.evaluate((r) => { const sh = window.__shunt; sh.loadReplay(r); return sh.runSteps(r.steps); }, rep);
else { await page.evaluate((r) => { window.__shunt.loadReplay(r); }, rep); for (;;) { const s = await page.evaluate(() => ({ steps: window.__shunt.G.steps, phase: window.__shunt.phase, ended: window.__shunt.G.rep.ended })); if (s.steps >= rep.steps || s.ended || s.phase === 'over') break; await page.waitForTimeout(250); } got = await page.evaluate(() => window.__shunt.G.hashes.slice()); }
const exp = rep.hashes; let first = -1, n = Math.min(exp.length, got.length) / 2;
for (let i = 0; i < n; i++) if (exp[i * 2 + 1] !== got[i * 2 + 1]) { first = i; break; }
const ok = first < 0 && got.length >= exp.length - 2;
console.log((ok ? 'MATCH' : 'MISMATCH'), path.basename(file), live ? '(live loop)' : '(sync)', 'hashes', n, 'of', exp.length / 2, first >= 0 ? 'first divergence at step ' + exp[first * 2] : '', 'in', ((Date.now() - t0) / 1000).toFixed(1) + ' s', errors.length ? errors : '');
await browser.close();
process.exit(ok ? 0 : 1);
