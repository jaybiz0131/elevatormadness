// Frozen tuning (audit Sprints A-C) and pure helpers. No DOM, no three.js.
export const REF = 195, H = 844;
export const T = {
  thumbRatio: 1.4, maxLateral: 520, ease: 0.06, lean: 10, deadZone: 3,
  speed0: 420, speedMax: 700, speedRampMinutes: 5,
  // Driving model (audit, Sprint B). Speed is the player's to manage: auto throttle to cruise, brake on the pedal pad, mini-turbo
  // after a drift, slipstream behind any car, nitro from the special. Steering is heading based: lateral speed = speed × sin(heading).
  // Sprint 4: gas pedal. Hold gas to pull past cruise toward `top` at `accel`; let go and the car eases back to cruise; brake to
  // `minSpeed`, keep holding and it stops and reverses to `reverse` (back out of what you hit, then go on).
  // Driver control: `vmax` flat out on full throttle, `dead` the puck's dead zone, `coastDecel` the roll-down with no throttle, `stopV` below which BRAKE turns into reverse (up to `reverse`)
  drive: { vmax: 1000, dead: 0.12, coastDecel: 160, stopV: 30, brakeSpeed: 400, brakeRate: 1250, cruise: 480, districtGain: 1.1, top: 1000, nitro: 1800, brake: 1000, minSpeed: 260, throttle: 1.2, accel: 700, coast: 0.5, reverse: 340, reverseAccel: 520, slipFor: 0.8, slipBoost: 120, slipBoostFor: 1.0,
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
  // Driver control: the e-brake. Alone it locks the rear wheels (`decel`); in a turn it drifts; with the thumb past `flipU` above `flipSpeed` it swings the car round
  // half a turn in `flipT` s (scrubbing `flipDrag`); with gas past `burnThr` below `burnStop` pt/s it is a burnout: held at least `burnMin` s (up to `burnMax`), letting go launches
  // the car at `launch` pt/s with up to `burnTurbo` of turbo for `burnFor` s. The fishtail is a damped spring on the yaw (`fishK`, `fishC`) kicked by `fishKick`.
  ebrake: { decel: 700, flipU: 1.5, flipSpeed: 160, flipBendV: 400, flipT: 0.5, flipDrag: 1.6, burnThr: 0.4, burnStop: 60, burnMin: 0.4, burnMax: 1.6, launch: 340, burnTurbo: 420, burnFor: 1.0, fishK: 40, fishC: 3.5, fishKick: 90, fishSlide: 40 },
  // Stop 6: the smoke cloak. `G.cloak` (0..1) is how thick the smoke is round the hero: a burnout, a long drift, a 180 and a skidding e-brake pour it in (`burn`,
  // `drift` ramping over `driftRamp` s after `driftAfter` s, `flip`, `skid` per second); it thins at `decay` a second and faster the quicker the car moves (it
  // leaves the cloud behind, `speedDecay` per 1,000 pt/s). Above `on` the hero is hidden: enemies lose track (they steer for where it was, `off` pt of wander, and a
  // Gunner fires `wide` pt wide); below `off` they find it again. The hero's guns are unaffected.
  smoke: { on: 0.55, off: 0.3, burn: 1.7, flip: 1.5, skid: 0.55, drift: [0.8, 2.3], driftAfter: 0.4, driftRamp: 1.4, decay: 0.3, speedDecay: 0.85, offX: 110, offY: 260, wander: 0.55, wide: [48, 95], range: 2000 },
  // Stop 6: the street takes damage. A round that reaches a building face chips it (a scar decal, dust, falling glass); chips and blasts heat a cell of the facade
  // (`cell` pt long), which cools `cool` a second; at `fireAt` the facade catches fire for `fire` s (at most `fires` at once, `scars` decals in all, each lasting
  // `scarLife` s). A wreck hitting a building at over `T.crash.wallBoom` m/s blows up there.
  facade: { cell: 48, cool: 0.5, fireAt: 6, boomHeat: 14, pieceHeat: 3, fire: [7, 11], fires: 6, scars: 80, scarLife: 50 },
  // Driver control: enemies turn round. A chaser that wants to go the other way at more than `uturnV` pt/s for `uturnWait` s does a U-turn in `uturn` s;
  // below `slow` pt/s of road speed a Gunner may sit at either end of the car
  enemy: { uturn: 0.7, uturnV: 120, uturnWait: 0.35, slow: 300, chargeFrom: 240, chargeV: 560 },
  // Driver control: cars break into pieces. At most `cap` pieces fly; each flies `life` s (or until it settles), then lies `lie` s. Thrown outward at `kick` m/s
  // (base, random extra) and up at `up`, spinning up to `spin` rad/s, scaled by the hit's power. A piece hitting a live enemy above `flipV` m/s flips it (a
  // pile-up with the player's credit when the piece is the player's doing); above `knockV` it spins it out.
  chunk: { cap: 16, life: 4, lie: 5, kick: [3, 6], up: [3, 5], spin: 9, massK: 0.05, flipV: 9, knockV: 4 },
  // Driver control: the street. Building faces stand `setback` pt past the road edge (behind the 40 pt sidewalk and a strip of plaza); nothing stands on or over the road
  city: { setback: 96 },
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
  // Driver control: the player sets the pace, so the grade is about what they did with it: score, takedowns and pile-ups, each per minute of the run (a slow run
  // does not win by lasting longer), the best combo (x`comboRef`), plus a time bonus (`fast` s = full, `slow` s = none). Each measure is 0..1 against its
  // reference, weighted into the rating, which gives the letter. A weak driver lands on C, a casual one on B, a skilled one on A; S is a great run.
  goal: { city: 120000, finale: 0.9, bonus: 1000, bonusArmor: 300, time: { fast: 100, slow: 145 }, scoreRef: 45000, killRef: 26, pileRef: 12, comboRef: 5, weights: { score: 0.30, kills: 0.20, pile: 0.10, combo: 0.05, time: 0.35 }, letters: [[0.85, 'S'], [0.64, 'A'], [0.55, 'B'], [0, 'C']], stars: [0.55, 0.64] },
  hurt: { perPip: 380, wall: 0, min: 120 },
  kill: { burst: 240, perCombo: 60, burstFor: 1.1, carStop: 0.07, carSlow: 0.18, carSlowRate: 0.6 },
  limp: { speedK: 0.55, repairAfter: 2.5, repairAt: 1600, armorBack: 2 },
  spawn: { min: 2600, speedK: 1.4, speedAdd: 900, behind: 650, cull: 3800, crate: 1600 },
  // the pacing director: the first wave at `first` s, then a wave every 8 to 15 s (shorter as the run goes on); with no threat in the
  // window for `floor` s (or fewer than the tier's minimum for `floorMore` s) a filler enemy appears at once, so the road is never quiet for long and never for 5 s. Weave lines of slow traffic,
  // pickups when armor or missiles run low, and the near-miss bonus.
  pace: { tierTime: 240, first: 3.5, waveMin: 8, waveMax: 15, floor: 0.3, floorMore: 0.8, window: [-700, 3200], visible: [-300, 1800], fillCool: 1.6, weaveEvery: [12, 18], pickupEvery: [12, 20], caps: [3, 4, 5, 6], nearMiss: 16 },
  // score by cause (audit, "Give the kills back to the player"): a wreck the player caused pays base × the cause multiplier;
  // the car is the main weapon, so Slam, shunt, ram, wall and oil kills pay 3× a gun kill; enemy-on-enemy accidents pay nothing
  score: { weak: 100, bruiser: 250, gunner: 250, armored: 400, cause: { gun: 1, missile: 1, mine: 3, slam: 3, shunt: 3, ram: 3, rail: 3, wall: 3, oil: 3, stomp: 3, chain: 2, barrel: 2, pileup: 2 }, pileUp: 150, civPile: 450,
           civilian: -100, crate: 250, graze: 10, grazeCap: 3, truckLoad: 100, clean: 120, closeCall: 50, shuntEnemy: 100, barrelDouble: 150, distancePer: 100, burnout: 150, flip: 200, wallSmash: 120 },
  mercy: 2.5,   // after the car takes a hit, enemies wait this long before the next lunge or shot (and twice as long on one armor pip)
  graceSeconds: 60,   // damage halved for the first minute; armor comes from pickups and the supply truck
  // the barrier hit (step 6): fires over 1.15x the grip budget, keeps 45% of the speed, costs half an armor pip
  wall: { over: 1.02, wideFor: 0.3, keep: 0.45, stun: 0.8, damage: 0.5 },   // stun: seconds the car grinds the rail at minimum speed
  // Stop 3 crash physics (src/sim/crash.js; speeds in m/s): at most `cap` tumbling wrecks; `life` s before a body is retired; a wreck that hits
  // a live enemy above `pileUp` takes it down too (a pile-up), a civilian above `civCrash` spins out (rolls above `civRoll`, explodes only above
  // `civBoom`); a wreck slamming into the hero from the side above `heroRoll` rolls the hero
  crash: { wallBoom: 13, cap: 6, gravity: 24, friction: 0.8, massK: 1300, life: 5.5, blastUp: [7, 5], pileUp: 8, civCrash: 7, civRoll: 15, civBoom: 26, heroHit: 5, heroRoll: 12, wallFx: 6, barrelRoll: 22 },
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
