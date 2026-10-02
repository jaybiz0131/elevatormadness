// Drives the gray-box in headless Chromium with a bot (rams enemies, Slams
// Bruisers in their hold/tell window, dodges civilians, takes ramps and
// trucks, fires the special) and logs the review's metrics:
// share of time with 2+ cars on screen, longest gap with no event,
// wrecks per minute, cause of death, slams landed.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'out');
const seconds = parseFloat(process.argv[3] || '120');
const passive = process.argv[4] === 'passive';   // holds the lane, never slams: checks that damage and death work
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|net::/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, 'shunt-title.png') });
await page.evaluate(() => window.__shunt.startPlaying());
let samples = 0, twoPlus = 0, maxGap = 0, lastKills = 0, shots = 0;
const t0 = Date.now();
for (let i = 0; i < seconds * 10; i++) {
  const s = await page.evaluate(() => {
    const g = window.__shunt.G; const near = g.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'truck' && c.y > g.dist - 300 && c.y < g.dist + 900);
    const enemies = near.filter(c => c.kind !== 'civ' && c.kind !== 'armored').sort((a, b) => Math.abs(a.y - g.dist) - Math.abs(b.y - g.dist));
    const civs = near.filter(c => c.kind === 'civ' && c.y > g.dist - 30 && c.y < g.dist + 260);
    const road = g.road.at(g.dist); let want = road.center, slam = 0;
    const e = enemies[0];
    if (e) { if (Math.abs(e.y - g.dist) < 80 && Math.abs(e.x - g.x) < 110 && Math.abs(e.x - g.x) > 30 && g.slamCd <= 0 && (e.state === 'hold' || e.state === 'tell' || e.kind !== 'bruiser')) slam = Math.sign(e.x - g.x); want = e.y > g.dist + 60 ? e.x : g.x + Math.sign(e.x - g.x || 1) * -40; }
    for (const c of civs) if (Math.abs(c.x - want) < 40) want = c.x + (c.x < road.center ? 70 : -70);
    const truck = g.cars.find(c => c.kind === 'truck' && !c.loaded && c.y > g.dist); if (truck && truck.y - g.dist < 600) want = truck.x;
    const ramp = g.ramps.find(r => !r.used && r.y > g.dist); if (ramp && ramp.y - g.dist < 450) want = ramp.x;
    const barrier = g.barriers.find(b => !b.hit && b.y > g.dist && b.y - g.dist < 400); if (barrier && !ramp) want = road.center - road.width / 2 + 30;
    return { phase: window.__shunt.phase, t: g.t, x: g.x, want, slam, score: g.score, armor: g.armor, kills: g.kills, slams: g.slams, special: g.special, lastEvent: g.lastEvent, near: near.length, cause: g.killedBy, gun: g.gun, wave: g.wave };
  });
  if (s.phase === 'over') { console.log('DIED at', s.t.toFixed(1), 's:', s.cause, '| score', s.score, 'kills', s.kills, 'slams', s.slams); await page.screenshot({ path: path.join(out, 'shunt-over.png') }); break; }
  if (s.phase === 'playing') { samples++; if (s.near >= 2) twoPlus++; if (s.t > 3 && s.t - s.lastEvent > maxGap) maxGap = s.t - s.lastEvent; }
  await page.evaluate(({ want, slam, passive }) => { const inp = window.__shunt.input; const g = window.__shunt.G; if (inp.id === null) inp.down(1, 200, 700); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX; if (passive) { inp.cur = { x: 200, y: 700 }; return; } const dx = (want - g.targetX) / 1.4; inp.cur = { x: 200 + Math.max(-70, Math.min(70, dx)), y: 700 }; if (slam) window.__shunt.trySlam(slam); if (g.special && g.special.ammo > 0 && (g.special.kind !== 'missiles' || g.cars.some(c => c.alive && !c.wrecked && (c.kind === 'armored' || c.kind === 'bruiser') && c.y > g.dist))) window.__shunt.fireSpecial(); }, { want: s.want, slam: s.slam, passive });
  await page.waitForTimeout(100);
  if (i % 300 === 150) await page.screenshot({ path: path.join(out, `shunt-${Math.round(s.t)}s.png`) });
  if (i % 100 === 0) console.log('t', s.t.toFixed(1), 'score', s.score, 'armor', s.armor, 'kills', s.kills, 'slams', s.slams, 'gun', s.gun, 'special', s.special ? s.special.kind + ':' + s.special.ammo : '-', 'near', s.near, s.wave);
}
const final = await page.evaluate(() => ({ t: window.__shunt.G.t, kills: window.__shunt.G.kills }));
console.log('--- metrics ---');
console.log('time with 2+ cars on screen:', (100 * twoPlus / Math.max(1, samples)).toFixed(0) + '%  (target 85%+)');
console.log('longest gap with no event:', maxGap.toFixed(2), 's  (target <= 3 s)');
console.log('wrecks per minute:', (final.kills / (final.t / 60)).toFixed(1), '(target 20-25)');
console.log('run length:', final.t.toFixed(1), 's');
console.log('errors', errors.length ? errors : 'none');
await browser.close();
