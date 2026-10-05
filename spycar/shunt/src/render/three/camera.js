// The road camera (Sprint 4: lower and closer, so the car reads as a car): 42 degrees vertical FOV, pitched 47 degrees down, the player in the lower third, looking ahead along
// the road. Heading follows the road 0.4 s ahead through a critically damped spring. It pulls back and widens a little with speed,
// rolls 5 degrees into a drift, and shakes by a capped offset. Every vector here is reused: no allocation per frame.
import { PerspectiveCamera, Vector3, Quaternion, Euler, Raycaster } from 'three';
import { clamp } from '../../sim/constants.js';
import { M } from './scale.js';
export const CAM = { fov: 42, pitch: 47, dist: 76, pitchHi: 56, distHi: 92, fovSpeed: 12, distSpeed: 26, lowerThird: 1 / 3, leadS: 0.4, leadCap: 0.44, spring: 14, roll: 5, shakeM: 1.2, shakeDeg: 2, look: 1.5 };
// the two presets Jack compares (Settings > Developer): A is the Sprint 3D view, higher and farther; B is the Sprint 4 view, lower and closer
export const CAMS = { A: { fov: 40, pitch: 55, dist: 90, pitchHi: 62, distHi: 104, distSpeed: 28 }, B: { fov: 42, pitch: 47, dist: 76, pitchHi: 56, distHi: 92, distSpeed: 26 } };
const noise1 = (t) => Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.3) * 0.4;
export class RoadCamera {
  constructor(aspect) {
    this.cam = new PerspectiveCamera(CAM.fov, aspect, 1, 1400);
    this.psi = 0; this.psiV = 0; this.zoom = 0; this.roll = 0; this.look = 0; this.fovKick = 0; this.lift = 0; this.occluders = null; this.ray = new Raycaster(); this.rayDir = new Vector3(); this.carPos = new Vector3(); this.frame = 0; this.blocked = false;
    this.anchor = new Vector3(); this.pos = new Vector3(); this.fwd = new Vector3(); this.right = new Vector3(); this.q = new Quaternion(); this.e = new Euler();
    this.WP = { X: 0, Y: 0 }; this.psiInit = false;
  }
  setPreset(name) { if (this.preset === name || !CAMS[name]) return; this.preset = name; Object.assign(CAM, CAMS[name]); }
  reset() { this.psiInit = false; this.psiV = 0; this.zoom = 0; this.roll = 0; this.look = 0; this.fovKick = 0; this.lift = 0; this.blocked = false; }
  // the meshes that may stand between the camera and the car (the city's building chunks): when one does, the camera lifts
  // toward the high view (pitchHi, distHi) until the line is clear again. Tested every other frame on the previous frame's position.
  setOccluders(group) { this.occluders = group; }
  occluded() { if (!this.occluders || !this.psiInit) return false; this.rayDir.copy(this.pos).sub(this.carPos); const len = this.rayDir.length(); if (len < 1) return false; this.rayDir.divideScalar(len); this.ray.set(this.carPos, this.rayDir); this.ray.far = len - 2; this.ray.near = 3; const hits = this.ray.intersectObjects(this.occluders.children, false); return hits.length > 0; }
  // the camera sits behind road-space (REF, s) at the road's own heading; `dist` is the slant distance to the player
  update(G, rs, rx, dt, elapsed, shakeOn, fovKick, carX = 195) {
    const road = G.road;
    road.world(carX, rs, this.WP); this.carPos.set(this.WP.X * M, road.at(rs).elev * M + 1, -this.WP.Y * M);   // the car itself, for the occlusion test
    const here = road.frame(rs).psi; const lead = road.frame(rs + CAM.leadS * Math.max(0, G.speed)).psi; const target = here + clamp(lead - here, -CAM.leadCap, CAM.leadCap);
    if (!this.psiInit) { this.psi = target; this.psiInit = true; }
    // critically damped spring on the heading
    const w = CAM.spring; const a = -2 * w * this.psiV - w * w * (this.psi - target); this.psiV += a * dt; this.psi += this.psiV * dt;
    const speedK = clamp((G.speed - 480) / 820, 0, 1);   // pulls back and widens from cruise up to top speed (Sprint 4: 1,300 pt/s)
    const zoomT = (G.air > 0 ? 0.6 * G.jumpZ : speedK) + (G.punch > 0 ? -0.2 : 0) + (G.drifting ? 0.25 : 0); this.zoom += (zoomT - this.zoom) * Math.min(1, dt * 6);
    const rollT = G.drifting ? -G.driftDir * CAM.roll : 0; this.roll += (rollT - this.roll) * Math.min(1, dt * 5);
    this.look += (clamp(G.vx / 520, -1, 1) * CAM.look - this.look) * Math.min(1, dt * 4);
    this.fovKick += ((fovKick || 0) - this.fovKick) * Math.min(1, dt * 8);
    if ((this.frame++ & 1) === 0) this.blocked = this.occluded(); this.lift += ((this.blocked ? 1 : 0) - this.lift) * Math.min(1, dt * (this.blocked ? 5 : 2));
    const fov = CAM.fov + CAM.fovSpeed * this.zoom + this.fovKick; const dist = CAM.dist + (CAM.distHi - CAM.dist) * this.lift + CAM.distSpeed * this.zoom;
    // the player sits a third of the way up the screen: that many degrees below the view axis
    const below = Math.atan(Math.tan(fov / 2 * Math.PI / 180) * (1 - 2 * CAM.lowerThird)) * 180 / Math.PI;
    const pitchDeg = CAM.pitch + (CAM.pitchHi - CAM.pitch) * this.lift; const pitch = (pitchDeg + below) * Math.PI / 180;
    const back = dist * Math.cos(pitch), height = dist * Math.sin(pitch);
    road.world(195 + rx, rs, this.WP); this.anchor.set(this.WP.X * M, road.at(rs).elev * M, -this.WP.Y * M);
    const s = Math.sin(this.psi), c = Math.cos(this.psi); this.fwd.set(s, 0, -c); this.right.set(c, 0, s);
    this.pos.copy(this.anchor).addScaledVector(this.fwd, -back); this.pos.y += height; this.pos.addScaledVector(this.right, this.look);
    // shake: a kick that decays without overshoot plus trauma squared noise, capped
    if (shakeOn) { const tr = G.trauma * G.trauma; const sx = clamp((G.kick.x + 16 * tr * noise1(elapsed * 31)) / 16, -1, 1) * CAM.shakeM, sy = clamp((G.kick.y + 16 * tr * noise1(elapsed * 29 + 7)) / 16, -1, 1) * CAM.shakeM; this.pos.addScaledVector(this.right, sx); this.pos.y += sy; this.rollShake = CAM.shakeDeg * tr * noise1(elapsed * 23 + 3); } else this.rollShake = 0;
    const cam = this.cam; cam.position.copy(this.pos); cam.fov = fov; cam.updateProjectionMatrix();
    this.e.set(-(pitchDeg * Math.PI / 180), -this.psi, (this.roll + this.rollShake) * Math.PI / 180, 'YXZ'); cam.quaternion.setFromEuler(this.e);
    cam.updateMatrixWorld();
  }
}
