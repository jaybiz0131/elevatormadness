// Clip capture (Stop 3): plays a replay (or a fresh seeded run with the simtest driver) synchronously and renders every few steps, then
// encodes an mp4 with the system ffmpeg. Software GL cannot run the page at pace, so frames are drawn one by one in sim time.
//   node tools/clip.mjs <out.mp4> (--replay=file.json | --seed=N [--mode=gunner]) --at=SECONDS [--len=10] [--fps=24] [--before=2]
//        [--cam=pitch,dist,fov,yaw,screenY] [--find=pileup|roll|two|wallslam] [--slow=1] [--dsf=2] [--scale=1.25]
//   --find: from --at on, run ahead (no rendering) to the next such event, then start the clip --before seconds earlier
//   --slow=2: half speed (each frame advances half the sim time), for the close-ups
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PACE } from './pace.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const out = path.resolve(args.find(a => !a.startsWith('--')));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const fps = Number(opt.fps || 24), len = Number(opt.len || 10), slow = Number(opt.slow || 1), before = Number(opt.before || 2); const per = Math.max(1, Math.round(120 / fps / slow));
const pageFile = opt.page ? path.resolve(opt.page) : path.join(here, '..', 'dist', 'shunt.html');
const frames = out.replace(/\.mp4$/, '') + '-frames'; fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const dsf = Number(opt.dsf || 2); const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dsf, hasTouch: true });
page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
await page.addInitScript(PACE);
await page.goto('file://' + pageFile + '?scale=' + (opt.scale || 1.25) + (opt.cam ? '&cam=' + opt.cam : '') + (opt.seed ? '&seed=' + opt.seed : '') + (opt.q ? '&' + opt.q : ''));
await page.waitForFunction(() => window.__shunt && window.__shunt.G, null, { timeout: 30000 }); await page.waitForTimeout(1200);
await page.evaluate(({ rep, mode, stage, boostAt, scenario, opt_clean }) => { const sh = window.__shunt;
  if (rep) { sh.loadReplay(rep); window.__drive = () => {}; return; }
  sh.startPlaying();
  // --stage=clean: an empty road (every car is removed each step) and the car holding its lane, for the Stop 5 showcase clips; --boostAt=S presses BOOST once at that time
  if (stage) { window.__drive = () => { const g = sh.G, inp = sh.input; if (inp.id === null) inp.down(1, 200, 700, 0); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center; inp.cur = { x: 200, y: 700 }; window.__pace(g, inp, 'skilled');
      for (const c of g.cars) c.alive = false; g.crates.length = 0; if (boostAt >= 0 && g.t >= boostAt && !window.__bp) { window.__bp = 1; inp.boostReq = true; } }; return; }
  window.__drive = () => { const g = sh.G, inp = sh.input; if (inp.id === null) inp.down(1, 200, 700, 0); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center;
    const e = g.cars.filter(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser' || c.kind === 'gunner') && c.y > g.dist + 40 && c.y < g.dist + 700).sort((a, b) => a.y - b.y)[0];
    const civ = g.cars.find(c => c.alive && !c.wrecked && c.kind === 'civ' && c.y > g.dist && c.y < g.dist + 260 && Math.abs(c.x - g.x) < 40);
    let want = e ? e.x : g.road.at(g.dist).center; if (civ && !e) want = civ.x + (civ.x < 195 ? 70 : -70);
    const k = g.road.at(g.dist).k; if (Math.abs(k) > 1 / 900) want += Math.sign(k) * (mode === 'weak' ? 40 : 110);
    inp.fireHeld = !!e || g.cars.some(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && c.y > g.dist - 50 && c.y < g.dist + 800);
    window.__pace(g, inp, mode === 'weak' ? 'weak' : 'skilled');
    const lim = mode === 'weak' ? 40 : 90; inp.cur = { x: 200 + Math.max(-lim, Math.min(lim, (want - g.targetX) / 1.4)), y: 700 }; };
  // Stop 6 scenarios (--scenario=puckfire|cloak|kerb): scripted through the puck fields the way a thumb would set them
  if (scenario) { const base = window.__drive; const put = (thr, fire, eb) => { const inp = sh.input; inp.raw = true; inp.puckId = 77; inp.puckThr = thr; inp.puckFire = fire; inp.puckEb = eb; inp.gas = false; inp.brake = false; inp.ebHeld = false; };
    const hold = (off) => { const g = sh.G, inp = sh.input; inp.id = 1; inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center; inp.cur = { x: 200 + off, y: 700 }; };
    const foes = (g) => g.cars.filter(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser' || c.kind === 'gunner'));
    window.__ph = 0; window.__phT = 0;
    if (scenario === 'puckfire') window.__drive = () => { base(); const g = sh.G; const near = foes(g).some(c => c.y > g.dist - 60 && c.y < g.dist + 900 && Math.abs(c.x - g.x) < 220); sh.input.puckThr = Math.max(sh.input.puckThr, 0.9); if (near) sh.input.puckFire = true; };
    if (scenario === 'cloak') window.__drive = () => { const g = sh.G; const p = window.__ph; hold(0);
      if (p === 0) { put(1, false, false); if (g.t > 4 && foes(g).length >= 2) { window.__ph = 1; window.__phT = g.t; } }   // drive until company has arrived
      else if (p === 1) { put(-1, false, false); if (g.speed < 25 || g.t - window.__phT > 4) { window.__ph = 2; window.__phT = g.t; } }
      else if (p === 2) { put(1, true, true); if (g.t - window.__phT > 4.2) { window.__ph = 3; window.__phT = g.t; } }   // gas + e-brake (burnout), the guns firing out of the smoke
      else { put(1, true, false); } };
    if (scenario === 'chip') window.__drive = () => { const g = sh.G; hold(g.t > 1.2 ? -62 : 0); put(1, g.t > 1.6, g.t > 1.2); };   // 700 pt/s along the left side, a drift toward the facade with the guns going
    if (scenario === 'cornerfire') window.__drive = () => { const g = sh.G, inp = sh.input; hold(0); put(1, false, false); window.__pace(g, inp, 'skilled'); inp.puckFire = g.t > 6; };   // the skilled driver round the corners with the gatling held
    if (scenario === 'passby') { let did = false; window.__drive = () => { const g = sh.G; hold(g.road.at(g.dist).width * -0.5 * 0.6); put(0.55, false, false);
      if (!did) { did = true; const ch = sh.renderer().fx.chaos, V = { x: 0, y: 0, z: 0 }; let best = null; for (let q = g.dist + 500; q < g.dist + 2200 && !best; q += 10) { const F = ch.face(g, -1, q, V, {}); if (F && F.top < 11) best = q; }
        const side = -1, s0 = best + 10; for (let i = 0; i < 12; i++) g.scars.push({ side, s: s0 + i * 3 - 12, h: 1 + (i * 0.37) % 2.8, kind: 0, t: 0.5 + 0.05 * i, seed: (i * 0.618) % 1 }); g.scars.push({ side, s: s0 + 40, h: 3, kind: 1, t: 0.2, seed: 0.4 }); g.fires.push({ side, s: s0 + 40, h: 2.2, w: 5, t: 0.5, life: 25, seed: 0.3 }); g.fires.push({ side, s: s0 + 85, h: 1.6, w: 4, t: 2, life: 25, seed: 0.7 }); g.scars.push({ side, s: s0 + 85, h: 2.6, kind: 1, t: 2, seed: 0.9 }); } }; }
    if (scenario === 'driftfire') window.__drive = () => { const g = sh.G; for (const c of g.cars) c.alive = false; g.crates.length = 0; const k = Math.max(0, Math.min(1, (g.t - 1.6) / 0.9)); hold(-105 * k); put(0.62, g.t > 1.7, g.t > 1.6); };   // a straight, a long drift toward the left facade with the guns going
    if (scenario === 'wallspray') window.__drive = () => { const g = sh.G; for (const c of g.cars) c.alive = false; g.crates.length = 0; hold(-260); const p = window.__ph;   // STAGED: the car is parked at the left kerb with its nose turned to the building (the script sets the heading), FIRE held through the puck
      if (p === 0) { put(1, false, false); if (g.t > 2.5) window.__ph = 1; } else if (p === 1) { put(-1, false, false); if (g.speed < 20) { window.__ph = 2; window.__phT = g.t; } } else { put(0, g.t - window.__phT > 0.5, false); const a = -0.95 + 0.25 * Math.sin((g.t - window.__phT) * 1.7); g.heading = g.phi = a; g.slip = 0; } };
    if (scenario === 'carboom') window.__drive = () => { const g = sh.G; hold(-40); put(window.__ph ? (g.speed > 15 ? -0.7 : 0) : 0.2, false, false);   // STAGED: an enemy is thrown sideways at 38 m/s into the left-hand building (the script places it and throws it)
      if (window.__ph === 0 && g.t > 3.4) { const e = g.cars.find(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser')); if (e) { window.__ph = 1; window.__phT = g.t; const ch = sh.renderer().fx.chaos, V = { x: 0, y: 0, z: 0 }; let best = null;
          for (let q = g.dist + 300; q < g.dist + 1800 && !best; q += 10) { const F = ch.face(g, -1, q, V, {}); if (F && F.top < 11) best = q; }
          const y = best + 60; g.dist = g.pdist = y - 45; g.x = g.px = 195 + 20; g.targetX = g.x; for (const c of g.cars) if (c !== e) c.alive = false; e.y = e.py = y; e.x = e.px = 195 - 50; e.speed = 150; e.vx = 0; e.state = 'recover'; sh.fling(e, -38, 4); } } };
    if (scenario === 'kerb') window.__drive = () => { const g = sh.G; const p = window.__ph; hold(-260); if (opt_clean) { for (const c of g.cars) c.alive = false; g.crates.length = 0; }
      if (p === 0) { put(1, false, false); if (g.t > 2.5) { window.__ph = 1; } } else if (p === 1) { put(-1, false, false); if (g.speed < 25) { window.__ph = 2; window.__phT = g.t; } } else { put(1, true, true); } }; }
}, { rep: opt.replay ? JSON.parse(fs.readFileSync(opt.replay, 'utf8')) : null, mode: opt.mode || 'gunner', stage: opt.stage || '', boostAt: opt.boostAt !== undefined ? Number(opt.boostAt) : -1, scenario: opt.scenario || '', opt_clean: !!opt.clean });
// run to the start (finding the event first if asked)
const start = await page.evaluate(({ at, find, before }) => { const sh = window.__shunt, G = sh.G; const step = () => { window.__drive(); sh.runSteps(1); };
  while (G.t < at && !(G.rep && G.rep.ended)) step();
  if (find) { const key = { pileup: 'pileups', roll: 'rolls', two: 'twoWheels', wallslam: 'wallSlams', wallboom: 'wallBooms', chip: 'chips', fire: 'facadeFires', cloak: 'cloaks' }[find]; const n0 = G[key]; let k = 0; while (G[key] === n0 && k++ < 120 * 240 && !(G.rep && G.rep.ended)) step(); const tEv = G.t; return { found: G[key] > n0, tEv, restart: Math.max(0, tEv - before), side: G.scars.length ? G.scars[G.scars.length - 1].side : 0 }; }
  return { found: true, tEv: G.t, restart: null }; }, { at: Number(opt.at || 0), find: opt.find || null, before });
console.log('event', JSON.stringify(start));
// --camside=pitch,dist,fov,yaw,screenY: a fixed close-up camera that looks at the facade the event happened on (yaw is turned toward that side)
if (opt.camside) await page.evaluate(({ c, side }) => { const CAM = window.__shunt.renderer().CAM; const [p, d, f, y, t] = c.split(',').map(Number); CAM.pitch = p; CAM.dist = d; CAM.fov = f; CAM.yaw = (side || -1) * y; CAM.lowerThird = t; CAM.fixed = true; }, { c: opt.camside, side: start.side });
if (start.restart !== null) {
  // the sim cannot step back: rebuild the run and step to the clip start (same inputs, same result)
  await page.evaluate(({ rep, seed, restart }) => { const sh = window.__shunt; if (rep) sh.loadReplay(rep); else { sh.startPlaying(); } const G = sh.G; while (G.t < restart) { window.__drive(); sh.runSteps(1); } }, { rep: opt.replay ? JSON.parse(fs.readFileSync(opt.replay, 'utf8')) : null, seed: opt.seed, restart: start.restart });
}
let maxCalls = 0, maxTris = 0; const n = Math.round(len * fps);
for (let f = 0; f < n; f++) {
  const r = await page.evaluate(({ per, dt }) => { const sh = window.__shunt; for (let i = 0; i < per; i++) { window.__drive(); sh.runSteps(1); } sh.renderFrame(dt); const st = sh.renderer().stats(); const G = sh.G; return { calls: st.calls, tris: st.triangles, t: G.t, pile: G.pileups, rolls: G.rolls, two: G.twoWheels, slams: G.wallSlams, bodies: sh.CRASH.bodies, cloak: +G.cloak.toFixed(2), lost: G.lostSeen, chips: G.chips, fires: G.fires.length, booms: G.wallBooms, ph: window.__ph, nEn: G.cars.filter(c => c.alive && (c.kind === "weak" || c.kind === "bruiser")).length, wr: G.cars.filter(c => c.wrecked).length }; }, { per, dt: 1 / fps / slow });
  maxCalls = Math.max(maxCalls, r.calls); maxTris = Math.max(maxTris, r.tris);
  await page.screenshot({ path: path.join(frames, 'f' + String(f).padStart(4, '0') + '.png'), timeout: 180000 });
  if (f % (opt.logEvery ? Number(opt.logEvery) : 24) === 0) console.log('frame', f, JSON.stringify(r));
}
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-vf', 'scale=390:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', out]);
console.log('wrote', out, 'max draw calls', maxCalls, 'max triangles', maxTris);
