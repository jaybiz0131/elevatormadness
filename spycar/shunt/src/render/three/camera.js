// The road camera (Sprint 4: lower and closer, so the car reads as a car): 42 degrees vertical FOV, pitched 47 degrees down, the player in the lower third, looking ahead along
// the road. Heading follows the road 0.4 s ahead through a critically damped spring. It pulls back and widens a little with speed,
// rolls 5 degrees into a drift, and shakes by a capped offset. Every vector here is reused: no allocation per frame.
import { PerspectiveCamera, Vector3, Quaternion, Euler, Raycaster } from 'three';
import { clamp } from '../../sim/constants.js';
import { M } from './scale.js';
export const CAM = { fov: 42, pitch: 47, dist: 76, pitchHi: 56, distHi: 92, fovSpeed: 12, distSpeed: 26, lowerThird: 1 / 3, yaw: 0, fixed: false, leadS: 0.4, leadCap: 0.44, spring: 14, roll: 5, shakeM: 1.2, shakeDeg: 2, look: 1.5, punchFov: 0.045, punchDist: 0.07, shakeFrac: 0.045, kickFrac: 0.03 };
// chase-cam presets for Jack's phone comparison (Settings > Camera, or ?camera=B): A is the current high camera; B is lower and a
// little further back, so the horizon and the skyline band come into the top of the frame (a 42 degree lens tilted more than about
// 25 degrees down cannot see the horizon at all, so B sits at 22 degrees with a slightly wider lens)
// Stop 2: B is the default and closer (66 m slant, 44 degrees, the car 38% up the screen), with a higher lift (38 degrees, 84 m) for corners
export const CAM_PRESETS = { A: { pitch: 47, dist: 76, fov: 42, pitchHi: 56, distHi: 92, lowerThird: 1 / 3, fovSpeed: 12, distSpeed: 26, leadCap: 0.44 }, B: { pitch: 21, dist: 66, fov: 44, pitchHi: 36, distHi: 84, lowerThird: 0.38, fovSpeed: 8, distSpeed: 14, leadCap: 0.36 } };
export function setCamPreset(name) { const p = CAM_PRESETS[name] || CAM_PRESETS.B; Object.assign(CAM, p); return CAM_PRESETS[name] ? name : 'B'; }
const noise1 = (t) => Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.3) * 0.4;
export class RoadCamera {
  constructor(aspect) {
    this.cam = new PerspectiveCamera(CAM.fov, aspect, 1, 1400);
    this.psi = 0; this.psiV = 0; this.zoom = 0; this.roll = 0; this.look = 0; this.fovKick = 0; this.lift = 0; this.occluders = null; this.ray = new Raycaster(); this.rayDir = new Vector3(); this.carPos = new Vector3(); this.frame = 0; this.blocked = false;
    this.anchor = new Vector3(); this.pos = new Vector3(); this.fwd = new Vector3(); this.right = new Vector3(); this.q = new Quaternion(); this.e = new Euler();
    this.WP = { X: 0, Y: 0 }; this.psiInit = false;
  }
  reset() { this.psiInit = false; this.psiV = 0; this.zoom = 0; this.roll = 0; this.look = 0; this.fovKick = 0; this.lift = 0; this.blocked = false; }
  // the meshes that may stand between the camera and the car (the city's building chunks): when one does, the camera lifts
  // toward the high view (pitchHi, distHi) until the line is clear again. Tested every other frame on the previous frame's position.
  setOccluders(group, city) { this.occluders = group; this.occCity = city || null; this.hit = new Vector3(); }
  occluded() { if (!this.occluders || !this.psiInit) return false; this.rayDir.copy(this.pos).sub(this.carPos); const len = this.rayDir.length(); if (len < 1) return false; this.rayDir.divideScalar(len); this.ray.set(this.carPos, this.rayDir); this.ray.far = len - 2; this.ray.near = 3; if (this.ray.intersectObjects(this.occluders.children, false).length > 0) return true;
    const oc = this.occCity; if (oc) for (let i = 0; i < oc.nBoxes; i++) { if (this.ray.ray.intersectBox(oc.boxes[i], this.hit)) { const d = this.hit.distanceTo(this.carPos); if (d > 3 && d < len - 2) return true; } }
    return false; }
  // the camera sits behind road-space (REF, s) at the road's own heading; `dist` is the slant distance to the player
  update(G, rs, rx, dt, elapsed, shakeOn, fovKick, carX = 195) {
    const road = G.road;
    road.world(carX, rs, this.WP); this.carPos.set(this.WP.X * M, road.at(rs).elev * M + 1, -this.WP.Y * M);   // the car itself, for the occlusion test
    const here = road.frame(rs).psi; const lead = road.frame(rs + CAM.leadS * Math.max(0, G.speed)).psi; const target = here + clamp(lead - here, -CAM.leadCap, CAM.leadCap);
    if (!this.psiInit) { this.psi = target; this.psiInit = true; }
    // critically damped spring on the heading
    const w = CAM.spring; const a = -2 * w * this.psiV - w * w * (this.psi - target); this.psiV += a * dt; this.psi += this.psiV * dt;
    const speedK = clamp((G.speed - 480) / 1000, 0, 1);   // pulls back and widens from cruise to 1,480 pt/s (gas tops out at 1,000; a boost goes past it)
    const zoomT = (G.air > 0 ? 0.6 * G.jumpZ : speedK) + (G.drifting ? 0.25 : 0); this.zoom += (zoomT - this.zoom) * Math.min(1, dt * 6);
    const rollT = G.drifting ? -G.driftDir * CAM.roll : 0; this.roll += (rollT - this.roll) * Math.min(1, dt * 5);
    this.look += (clamp(G.vx / 520, -1, 1) * CAM.look - this.look) * Math.min(1, dt * 4);
    this.fovKick += ((fovKick || 0) - this.fovKick) * Math.min(1, dt * 8);
    // the lift: blocked by a building (a ray from the car to the camera) takes it all the way up; a hard corner ahead takes it half way,
    // before the camera swings round the inside of the bend
    if ((this.frame++ & 1) === 0) this.blocked = this.occluded(); const cn = road.cornerAhead(rs, 450); const cornerLift = cn && cn.hard ? 0.55 : 0;
    const liftT = Math.max(this.blocked ? 1 : 0, cornerLift); this.lift += (liftT - this.lift) * Math.min(1, dt * (liftT > this.lift ? 5 : 2));
    if (CAM.fixed) { this.zoom = 0; this.lift = 0; this.fovKick = 0; }   // close-up shots (?cam with yaw or screenY): no speed pull-back, no occlusion lift
    // a kill punches the camera in: 4.5% narrower, 7% closer, eased out over 0.18 s (G.punch counts down in the sim's presentation clock)
    const pk0 = G.punch > 0 ? clamp(G.punch / 0.18, 0, 1) : 0, pk = pk0 * pk0 * (3 - 2 * pk0);
    const fov = (CAM.fov + CAM.fovSpeed * this.zoom + this.fovKick) * (1 - CAM.punchFov * pk); const dist = (CAM.dist + (CAM.distHi - CAM.dist) * this.lift + CAM.distSpeed * this.zoom) * (1 - CAM.punchDist * pk);
    // the player sits a third of the way up the screen: that many degrees below the view axis
    const below = Math.atan(Math.tan(fov / 2 * Math.PI / 180) * (1 - 2 * CAM.lowerThird)) * 180 / Math.PI;
    const pitchDeg = CAM.pitch + (CAM.pitchHi - CAM.pitch) * this.lift; const pitch = (pitchDeg + below) * Math.PI / 180;
    const back = dist * Math.cos(pitch), height = dist * Math.sin(pitch);
    road.world(CAM.fixed ? carX : 195 + rx + (carX - 195) * 0.65 * clamp(this.lift / 0.55, 0, 1), rs, this.WP);   // in a corner the camera follows the car across the road (on a bend the car otherwise drifts to the corner of the screen, under the buttons)
    this.anchor.set(this.WP.X * M, road.at(rs).elev * M, -this.WP.Y * M);
    // yaw: an orbit offset for close-up shots (?cam=...,yaw)
    const psiC = this.psi + CAM.yaw * Math.PI / 180; const s = Math.sin(psiC), c = Math.cos(psiC); this.fwd.set(s, 0, -c); this.right.set(c, 0, s);
    this.pos.copy(this.anchor).addScaledVector(this.fwd, -back); this.pos.y += height; this.pos.addScaledVector(this.right, this.look);
    // shake, sized as a fraction of the screen: the view is 2 tan(fov/2) x dist metres tall, so a wreck's 2% is the same on the phone at any
    // camera distance. Trauma gives noise (4.5% of the screen at 1, falling off as trauma^2.3), the kick gives a directional jolt (3% at 16).
    if (shakeOn) { const viewH = 2 * Math.tan(fov / 2 * Math.PI / 180) * dist; const tr = Math.pow(G.trauma, 2.3);
      const sx = (clamp(G.kick.x / 16, -1, 1) * CAM.kickFrac + CAM.shakeFrac * tr * noise1(elapsed * 31)) * viewH, sy = (clamp(G.kick.y / 16, -1, 1) * CAM.kickFrac + CAM.shakeFrac * tr * noise1(elapsed * 29 + 7)) * viewH;
      this.pos.addScaledVector(this.right, sx); this.pos.y += sy; this.rollShake = CAM.shakeDeg * tr * noise1(elapsed * 23 + 3); } else this.rollShake = 0;
    const cam = this.cam; cam.position.copy(this.pos); cam.fov = fov; cam.updateProjectionMatrix();
    this.e.set(-(pitchDeg * Math.PI / 180), -psiC, (this.roll + this.rollShake) * Math.PI / 180, 'YXZ'); cam.quaternion.setFromEuler(this.e);
    cam.updateMatrixWorld();
  }
}
