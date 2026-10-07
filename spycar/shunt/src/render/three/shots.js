// The camera director (Stop 4). Render-side only: it reads the sim state and never writes it, so replays and hashes are untouched, and steering stays
// relative to the car whatever the camera does (the thumb moves the car across the road; the camera just looks).
//
// Named shots. Every number is live-editable in the tune panel (Camera Lab) and copied out as JSON.
//   pitch  degrees the camera looks down            dist  slant distance to the car (m)         fov  lens, vertical degrees
//   yaw    degrees round the car (0 behind, + camera on its left)   lower  where the car sits on the screen (0.3 low, 0.5 centre)
//   lean   degrees of roll into a turn              blend  seconds to settle into this shot       aim  degrees the view turns toward the corner exit
// Two kinds: auto shots the road asks for (corner / drift cam, tunnel low, airtime) and hero shots (close chase, tracking alongside, rising crane,
// crash cam) that are earned: by a takedown, a big pile-up or a close near miss; 8 to 12 a run, 1 to 3 s each, at least 8 s apart, never the same
// angle twice in a row, never with danger close, and a tap skips one.
import { S } from '../../settings.js';
export const SHOTS = {
  closeChase: { pitch: 8, dist: 16, fov: 58, yaw: 0, lower: 0.30, lean: 5, blend: 0.6, hold: 1.7 },
  tracking: { pitch: 7, dist: 22, fov: 46, yaw: 78, lower: 0.42, lean: 3, blend: 0.8, hold: 2.3 },
  crane: { pitch: 5, dist: 17, fov: 56, yaw: 0, lower: 0.32, lean: 3, blend: 0.5, hold: 2.6, toPitch: 38, toDist: 52, toYaw: 28, toFov: 46 },
  corner: { pitch: 14, dist: 38, fov: 52, yaw: 34, lower: 0.40, lean: 7, blend: 0.55, aim: 4 },
  tunnel: { pitch: 4, dist: 15, fov: 64, yaw: 0, lower: 0.30, lean: 4, blend: 0.5 },
  crash: { pitch: 12, dist: 30, fov: 52, yaw: 55, lower: 0.40, lean: 3, blend: 0.45, hold: 2.0 },
  // Stop 5: the rear shot (a shock mine goes off): the camera swings round in front of the car and looks back at the wreck and what tumbles into it
  rear: { pitch: 11, dist: 24, fov: 56, yaw: 180, lower: 0.52, lean: 0, blend: 0.45, hold: 2.3 },
  airtime: { pitch: 17, dist: 34, fov: 52, yaw: 12, lower: 0.40, lean: 2, blend: 0.5, hold: 1.6 },   // Stop 5: low, close behind and a little to one side, so the crest and the drop beyond it show round the car
};
export const SHOT_NAMES = { closeChase: 'Close chase', tracking: 'Tracking alongside', crane: 'Rising crane', corner: 'Corner and drift cam', tunnel: 'Tunnel low', crash: 'Crash cam', airtime: 'Airtime', rear: 'Rear (mine)' };
const HERO_BY_EVENT = { takedown: ['tracking', 'crane', 'closeChase'], pileup: ['crash', 'tracking', 'crane'], near: ['closeChase', 'tracking', 'crane'], mine: ['rear'] };
const ENEMY = new Set(['weak', 'bruiser', 'gunner', 'armored']);
export class ShotDirector {
  constructor() { this.force = null; this.reset(); }
  reset() { this.heroLeft = 0; this.heroName = null; this.heroT = 0; this.heroDur = 0; this.last = null; this.lastEnd = -99; this.count = 0; this.kills = 0; this.pileups = 0; this.near = 0; this.pending = null; this.name = 'base'; this.autoName = null; this.autoUntil = 0; this.side = 1; this.aimPt = null; this.log = []; this.civ = 0; this.mines = 0; this.airShot = false; }
  skip() { if (this.heroName) { this.heroLeft = 0; this.endHero(this.t); } }
  get budget() { return S.fewShots ? 5 : 12; }
  get gap() { return S.fewShots ? 16 : 8; }
  endHero(t) { this.heroName = null; this.lastEnd = t; }
  // is something about to hurt: an enemy about to strike or close, a barrier or barrel ahead, a hard corner, the car down to its last armor, limping, rolling
  danger(G) {
    if (G.limp || G.roll || G.wallT > 0 || G.armor <= 1) return true;
    for (const c of G.cars) { if (!c.alive || c.wrecked) continue; const dy = c.y - G.dist;
      if (ENEMY.has(c.kind)) { if (dy > -110 && dy < 200) return true; if (dy > -600 && dy < 700 && (c.state === 'tell' || c.state === 'swerve' || c.state === 'sight')) return true; } }
    if (G.barrels && G.barrels.some(b => b.alive && b.y - G.dist > 0 && b.y - G.dist < 380 && Math.abs(b.x - G.x) < 90)) return true;
    const cn = G.road.cornerAhead(G.dist, 420); if (cn && cn.hard) return true;
    return false;
  }
  autoWant(G) {
    const cn = G.road.cornerAhead(G.dist, 300); const inCorner = cn && cn.hard && G.speed > 380 && G.dist > cn.s0 - 260;
    const bend = Math.abs(G.road.at(G.dist).k) > 1 / 1500;   // a drift on a straight (a lane change that slid) is not a corner: no corner cam
    if ((G.drifting && G.driftT > 0.3 && bend) || inCorner) return 'corner';
    // driver control: no overpasses, so no tunnel shot
    return 'base';
  }
  // which shot now (a name from SHOTS or 'base'); `crashAt` receives the road point a crash cam should look at
  pick(G, dt, base) {
    const t = G.t; this.t = t;
    if (this.force && SHOTS[this.force]) { this.name = this.force; this.heroName = null; return this.name; }   // the Camera Lab holds a shot to look at it
    if (base === 'A') { this.name = 'base'; return 'base'; }   // A is the plain high camera: no director
    // events since last frame
    if (G.kills > this.kills) { this.pending = { kind: 'takedown', t }; } this.kills = G.kills;
    if (G.pileups > this.pileups) { this.pending = { kind: 'pileup', t }; this.crashPt = { x: G.crashX || G.x, y: G.crashY || G.dist + 150 }; } this.pileups = G.pileups;
    if (G.nearMisses > this.near) { if (!this.pending) this.pending = { kind: 'near', t }; } this.near = G.nearMisses;
    if ((G.launches || 0) > this.civ) { this.pending = { kind: 'pileup', t }; } this.civ = G.launches || 0;
    if ((G.mineHits || 0) > this.mines) { this.pending = { kind: 'mine', t }; } this.mines = G.mineHits || 0;   // a mine takes the shot even when its pile-up lands the same moment
    // Stop 5: airtime is earned: a jump long enough (the time in the air so far plus what the arc has left) takes the camera at take-off, danger or not (nothing can touch the car up there)
    if (G.air <= 0) this.airShot = false;
    else if (!this.airShot && !this.heroName && G.hang > 0.05 && (G.hang + G.air >= 0.45 || (G.crestAir && G.fvz > 20 && G.speed > 900)) && t - this.lastEnd >= 3 && this.count < this.budget + 3 && G.playing) { this.airShot = true; this.heroName = 'airtime'; this.heroT = 0; this.heroDur = Math.min(2.4, G.hang + G.air + 0.7); this.last = 'airtime'; this.count++; this.side = -this.side; this.pending = null; this.log.push([+t.toFixed(1), 'airtime']); }
    // an earned shot in progress
    if (this.heroName) { this.heroT += dt; if (this.heroT >= this.heroDur || (this.danger(G) && this.heroName !== 'airtime')) { this.endHero(t); } else { this.name = this.heroName; return this.name; } }
    // start one: an event is pending (fresh), a quarter second has passed (the hit lands first), the gap is kept, the budget is not spent, no danger
    if (this.pending && t - this.pending.t > 3.5) this.pending = null;
    if (this.pending && t - this.pending.t >= 0.25 && t - this.lastEnd >= this.gap && this.count < this.budget && G.playing && !this.danger(G) && G.air <= 0) {
      const opts = HERO_BY_EVENT[this.pending.kind].filter(n => n !== this.last); const name = opts[Math.floor((G.t * 7.31 + this.count * 3.7) % opts.length)] || opts[0];
      const spec = SHOTS[name]; this.heroName = name; this.heroT = 0; this.heroDur = Math.min(3, Math.max(1, (spec.hold || 2) * (S.fewShots ? 0.8 : 1))); this.last = name; this.count++; this.pending = null; this.side = -this.side; this.log.push([+t.toFixed(1), name]);
      this.name = name; return name;
    }
    // auto shots
    const k = G.road.at(G.dist).k;
    // each auto shot is held a little after its cause ends (hold-over), so a short drift or a quick jump does not flap the camera in and out
    const want = this.autoWant(G);
    if (want !== 'base') { this.autoName = want; this.autoUntil = t + (want === 'corner' ? 1.0 : 0.7); }
    if (this.autoName && t < this.autoUntil) { this.name = this.autoName; return this.name; }
    this.autoName = null; this.name = 'base'; return 'base';
  }
}
