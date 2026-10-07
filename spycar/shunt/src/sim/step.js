// The fixed step. The frame clock only decides how many steps run (real time x the slow-motion rate; hit-stop runs at full rate, frozen).
import { STEP, T } from './constants.js';
export const STEP_LEN = STEP;
import { director } from './director.js';
import { physics, win } from './physics.js';
import { G } from './state.js';
export let source = null, sink = null;
// the input source supplies one snapshot per step (and re-latches requests that a frozen step could not use); the sink receives events
export function setInputSource(s) { source = s; }
export function setSink(f) { sink = f; }
export function advance(dt, playing) {
  const rate = G.hitStop > 0 ? 1 : G.slowmo > 0 ? G.slowmoRate : 1;
  G.acc += dt * rate; let n = 0;
  while (G.acc >= STEP && n < 8) { simStep(playing); G.acc -= STEP; n++; }
}
export function simStep(playing) {
  G.steps++; G.playing = playing;
  if (G.rep) { replayNext(G.in); playing = G.playing = G.in.p === 1; } else source.snapshot(G.in, playing);
  if (G.rec) recordStep(G.in);
  decayPresentation(STEP);
  if (G.hitStop > 0) { G.hitStop -= STEP; if (!G.rep) source.relatch(G.in); }   // frozen: requests wait for the next live step
  else {
    if (G.slowmo > 0) G.slowmo -= STEP / G.slowmoRate;   // slow motion is a real-time countdown: fewer steps per second, same seconds
    G.ticks++; G.t = G.ticks / 120;
    physics(STEP, playing);
    if (playing && !G.won) director();
    if (playing && !G.won && !G.dead && G.dist >= T.goal.city) win();
  }
  if (G.steps % 120 === 0) G.hashes.push(G.steps, hashState());
  if (globalThis.__fineHash && G.steps % 6 === 0) { G.fine = G.fine || []; G.fine.push(G.steps, hashState()); }   // debugging aid: a hash every 6 steps
  if (G.ev.length) { sink(G.ev); G.ev.length = 0; }
}
// presentation timers live on G so the renderer never writes; they are not part of the state hash
export function decayPresentation(dt) { const k = G.kick, decay = Math.exp(-dt / 0.08); k.x *= decay; k.y *= decay; G.trauma = Math.max(0, G.trauma - dt * 1.6); if (G.vignette > 0) G.vignette = Math.max(0, G.vignette - dt * 2); if (G.flashT2 > 0) G.flashT2 -= dt; if (G.speedLines > 0) G.speedLines -= dt; if (G.punch > 0) G.punch -= dt; if (G.flashT > 0) G.flashT -= dt; if (G.killFlash > 0) G.killFlash -= dt; }
// the simulation's outbox: sounds, haptics, callouts and UI changes are events the main loop delivers after each step
export const HB = new DataView(new ArrayBuffer(8));
export let hh = 0;
export function hf(v) { HB.setFloat64(0, +v); for (let i = 0; i < 8; i++) { hh ^= HB.getUint8(i); hh = Math.imul(hh, 0x01000193) >>> 0; } }
export function hs(str) { for (let i = 0; i < str.length; i++) { hh ^= str.charCodeAt(i); hh = Math.imul(hh, 0x01000193) >>> 0; } }
export function hashState() {
  hh = 0x811c9dc5;
  hf(G.ticks); hf(G.dist); hf(G.x); hf(G.speed); hf(G.vx); hf(G.heading); hf(G.phi); hf(G.slip); hf(G.slideVx); hf(G.targetX); hf(G.armor); hf(G.score); hf(G.combo); hf(G.comboT);
  hf(G.air); hf(G.jumpZ); hf(G.fz); hf(G.fvz); hf(G.hang); hf(G.bst); hf(G.bstT); hf(G.mineAmmo); hf(G.face); hf(G.flip ? G.flip.t : -1); hf(G.flipLock ? 1 : 0); hf(G.bo); hf(G.fish); hf(G.fishV); hf(G.drifting ? 1 : 0); hf(G.driftCharge); hf(G.driftBank); hf(G.turbo); hf(G.turboT); hf(G.nitro); hf(G.slowmo); hf(G.hitStop); hf(G.rng.state); hf(G.kills); hf(G.slams); hf(G.invuln); hf(G.damageAcc);
  hf(G.special ? G.special.ammo : -1); hf(G.cruise); hf(G.distScore); hf(G.waveT); hf(G.dead ? 1 : 0); hf(G.gunSpin); hf(G.easyDrift ? 1 : 0); hf(G.brakeOn ? 1 : 0); hf(G.heat); hf(G.hot); hf(G.spinA); hf(G.spinning ? 1 : 0); hf(G.mercyT); hf(G.limp ? 1 : 0); hf(G.limpT); hf(G.waveIdx); hf(G.fillT); hf(G.finale); hf(G.won ? 1 : 0); hf(G.pickT); hf(G.weaveT); hf(G.pileups); hf(G.civCrashes); hf(G.rolls); hf(G.roll ? G.roll.t : -1); hf(G.body.tilt); hf(G.body.roll); hf(G.driftBuild);
  hf(G.cars.length); for (const c of G.cars) { hs(c.kind); hf(c.x); hf(c.y); hf(c.speed); hf(c.vx); hf(c.hp); hf(c.alive ? 1 : 0); hf(c.wrecked ? 1 : 0); hs(c.state || ''); hf(c.t); hf(c.lane); hf(c.spin); hf(c.face || 0); hf(c.ut || 0); if (c.wrecked) { hf(c.h || 0); hf(c.qx || 0); hf(c.qy || 0); hf(c.qz || 0); hf(c.qw === undefined ? 1 : c.qw); hf(c.rb ? 1 : c.rested ? 2 : 0); } }
  hf(G.mines.length); for (const m of G.mines) { hf(m.x); hf(m.y); hf(m.dead ? 1 : 0); }
  hf(G.chunks.length); for (const ch of G.chunks) { hf(ch.x); hf(ch.y); hf(ch.h); hf(ch.qw); }
  hf(G.bullets.length); for (const b of G.bullets) { hf(b.x); hf(b.y); }
  hf(G.missiles.length); for (const m of G.missiles) { hf(m.x); hf(m.y); }
  hf(G.crates.length); hf(G.barrels.length); hf(G.cones.length); hf(G.ramps.length); hf(G.slicks.length); hf(G.queue.length); hf(G.puffs.length); hf(G.sparks.length);
  return hh >>> 0;
}
// Recorder: per-step snapshots, run-length encoded. Replayer: feeds them straight back. Version 4 (driver control): [off, thr x 16, fire, special, slam,
// flicks, playing, boost, mine, e-brake, run length]. The throttle is quantised to sixteenths at the input, so a live run and its replay see the same
// number; brake and gas are derived from it. Older versions belong to retired sims and are not read.
export const THR_Q = 16;
export function recordStep(i) { const R = G.rec; const L = R.last; const q = Math.round(i.thr * THR_Q), b = i.boost ? 1 : 0, m = i.mine ? 1 : 0, eb = i.ebrake ? 1 : 0, f = i.fire ? 1 : 0, sp = i.special ? 1 : 0;
  if (L && L[0] === i.off && L[1] === q && L[2] === f && L[3] === sp && L[4] === i.slam && L[5] === i.flicks && L[6] === i.p && L[7] === b && L[8] === m && L[9] === eb) { L[10]++; return; }
  const e = [i.off, q, f, sp, i.slam, i.flicks, i.p, b, m, eb, 1]; R.runs.push(e); R.last = e; }
export function deriveInput(i) { i.gas = i.thr > T.drive.dead; i.brake = i.thr < -T.drive.dead; }
export function replayNext(i) { const R = G.rep; let e = R.runs[R.i]; if (!e) { i.off = 0; i.thr = 0; i.fire = false; i.special = false; i.slam = 0; i.flicks = 0; i.p = 0; i.boost = false; i.mine = false; i.ebrake = false; deriveInput(i); R.ended = true; return; }
  i.off = e[0]; i.thr = e[1] / THR_Q; i.fire = e[2] === 1; i.special = e[3] === 1; i.slam = e[4]; i.flicks = e[5]; i.p = e[6]; i.boost = e[7] === 1; i.mine = e[8] === 1; i.ebrake = e[9] === 1; deriveInput(i);
  if (++R.n >= e[10]) { R.i++; R.n = 0; } }
export function exportReplay(bot) { const R = G.rec; return { version: 4, rev: 'D6', seed: G.seed, cfg: G.cfg, bot: bot || '', steps: G.steps, runs: R.runs, hashes: G.hashes.slice(), fine: G.fine ? G.fine.slice() : undefined }; }
export function startRecording(bot) { G.rec = { runs: [], last: null }; G.recBot = bot; }
export function attachReplay(r) { G.rep = { runs: r.runs, i: 0, n: 0, ended: false, version: r.version || 1 }; if (G.rep.version < 4) console.warn('replay version ' + G.rep.version + ' is from a retired sim'); G.expect = r.hashes; }
// runs N steps synchronously (no rendering, no frame clock): the fast replay check
export function runSteps(n, playing = true) { for (let k = 0; k < n; k++) { if (G.rep && G.rep.ended) break; simStep(G.rep ? G.playing : playing); } return G.hashes.slice(); }
