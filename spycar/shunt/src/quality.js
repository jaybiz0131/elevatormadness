// Graphics levels. `Q` is one live object that the renderer reads every frame; setLevel() rewrites it in place.
//   dpr         the most pixels per CSS pixel the canvas may use (the render scale then steps down from there)
//   msaa        samples on the HDR frame buffer (0 = none: at 1.5x and above the edges are already fine)
//   shadow      the sun's shadow map; shadowMap its size; castProps: lamps, benches and other small props cast into it, castCity: the building chunks do
//   bloom       resolution of the bloom chain relative to the frame (the chain itself already halves at every step)
//   cloud       the most smoke-cloak puffs (the hero's thick smoke, chaos.js) drawn at once; they ride in the smoke batch, so puffTotal covers them too
//   puffs       the most smoke sprites drawn (the newest ones); sparks, debris, glows: the fixed pools of the other effects; none of them ever grows
//   detail      how far ahead (pt) the detailed models (storefronts, rooftop units, lamps) are placed
//   lamps       how many pt ahead the street lamp model is used (beyond that the plain kit lamp)
//   floor       the lowest render scale the automatic scaler may use
// Overrides for testing: ?gfx=low|high and ?q=dpr:1.5,msaa:0,puffs:100
export const LEVELS = {
  high: { dpr: 2, msaa: 4, shadow: true, shadowMap: 2048, castProps: false, castCity: false, castEnemies: false, bloom: 0.5, puffs: 220, puffTotal: 460, cloud: 56, sparks: 256, debris: 160, glows: 160, detail: 900, lamps: 700, floor: 0.7 },
  low: { dpr: 1.25, msaa: 0, shadow: false, shadowMap: 1024, castProps: false, castCity: false, castEnemies: false, bloom: 0.5, puffs: 90, puffTotal: 230, cloud: 28, sparks: 128, debris: 64, glows: 110, detail: 600, lamps: 450, floor: 0.6 },
};
export const Q = Object.assign({ level: 'high' }, LEVELS.high);
export function setLevel(name, overrides) { const L = LEVELS[name] || LEVELS.high; Object.assign(Q, L, overrides || {}); Q.level = LEVELS[name] ? name : 'high'; return Q; }
export function parseOverrides(search) { const out = {}; const q = new URLSearchParams(search).get('q'); if (q) for (const kv of q.split(',')) { const [k, v] = kv.split(':'); if (k && v !== undefined) out[k] = v === 'true' ? true : v === 'false' ? false : Number(v); } return out; }
