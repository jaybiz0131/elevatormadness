// Frozen tuning (audit Sprints A-C) and pure helpers. No DOM, no three.js.
export const REF = 195, H = 844;
export const T = {
  thumbRatio: 1.4, maxLateral: 520, ease: 0.06, lean: 10, deadZone: 3,
  speed0: 420, speedMax: 700, speedRampMinutes: 5,
  // Driving model (audit, Sprint B). Speed is the player's to manage: auto throttle to cruise, brake on the pedal pad, mini-turbo
  // after a drift, slipstream behind any car, nitro from the special. Steering is heading based: lateral speed = speed × sin(heading).
  // Sprint 4: gas pedal. Hold gas to pull past cruise toward `top` at `accel`; let go and the car eases back to cruise; brake to
  // `minSpeed`, keep holding and it stops and reverses to `reverse` (back out of what you hit, then go on).
  drive: { cruise: 480, districtGain: 1.1, top: 1300, nitro: 1600, brake: 1000, minSpeed: 260, throttle: 1.2, accel: 700, coast: 0.5, reverse: 220, reverseAccel: 500, slipFor: 0.8, slipBoost: 120, slipBoostFor: 1.0,
           maxHeading: 30, turnRate: 240, tau: 0.07, grip: 1500 },
  drift: { heading: 55, turnRate: 320, tau: 0.38, loss: 0.05, tiers: [0.8, 1.6, 2.6], turbo: [150, 250, 400], turboFor: [0.6, 0.9, 1.2], exit: 0.25, exitTau: 0.12, minSlip: 20, slamSlip: 25, bankRate: 0.5 },
  // the 360: a drift held hard out for `arm` seconds above `speed` becomes a spin; the body turns a full circle at `rate` degrees
  // a second while the car keeps sliding along its path, scrubbing `loss` of its speed a second; a finished spin pays score and a turbo
  spin: { arm: 0.4, over: 0.8, speed: 480, rate: 420, loss: 0.3, score: 300 },
  // the gatling gun (Sprint D, replaces the rotary machine guns): hold FIRE, the barrels spin up over `spinUp` seconds (the whine), then
  // `rate` rounds a second leave along the car's heading in a narrow spray of +-`spread` degrees. No aim help: the player aims by steering.
  // Heat climbs per round; an overheated gun rests for `rest`. About 5 s of continuous fire before the rest.
  gatling: { spinUp: 1.0, spinDown: 2.0, rate: 20, spread: 3.0, dmg: 0.5, muzzle: 36, heatPer: 0.022, cool: 0.25, rest: 1.2, tracerEvery: 3, shake: 0.6, killStop: 0.06 },
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
  bruiser: { hold: [0.8, 1.6], tell: 0.6, lunge: 70, lungeSpeed: 260, recover: 1.0, push: 22, shove: 300, closeCap: 190, dropCap: 150, damage: 1, hp: 6 },
  dart: { hold: [0.8, 1.6], tell: 0.45, lunge: 60, lungeSpeed: 420, recover: 2.2, push: 14, shove: 180, closeCap: 280, dropCap: 260, damage: 0.5, hp: 3 },
  gunner: { sight: 0.8, cooldown: 3.0, hp: 7 },
  ramp: { first: 12, every: [12, 18], warn: 2.0, air: 1.2, steerAir: 0.5, slowmo: 0.7, slowmoFor: 0.3 },
  truckEvery: 25, barrelEvery: 20, closureEvery: 30, forkEvery: [60, 90], onrampEvery: 45, districtEvery: 60,
  missiles: 6, oil: 4, nitro: 3, crateDrop: 0.25,
  // combo: a kill within `window` seconds of the last one raises the multiplier (x2 up to x5); the multiplier is held for `hold` seconds
  // after the last kill (a kill in that last second keeps it but does not raise it); a crash or running out of hold resets it
  combo: { window: 3.0, hold: 4.0, max: 5 },
  // the run (Sprint D): escape toward the city. `city` is the distance in pt (about three minutes at cruise); the finale starts at `finale`
  // of the way, a heavy wave plus a Bulwark; stars are awarded at the city
  goal: { city: 120000, finale: 0.9, bonus: 1000, bonusArmor: 300, stars: [0, 30000, 60000] },
  // the pacing director: the first wave at `first` s, then a wave every 8 to 15 s (shorter as the run goes on); with no threat in the
  // window for `floor` s (or fewer than the tier's minimum for `floorMore` s) a filler enemy appears at once, so the road is never quiet for long and never for 5 s. Weave lines of slow traffic,
  // pickups when armor or missiles run low, and the near-miss bonus.
  pace: { first: 3.5, waveMin: 8, waveMax: 15, floor: 0.3, floorMore: 0.8, window: [-460, 900], weaveEvery: [12, 18], pickupEvery: [12, 20], caps: [3, 4, 5, 6], nearMiss: 16 },
  // score by cause (audit, "Give the kills back to the player"): a wreck the player caused pays base × the cause multiplier;
  // the car is the main weapon, so Slam, shunt, ram, wall and oil kills pay 3× a gun kill; enemy-on-enemy accidents pay nothing
  score: { weak: 100, bruiser: 250, gunner: 250, armored: 400, cause: { gun: 1, missile: 1, slam: 3, shunt: 3, ram: 3, rail: 3, wall: 3, oil: 3, stomp: 3, chain: 2, barrel: 2 },
           civilian: -100, crate: 250, graze: 10, grazeCap: 3, truckLoad: 100, clean: 120, closeCall: 50, shuntEnemy: 100, barrelDouble: 150, distancePer: 100 },
  mercy: 2.5,   // after the car takes a hit, enemies wait this long before the next lunge or shot (and twice as long on one armor pip)
  graceSeconds: 60,   // damage halved for the first minute; armor comes from pickups and the supply truck
  // the barrier hit (step 6): fires over 1.15x the grip budget, keeps 45% of the speed, costs half an armor pip
  wall: { over: 1.02, wideFor: 0.3, keep: 0.45, stun: 0.8, damage: 0.5 },   // stun: seconds the car grinds the rail at minimum speed
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
