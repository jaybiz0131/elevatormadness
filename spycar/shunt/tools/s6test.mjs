// Stop 6 scenarios, scripted through the puck fields (sync, lite): node tools/s6test.mjs <burnout|drift|wallfire|puck> [--seed=3] [--page=dist/shunt.html]
// burnout: stop, hold gas + e-brake 3 s with enemies about; prints how thick the cloak got and whether enemies lost track.
// drift: skilled bot over a technical sector; wallfire: stopped at the kerb in a burnout with FIRE held (chips, scars, fires); puck: the real puck pointer mapping.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PACE } from './pace.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const scen = args.find(a => !a.startsWith('--')) || 'burnout';
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const pageFile = opt.page ? path.resolve(opt.page) : path.join(here, '..', 'dist', 'shunt.html');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
await page.addInitScript(PACE);
await page.goto('file://' + pageFile + '?lite=1&seed=' + (opt.seed || 3)); await page.waitForFunction(() => window.__shunt && window.__shunt.G, null, { timeout: 30000 }); await page.waitForTimeout(500);
const r = await page.evaluate(({ scen }) => {
  const sh = window.__shunt; sh.startPlaying(); const G = sh.G, inp = sh.input; const log = [];
  const put = (thr, fire, eb, off) => { inp.raw = true; inp.puckId = 77; inp.puckThr = thr; inp.puckFire = fire; inp.puckEb = eb; inp.gas = false; inp.brake = false; inp.ebHeld = false; if (off !== undefined) { inp.id = 1; inp.anchor = { x: 200, y: 700 }; inp.cur = { x: 200 + off, y: 700 }; inp.carAnchor = G.targetX - G.road.at(G.dist).center; } };
  const run = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); sh.runSteps(1); } };
  const snap = (tag) => log.push(tag + ' t=' + G.t.toFixed(1) + ' speed=' + Math.round(G.speed) + ' cloak=' + G.cloak.toFixed(2) + (G.cloakOn ? ' ON' : '') + ' lost=' + G.lostSeen + ' wide=' + G.wideShots + ' chips=' + G.chips + ' scars=' + G.scars.length + ' fires=' + G.fires.length + ' booms=' + G.wallBooms + ' bo=' + G.bo.toFixed(2) + ' x=' + Math.round(G.x));
  let maxCloak = 0, onSteps = 0;
  const track = () => { maxCloak = Math.max(maxCloak, G.cloak); if (G.cloakOn) onSteps++; };
  if (scen === 'burnout') {
    run(360, () => { put(1, false, false, 0); });       // get going
    snap('cruise'); for (let i = 0; i < 600 && G.speed > 20; i++) run(1, () => { put(-1, false, false, 0); }); snap('braked');
    run(1800, () => { put(1, true, true, 0); track(); if ((G.steps % 480) === 0) snap("burn"); }); snap("burnout");   // gas + e-brake + fire, stopped
    run(360, () => { put(1, false, false, 0); track(); }); snap('launched');
  } else if (scen === 'gunnerwide') {
    run(480, () => { put(1, false, false, 0); }); for (let i = 0; i < 600 && G.speed > 20; i++) run(1, () => { put(-1, false, false, 0); });
    const c = G.cars.find(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser')); if (c) { c.kind = 'gunner'; c.w = 40; c.l = 76; c.state = 'approach'; c.cd = 0; c.hp = 99; c.maxHp = 99; } snap('gunner made ' + !!c);
    let cloaked = 0, fired = 0, damageBefore = G.armorLost; run(2400, () => { put(1, false, true, 0); track(); if (G.cloakOn) cloaked++; }); snap('end'); log.push('armor lost while cloaked ' + (G.armorLost - damageBefore) + ' wide ' + G.wideShots + ' cloaked steps ' + cloaked);
  } else if (scen === 'wallfire') {
    run(300, () => { put(1, false, false, -260); });    // hard left: the kerb
    for (let i = 0; i < 600 && G.speed > 20; i++) run(1, () => { put(-1, false, false, -260); }); snap('stopped at the kerb');
    run(900, () => { put(1, true, true, -260); track(); if ((G.steps % 240) === 0) snap('fire'); });
    snap('end'); log.push('heat cells ' + G.heatCells.length);
  } else if (scen === 'chip') {
    for (let i = 0; i < 1100; i++) { const t = G.t; put(1, t > 1.6, t > 1.2, t > 1.2 ? -62 : 0); sh.runSteps(1); track(); if (i % 60 === 0) log.push(`t=${G.t.toFixed(1)} x=${Math.round(G.x)} hd=${(G.heading*57.3).toFixed(0)} slip=${(G.slip*57.3).toFixed(0)} dr=${G.drifting} spd=${Math.round(G.speed)} face=${G.face} chips=${G.chips} bul=${G.bullets.length}`); }
  } else if (scen === 'drift') {
    run(1000, () => { put(1, false, false, 0); window.__pace(G, inp, 'skilled'); track(); }); snap('drive'); 
    let drifts = 0; for (let k = 0; k < 6000; k++) { window.__pace(G, inp, 'skilled'); inp.puckFire = true; sh.runSteps(1); track(); if (G.cloakOn && !log.some(l => l.startsWith('cloaked'))) snap('cloaked first'); if (k % 600 === 0) snap('d'); }
    snap('end');
  }
  return { log, maxCloak: +maxCloak.toFixed(2), onSeconds: +(onSteps / 120).toFixed(1), flips: G.flipDone, burnouts: G.burnouts, drifts: G.drifts, cloaks: G.cloaks };
}, { scen });
console.log(JSON.stringify(r, null, 1)); if (errors.length) console.log('ERRORS', errors.slice(0, 5)); await browser.close();
