// Frozen tuning (audit Sprints A-C) and pure helpers. No DOM, no three.js.
export const REF = 195, H = 844;
export const T = {
  thumbRatio: 1.4, maxLateral: 520, ease: 0.06, lean: 10, deadZone: 3,
  speed0: 420, speedMax: 700, speedRampMinutes: 5,
  // Driving model (audit, Sprint B). Speed is the player's to manage: auto throttle to cruise, brake on the pedal pad, mini-turbo
  // after a drift, slipstream behind any car, nitro from the special. Steering is heading based: lateral speed = speed × sin(heading).
  // Sprint 4: gas pedal. Hold gas to pull past cruise toward `top` at `accel`; let go and the car eases back to cruise; brake to
  // `minSpeed`, keep holding and it stops and reverses to `reverse` (back out of what you hit, then go on).
  drive: { brakeSpeed: 400, brakeRate: 1250, cruise: 480, districtGain: 1.1, top: 1000, nitro: 1800, brake: 1000, minSpeed: 260, throttle: 1.2, accel: 700, coast: 0.5, reverse: 220, reverseAccel: 500, slipFor: 0.8, slipBoost: 120, slipBoostFor: 1.0,
           maxHeading: 30, turnRate: 240, tau: 0.07, grip: 1500,
           // Stop 3: no pedals. The car drives itself at `auto` and lifts for a hard corner it would not hold (down to `liftK` x its grip speed,
           // at `liftRate`); a drift skips the lift, so drifting is the fast way round
           auto: 1000, liftK: 0.97, liftRate: 900 },
  // Stop 3: drift is automatic. Steering past `startU` for `startFor` s at speed (or steering into a corner the tyres cannot hold) starts it;
  // the slip angle grows with how hard the thumb is held (`slip` degrees from `holdU` to full); a held drift builds speed (`build` pt/s a
  // second, up to `buildMax` over the auto speed), and letting the thumb come back past `holdU` ends it with the tier's turbo
  drift: { brakeU: 0.14, brakeHoldU: 0.05, easySlip: [20, 36], startU: 0.62, startFor: 0.1, cornerU: 0.3, holdU: 0.22, counterU: -0.3, slip: [18, 52], build: 160, buildMax: 260, heading: 55, turnRate: 320, tau: 0.38, loss: 0.05, tiers: [0.8, 1.6, 2.6], turbo: [150, 250, 400], turboFor: [0.6, 0.9, 1.2], exit: 0.25, exitTau: 0.12, minSlip: 20, slamSlip: 25, bankRate: 0.5 },
  // the 360: a drift held hard out for `arm` seconds above `speed` becomes a spin; the body turns a full circle at `rate` degrees
  // a second while the car keeps sliding along its path, scrubbing `loss` of its speed a second; a finished spin pays score and a turbo
  spin: { arm: 0.4, over: 0.8, speed: 480, rate: 420, loss: 0.3, score: 300 },
  // the gatling gun (Sprint D, replaces the rotary machine guns): hold FIRE, the barrels spin up over `spinUp` seconds (the whine), then
  // `rate` rounds a second leave along the car's heading in a narrow spray of +-`spread` degrees. No aim help: the player aims by steering.
  // Heat climbs per round; an overheated gun rests for `rest`. About 5 s of continuous fire before the rest.
  // Stop 3: the gun fires on the press (Jack): no spin-up delay, the barrels are already turning
  gatling: { spinUp: 0, spinDown: 2.0, rate: 20, spread: 3.0, dmg: 0.5, muzzle: 36, heatPer: 0.022, cool: 0.25, rest: 1.2, tracerEvery: 3, shake: 0.6, killStop: 0.05 },
  laneW: 62, minLanes: 2, maxLanes: 5,
  // Roads with real turns (audit, Sprint C): constant-curvature arcs joined by 120 pt transitions; combat straights with gentle
  // sweepers alternate with technical sectors of hard corners and hairpins. Grip speed in a corner is sqrt(grip × radius).
  corner: { warn: 2.2, transition: 120, chevronEvery: 60, trafficSlow: 0.45, driftBonus: 1.0, driftGrip: 1.3, crestSpeed: 600, rumbleEvery: 0.08 },
  fireRate: 6, bulletSpeed: 1300, gunRange: 640, gunHalfLane: 26,
  // Slam (audit, "The Slam, corrected"): 600 pt/s for 0.11 s is about one lane; a flick is 60 stage pt in under 100 ms from a
  // thumb that moved less than 10 pt in the previous 120 ms; it only fires with an enemy within 1.4 lanes on that side and 60 pt ahead or behind
  slam: { flickPt: 60, flickMs: 100, quietPt: 10, quietMs: 120, burst: 0.11, speed: 600, cooldown: 1.0, power: 2.5, reachLanes: 1.4, reachY: 60 },
  shuntMul: 1.5, shuntMin: 220, shuntThreshold: 120, shuntIntent: 80, rearCd: 0.35, armor: 3, invuln: 1.0,
  // Enemy classes. Ram (the bruiser) lines up beside the car, flashes, then lunges: a crunch and a shove. Dart (kind 'weak') is the light,
  // fast one: a short tell, a quick half-armor clip. Gunner sits behind and fires along a red sight line. Bulwark (kind 'armored') is the
  // armored truck: guns bounce off, missiles kill it, ramming it costs armor.
  bruiser: { hold: [0.8, 1.6], tell: 0.6, lunge: 70, lungeSpeed: 260, recover: 1.0, push: 22, shove: 300, closeCap: 190, dropCap: 150, damage: 1, hp: 18 },
  dart: { hold: [0.8, 1.6], tell: 0.45, lunge: 60, lungeSpeed: 420, recover: 2.2, push: 14, shove: 180, closeCap: 280, dropCap: 260, damage: 0.5, hp: 9 },
  gunner: { sight: 0.8, cooldown: 3.0, hp: 21 },
  // Stop 5: a ramp is a ballistic launch (vz pt/s up, so about 2 vz / g seconds in the air on the flat); `air` is only the nominal time
  ramp: { first: 12, every: [12, 18], warn: 2.0, air: 0.9, vz: 190, steerAir: 0.5, slowmo: 0.7, slowmoFor: 0.3 },
  // Stop 5: hills. The car is a point that follows the road's height until the road curves away faster than gravity can pull it (speed^2 x curvature
  // over `g`, times `k`): then it is airborne, on a parabola, until it meets the road again. A landing is always soft (compression, a bounce over
  // `hopAt` s of air, sparks). `airMin` s of air and up pays `airScore` a second and charges BOOST.
  hill: { g: 420, k: 1.5, minSpeed: 520, maxAir: 1.6, hopAt: 0.75, airScore: 260, airMin: 0.35 },
  // Stop 5: BOOST. A full meter is `dur` s at +`speed` pt/s over the auto speed; a tap spends the whole meter (at least `min`). Fills: a near miss,
  // each tier of a clean drift, a takedown, a pile-up, and airtime. `start` is the meter at the start of a run.
  boost: { speed: 560, dur: 1.6, accel: 3200, start: 0.5, min: 0.3, near: 0.12, drift: 0.07, air: 0.3, kill: 0.1, pile: 0.08 },
  // Stop 5: shock mines: `ammo` at the start, `max` carried, `crate` more from every supply crate; armed after `arm` s; a pursuer within `r` pt sideways
  // and `ry` pt along trips it
  mine: { ammo: 3, max: 6, crate: 2, arm: 0.25, r: 30, ry: 24, hold: 0.32, stun: 0.9, shock: 90 },
  truckEvery: 25, barrelEvery: 20, closureEvery: 30, forkEvery: [60, 90], onrampEvery: 45, districtEvery: 60,
  missiles: 6, oil: 4, nitro: 3, crateDrop: 0.25,
  // combo: a kill within `window` seconds of the last one raises the multiplier (x2 up to x5); the multiplier is held for `hold` seconds
  // after the last kill (a kill in that last second keeps it but does not raise it); a crash or running out of hold resets it
  combo: { window: 3.0, hold: 4.0, max: 5 },
  // the run (Sprint D): escape toward the city. `city` is the distance in pt (about three minutes at cruise); the finale starts at `finale`
  // of the way, a heavy wave plus a Bulwark; stars are awarded at the city
  // Stop 2: it is a combat race and the player never dies. Time is the cost of everything: a hit, a ram or a wall takes speed (`hurt`, in
  // pt/s per armor pip, as a one-off speed loss), no armor means limp mode (slower, no gas, smoking) until a repair crate is collected, and
  // every kill gives a short speed burst. The finish card grades time plus score: each is turned into 0..1 (time between `fast` and `slow`
  // seconds, score up to `scoreRef`), averaged, and the average gives the letter and the stars.
  // Stop 5: speed is automatic, so time alone is generous (everyone finishes in about two minutes). The rating is a weighted sum of five 0..1 measures: time (`fast` s = 1, `slow` s = 0),
  // score (to `scoreRef`), takedowns (to `killRef`), pile-ups (to `pileRef`) and the best combo (x`comboRef`). A weak driver lands on C, a casual one on B, a skilled one on A; S is for a great run.
  goal: { city: 120000, finale: 0.9, bonus: 1000, bonusArmor: 300, time: { fast: 95, slow: 132 }, scoreRef: 70000, killRef: 50, pileRef: 16, comboRef: 5, weights: { time: 0.50, score: 0.20, kills: 0.12, pile: 0.10, combo: 0.08 }, letters: [[0.88, 'S'], [0.66, 'A'], [0.38, 'B'], [0, 'C']], stars: [0.38, 0.66] },
  hurt: { perPip: 380, wall: 0, min: 120 },
  kill: { burst: 240, perCombo: 60, burstFor: 1.1, carStop: 0.07, carSlow: 0.18, carSlowRate: 0.6 },
  limp: { speedK: 0.55, repairAfter: 2.5, repairAt: 1600, armorBack: 2 },
  spawn: { min: 2600, speedK: 1.4, speedAdd: 900, behind: 650, cull: 3800, crate: 1600 },
  // the pacing director: the first wave at `first` s, then a wave every 8 to 15 s (shorter as the run goes on); with no threat in the
  // window for `floor` s (or fewer than the tier's minimum for `floorMore` s) a filler enemy appears at once, so the road is never quiet for long and never for 5 s. Weave lines of slow traffic,
  // pickups when armor or missiles run low, and the near-miss bonus.
  pace: { first: 3.5, waveMin: 8, waveMax: 15, floor: 0.3, floorMore: 0.8, window: [-700, 3200], visible: [-300, 1800], fillCool: 1.6, weaveEvery: [12, 18], pickupEvery: [12, 20], caps: [3, 4, 5, 6], nearMiss: 16 },
  // score by cause (audit, "Give the kills back to the player"): a wreck the player caused pays base × the cause multiplier;
  // the car is the main weapon, so Slam, shunt, ram, wall and oil kills pay 3× a gun kill; enemy-on-enemy accidents pay nothing
  score: { weak: 100, bruiser: 250, gunner: 250, armored: 400, cause: { gun: 1, missile: 1, mine: 3, slam: 3, shunt: 3, ram: 3, rail: 3, wall: 3, oil: 3, stomp: 3, chain: 2, barrel: 2, pileup: 2 }, pileUp: 150, civPile: 450,
           civilian: -100, crate: 250, graze: 10, grazeCap: 3, truckLoad: 100, clean: 120, closeCall: 50, shuntEnemy: 100, barrelDouble: 150, distancePer: 100 },
  mercy: 2.5,   // after the car takes a hit, enemies wait this long before the next lunge or shot (and twice as long on one armor pip)
  graceSeconds: 60,   // damage halved for the first minute; armor comes from pickups and the supply truck
  // the barrier hit (step 6): fires over 1.15x the grip budget, keeps 45% of the speed, costs half an armor pip
  wall: { over: 1.02, wideFor: 0.3, keep: 0.45, stun: 0.8, damage: 0.5 },   // stun: seconds the car grinds the rail at minimum speed
  // Stop 3 crash physics (src/sim/crash.js; speeds in m/s): at most `cap` tumbling wrecks; `life` s before a body is retired; a wreck that hits
  // a live enemy above `pileUp` takes it down too (a pile-up), a civilian above `civCrash` spins out (rolls above `civRoll`, explodes only above
  // `civBoom`); a wreck slamming into the hero from the side above `heroRoll` rolls the hero
  crash: { cap: 6, gravity: 24, friction: 0.8, massK: 1300, life: 5.5, blastUp: [7, 5], pileUp: 8, civCrash: 7, civRoll: 15, civBoom: 26, heroHit: 5, heroRoll: 12, wallFx: 6, barrelRoll: 22 },
  // the hero's body (presentation, but stepped in the sim): roll per pt/s^2 of lateral load, squat per pt/s^2 of speed change, and two wheels:
  // above `twoAt` x the grip budget for `twoFor` s (not drifting) the inside wheels lift up to `twoMax` degrees, then slam back down
  susp: { rollK: 0.0045, rollMax: 7, pitchK: 0.004, pitchMax: 4, k: 180, damp: 16, twoAt: 1.05, twoFor: 0.18, twoMax: 22, twoHold: 0.45 },
  // the hero rollover: a big hit throws the car over once round its long axis in `dur` s, `lift` m up; it lands on its wheels
  roll: { dur: 0.95, lift: 1.7, damage: 1, steer: 0.25 },
  sizes: { player: [34, 60, 1.0], civ: [34, 58, 0.8], weak: [28, 50, 0.7], bruiser: [40, 70, 1.2], gunner: [40, 76, 1.3], armored: [120, 150, 3.0], truck: [56, 110, 3.0] },
};
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
export const lerp = (a, b, t) => a + (b - a) * t;
export function mulberry32(a) { const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; Object.defineProperty(r, 'state', { get: () => a >>> 0 }); return r; }
export const STEP = 1 / 120;   // the fixed simulation step; sim time is ticks / 120
export function hashI(seed, i) { let h = (seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0; h = Math.imul(h ^ h >>> 16, 0x85EBCA6B) >>> 0; h = Math.imul(h ^ h >>> 13, 0xC2B2AE35) >>> 0; return (h ^ h >>> 16) >>> 0; }
export function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export function localDate() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
