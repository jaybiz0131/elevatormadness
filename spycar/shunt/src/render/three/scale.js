// The one place stage points become metres. The player car is 60 pt long and 4.5 m long, so M = 0.075 m per pt.
// Road space (x across, s along) goes through G.road.world() to the Sprint C world plane (X, Y), then to three.js (x = X, y = up, z = -Y).
import { REF } from '../../sim/constants.js';
export const M = 4.5 / 60;
const WP = { X: 0, Y: 0 };
// writes the three.js position of road-space (x, s) into `out` (a Vector3 or {x,y,z}); elev is the road's crest height at s
export function toWorld(road, x, s, out) { road.world(x, s, WP); out.x = WP.X * M; out.y = road.at(s).elev * M; out.z = -WP.Y * M; return out; }
export function toWorldFlat(road, x, s, out, y = 0) { road.world(x, s, WP); out.x = WP.X * M; out.y = y; out.z = -WP.Y * M; return out; }
// three.js yaw (rotation about +y) for a thing heading along the road at s plus a body angle (radians, clockwise from the road)
export function yawAt(road, s, body = 0) { return -(road.frame(s).psi + body); }
export const lateral = (pt) => (pt - REF) * M;
