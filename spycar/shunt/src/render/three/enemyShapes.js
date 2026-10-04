// The five enemy designs (Sprint C Stop 2), as top-view layers. One description drives both the approval sheet
// (tools/enemysheet.mjs, an SVG) and the 3D models (each layer is extruded between two heights). Original shapes from role
// descriptions only: no real make or model, no franchise cues. Cyan belongs to the hero; enemies use red, orange, violet-red and
// amber accents; the supply truck is green with a green beacon (friendly).
// Coordinates are stage points inside the sim footprint (T.sizes, not changed): x across (+ right), y along (- is the nose).
// Heights are metres. `glow` marks lit parts (they bloom); `glass` marks dark glossy parts; `ring` is a circle [cx, cy, r].
export const ENEMY_ROLES = {
  weak: { name: 'Dart', role: 'Weak: small, low, narrow wedge. Fast and fragile.', accent: '#ff3b3b' },
  bruiser: { name: 'Ram', role: 'Bruiser: widest car body, heavy blunt front, built to ram.', accent: '#ff7a1c' },
  gunner: { name: 'Turret van', role: 'Gunner: tall boxy van, turret clearly on the roof.', accent: '#ff2f6d' },
  armored: { name: 'Bulwark', role: 'Armored: biggest footprint, slab sides, unstoppable.', accent: '#ffb02a' },
  truck: { name: 'Mule', role: 'Supply truck: friendly flatbed, green beacon.', accent: '#7dff9e' },
};
const mirror = (pts) => pts.concat(pts.slice().reverse().map(([x, y]) => [-x, y]));   // right half (x >= 0, nose to tail) to a closed outline
export const ENEMY_SHAPES = {
  weak: [   // 30 x 52: a needle nose that widens to the rear, a bubble canopy set back, a rear wing as wide as the car
    { poly: mirror([[3, -26], [12, -8], [14, 12], [13, 26]]), h: [0.25, 0.75], col: '#2b2e37' },
    { poly: mirror([[5, -2], [7, 9], [5, 17]]), h: [0.75, 1.15], col: '#141a24', glass: true },
    { poly: mirror([[1.6, -25], [1.6, -3]]), h: [0.75, 0.77], col: '#ff3b3b', glow: 1.4 },
    { poly: mirror([[15, 20], [15, 25.5]]), h: [0.95, 1.08], col: '#1c1e24' },
    { poly: mirror([[12, 20.5], [12, 22]]), h: [1.08, 1.1], col: '#ff3b3b', glow: 1.6 },
  ],
  bruiser: [   // 40 x 70: a full-width steel ram bar with teeth, flared fenders at all four corners and a narrow waist between them
    { poly: mirror([[20, -35], [20, -28]]), h: [0.3, 0.95], col: '#6d727c' },
    { poly: [[-18, -35], [-14, -38], [-10, -35], [-4, -35], [0, -38], [4, -35], [10, -35], [14, -38], [18, -35]], h: [0.4, 0.8], col: '#6d727c' },
    { poly: mirror([[15, -28], [14, -8], [14, 10], [15, 32], [13, 35]]), h: [0.3, 1.05], col: '#1d1f24' },
    { poly: mirror([[14, -27], [20, -25], [20, -11], [14, -8]]), h: [0.3, 0.9], col: '#15161a' },
    { poly: mirror([[14, 12], [20, 15], [20, 30], [14, 32]]), h: [0.3, 0.9], col: '#15161a' },
    { poly: mirror([[10, 0], [10, 19]]), h: [1.05, 1.5], col: '#141a24', glass: true },
    { poly: mirror([[19.5, -33], [19.5, -30]]), h: [0.95, 0.97], col: '#ff7a1c', glow: 1.6 },
    { poly: mirror([[3, -26], [3, -6]]), h: [1.05, 1.07], col: '#ff7a1c', glow: 0.9 },
  ],
  gunner: [   // 40 x 76: a short cab, a tall box body, a turret ring on the roof with twin barrels reaching past the nose
    { poly: mirror([[16, -38], [18, -33], [18, -15]]), h: [0.35, 1.8], col: '#262931' },
    { poly: [[-15, -36.5], [15, -36.5], [17, -31], [-17, -31]], h: [1.1, 1.65], col: '#141a24', glass: true },
    { poly: mirror([[20, -14], [20, 38]]), h: [0.35, 2.3], col: '#23262e' },
    { ring: [0, 6, 11], h: [2.3, 2.55], col: '#3a3e48' },
    { ring: [0, 6, 7.5], h: [2.55, 2.95], col: '#2a2d35' },
    { poly: [[-4.2, -46], [-1.8, -46], [-1.8, 2], [-4.2, 2]], h: [2.65, 2.85], col: '#5a5f69' },
    { poly: [[1.8, -46], [4.2, -46], [4.2, 2], [1.8, 2]], h: [2.65, 2.85], col: '#5a5f69' },
    { ring: [0, 6, 11.4], h: [2.3, 2.34], col: '#ff2f6d', glow: 1.6, band: 1.2 },
    { poly: mirror([[20, 30], [20, 32]]), h: [2.3, 2.32], col: '#ff2f6d', glow: 1.0 },
  ],
  armored: [   // 120 x 150: a V plow out front, a slab hull with armoured wheel pods notching both sides, a raised deck
    { poly: [[0, -75], [60, -60], [60, -52], [0, -66], [-60, -52], [-60, -60]], h: [0.4, 1.4], col: '#6d727c' },
    { poly: mirror([[38, -63], [54, -52], [54, 64], [46, 75]]), h: [0.6, 2.7], col: '#343a44' },
    ...[[-44, -24], [-12, 8], [20, 40], [50, 66]].map(([y0, y1]) => ({ poly: mirror([[54, y0], [60, y0 + 3], [60, y1 - 3], [54, y1]]), h: [0.5, 2.2], col: '#2b3038' })),
    { poly: mirror([[32, -42], [34, -38], [34, 52]]), h: [2.7, 3.3], col: '#2b3038' },
    { poly: mirror([[22, -40], [22, -37]]), h: [3.3, 3.32], col: '#ff3b3b', glow: 1.6 },
    { poly: mirror([[34, 44], [34, 50]]), h: [3.3, 3.32], col: '#ffb02a', glow: 1.0 },
    { poly: mirror([[58, -60], [58, -57]]), h: [1.4, 1.6], col: '#ffb02a', glow: 1.4 },
  ],
  truck: [   // 56 x 110: a narrow rounded cab with a green beacon and a white light bar, a hitch gap, a wider flatbed with crates
    { poly: mirror([[16, -55], [20, -51], [21, -30]]), h: [0.4, 2.3], col: '#2fd36a' },
    { poly: [[-15, -53.5], [15, -53.5], [19, -49], [-19, -49]], h: [1.3, 2.0], col: '#141a24', glass: true },
    { poly: mirror([[16, -40], [16, -38]]), h: [2.3, 2.45], col: '#f4f6fa', glow: 1.8 },
    { ring: [0, -33, 4.4], h: [2.3, 2.75], col: '#7dff9e', glow: 2.4 },
    { poly: mirror([[5, -30], [5, -23]]), h: [0.5, 0.8], col: '#2a2d33' },
    { poly: mirror([[28, -23], [28, 55]]), h: [0.5, 1.05], col: '#24282e' },
    { poly: mirror([[27, -23], [27, -20]]), h: [1.05, 1.6], col: '#2fd36a' },
    { poly: [[-24, -16], [-2, -16], [-2, 8], [-24, 8]], h: [1.05, 2.3], col: '#c9a24a' },
    { poly: [[2, -12], [24, -12], [24, 14], [2, 14]], h: [1.05, 2.05], col: '#b88e3e' },
    { poly: [[-22, 16], [22, 16], [22, 48], [-22, 48]], h: [1.05, 1.9], col: '#3f6b55' },
    { poly: mirror([[28, 52], [28, 55]]), h: [0.7, 0.85], col: '#7dff9e', glow: 1.2 },
  ],
};
// wheels: [x, y, width, length] in points, drawn dark; the sheet shows the ones that stick out of the body
export const ENEMY_WHEELS = {
  weak: [[11, -12, 4, 9], [14, 15, 4.5, 10]],
  bruiser: [[19, -17, 5, 11], [19, 21, 5, 11]],
  gunner: [[18.5, -26, 4, 11], [19.5, 26, 4, 11]],
  armored: [[56, -34, 6, 18], [56, -2, 6, 18], [56, 30, 6, 18], [56, 58, 6, 14]],
  truck: [[20, -42, 4, 11], [27, 18, 4, 11], [27, 34, 4, 11]],
};
