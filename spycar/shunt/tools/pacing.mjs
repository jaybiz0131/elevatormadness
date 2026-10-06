// Pacing report: replays recorded runs through the sim and measures how much is happening.
//   node tools/pacing.mjs <out.json> <replay.json>... [--page=dist/shunt.html]
// "On screen" is the window the audits always used: from 300 pt behind the car to 900 pt ahead of it. An enemy is a weak car (Dart),
// bruiser (Ram), gunner or armored truck (Bulwark) that is alive and not wrecked. An attacker is any enemy except fodder: before the
// pacing director the weak car only drove along, so both views are reported. A sample is 0.1 s of sim time while the run is live.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const files = args.filter(a => !a.startsWith('--')); const out = files.shift();
const optv = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? Number(a.split('=')[1]) : d; }; const lo = optv('lo', -300), hi = optv('hi', 900);   // the window: --lo and --hi, pt from the car (default the audit window, -300 to 900; the visible window at camera B is about -300 to 2,000)
const weakAttacks = args.includes('--weakAttacks');   // after the pacing director the Dart (kind weak) attacks; before it the weak car only drove along
const pageArg = args.find(a => a.startsWith('--page=')); const pageFile = pageArg ? path.resolve(pageArg.slice(7)) : path.join(here, '..', 'dist', 'shunt.html');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + pageFile + '?lite=1'); await page.waitForTimeout(500);
const rows = [];
for (const f of files) {
  const rep = JSON.parse(fs.readFileSync(f, 'utf8'));
  const m = await page.evaluate(({ r, weakAttacks, lo, hi }) => {
    const sh = window.__shunt; const G = sh.loadReplay(r); const ENEMY = new Set(['weak', 'bruiser', 'gunner', 'armored']), ATTACK = new Set(weakAttacks ? ['weak', 'bruiser', 'gunner', 'armored'] : ['bruiser', 'gunner', 'armored']);
    let samples = 0, none = 0, noneAtk = 0, gap = 0, gapMax = 0, gapAtk = 0, gapAtkMax = 0, kills = 0, lastKill = null, firstKill = null, killGapMax = 0, lastKills = 0, maxOn = 0, sumOn = 0, prog = 0;
    const killT = [], gaps0 = [];
    for (let guard = 0; guard < 5000; guard++) {
      if (G.rep && G.rep.ended) break; sh.runSteps(12); if (G.rep && G.rep.ended) break;
      if (G.won) break; if (!G.playing) continue;
      let on = 0, atk = 0; for (const c of G.cars) { if (!c.alive || c.wrecked || !ENEMY.has(c.kind)) continue; if (c.y > G.dist + lo && c.y < G.dist + hi) { on++; if (ATTACK.has(c.kind)) atk++; } }
      samples++; sumOn += on; maxOn = Math.max(maxOn, on);
      if (on === 0) { none++; gap += 0.1; gapMax = Math.max(gapMax, gap); } else { if (gap >= 1) gaps0.push([+(G.t - gap).toFixed(1), +gap.toFixed(1)]); gap = 0; }
      if (atk === 0) { noneAtk++; gapAtk += 0.1; gapAtkMax = Math.max(gapAtkMax, gapAtk); } else gapAtk = 0;
      if (G.kills > lastKills) { for (let k = lastKills; k < G.kills; k++) killT.push(G.t); lastKills = G.kills; }
    }
    const t = samples / 10; const gaps = []; for (let i = 1; i < killT.length; i++) gaps.push(killT[i] - killT[i - 1]);
    return { seconds: t, steps: G.steps, dead: G.dead, cause: G.killedBy, score: G.score, kills: G.kills, noEnemyPct: 100 * none / Math.max(1, samples), noAttackerPct: 100 * noneAtk / Math.max(1, samples), longestNoEnemy: gapMax, longestNoAttacker: gapAtkMax, avgEnemies: sumOn / Math.max(1, samples), maxEnemies: maxOn,
      secPerKill: G.kills ? t / G.kills : null, meanKillGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null, longestKillGap: Math.max(killT.length ? killT[0] : t, ...gaps, t - (killT.length ? killT[killT.length - 1] : 0)), killsPerMin: G.kills / Math.max(1 / 60, t / 60), won: !!G.won, gaps: gaps0, dist: G.dist, armorLost: G.armorLost };
  }, { r: rep, weakAttacks, lo, hi });
  rows.push({ file: path.basename(f), bot: rep.bot, seed: rep.seed, ...m });
}
fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), rows }, null, 1));
const f1 = (v, d = 1) => v === null || v === undefined ? '  -  ' : v.toFixed(d);
console.log('file                    bot     secs  end        no-enemy%  longest-no-enemy  no-attacker%  longest-no-attacker  kills  s/kill  longest-kill-gap  avg-on-screen');
for (const r of rows) console.log(r.file.padEnd(23), r.bot.padEnd(7), f1(r.seconds).padStart(6), (r.won ? "CITY" : "alive").padEnd(8), f1(r.noEnemyPct).padStart(10), f1(r.longestNoEnemy).padStart(17), f1(r.noAttackerPct).padStart(13), f1(r.longestNoAttacker).padStart(20), String(r.kills).padStart(6), f1(r.secPerKill).padStart(7), f1(r.longestKillGap).padStart(17), f1(r.avgEnemies, 2).padStart(14));
const sum = (k) => rows.reduce((a, r) => a + r[k], 0); const secs = sum('seconds');
const wt = (k) => rows.reduce((a, r) => a + r[k] * r.seconds, 0) / secs;
console.log('ALL (time weighted): no-enemy', wt('noEnemyPct').toFixed(1) + '%', ' no-attacker', wt('noAttackerPct').toFixed(1) + '%', ' longest no-enemy', Math.max(...rows.map(r => r.longestNoEnemy)).toFixed(1), 's  longest no-attacker', Math.max(...rows.map(r => r.longestNoAttacker)).toFixed(1), 's  kills', sum('kills'), ' s/kill', (secs / Math.max(1, sum('kills'))).toFixed(1), ' longest kill gap', Math.max(...rows.map(r => r.longestKillGap)).toFixed(1), 's  total', secs.toFixed(0), 's');
console.log('errors', errors.length ? errors : 'none');
await browser.close();
