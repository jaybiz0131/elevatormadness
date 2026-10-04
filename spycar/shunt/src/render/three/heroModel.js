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
export const NOSE = '-x';   // hero.glb (Meshy, 2026-10-04): splitter and long hood at -x, ducktail at +x; the roof check agrees
export const HERO_FIT = { length: T.sizes.player[1] * M, width: T.sizes.player[0] * M };
const BRAKE = { value: 0 };
const PAL = Object.assign(palette('#37e6ff'), { intake: [0.53, 0.74, 0.1, 0.63] });   // hero.glb's side intake ahead of the rear wheel (u from, to; h from, to): a ragged recess in the mesh, painted dark
export async function loadHeroModel(url = HERO_GLB_URL, nose = new URLSearchParams(location.search).get('heroNose') || NOSE) {
  if (!url) return null;
  const { geo, size, info } = await fitGlb(url, { length: HERO_FIT.length, width: HERO_FIT.width, nose });
  const wheels = findWheels(geo, size); const counts = paintCar(geo, size, wheels, PAL);
  const body = new Mesh(geo, carMaterial(BRAKE, 'hero')); body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false; body.name = 'heroGlb';
  const spin = wheelSet(wheels); const car = new Group(); car.name = 'heroGlbCar'; car.add(body, spin.mesh); car.userData.body = body;
  car.userData.info = Object.assign(info, { wheelTriangles: spin.triangles, wheelRadius: +wheels.r.toFixed(3), wheelsMeasured: wheels.measured, axles: [wheels.list[0].z, wheels.list[2].z].map(v => +v.toFixed(2)), paint: counts });
  // per frame: wheels turn with the road speed (metres per second over the radius); the tail-light bar brightens under braking
  car.userData.tick = (dt, mps, braking) => { spin.turn(dt * mps / wheels.r); BRAKE.value += ((braking ? 1 : 0) - BRAKE.value) * Math.min(1, dt * 14); };
  return car;
}
// spinning wheel pieces over the fused ones, at the measured radius: a tyre, a dark rim face, five spokes and a hub, merged; four
// instances; one draw call
function wheelSet(wheels) {
  const r = wheels.r, w = 0.26; const parts = [tagPart(new CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), PAL.tyre), tagPart(new CylinderGeometry(r * 0.68, r * 0.68, w + 0.02, 16).rotateZ(Math.PI / 2), PAL.trim)];
  for (let i = 0; i < 5; i++) parts.push(tagPart(new BoxGeometry(w + 0.04, r * 1.2, 0.07).translate(0, r * 0.3, 0).rotateX(i * Math.PI * 2 / 5), PAL.rim));
  parts.push(tagPart(new CylinderGeometry(r * 0.16, r * 0.16, w + 0.06, 8).rotateZ(Math.PI / 2), PAL.rim));
  const g = mergeGeometries(parts, false); const mesh = new InstancedMesh(g, carMaterial(BRAKE, 'hero'), 4); mesh.castShadow = true; mesh.frustumCulled = false; mesh.name = 'heroGlbWheels';
  const D = new Object3D(); let ang = 0;
  const turn = (da) => { ang = (ang - da) % (Math.PI * 2); wheels.list.forEach((wh, i) => { D.position.set(wh.x, wh.y, wh.z); D.rotation.set(ang, 0, 0); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix); }); mesh.instanceMatrix.needsUpdate = true; };
  turn(0); return { mesh, turn, triangles: g.attributes.position.count / 3 * 4 };
}
