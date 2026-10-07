// Stop 7: the opening scene, in the sim so a replay and the live loop agree. For T.intro.total seconds after PLAY the run's clock (G.ticks) does not move and the hero is placed by
// this script instead of by the driving model: nothing on the road, a beat of quiet, an engine off-screen, the hero blasting in from the screen's right sliding sideways, a 180 whipped in a
// burst of tyre smoke, a stop facing down the road, the pursuers' headlights flaring behind it (the renderer draws those from G.intro.t), then GO. A tap skips it (once it has been seen).
// The camera (render/three/camera.js) reads G.intro.t; the sim writes only the hero's pose and the same fields the driving model does, so the smoke, skid marks and sounds need no special case.
import { REF, STEP, T, clamp } from './constants.js';
import { hap, say, sfx } from './events.js';
import { G } from './state.js';
import { driveEffects } from './physics.js';
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// the hero's pose at intro time t: [across, along, yaw, travel speed across, along] (road space, yaw clockwise from down the road)
export function introPose(t, s0, out) {
  const I = T.intro; const ts = I.appear; const u = clamp((t - ts) / I.slide, 0, 1), k = 1 - u;
  const dx = I.from[0], ds = I.from[1];
  out.x = REF - dx * k * k; out.s = s0 - ds * k * k;
  out.vx = 2 * dx * k / I.slide * (u < 1 ? 1 : 0); out.vs = 2 * ds * k / I.slide * (u < 1 ? 1 : 0);
  const w = sm((t - I.whipAt) / I.whipFor); out.yaw = Math.PI * (1 - w);
  out.slip = (u < 1 ? 1 : 0) * 0.85 * clamp(k * 3, 0, 1) * (t > I.whipAt - 0.25 ? 1 : 0.6);
  return out;
}
const P = { x: REF, s: 0, vx: 0, vs: 0, yaw: Math.PI, slip: 0 };
export function introStep() {
  const I = G.intro, c = T.intro; const prev = I.t; I.t += STEP; const t = I.t;
  // one-shots on the script's clock
  if (prev < c.roar && t >= c.roar) sfx.introRoar();
  if (prev < c.whipAt && t >= c.whipAt) { sfx.slam(); sfx.brake(); hap([20, 20, 40]); }
  if (prev < c.appear + c.slide && t >= c.appear + c.slide) { sfx.launch(); G.kick.y += 3; G.trauma = Math.max(G.trauma, 0.35); }
  introPose(t, I.s, P);
  G.px = G.x; G.pdist = G.dist;
  G.heroHidden = t < c.appear;
  if (G.heroHidden) { P.vx = P.vs = 0; P.slip = 0; }   // not on the road yet: nothing to hear or smoke
  G.x = P.x; G.dist = P.s; G.vx = P.vx; G.fwd = P.vs; G.speed = Math.hypot(P.vx, P.vs); G.heading = 0; G.phi = 0; G.flipA = P.yaw; G.slip = P.slip; G.fish = 0; G.targetX = G.x; G.rawTargetX = G.x; G.face = 1; G.slipping = P.slip > 0.1; G.drifting = false;
  if (t >= c.appear && t < c.appear + c.slide + 0.35) driveEffects(STEP);   // tyre smoke, skid marks: the same code the driving model uses (it needs a speed and a slip)
  else if (G.puffs.length || G.ribbons.length) { G.speed = 0; G.slip = 0; driveEffects(STEP); }
  if (t >= c.total) endIntro(false);
}
export function endIntro(skipped) {
  const I = G.intro; if (!I) return; const c = T.intro;
  introPose(c.total + 1, I.s, P);
  G.px = G.x = P.x; G.pdist = G.dist = P.s; G.vx = 0; G.fwd = 0; G.speed = 0; G.heading = 0; G.phi = 0; G.flipA = 0; G.slip = 0; G.slipping = false; G.fish = 0; G.targetX = G.x; G.rawTargetX = G.x; G.face = 1;
  G.heroHidden = false; G.intro = null; if (skipped) G.introSkips++;
  G.prevRc = undefined; G.prevOff = undefined;
  say('Go', '', 700, true); hap([10, 30]); sfx.turbo(1);
}
