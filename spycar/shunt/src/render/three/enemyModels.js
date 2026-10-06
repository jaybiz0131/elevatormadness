// Imported enemy models (Jack's Meshy GLBs, one per type, same path as the hero): assets/models/<name>.glb, named after the designs
// in enemyShapes.js (which stays the size and silhouette reference). Each is fitted to its sim footprint (T.sizes, unchanged),
// measured and painted in its role colours by carModel.js, then drawn as one InstancedMesh per type: one draw call per type however
// many are on screen. A type with no file keeps the placeholder box from cars.js.
import { Q as Q2 } from '../../quality.js';
import { InstancedMesh, InstancedBufferAttribute, Color, Matrix4, MeshStandardMaterial } from 'three';
import { T } from '../../sim/constants.js';
import { M } from './scale.js';
import { MODELS, fitGlb, findWheels, paintCar, palette, carMaterial } from './carModel.js';
import { ENEMY_ROLES, ENEMY_SHAPES } from './enemyShapes.js';
export const ENEMY_FILES = { weak: 'dart', bruiser: 'ram', gunner: 'gunner', armored: 'bulwark', truck: 'mule', civ: 'traffic_car' };   // civ: the civilian traffic
// nose direction per file in the model's own axes, set once someone has looked at each model ('auto' guesses from the roof);
// ?nose-dart=+x (etc.) overrides for a quick check
// checked by side and top views of Jack's files (2026-10-05): all four point their nose to -x; bulwark_alt.glb (the spare) runs along z
// with the plow at +z
export const ENEMY_NOSE = { dart: '-x', ram: '-x', gunner: '-x', bulwark: '-x', bulwark_alt: '+z', mule: '-x', traffic_car: '-x' };   // mule.glb (2026-10-05): cab at -x, flatbed at +x; traffic_car.glb: sloped bonnet at -x
// the up axis where the shortest axis is not the height (the Gunner van is taller than it is wide)
export const ENEMY_UP = { gunner: 'y', mule: 'y' };   // the Mule is as tall as it is wide
// textured enemies keep their texture colours; the role's lights glow: front and rear light zones and a strip along the top
// (the Bulwark: a red slit at the front, amber hazards at the rear and on the deck)
const LIGHTS = { civ: ['#fff3c4', '#ff3b3b'], weak: ['#ff3b3b', '#ff3b3b'], bruiser: ['#ff7a1c', '#ff7a1c'], gunner: ['#ff2f6d', '#ff2f6d'], armored: ['#ff3b3b', '#ffb02a'], truck: ['#fff3c4', '#7dff9e'] };
function texPalette(kind) { const [front, rear] = LIGHTS[kind]; const p = palette('#ffffff', { bodyGlow: 0, metal: 0.4, rough: 0.4, accent: rear, head: front, headGlow: 2.6 });
  for (const k of ['glass', 'trim', 'arch', 'rim', 'tyre']) p[k] = [p.body[0], p[k][1], p[k][2], 0, 0]; p.tail = [new Color(rear), 0.3, 0, 1.8, 0];
  // the supply truck reads friendly at a glance: bright green strips along both sides and a pulsing green beacon on the cab roof
  if (kind === 'civ') p.accent = null;   // traffic: plain cars, no role accent
  if (kind === 'truck') { const G = new Color('#3dff7a'); Object.assign(p, { stripsAt: [0.3, 0.37], beaconAt: [0.36, 0.8], strip: [G, 0.3, 0, 2.6, 0], beacon: [G, 0.2, 0, 2.4, 1] }); }   // beacon flag 1: pulses
  return p; }
// the Mule's beacon pulse (the brake channel of its material, 0 to 1): set each frame by tickEnemyLights
const MULE_PULSE = { value: 0 };
export function tickEnemyLights(elapsed) { MULE_PULSE.value = 0.5 + 0.5 * Math.sin(elapsed * 5); }
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
      const civ = kind === 'civ' && !!tex; const n = civ ? 40 : cap;
      const mesh = new InstancedMesh(geo, carMaterial(kind === 'truck' ? MULE_PULSE : NO_BRAKE, 'enemy-' + kind, tex ? { tex, clearcoat: civ ? 0.25 : 0.5, envMapIntensity: civ ? 0.6 : 1.2, instTint: civ } : {}), n); mesh.count = 0; mesh.castShadow = Q2.castEnemies; mesh.frustumCulled = false; mesh.name = 'enemy-' + name;   // enemies and traffic keep their blob shadow (fx.shadow); only the hero casts into the sun's shadow map
      if (civ) { const a = new InstancedBufferAttribute(new Float32Array(n * 4).fill(1), 4); geo.setAttribute('aTint', a); mesh.userData.aTint = a; }   // traffic: body colour and darkness per car
      else mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);   // per instance tint: white, or dark for a wreck
      scene.add(mesh); out[kind] = { mesh, info };
      if (kind === 'truck' && MODELS.mule_arm) {   // the Mule's arm (mule_arm.glb), folded along the right side, claw forward; it rides on
        // the Mule's own instance matrix (cars.js emit), one more draw; the side-dock animation comes in Sprint F
        const arm = await fitGlb(MODELS.mule_arm, { length: 3.2, width: 2, nose: '+x', up: 'y' });
        const am = new MeshStandardMaterial({ map: arm.tex ? arm.tex.map : null, normalMap: arm.tex ? arm.tex.normalMap : null, roughness: 0.6, metalness: 0.4 });
        const armMesh = new InstancedMesh(arm.geo, am, cap); armMesh.count = 0; armMesh.castShadow = true; armMesh.frustumCulled = false; armMesh.name = 'enemy-mule-arm';
        armMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); scene.add(armMesh);
        mesh.userData.attach = { mesh: armMesh, local: new Matrix4().makeTranslation(size.x / 2 + arm.size.x / 2 - 0.25, 0.9, 0.4) }; info.arm = { triangles: arm.info.triangles, size: arm.info.size };
      }
    } catch (e) { out[kind] = { error: String(e && e.message || e).slice(0, 120), file: name + '.glb' }; }
  }
  return out;
}
