// Drives the gray-box in headless Chromium for ~70 s of game time with a
// simple bot (steers toward enemies to ram them, dodges civilians), fires
// the special when armed, and screenshots. Reports page errors and the
// 3-second rule (longest gap between events).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'out');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|net::/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto('file://' + path.join(here, 'index.html'));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, 'shunt-attract.png') });
await page.touchscreen.tap(200, 700);
let maxGap = 0, lastEvent = 0, shots = [];
for (let i = 0; i < 140; i++) {
  const s = await page.evaluate(() => {
    const g = window.__shunt.G; const enemies = g.cars.filter(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.y > g.dist - 40 && c.y < g.dist + 400);
    const civs = g.cars.filter(c => c.alive && c.kind === 'civ' && c.y > g.dist && c.y < g.dist + 300);
    const road = g.road.at(g.dist);
    let want = road.center;
    if (enemies.length) want = enemies[0].x; else if (civs.length && Math.abs(civs[0].x - g.x) < 40) want = civs[0].x + (civs[0].x < road.center ? 70 : -70);
    const truck = g.trucks.find(t => !t.loaded); if (truck) want = truck.x;
    const ramp = g.ramps.find(r => !r.used); if (ramp && ramp.y - g.dist < 500) want = ramp.x;
    return { phase: window.__shunt.phase, t: g.t, x: g.x, want, score: g.score, armor: g.armor, kills: g.kills, special: g.special, lastEvent: g.lastEvent, scripted: g.scripted };
  });
  if (s.phase === 'over') break;
  if (s.t - s.lastEvent > maxGap && s.t > 3) maxGap = s.t - s.lastEvent;
  await page.evaluate(({ want }) => { const inp = window.__shunt.input; const g = window.__shunt.G; if (inp.id === null) inp.down(1, 200, 700); const dx = (want - g.targetX) / 1.4; inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX; inp.move(1, 200 + Math.max(-60, Math.min(60, dx)), 700); if (g.special.ammo > 0) window.__shunt.fireSpecial(); }, { want: s.want });
  await page.waitForTimeout(500);
  if (i % 20 === 10) { const f = path.join(out, `shunt-${i}.png`); await page.screenshot({ path: f }); shots.push(f); }
  if (i === 139) console.log('final', JSON.stringify(s));
  if (i % 20 === 0) console.log('t', s.t.toFixed(1), 'score', s.score, 'armor', s.armor, 'kills', s.kills, 'special', s.special.name, s.special.ammo, 'scripted', s.scripted);
}
console.log('longest gap without an event (s):', maxGap.toFixed(2));
console.log('errors', errors.length ? errors : 'none');
await browser.close();
