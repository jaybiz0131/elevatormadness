// The imported hero (assets/models/hero.glb): fitted, measured and painted by carModel.js, plus a spinning wheel set over the fused
// wheels (sized to the measured radius so it sits flush). A new version of the file only needs a rebuild; with no file the code hero
// (hero.js) stays, and ?hero=code shows it for comparison. Body one draw call, wheels one.
import { Mesh, Group, InstancedMesh, Object3D, BoxGeometry, CylinderGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T } from '../../sim/constants.js';
import { M } from './scale.js';
import { MODELS, fitGlb, findWheels, paintCar, palette, carMaterial, tagPart } from './carModel.js';
export const HERO_GLB_URL = MODELS.hero || null;
// the nose direction in the model's own axes; 'auto' guesses from the roof
export const NOSE = 'auto';   // set after a side-view check of each new hero.glb ('-x' was right for the untextured 2026-10-04 mesh)
export const HERO_FIT = { length: T.sizes.player[1] * M, width: T.sizes.player[0] * M };
const BRAKE = { value: 0 };
// untextured models (fallback): painted in code; the earlier mesh's ragged side intake ahead of the rear wheel is painted dark
const PAL = Object.assign(palette('#37e6ff'), { intake: [0.53, 0.74, 0.1, 0.63] });
// textured models: the texture carries the colour, so every region is white (roughness, metalness and glow per region still apply);
// only the head and tail lights are tinted, and the body has no self-glow (it kept the hood from blowing out under bloom)
const TEX_PAL = (() => { const p = palette('#ffffff', { bodyGlow: 0, metal: 0.6, rough: 0.28 }); for (const k of ['glass', 'trim', 'arch', 'rim', 'tyre']) p[k] = [p.body[0], p[k][1], p[k][2], 0, 0]; return p; })();
// the spinning wheels on a textured model: Jack's spec, 0.68 m across, pushed out flush with the body at the corners
const TEX_WHEEL = { r: 0.34, width: 0.3 };
export async function loadHeroModel(url = HERO_GLB_URL, nose = new URLSearchParams(location.search).get('heroNose') || NOSE) {
  if (!url) return null;
  const { geo, size, info, tex } = await fitGlb(url, { length: HERO_FIT.length, width: HERO_FIT.width, nose });
  // wheels: measured from the mesh; on a textured model the spinning set is Jack's size and sits flush with the body sides
  const measured = findWheels(geo, size); const wheels = tex ? flush(measured, size) : measured;
  const counts = paintCar(geo, size, measured, tex ? TEX_PAL : PAL);
  const body = new Mesh(geo, carMaterial(BRAKE, 'hero', tex ? { tex } : {})); body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false; body.name = 'heroGlb';
  const spin = wheelSet(wheels, tex ? TEX_WHEEL.width : 0.26); const car = new Group(); car.name = 'heroGlbCar'; car.add(body, spin.mesh); car.userData.body = body;
  car.userData.info = Object.assign(info, { wheelTriangles: spin.triangles, wheelRadius: +wheels.r.toFixed(3), measuredWheelRadius: +measured.r.toFixed(3), wheelsMeasured: measured.measured, axles: [wheels.list[0].z, wheels.list[2].z].map(v => +v.toFixed(2)), wheelX: +wheels.list[1].x.toFixed(2), paint: counts });
  // per frame: wheels turn with the road speed (metres per second over the radius); the tail-light bar brightens under braking
  car.userData.tick = (dt, mps, braking) => { spin.turn(dt * mps / wheels.r); BRAKE.value += ((braking ? 1 : 0) - BRAKE.value) * Math.min(1, dt * 14); };
  return car;
}
// the textured model's wheel set: the measured axles, Jack's radius, centred so the outer face is flush with the body side
function flush(m, size) { const r = TEX_WHEEL.r, x = size.x / 2 - TEX_WHEEL.width / 2; return { r, measured: m.measured, list: m.list.map(w => ({ x: Math.sign(w.x) * x, y: r, z: w.z, r })) }; }
// spinning wheel pieces over the fused ones, at the measured radius: a tyre, a dark rim face, five spokes and a hub, merged; four
// instances; one draw call
function wheelSet(wheels, w = 0.26) {
  const r = wheels.r; const parts = [tagPart(new CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), PAL.tyre), tagPart(new CylinderGeometry(r * 0.68, r * 0.68, w + 0.02, 16).rotateZ(Math.PI / 2), PAL.trim)];
  for (let i = 0; i < 5; i++) parts.push(tagPart(new BoxGeometry(w + 0.04, r * 1.2, 0.07).translate(0, r * 0.3, 0).rotateX(i * Math.PI * 2 / 5), PAL.rim));
  parts.push(tagPart(new CylinderGeometry(r * 0.16, r * 0.16, w + 0.06, 8).rotateZ(Math.PI / 2), PAL.rim));
  const g = mergeGeometries(parts, false); const mesh = new InstancedMesh(g, carMaterial(BRAKE, 'hero'), 4); mesh.castShadow = true; mesh.frustumCulled = false; mesh.name = 'heroGlbWheels';
  const D = new Object3D(); let ang = 0;
  const turn = (da) => { ang = (ang - da) % (Math.PI * 2); wheels.list.forEach((wh, i) => { D.position.set(wh.x, wh.y, wh.z); D.rotation.set(ang, 0, 0); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix); }); mesh.instanceMatrix.needsUpdate = true; };
  turn(0); return { mesh, turn, triangles: g.attributes.position.count / 3 * 4 };
}
