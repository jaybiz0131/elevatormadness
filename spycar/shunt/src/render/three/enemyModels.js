// Imported enemy models (Jack's Meshy GLBs, one per type, same path as the hero): assets/models/<name>.glb, named after the designs
// in enemyShapes.js (which stays the size and silhouette reference). Each is fitted to its sim footprint (T.sizes, unchanged),
// measured and painted in its role colours by carModel.js, then drawn as one InstancedMesh per type: one draw call per type however
// many are on screen. A type with no file keeps the placeholder box from cars.js.
import { InstancedMesh, InstancedBufferAttribute, Color } from 'three';
import { T } from '../../sim/constants.js';
import { M } from './scale.js';
import { MODELS, fitGlb, findWheels, paintCar, palette, carMaterial } from './carModel.js';
import { ENEMY_ROLES, ENEMY_SHAPES } from './enemyShapes.js';
export const ENEMY_FILES = { weak: 'dart', bruiser: 'ram', gunner: 'gunner', armored: 'bulwark', truck: 'mule' };
// nose direction per file in the model's own axes, set once someone has looked at each model ('auto' guesses from the roof);
// ?nose-dart=+x (etc.) overrides for a quick check
// checked by side and top views of Jack's files (2026-10-05): all four point their nose to -x; bulwark_alt.glb (the spare) runs along z
// with the plow at +z
export const ENEMY_NOSE = { dart: '-x', ram: '-x', gunner: '-x', bulwark: '-x', bulwark_alt: '+z', mule: 'auto' };
// the up axis where the shortest axis is not the height (the Gunner van is taller than it is wide)
export const ENEMY_UP = { gunner: 'y' };
// textured enemies keep their texture colours; the role's lights glow: front and rear light zones and a strip along the top
// (the Bulwark: a red slit at the front, amber hazards at the rear and on the deck)
const LIGHTS = { weak: ['#ff3b3b', '#ff3b3b'], bruiser: ['#ff7a1c', '#ff7a1c'], gunner: ['#ff2f6d', '#ff2f6d'], armored: ['#ff3b3b', '#ffb02a'], truck: ['#fff3c4', '#7dff9e'] };
function texPalette(kind) { const [front, rear] = LIGHTS[kind]; const p = palette('#ffffff', { bodyGlow: 0, metal: 0.4, rough: 0.4, accent: rear, head: front, headGlow: 2.6 });
  for (const k of ['glass', 'trim', 'arch', 'rim', 'tyre']) p[k] = [p.body[0], p[k][1], p[k][2], 0, 0]; p.tail = [new Color(rear), 0.3, 0, 1.8, 0]; return p; }
const NO_BRAKE = { value: 0 };
// body colour from the approved top-view sheet (the main hull layer), accent from the role; enemies show red headlights (the threat
// cue from the 2D build), the supply truck white ones
function paletteFor(kind) { const body = ENEMY_SHAPES[kind].reduce((a, L) => (!L.glow && !L.glass && (!a || (L.h[1] - L.h[0]) > (a.h[1] - a.h[0]))) ? L : a, null).col;
  return palette(body, { accent: ENEMY_ROLES[kind].accent, head: kind === 'truck' ? '#fff3c4' : '#ff4a3a', headGlow: kind === 'truck' ? 3 : 2.4, metal: 0.4, rough: 0.32, bodyGlow: kind === 'truck' ? 0.12 : 0.04 }); }
export async function loadEnemyModels(scene, cap = 24) {
  const out = {}; const Q = new URLSearchParams(location.search);
  for (const [kind, name] of Object.entries(ENEMY_FILES)) {
    const url = MODELS[name]; if (!url) continue;
    try {
      const [w, l] = T.sizes[kind]; const { geo, size, info, tex } = await fitGlb(url, { length: l * M, width: w * M, nose: Q.get('nose-' + name) || ENEMY_NOSE[name], up: ENEMY_UP[name] || null });
      const wheels = findWheels(geo, size); info.paint = paintCar(geo, size, wheels, tex ? texPalette(kind) : paletteFor(kind)); info.wheelRadius = +wheels.r.toFixed(3); info.file = name + '.glb';
      const mesh = new InstancedMesh(geo, carMaterial(NO_BRAKE, 'enemy-' + kind, tex ? { tex, clearcoat: 0.5, envMapIntensity: 1.2 } : {}), cap); mesh.count = 0; mesh.castShadow = true; mesh.frustumCulled = false; mesh.name = 'enemy-' + name;
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);   // per instance tint: white, or dark for a wreck
      scene.add(mesh); out[kind] = { mesh, info };
    } catch (e) { out[kind] = { error: String(e && e.message || e).slice(0, 120), file: name + '.glb' }; }
  }
  return out;
}
