// Crash physics (Sprint D, Stop 3): a hybrid. The hero and every live car keep the arcade road-space model in physics.js; a car that is
// wrecked, launched or knocked hard becomes a rigid body in Rapier (the deterministic WebAssembly build) and flips, tumbles, rolls,
// bounces off the road, the rails, the building faces and other cars until it comes to rest. Live cars and the hero ride along as
// kinematic boxes so wrecks hit them; those hits come back to the sim as events (pile-ups, spin-outs, hits on the hero).
//
// Frame: road space straightened out. X = (x - REF) * M across the road (metres), Y up from the road surface, Z = -s * M along it, so a
// body's forward is -Z like the three.js car models. The renderer maps a body's road-space position through the road frame at its s and
// turns its rotation by the road heading there. Curvature is felt as the outward push the arcade model already used (v^2 k).
//
// Determinism: the world is rebuilt for every run, bodies are created and removed only inside the fixed step and always in G.cars order,
// and every body's pose is copied onto its car each step so the state hash covers it. At most T.crash.cap bodies are dynamic; when one
// more is needed the oldest is retired (frozen in place, it still lies there until it is cleared).
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import GZ from 'virtual:rapier-wasm';
import { gunzipSync } from 'fflate';
import { REF, T } from './constants.js';
import { G } from './state.js';
export const M = 4.5 / 60;   // metres per pt (render/three/scale.js has the same number)
export const CRASH = { ready: false, error: null, stepMs: 0, steps: 0, bodies: 0, kin: 0, walls: 0, events: 0 };
// car heights (m) for the boxes; the renderer's models stand on y = 0, the box centre is half this above the road
export const HEIGHT = { player: 1.25, civ: 1.4, weak: 1.15, bruiser: 1.45, gunner: 2.0, armored: 2.6, truck: 3.0 };
let initP = null;
export function initCrash() {
  if (initP) return initP;
  initP = (async () => {
    if (globalThis.location && /[?&]crash=0/.test(location.search)) { CRASH.error = 'off (?crash=0)'; return false; }   // dev switch: the old wreck slide, for comparisons
    try {
      const bin = atob(GZ); const gz = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) gz[i] = bin.charCodeAt(i);
      globalThis.__rapierWasm = gunzipSync(gz); await RAPIER.init(); globalThis.__rapierWasm = undefined; CRASH.ready = true;
    } catch (e) { CRASH.error = String(e && e.message || e).slice(0, 140); }
    return CRASH.ready;
  })();
  return initP;
}
// one line for the Show FPS panel
export function crashLine() { return CRASH.ready ? `physics rapier ${CRASH.bodies}/${T.crash.cap} wrecks, ${CRASH.kin} cars, ${CRASH.stepMs.toFixed(3)} ms/step` : CRASH.error ? 'physics FAILED ' + CRASH.error : 'physics loading'; }

// ---- the world (module state, rebuilt per run; never serialised) ----
let W = null, EQ = null, dormant = true; const tags = new Map(); let dyn = [], kin = [], walls = new Map(); let hero = null;
const SEG = 200;   // wall segment length along the road (pt)
export function crashReset() {
  if (!CRASH.ready) return;
  if (W) { W.free(); W = null; } if (EQ) { EQ.free(); EQ = null; }
  tags.clear(); dyn = []; kin = []; walls = new Map(); hero = null;
  W = new RAPIER.World({ x: 0, y: -T.crash.gravity, z: 0 }); W.timestep = 1 / 60; dormant = true; W.numSolverIterations = 4;
  EQ = new RAPIER.EventQueue(true);
}
export const crashOn = () => CRASH.ready && W !== null;
// remove a body and forget its colliders' tags
function drop(b) { for (let i = 0, n = b.numColliders(); i < n; i++) tags.delete(b.collider(i).handle); W.removeRigidBody(b); }
const yawQ = (a, q) => { q.x = 0; q.y = Math.sin(a / 2); q.z = 0; q.w = Math.cos(a / 2); return q; };
const QT = { x: 0, y: 0, z: 0, w: 1 }, VT = { x: 0, y: 0, z: 0 };
// ---- walls: the rail (kerb height in the physics, so wrecks trip over it) and the building faces 66 pt past the road edge, in 200 pt segments ----
function buildingSide(s, side) {
  // round a hard corner the city leaves the inside of the bend open (city.js): no facade there
  const a = G.road.at(s); const cn = a.corner; if (!cn) { for (const c of G.road.corners) { if (c.s0 > s + 700) break; if (c.hard && s > c.s0 - 1300 && s < c.s1 + 700) return side !== c.dir; } return true; }
  return !(cn.hard && side === cn.dir);
}
// Stop 5: the road has hills, so the ground is a row of short tilted slabs that follow the height profile (4 per wall segment, each 50 pt long), and the
// rails and building faces ride on a body tilted to the segment's chord. A wreck that meets a crest at speed is launched by it.
const SLAB = 4, tiltQ = (a, q) => { q.x = Math.sin(a / 2); q.y = 0; q.z = 0; q.w = Math.cos(a / 2); return q; };
function syncWalls() {
  const k0 = Math.floor((G.dist - 900) / SEG), k1 = Math.floor((G.dist + 1700) / SEG);
  for (const [k, e] of walls) if (k < k0 || k > k1) { drop(e.b); drop(e.g); walls.delete(k); }
  for (let k = k0; k <= k1; k++) {
    if (walls.has(k) || k < -2) continue;
    const s = k * SEG + SEG / 2; const w = G.road.at(s).width; const eA = G.road.at(k * SEG).elev * M, eB = G.road.at(k * SEG + SEG).elev * M, eM = G.road.at(s).elev * M;
    const b = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, (eA + eB) / 2, -s * M).setRotation(tiltQ(Math.atan2(eB - eA, SEG * M), QT))); const half = SEG * M / 2 + 0.05;
    const g = W.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (let q = 0; q < SLAB; q++) { const s0 = k * SEG + q * SEG / SLAB, s1 = s0 + SEG / SLAB; const e0 = G.road.at(s0).elev * M, e1 = G.road.at(s1).elev * M; const len = (s1 - s0) * M, a = Math.atan2(e1 - e0, len), em = (e0 + e1) / 2, zc = -(s0 + s1) / 2 * M;
      tags.set(W.createCollider(RAPIER.ColliderDesc.cuboid(80, 1, len / 2 + 0.15).setTranslation(0, em - Math.cos(a), zc - Math.sin(a)).setRotation(tiltQ(a, { x: 0, y: 0, z: 0, w: 1 })).setFriction(T.crash.friction).setRestitution(0.15), g).handle, { type: 'ground' }); }
    for (const side of [-1, 1]) {
      const rx = side * ((w / 2 + 2) * M + 0.35);   // rail: inner face at the road edge plus 2 pt, kerb height, so a tumbling wreck trips over it into the buildings
      tags.set(W.createCollider(RAPIER.ColliderDesc.cuboid(0.35, 0.18, half).setTranslation(rx, 0.18, 0).setFriction(0.5).setRestitution(0.3), b).handle, { type: 'rail', side });
      if (buildingSide(s, side)) { const fx = side * ((w / 2 + 66) * M + 2); tags.set(W.createCollider(RAPIER.ColliderDesc.cuboid(2, 5, half).setTranslation(fx, 5, 0).setFriction(0.6).setRestitution(0.25), b).handle, { type: 'wall', side }); }
    }
    walls.set(k, { b, g });
  }
  CRASH.walls = walls.size;
}
// ---- kinematic stand-ins for the hero and live cars ----
function boxDesc(kind, w, l) { const h = HEIGHT[kind] || 1.3; return RAPIER.ColliderDesc.roundCuboid(Math.max(0.3, w * M / 2 - 0.12), h / 2 - 0.12, Math.max(0.5, l * M / 2 - 0.12), 0.12); }
// teleport: after a dormant spell the boxes jump to where the cars are now (a 'next' pose would give them a huge one-step velocity)
function placeKin(b, x, s, yaw, h, lift, teleport) { const ra = G.road.at(s); VT.x = (x - REF) * M; VT.y = h / 2 + lift + ra.elev * M; VT.z = -s * M; yawQ(-yaw, QT); { const pa = Math.atan(ra.slope) / 2, sn = Math.sin(pa), cs = Math.cos(pa), y0 = QT.y, w0 = QT.w; QT.x = cs * 0 + w0 * sn; QT.y = y0 * cs; QT.z = -y0 * sn; QT.w = w0 * cs; } if (teleport) { b.setTranslation(VT, true); b.setRotation(QT, true); } else { b.setNextKinematicTranslation(VT); b.setNextKinematicRotation(QT); } }
function syncKinematic(tp) {
  if (!hero) { hero = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation((G.x - REF) * M, HEIGHT.player / 2, -G.dist * M)); tags.set(W.createCollider(boxDesc('player', T.sizes.player[0], T.sizes.player[1]), hero).handle, { type: 'hero' }); }
  placeKin(hero, G.x, G.dist, G.heading, HEIGHT.player, G.jumpZ * 3.5 + (G.roll ? G.roll.lift : 0), tp);
  // live cars within reach of a wreck get a box; wrecks, the dead and the far away give theirs back
  let n = 0;
  for (const c of kin) if (!c.alive || c.wrecked || c.y < G.dist - 800 || c.y > G.dist + 1700) { drop(c.kb); c.kb = null; } else kin[n++] = c;
  kin.length = n;
  for (const c of G.cars) {
    if (!c.alive || c.wrecked || c.y < G.dist - 800 || c.y > G.dist + 1700) continue;
    if (!c.kb) { c.kb = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation((c.x - REF) * M, (HEIGHT[c.kind] || 1.3) / 2, -c.y * M)); tags.set(W.createCollider(boxDesc(c.kind, c.w, c.l), c.kb).handle, { type: 'car', car: c }); kin.push(c); }
    placeKin(c.kb, c.x, c.y, (c.lean || 0) * Math.PI / 180 + (c.spin || 0), HEIGHT[c.kind] || 1.3, 0, tp);
  }
  CRASH.kin = kin.length;
}
// ---- dynamic wrecks ----
// launch: velocities in m/s and rad/s in the body frame described at the top. `v` is the car's road-space velocity (pt/s) already set by
// the sim; the cause adds the lift and the tumble.
export function crashLaunch(c, how, kick) {
  if (!crashOn()) return false;
  if (c.kb) { drop(c.kb); c.kb = null; const i = kin.indexOf(c); if (i >= 0) kin.splice(i, 1); }
  if (c.rb) return true;
  retireOver(T.crash.cap - 1);
  const h = HEIGHT[c.kind] || 1.3; const r = G.rng; const C = T.crash;
  const ra = G.road.at(c.y); const tz = ra.elev * M, slopeV = ra.slope * (c.speed || 0) * M;
  const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation((c.x - REF) * M, tz + h / 2 + 0.02, -c.y * M).setRotation(yawQ(-((c.lean || 0) * Math.PI / 180 + (c.spin || 0)), QT)).setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.35).setCanSleep(true);
  const b = W.createRigidBody(desc);
  const col = boxDesc(c.kind, c.w, c.l).setMass(c.mass * C.massK).setFriction(T.crash.friction).setRestitution(c.kind === 'civ' ? 0.2 : 0.3).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  tags.set(W.createCollider(col, b).handle, { type: 'wreck', car: c });
  const vx = (c.vx || 0) * M, vz = -(c.speed || 0) * M; const k = kick || {}; const heavy = c.kind === 'armored' || c.kind === 'truck' ? 0.45 : 1;
  let lx = vx + (k.vx || 0), ly = (k.vy || 0) + slopeV, lz = vz + (k.vz || 0), ax = 0, ay = (r() * 2 - 1) * 2, az = 0;
  const side = Math.sign(c.vx || (r() - 0.5)) || 1;
  if (how === 'gun' || how === 'missile' || how === 'barrel') {   // the car blows up: thrown up and tumbling
    const big = how === 'missile' || how === 'barrel' ? 1.35 : 1; ly += (C.blastUp[0] + r() * C.blastUp[1]) * big * heavy; lx += (r() * 2 - 1) * 7;
    az = (r() < 0.5 ? -1 : 1) * (3 + r() * 5) * big; ax = -(1 + r() * 4) * big; ay += (r() * 2 - 1) * 3;
  } else if (how === 'slam' || how === 'shunt' || how === 'rail' || how === 'wall' || how === 'oil') {   // shoved sideways: it trips and rolls over the shoved side
    ly += 3 + r() * 2.5; lx += side * 4; az = -side * (6 + r() * 4) * heavy; ax = -(r() * 2);
  } else if (how === 'ram') { ly += 4 + r() * 2; ax = -(5 + r() * 3) * heavy; lz -= 6; }   // punted from behind: the tail comes up and it goes end over end
  else if (how === 'stomp') { ly += 1.2; ay = (r() < 0.5 ? -1 : 1) * (5 + r() * 3); lz += 4; }   // crushed from above: flattened, it spins away under the car
  else if (how === 'mine') { ly += 5 + r() * 3; lx += side * 3; lz *= 0.45; ay = side * (7 + r() * 5); az = -side * (5 + r() * 5); ax = -(2 + r() * 4); }   // a shock mine: thrown up, spinning and rolling, slowed so it tumbles behind the hero into its friends
  else if (how === 'launch') { ay = (r() * 2 - 1) * 3; az = -side * (5 + r() * 6); ax = -(3 + r() * 5); }   // a civilian the hero ran into: thrown up and ahead, end over end and rolling
  else if (how === 'spin') { ly += 0.4; ay = side * (4 + r() * 4); if (k.roll) { ly += 2.5; az = -side * (5 + r() * 3); } }   // a civilian spun out: a skid, sometimes a roll
  else { ly += 2.5 + r() * 3; az = (r() < 0.5 ? -1 : 1) * (2 + r() * 5); ax = -(r() * 4); }   // pile-up and chain: knocked about by what hit it
  b.setLinvel({ x: lx, y: ly, z: lz }, true); b.setAngvel({ x: ax, y: ay, z: az }, true);
  c.rb = b; c.h = h / 2; c.qx = 0; c.qy = 0; c.qz = 0; c.qw = 1; c.crashT = G.t; c.bodyH = h; dyn.push(c); CRASH.bodies = dyn.length;
  return true;
}
// retire the oldest dynamic wrecks until at most n are left: the body goes, the wreck lies where it is
function retire(c) { if (c.rb) { drop(c.rb); c.rb = null; } c.rested = true; const i = dyn.indexOf(c); if (i >= 0) dyn.splice(i, 1); CRASH.bodies = dyn.length; }
function retireOver(n) { while (dyn.length > n) retire(dyn[0]); }
// ---- the step ----
let onHit = null; export function setCrashHandler(f) { onHit = f; }
// Rapier steps at 60 Hz, on even sim ticks; on odd ticks the wrecks coast on their velocity so the renderer's interpolation stays smooth.
// With no wreck tumbling the world is not stepped at all (dormant); it wakes with every box teleported to its car.
export function crashStep(dt) {
  if (!crashOn()) return;
  CRASH.steps++;
  if (G.ticks & 1) { for (const c of dyn) { c.x += c.vx * dt; c.y += c.speed * dt; } return; }
  if (!dyn.length) { dormant = true; return; }
  const timed = (CRASH.steps & 31) === 0, t0 = timed ? performance.now() : 0;   // the cost is sampled every 32nd step
  const wake = dormant; dormant = false;
  syncWalls(); syncKinematic(wake);
  // drop the bodies of cars that are gone; rest the ones that settled or lived long enough
  for (let i = dyn.length - 1; i >= 0; i--) { const c = dyn[i]; if (!c.alive) { drop(c.rb); c.rb = null; dyn.splice(i, 1); } }
  for (let i = dyn.length - 1; i >= 0; i--) { const c = dyn[i]; if (c.rb.isSleeping() || G.t - c.crashT > T.crash.life) retire(c); }
  const h = 2 * dt;
  // the corner throws a sliding wreck outward, as the arcade model did (v^2 k, road-space)
  for (const c of dyn) { const b = c.rb; const v = b.linvel(); const s = -b.translation().z / M; const kk = G.road.at(s).k; const fwd = -v.z / M; if (Math.abs(kk) > 1e-6 && Math.abs(fwd) > 20) { const ax = -kk * fwd * fwd * M; b.setLinvel({ x: v.x + ax * h, y: v.y, z: v.z }, true); } }
  W.step(EQ);
  for (const c of dyn) { const b = c.rb; const p = b.translation(), q = b.rotation(), v = b.linvel(); c.x = REF + p.x / M; c.y = -p.z / M; c.h = p.y - G.road.at(c.y).elev * M; c.qx = q.x; c.qy = q.y; c.qz = q.z; c.qw = q.w; c.vx = v.x / M; c.speed = -v.z / M; c.vy = v.y; }
  EQ.drainCollisionEvents((h1, h2, started) => {
    if (!started) return; const a = tags.get(h1), b = tags.get(h2); if (!a || !b) return;
    CRASH.events++;
    if (a.type === 'wreck' && onHit) onHit(a.car, b); if (b.type === 'wreck' && onHit) onHit(b.car, a);
  });
  CRASH.bodies = dyn.length; if (timed) CRASH.stepMs += ((performance.now() - t0) - CRASH.stepMs) * 0.1;
}
// relative impact speed (m/s) between a wreck and what it touched
export function impactSpeed(c, o) {
  let ox = 0, oy = 0, oz = 0;
  if (o.type === 'car' && o.car) { ox = (o.car.vx || 0) * M; oz = -(o.car.speed || 0) * M; if (o.car.rb) { const v = o.car.rb.linvel(); ox = v.x; oy = v.y; oz = v.z; } }
  else if (o.type === 'wreck' && o.car && o.car.rb) { const v = o.car.rb.linvel(); ox = v.x; oy = v.y; oz = v.z; }
  else if (o.type === 'hero') { ox = G.vx * M; oz = -G.fwd * M; }
  const v = c.rb ? c.rb.linvel() : { x: (c.vx || 0) * M, y: 0, z: -(c.speed || 0) * M };
  return Math.hypot(v.x - ox, v.y - oy, v.z - oz);
}
// push a live (kinematic) car's sim velocity by what hit it, in pt/s
export function wreckVelocity(c) { if (!c.rb) return { vx: c.vx || 0, vs: c.speed || 0, vy: 0 }; const v = c.rb.linvel(); return { vx: v.x / M, vs: -v.z / M, vy: v.y }; }
