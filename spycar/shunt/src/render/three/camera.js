// The road camera: perspective, 40 degrees vertical FOV, pitched 55 degrees down, the player in the lower third, looking ahead along
// the road. Heading follows the road 0.4 s ahead through a critically damped spring. It pulls back and widens a little with speed,
// rolls 5 degrees into a drift, and shakes by a capped offset. Every vector here is reused: no allocation per frame.
import { PerspectiveCamera, Vector3, Quaternion, Euler } from 'three';
import { clamp } from '../../sim/constants.js';
import { M } from './scale.js';
export const CAM = { fov: 40, pitch: 55, dist: 90, fovSpeed: 8, distSpeed: 10, lowerThird: 1 / 3, leadS: 0.4, leadCap: 0.44, spring: 14, roll: 5, shakeM: 1.2, shakeDeg: 2, look: 1.5 };
const noise1 = (t) => Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.3) * 0.4;
export class RoadCamera {
  constructor(aspect) {
    this.cam = new PerspectiveCamera(CAM.fov, aspect, 1, 1400);
    this.psi = 0; this.psiV = 0; this.zoom = 0; this.roll = 0; this.look = 0; this.fovKick = 0;
    this.anchor = new Vector3(); this.pos = new Vector3(); this.fwd = new Vector3(); this.right = new Vector3(); this.q = new Quaternion(); this.e = new Euler();
    this.WP = { X: 0, Y: 0 }; this.psiInit = false;
  }
  reset() { this.psiInit = false; this.psiV = 0; this.zoom = 0; this.roll = 0; this.look = 0; this.fovKick = 0; }
  // the camera sits behind road-space (REF, s) at the road's own heading; `dist` is the slant distance to the player
  update(G, rs, rx, dt, elapsed, shakeOn, fovKick) {
    const road = G.road;
    const here = road.frame(rs).psi; const lead = road.frame(rs + CAM.leadS * G.speed).psi; const target = here + clamp(lead - here, -CAM.leadCap, CAM.leadCap);
    if (!this.psiInit) { this.psi = target; this.psiInit = true; }
    // critically damped spring on the heading
    const w = CAM.spring; const a = -2 * w * this.psiV - w * w * (this.psi - target); this.psiV += a * dt; this.psi += this.psiV * dt;
    const speedK = clamp((G.speed - 480) / 420, 0, 1);
    const zoomT = (G.air > 0 ? 0.6 * G.jumpZ : speedK) + (G.punch > 0 ? -0.2 : 0) + (G.drifting ? 0.25 : 0); this.zoom += (zoomT - this.zoom) * Math.min(1, dt * 6);
    const rollT = G.drifting ? -G.driftDir * CAM.roll : 0; this.roll += (rollT - this.roll) * Math.min(1, dt * 5);
    this.look += (clamp(G.vx / 520, -1, 1) * CAM.look - this.look) * Math.min(1, dt * 4);
    this.fovKick += ((fovKick || 0) - this.fovKick) * Math.min(1, dt * 8);
    const fov = CAM.fov + CAM.fovSpeed * this.zoom + this.fovKick; const dist = CAM.dist + CAM.distSpeed * this.zoom;
    // the player sits a third of the way up the screen: that many degrees below the view axis
    const below = Math.atan(Math.tan(fov / 2 * Math.PI / 180) * (1 - 2 * CAM.lowerThird)) * 180 / Math.PI;
    const pitch = (CAM.pitch + below) * Math.PI / 180;
    const back = dist * Math.cos(pitch), height = dist * Math.sin(pitch);
    road.world(195 + rx, rs, this.WP); this.anchor.set(this.WP.X * M, road.at(rs).elev * M, -this.WP.Y * M);
    const s = Math.sin(this.psi), c = Math.cos(this.psi); this.fwd.set(s, 0, -c); this.right.set(c, 0, s);
    this.pos.copy(this.anchor).addScaledVector(this.fwd, -back); this.pos.y += height; this.pos.addScaledVector(this.right, this.look);
    // shake: a kick that decays without overshoot plus trauma squared noise, capped
    if (shakeOn) { const tr = G.trauma * G.trauma; const sx = clamp((G.kick.x + 16 * tr * noise1(elapsed * 31)) / 16, -1, 1) * CAM.shakeM, sy = clamp((G.kick.y + 16 * tr * noise1(elapsed * 29 + 7)) / 16, -1, 1) * CAM.shakeM; this.pos.addScaledVector(this.right, sx); this.pos.y += sy; this.rollShake = CAM.shakeDeg * tr * noise1(elapsed * 23 + 3); } else this.rollShake = 0;
    const cam = this.cam; cam.position.copy(this.pos); cam.fov = fov; cam.updateProjectionMatrix();
    this.e.set(-(CAM.pitch * Math.PI / 180), -this.psi, (this.roll + this.rollShake) * Math.PI / 180, 'YXZ'); cam.quaternion.setFromEuler(this.e);
    cam.updateMatrixWorld();
  }
}
