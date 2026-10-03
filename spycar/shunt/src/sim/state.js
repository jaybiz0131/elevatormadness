import { REF, T, mulberry32 } from './constants.js';
import { Road } from './road.js';
export function makeCar(kind, x, y, extra) {
  const [w, l, mass] = T.sizes[kind];
  // px/py: position at the previous physics step, for interpolated rendering. credit: the player caused this car's motion or wreck.
  return Object.assign({ kind, x, y, px: x, py: y, w, l, mass, vx: 0, speed: 0, factor: 1, hp: kind === 'bruiser' ? 4 : kind === 'gunner' ? 5 : kind === 'armored' ? 999 : 2, alive: true, wrecked: false, debrisT: 0, spin: 0, flip: 0, state: 'approach', t: 0, lane: 0, blink: 0, blinkDir: 0, laneTimer: 3 + G.rng() * 5, hitCd: 0, shunted: false, slammed: false, credit: false, creditT: 0, how: null, penalised: false, closeCalled: false, id: G.rng(), tint: null, side: 1, sight: 0, cd: 0, honk: 0, sq: 1, hitFlash: 0, lean: 0 }, extra || {});
}
// in-place compaction: keeps the elements that pass, in order, without allocating a new array (audit, "Smooth movement" 3)
export function compact(arr, keep) { let n = 0; for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (keep(v)) arr[n++] = v; } arr.length = n; return arr; }
// replay ring buffer: 1.5 s at 30 Hz, every frame and car slot pre-allocated so recording allocates nothing
export const REPLAY_FRAMES = 45, REPLAY_SLOTS = 24, REPLAY_FIELDS = ['kind', 'x', 'y', 'w', 'l', 'wrecked', 'tint', 'spin', 'flip', 'lean', 'state', 'blink', 'blinkDir', 'honk', 'debrisT', 'loaded', 'hitFlash', 't', 'sightX'];
export function makeReplay() { const frames = []; for (let i = 0; i < REPLAY_FRAMES; i++) { const cars = []; for (let j = 0; j < REPLAY_SLOTS; j++) cars.push({ kind: 'civ', x: 0, y: 0, w: 34, l: 58, wrecked: false, tint: null, spin: 0, flip: 0, lean: 0, state: '', blink: 0, blinkDir: 0, honk: 0, debrisT: 0, loaded: false, hitFlash: 0, t: 0, sightX: 0 }); frames.push({ x: REF, y: 0, jumpZ: 0, lean: 0, n: 0, cars, district: 0 }); } return { frames, head: 0, count: 0, acc: 0 }; }
export function recordReplay(dt) {
  const R = G.replay; R.acc += dt; if (R.acc < 1 / 30) return; R.acc = 0;
  const f = R.frames[R.head]; R.head = (R.head + 1) % REPLAY_FRAMES; R.count = Math.min(REPLAY_FRAMES, R.count + 1);
  f.x = G.x; f.y = G.dist; f.jumpZ = G.jumpZ; f.lean = G.lean; f.district = G.district; let n = 0;
  for (const c of G.cars) { if (n >= REPLAY_SLOTS) break; if (c.y < G.dist - 400 || c.y > G.dist + 900) continue; const s = f.cars[n++]; for (const k of REPLAY_FIELDS) s[k] = c[k]; }
  f.n = n;
}
export let G = null;
// A fresh run from a seed and the settings the sim is allowed to read. The caller owns the seed (random, daily or replayed).
export function newRun(seed, cfg) {
  const road = new Road(seed);
  G = { road, rng: mulberry32(seed ^ 0x5bd1e995), seed, cfg: { sens: cfg.sens, autoDrift: cfg.autoDrift, hairpinWall: !!cfg.hairpinWall }, ticks: 0, steps: 0, ev: [], hashes: [], rec: null, rep: null, in: { off: 0, brake: false, gas: false, fire: false, special: false, slam: 0, flicks: 0, p: 0 }, playing: false, dead: false, t: 0, acc: 0, dist: 0, pdist: 0, speed: 0, cruise: T.drive.cruise, fwd: 0, x: REF, px: REF, vx: 0, targetX: REF, rawTargetX: REF, lean: 0, sq: 1,
        heading: 0, phi: 0, slip: 0, slipping: false, drifting: false, driftDir: 0, driftT: 0, driftTier: 0, driftCharge: 0, driftBank: 0, driftDirty: false, driftExitT: 0, wobble: 0,
        turbo: 0, turboT: 0, slipT: 0, slipBoostT: 0, braking: false, burnout: 0, popT: 0, puffAcc: 0, sparkAcc: 0, puffs: [], ribbons: [], ribL: null, ribR: null, slideVx: 0, rumbleT: 0, cornerCalls: 0, hairpins: 0, cornerLog: [], teach: null, teachT: 0, pulsed: false,
        wallHits: 0, wideT: 0, wallT: 0, drifts: 0, driftSlams: 0, turbos: 0, driftPoints: 0, driftTierMax: 0, topSpeed: 0, speedSum: 0, speedN: 0, districtsPassed: 0,
        armor: T.armor, invuln: 0, damageAcc: 0, armorLost: 0, score: 0, combo: 0, comboT: 0, comboPeak: 1, kills: 0, passiveWrecks: 0, gunKills: 0, carKills: 0, civHits: 0, slams: 0, flicks: 0, flickMisses: 0, stomps: 0, distScore: 0,
        cars: [], bullets: [], missiles: [], crates: [], ramps: [], slicks: [], barrels: [], cones: [], medians: [], gaps: [], barriers: [], signs: [], debris: [], marks: [], fx: [], pops: [], sparks: [], queue: [],
        air: 0, airTotal: 0, jumpZ: 0, slowmo: 0, slowmoRate: 0.7, hitStop: 0, trauma: 0, kick: { x: 0, y: 0 }, vignette: 0, smoke: 0, flashT: 0, nitro: 0, speedLines: 0, punch: 0, detour: 0,
        special: null, gun: 'twin', gunLevel: 1, nextRamp: T.ramp.first, rampIndex: 0, nextTruck: 999, truckIndex: 0, nextBarrel: 999, nextClosure: 999, nextFork: 999, nextOnramp: 999, nextSpawn: 0, lastEvent: 0, lastSpawnBurst: [], wave: 'pressure', waveT: 40, waveN: 0,
        scripted: true, script: 0, district: 0, nextDistrictY: 600 * 8, signShown: -1, cause: '', killedBy: '', boost: 0, grazeT: 0, grazePaid: 0, gunCd: 0, gunSpin: 0, heat: 0, hot: 0, shots: 0, reversing: false, gasT: 0, spinning: false, spinA: 0, spinDir: 0, spins: 0, spinArm: 0, slamT: 0, slamDir: 0, slamCd: 0, replay: makeReplay(), replayT: 0, deathT: 0, bestMoment: 0 };
  G.x = REF; return G;
}
export function beginRun() { G.burnout = 0.6; G.speed = 0; }
