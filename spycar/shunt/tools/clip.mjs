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
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const out = path.resolve(args.find(a => !a.startsWith('--')));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const fps = Number(opt.fps || 24), len = Number(opt.len || 10), slow = Number(opt.slow || 1), before = Number(opt.before || 2); const per = Math.max(1, Math.round(120 / fps / slow));
const pageFile = opt.page ? path.resolve(opt.page) : path.join(here, '..', 'dist', 'shunt.html');
const frames = out.replace(/\.mp4$/, '') + '-frames'; fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const dsf = Number(opt.dsf || 2); const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dsf, hasTouch: true });
page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
await page.goto('file://' + pageFile + '?scale=' + (opt.scale || 1.25) + (opt.cam ? '&cam=' + opt.cam : '') + (opt.seed ? '&seed=' + opt.seed : '') + (opt.q ? '&' + opt.q : ''));
await page.waitForFunction(() => window.__shunt && window.__shunt.G, null, { timeout: 30000 }); await page.waitForTimeout(1200);
await page.evaluate(({ rep, mode, stage, boostAt }) => { const sh = window.__shunt;
  if (rep) { sh.loadReplay(rep); window.__drive = () => {}; return; }
  sh.startPlaying();
  // --stage=clean: an empty road (every car is removed each step) and the car holding its lane, for the Stop 5 showcase clips; --boostAt=S presses BOOST once at that time
  if (stage) { window.__drive = () => { const g = sh.G, inp = sh.input; if (inp.id === null) inp.down(1, 200, 700, 0); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center; inp.cur = { x: 200, y: 700 };
      for (const c of g.cars) c.alive = false; g.crates.length = 0; if (boostAt >= 0 && g.t >= boostAt && !window.__bp) { window.__bp = 1; inp.boostReq = true; } }; return; }
  window.__drive = () => { const g = sh.G, inp = sh.input; if (inp.id === null) inp.down(1, 200, 700, 0); inp.anchor = { x: 200, y: 700 }; inp.carAnchor = g.targetX - g.road.at(g.dist).center;
    const e = g.cars.filter(c => c.alive && !c.wrecked && (c.kind === 'weak' || c.kind === 'bruiser' || c.kind === 'gunner') && c.y > g.dist + 40 && c.y < g.dist + 700).sort((a, b) => a.y - b.y)[0];
    const civ = g.cars.find(c => c.alive && !c.wrecked && c.kind === 'civ' && c.y > g.dist && c.y < g.dist + 260 && Math.abs(c.x - g.x) < 40);
    let want = e ? e.x : g.road.at(g.dist).center; if (civ && !e) want = civ.x + (civ.x < 195 ? 70 : -70);
    const k = g.road.at(g.dist).k; if (Math.abs(k) > 1 / 900) want += Math.sign(k) * (mode === 'weak' ? 40 : 110);
    inp.fireHeld = !!e || g.cars.some(c => c.alive && !c.wrecked && c.kind !== 'civ' && c.kind !== 'truck' && c.y > g.dist - 50 && c.y < g.dist + 800);
    const lim = mode === 'weak' ? 40 : 90; inp.cur = { x: 200 + Math.max(-lim, Math.min(lim, (want - g.targetX) / 1.4)), y: 700 }; };
}, { rep: opt.replay ? JSON.parse(fs.readFileSync(opt.replay, 'utf8')) : null, mode: opt.mode || 'gunner', stage: opt.stage || '', boostAt: opt.boostAt !== undefined ? Number(opt.boostAt) : -1 });
// run to the start (finding the event first if asked)
const start = await page.evaluate(({ at, find, before }) => { const sh = window.__shunt, G = sh.G; const step = () => { window.__drive(); sh.runSteps(1); };
  while (G.t < at && !(G.rep && G.rep.ended)) step();
  if (find) { const key = { pileup: 'pileups', roll: 'rolls', two: 'twoWheels', wallslam: 'wallSlams' }[find]; const n0 = G[key]; let k = 0; while (G[key] === n0 && k++ < 120 * 240 && !(G.rep && G.rep.ended)) step(); const tEv = G.t; return { found: G[key] > n0, tEv, restart: Math.max(0, tEv - before) }; }
  return { found: true, tEv: G.t, restart: null }; }, { at: Number(opt.at || 0), find: opt.find || null, before });
console.log('event', JSON.stringify(start));
if (start.restart !== null) {
  // the sim cannot step back: rebuild the run and step to the clip start (same inputs, same result)
  await page.evaluate(({ rep, seed, restart }) => { const sh = window.__shunt; if (rep) sh.loadReplay(rep); else { sh.startPlaying(); } const G = sh.G; while (G.t < restart) { window.__drive(); sh.runSteps(1); } }, { rep: opt.replay ? JSON.parse(fs.readFileSync(opt.replay, 'utf8')) : null, seed: opt.seed, restart: start.restart });
}
let maxCalls = 0, maxTris = 0; const n = Math.round(len * fps);
for (let f = 0; f < n; f++) {
  const r = await page.evaluate(({ per, dt }) => { const sh = window.__shunt; for (let i = 0; i < per; i++) { window.__drive(); sh.runSteps(1); } sh.renderFrame(dt); const st = sh.renderer().stats(); const G = sh.G; return { calls: st.calls, tris: st.triangles, t: G.t, pile: G.pileups, rolls: G.rolls, two: G.twoWheels, slams: G.wallSlams, bodies: sh.CRASH.bodies }; }, { per, dt: 1 / fps / slow });
  maxCalls = Math.max(maxCalls, r.calls); maxTris = Math.max(maxTris, r.tris);
  await page.screenshot({ path: path.join(frames, 'f' + String(f).padStart(4, '0') + '.png'), timeout: 180000 });
  if (f % 24 === 0) console.log('frame', f, JSON.stringify(r));
}
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-vf', 'scale=390:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', out]);
console.log('wrote', out, 'max draw calls', maxCalls, 'max triangles', maxTris);
