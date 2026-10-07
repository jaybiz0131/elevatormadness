// The road camera (Sprint 4: lower and closer, so the car reads as a car): 42 degrees vertical FOV, pitched 47 degrees down, the player in the lower third, looking ahead along
// the road. Heading follows the road 0.4 s ahead through a critically damped spring. It pulls back and widens a little with speed,
// rolls 5 degrees into a drift, and shakes by a capped offset. Every vector here is reused: no allocation per frame.
import { PerspectiveCamera, Vector3, Quaternion, Euler, Raycaster } from 'three';
import { clamp, REF, T } from '../../sim/constants.js';
import { M } from './scale.js';
import { ShotDirector, SHOTS } from './shots.js';
export const CAM = { fov: 42, pitch: 47, dist: 76, pitchHi: 56, distHi: 92, fovSpeed: 12, distSpeed: 26, lowerThird: 1 / 3, yaw: 0, fixed: false, leadS: 0.4, leadCap: 0.44, spring: 14, roll: 5, shakeM: 1.2, shakeDeg: 2, look: 1.5, lean: 5, blend: 0.7, punchFov: 0.045, punchDist: 0.07, shakeFrac: 0.045, kickFrac: 0.03 };
// chase-cam presets for Jack's phone comparison (Settings > Camera, or ?camera=B): A is the current high camera; B is lower and a
// little further back, so the horizon and the skyline band come into the top of the frame (a 42 degree lens tilted more than about
// 25 degrees down cannot see the horizon at all, so B sits at 22 degrees with a slightly wider lens)
// Stop 2: B is the default and closer (66 m slant, 44 degrees, the car 38% up the screen), with a higher lift (38 degrees, 84 m) for corners
export const CAM_PRESETS = {
  A: { pitch: 47, dist: 76, fov: 42, pitchHi: 56, distHi: 92, lowerThird: 1 / 3, fovSpeed: 12, distSpeed: 26, leadCap: 0.44, lean: 5, blend: 0.7, follow: 0 },
  B: { pitch: 21, dist: 66, fov: 44, pitchHi: 36, distHi: 84, lowerThird: 0.38, fovSpeed: 8, distSpeed: 14, leadCap: 0.36, lean: 5, blend: 0.7, follow: 0 },
  // Stop 4: C sits close behind the car, low and tight, to show the hero's detail (the hairpin lift still raises it a little)
  // driver control: C is the default and only about 10 m wide at the car, so it follows the car most of the way across the road (a car at the kerb stays in frame)
  C: { pitch: 9, dist: 19, fov: 60, pitchHi: 20, distHi: 30, lowerThird: 0.30, fovSpeed: 6, distSpeed: 3, leadCap: 0.30, lean: 6, blend: 0.6, follow: 0.7 },
};
let baseName = 'B';
export function setCamPreset(name) { const p = CAM_PRESETS[name] || CAM_PRESETS.B; baseName = CAM_PRESETS[name] ? name : 'B'; Object.assign(CAM, p); return baseName; }
export const camBase = () => baseName;
const noise1 = (t) => Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.3) * 0.4;
export class RoadCamera {
  constructor(aspect) {
    this.cam = new PerspectiveCamera(CAM.fov, aspect, 1, 1400);
    this.psi = 0; this.psiV = 0; this.zoom = 0; this.roll = 0; this.look = 0; this.fovKick = 0; this.lift = 0; this.occluders = null; this.ray = new Raycaster(); this.rayDir = new Vector3(); this.carPos = new Vector3(); this.frame = 0; this.blocked = false;
    this.anchor = new Vector3(); this.pos = new Vector3(); this.fwd = new Vector3(); this.right = new Vector3(); this.q = new Quaternion(); this.e = new Euler();
    this.WP = { X: 0, Y: 0 }; this.psiInit = false; this.dir = new ShotDirector(); this.P = { pitch: 21, dist: 66, fov: 44, yaw: 0, lower: 0.38, lean: 5, aim: 0 }; this.T = { pitch: 21, dist: 66, fov: 44, yaw: 0, lower: 0.38, lean: 5, aim: 0, blend: 0.7 }; this.pInit = false; this.shot = 'base'; this.wp2 = { X: 0, Y: 0 };
  }
  reset() { this.iw = 1; this.pInit = false; this.dir.reset(); this.psiInit = false; this.psiV = 0; this.zoom = 0; this.roll = 0; this.look = 0; this.fovKick = 0; this.lift = 0; this.blocked = false; }
  // the meshes that may stand between the camera and the car (the city's building chunks): when one does, the camera lifts
  // toward the high view (pitchHi, distHi) until the line is clear again. Tested every other frame on the previous frame's position.
  setOccluders(group, city) { this.occluders = group; this.occCity = city || null; this.hit = new Vector3(); }
  occluded() { if (!this.occluders || !this.psiInit) return false; this.rayDir.copy(this.pos).sub(this.carPos); const len = this.rayDir.length(); if (len < 1) return false; this.rayDir.divideScalar(len); this.ray.set(this.carPos, this.rayDir); this.ray.far = len - 2; this.ray.near = 3; if (this.ray.intersectObjects(this.occluders.children, false).length > 0) return true;
    const oc = this.occCity; if (oc) for (let i = 0; i < oc.nBoxes; i++) { if (this.ray.ray.intersectBox(oc.boxes[i], this.hit)) { const d = this.hit.distanceTo(this.carPos); if (d > 3 && d < len - 2) return true; } }
    return false; }
  // the newest wreck near the car (the crash cam looks at it)
  recentWreck(G) { let best = null; for (const c of G.cars) { if (c.alive && c.wrecked && c.debrisT > 0 && Math.abs(c.y - G.dist) < 1200 && (!best || c.debrisT > best.debrisT)) best = c; } return best; }
  // the camera sits behind road-space (REF, s) at the road's own heading; `dist` is the slant distance to the player
  update(G, rs, rx, dt, elapsed, shakeOn, fovKick, carX = 195) {
    const road = G.road;
    road.world(carX, rs, this.WP); this.carPos.set(this.WP.X * M, road.at(rs).elev * M + 1, -this.WP.Y * M);   // the car itself, for the occlusion test
    // driver control: the camera sits behind the car's nose, so after an e-brake 180 it swings round (the spring) and looks back down the road
    const backA = G.face < 0 ? Math.PI : 0; const here = road.frame(rs).psi; const lead = road.frame(rs + CAM.leadS * (G.fwd || 0)).psi; const target = here + clamp(lead - here, -CAM.leadCap, CAM.leadCap) + backA;
    if (!this.psiInit) { this.psi = target; this.psiInit = true; }
    // critically damped spring on the heading
    const w = CAM.spring; const a = -2 * w * this.psiV - w * w * (this.psi - target); this.psiV += a * dt; this.psi += this.psiV * dt;
    const speedK = clamp((G.speed - 480) / 1000, 0, 1);   // pulls back and widens from cruise to 1,480 pt/s (gas tops out at 1,000; a boost goes past it)
    const zoomT = (G.air > 0 ? 0.6 * G.jumpZ + 0.3 * speedK : speedK) + (G.drifting ? 0.25 : 0) + (G.bstT > 0 ? 0.3 : 0); this.zoom += (zoomT - this.zoom) * Math.min(1, dt * 6);
    this.look += (clamp(G.vx / 520, -1, 1) * CAM.look - this.look) * Math.min(1, dt * 4);
    this.fovKick += ((fovKick || 0) - this.fovKick) * Math.min(1, dt * 8);
    // the lift: blocked by a building (a ray from the car to the camera) takes it all the way up; a hard corner ahead takes it half way,
    // before the camera swings round the inside of the bend
    if ((this.frame++ & 1) === 0) this.blocked = this.occluded(); const cn = road.cornerAhead(rs, 450); const cornerLift = cn && cn.hard ? 0.55 : 0;
    const liftT = Math.max(this.blocked ? 1 : 0, cornerLift); this.lift += (liftT - this.lift) * Math.min(1, dt * (liftT > this.lift ? 5 : 2));
    if (CAM.fixed) { this.zoom = 0; this.lift = 0; this.fovKick = 0; }   // close-up shots (?cam with yaw or screenY): no speed pull-back, no occlusion lift
    // ---- the shot: the director names one (or 'base', the chosen camera A, B or C); its numbers become the target the live camera blends toward
    const name = CAM.fixed ? 'base' : this.dir.pick(G, dt, baseName); const Tg = this.T, Pp = this.P;
    if (name === 'base') { Tg.pitch = CAM.pitch + (CAM.pitchHi - CAM.pitch) * this.lift; Tg.dist = CAM.dist + (CAM.distHi - CAM.dist) * this.lift + CAM.distSpeed * this.zoom; Tg.fov = CAM.fov + CAM.fovSpeed * this.zoom + this.fovKick; Tg.yaw = CAM.yaw; Tg.lower = CAM.lowerThird; Tg.lean = CAM.lean; Tg.aim = 0; Tg.blend = CAM.blend; }
    else { const sp = SHOTS[name]; const D = this.dir; let u = 0; if (sp.toPitch !== undefined) { const x = clamp(D.heroT / Math.max(0.5, D.heroDur), 0, 1); u = x * x * (3 - 2 * x); }
      Tg.pitch = sp.pitch + ((sp.toPitch !== undefined ? sp.toPitch : sp.pitch) - sp.pitch) * u; Tg.dist = (sp.dist + ((sp.toDist !== undefined ? sp.toDist : sp.dist) - sp.dist) * u) * (sp.hold === undefined ? Math.sqrt(CAM.dist / CAM_DEFAULTS.presets.B.dist) : 1) + CAM.distSpeed * this.zoom * 0.3;   // the auto shots (corner, tunnel) keep the character of the chosen camera: C stays close
      Tg.fov = sp.fov + ((sp.toFov !== undefined ? sp.toFov : sp.fov) - sp.fov) * u + this.fovKick;
      const kk = cn ? cn.k : road.at(rs).k; const outs = Math.sign(kk) || (G.driftDir || 1); Tg.lower = sp.lower; Tg.lean = sp.lean; Tg.blend = sp.blend; Tg.aim = 0;
      if (name === 'corner') { Tg.yaw = sp.yaw * outs; Tg.aim = (sp.aim || 0) * outs; } else if (name === 'tracking' || name === 'crash' || name === 'airtime') Tg.yaw = sp.yaw * D.side; else Tg.yaw = sp.yaw + ((sp.toYaw !== undefined ? sp.toYaw : sp.yaw) - sp.yaw) * u * D.side;
      if (name === 'crash') { const w = this.recentWreck(G); if (w) { road.world(w.x, w.y, this.wp2); const dx = this.wp2.X * M - this.anchor.x, dz = -this.wp2.Y * M - this.anchor.z; let d = Math.atan2(dx, -dz) - (this.psi + Tg.yaw * Math.PI / 180); d = Math.atan2(Math.sin(d), Math.cos(d)); Tg.aim = clamp(d * 180 / Math.PI, -35, 35); } } }
    if (!this.pInit) { for (const k in Pp) Pp[k] = Tg[k]; this.pInit = true; } else { const kb = 1 - Math.exp(-dt * 3 / Math.max(0.15, Tg.blend)); for (const k in Pp) Pp[k] += (Tg[k] - Pp[k]) * kb; }
    this.shot = name;
    const rollT = G.drifting ? -G.driftDir * Pp.lean : -clamp(G.vx / 600, -1, 1) * Pp.lean * 0.4; this.roll += (rollT - this.roll) * Math.min(1, dt * 5);
    // a kill punches the camera in: 4.5% narrower, 7% closer, eased out over 0.18 s (G.punch counts down in the sim's presentation clock)
    const pk0 = G.punch > 0 ? clamp(G.punch / 0.18, 0, 1) : 0, pk = pk0 * pk0 * (3 - 2 * pk0);
    const fov = Pp.fov * (1 - CAM.punchFov * pk), dist = Pp.dist * (1 - CAM.punchDist * pk);
    // the player sits a third of the way up the screen: that many degrees below the view axis
    const below = Math.atan(Math.tan(fov / 2 * Math.PI / 180) * (1 - 2 * Pp.lower)) * 180 / Math.PI;
    const pitchDeg = Pp.pitch; const pitch = (pitchDeg + below) * Math.PI / 180;
    const back = dist * Math.cos(pitch), height = dist * Math.sin(pitch);
    road.world(CAM.fixed ? carX : 195 + rx + (carX - 195) * Math.max(CAM.follow || 0, 0.65 * clamp(this.lift / 0.55, 0, 1)), rs, this.WP);   // in a corner the camera follows the car across the road (on a bend the car otherwise drifts to the corner of the screen, under the buttons)
    this.anchor.set(this.WP.X * M, road.at(rs).elev * M, -this.WP.Y * M);
    // yaw: an orbit offset round the car (a tracking shot, the corner cam's outside swing); aim turns the view itself toward the corner exit or a crash
    const psiO = this.psi + Pp.yaw * Math.PI / 180; const psiC = psiO + Pp.aim * Math.PI / 180; const s = Math.sin(psiO), c = Math.cos(psiO); this.fwd.set(s, 0, -c); this.right.set(c, 0, s);
    this.pos.copy(this.anchor).addScaledVector(this.fwd, -back); this.pos.y += height; this.pos.addScaledVector(this.right, this.look);
    // Stop 5: on a descent the road behind the car can rise above a low camera: keep it clear of the surface there
    { const eb = road.at(rs - back / M * Math.cos(Pp.yaw * Math.PI / 180)).elev * M; if (this.pos.y < eb + 1.8) this.pos.y = eb + 1.8; }
    // shake, sized as a fraction of the screen: the view is 2 tan(fov/2) x dist metres tall, so a wreck's 2% is the same on the phone at any
    // camera distance. Trauma gives noise (4.5% of the screen at 1, falling off as trauma^2.3), the kick gives a directional jolt (3% at 16).
    if (shakeOn) { const viewH = 2 * Math.tan(fov / 2 * Math.PI / 180) * dist; const tr = Math.pow(G.trauma, 2.3);
      const sx = (clamp(G.kick.x / 16, -1, 1) * CAM.kickFrac + CAM.shakeFrac * tr * noise1(elapsed * 31)) * viewH, sy = (clamp(G.kick.y / 16, -1, 1) * CAM.kickFrac + CAM.shakeFrac * tr * noise1(elapsed * 29 + 7)) * viewH;
      this.pos.addScaledVector(this.right, sx); this.pos.y += sy; this.rollShake = CAM.shakeDeg * tr * noise1(elapsed * 23 + 3); } else this.rollShake = 0;
    const cam = this.cam; cam.position.copy(this.pos); cam.fov = fov; cam.updateProjectionMatrix();
    this.e.set(-(pitchDeg * Math.PI / 180), -psiC, (this.roll + this.rollShake) * Math.PI / 180, 'YXZ'); cam.quaternion.setFromEuler(this.e);
    this.applyIntro(G, road, dt);
    cam.updateMatrixWorld();
  }
  // Stop 7: the opening scene. A low camera in front of where the hero will stop, looking back down the empty road (the pursuers' headlights come up behind the car); from T.intro.orbit it swings
  // round the car, front to behind, on the road's right, and its pose melts into the normal chase camera by GO, so the hand-over is not a cut. A skip eases the same way over 0.45 s.
  applyIntro(G, road, dt) {
    const I = G.intro, cam = this.cam; if (!this.ip) { this.ip = new Vector3(); this.iq = new Quaternion(); this.ifov = 50; this.iw = 1; this.ia = new Vector3(); this.im = null; this.ih = new Vector3(); this.iu = new Vector3(0, 1, 0); this.la = new PerspectiveCamera(); this.nq = new Quaternion(); this.np = new Vector3(); }
    if (!I && this.iw >= 1) return;
    let w;
    if (I) { const c = T.intro, t = I.t; road.world(REF, I.s, this.WP); this.ih.set(this.WP.X * M, road.at(I.s).elev * M, -this.WP.Y * M); const psi = road.frame(I.s).psi, fx = Math.sin(psi), fz = -Math.cos(psi), rx = Math.cos(psi), rz = Math.sin(psi);
      const u3 = clamp((t - c.orbit) / (c.total - c.orbit), 0, 1), e = u3 * u3 * (3 - 2 * u3), th = Math.PI * (1 - e), R = 15 - 4 * e, side = 0.6 * R * Math.sin(th), ahead = -R * Math.cos(th);
      this.ip.set(this.ih.x + fx * ahead + rx * (side + 2.2 * (1 - e)), this.ih.y + 1.15 + 3.2 * e, this.ih.z + fz * ahead + rz * (side + 2.2 * (1 - e)));
      const k = e; const a = clamp(u3 * 5, 0, 1), aa = a * a * (3 - 2 * a), bx = this.ih.x - fx * 55, bz = this.ih.z - fz * 55; this.ia.set(bx + (this.ih.x - bx) * aa + fx * 2 * k, this.ih.y + 1.2, bz + (this.ih.z - bz) * aa + fz * 2 * k);   // from the far headlights to the car, then ahead of it
      this.la.position.copy(this.ip); this.la.up.set(0, 1, 0); this.la.lookAt(this.ia); this.iq.copy(this.la.quaternion); this.ifov = 56; w = clamp((u3 - 0.4) / 0.6, 0, 1); w = w * w * (3 - 2 * w); this.iw = w; this.im = true; }
    else { this.iw = Math.min(1, this.iw + dt / 0.45); w = this.iw; w = w * w * (3 - 2 * w); }
    this.np.copy(cam.position); this.nq.copy(cam.quaternion); const nf = cam.fov;
    cam.position.copy(this.ip).lerp(this.np, w); cam.quaternion.copy(this.iq).slerp(this.nq, w); cam.fov = this.ifov + (nf - this.ifov) * w; cam.updateProjectionMatrix(); this.pos.copy(cam.position);
  }
}
// Camera Lab (tune panel): edits to A, B, C and every shot are kept in this browser and survive a reload; DEFAULTS is what Reset puts back
export const CAM_DEFAULTS = JSON.parse(JSON.stringify({ presets: CAM_PRESETS, shots: SHOTS }));
const LAB_KEY = 'shunt-camlab';
export function labSave() { try { localStorage.setItem(LAB_KEY, JSON.stringify({ presets: CAM_PRESETS, shots: SHOTS })); } catch (e) {} }
export function labReset() { for (const k in CAM_DEFAULTS.presets) Object.assign(CAM_PRESETS[k], CAM_DEFAULTS.presets[k]); for (const k in CAM_DEFAULTS.shots) Object.assign(SHOTS[k], CAM_DEFAULTS.shots[k]); try { localStorage.removeItem(LAB_KEY); } catch (e) {} setCamPreset(baseName); }
try { const d = JSON.parse(localStorage.getItem(LAB_KEY) || 'null'); if (d) { for (const k in d.presets || {}) if (CAM_PRESETS[k]) Object.assign(CAM_PRESETS[k], d.presets[k]); for (const k in d.shots || {}) if (SHOTS[k]) Object.assign(SHOTS[k], d.shots[k]); } } catch (e) {}
