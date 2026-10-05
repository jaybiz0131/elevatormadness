// Imported street props and landmarks (Jack's Meshy GLBs in assets/models/, embedded at build). Each file is merged into one geometry,
// scaled uniformly to a real-world size (PROPS: one dimension in metres), set on the ground (lowest point y = 0) and centred; the model's
// own front is +z and up is +y (all checked by front and side views, 2026-10-05). Each type is one InstancedMesh: one draw per type.
// city.js and props.js put them where the code-built kit pieces stood; a type with no file keeps its kit piece.
import { InstancedMesh, MeshStandardMaterial, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODELS, fixNormals } from './carModel.js';
// size: [axis, metres]; cap: most instances at once; shadow: casts a shadow (the large pieces only, to keep the shadow pass small)
export const PROPS = {
  street_lamp: { size: ['y', 7.0], cap: 64, shadow: false },     // the arm reaches toward +x (over the road); no shadow (4,040 triangles each)
  cones: { size: ['x', 1.8], cap: 32, shadow: false },           // three cones and a barrier: one roadblock segment (24 pt)
  storefront: { size: ['x', 6.0], cap: 48, shadow: false },      // a shopfront with an awning, front +z
  newsstand: { size: ['x', 2.4], cap: 32, shadow: false },
  phone_booth: { size: ['y', 2.4], cap: 32, shadow: false },
  billboard: { size: ['x', 8.0], cap: 24, shadow: true },
  rooftop_ac: { size: ['x', 2.6], cap: 64, shadow: false },
  hotel_tower: { size: ['y', 70], cap: 1, shadow: true },        // landmarks: one each, see LANDMARKS in city.js
  radio_tower: { size: ['y', 80], cap: 1, shadow: true },
  parking_garage: { size: ['x', 40], cap: 1, shadow: true },
};
async function loadOne(url, [axis, metres]) {
  const gltf = await new GLTFLoader().loadAsync(url); gltf.scene.updateMatrixWorld(true);
  const parts = []; let mat = null;
  gltf.scene.traverse((o) => { if (!o.isMesh) return; if (!mat) mat = o.material; let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); g = g.index ? g.toNonIndexed() : g; parts.push(g); });
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  const box = new Box3().setFromBufferAttribute(geo.attributes.position); const size = box.getSize(new Vector3()), ctr = box.getCenter(new Vector3());
  const k = metres / size[axis]; geo.translate(-ctr.x, -box.min.y, -ctr.z); geo.scale(k, k, k); const fixed = geo.attributes.normal ? fixNormals(geo) : (geo.computeVertexNormals(), 0); geo.computeBoundingSphere();
  const m = new MeshStandardMaterial({ map: mat && mat.map || null, normalMap: mat && mat.normalMap || null, roughness: 0.75, metalness: 0.1, envMapIntensity: 0.8 });
  if (mat && mat.normalScale) m.normalScale.copy(mat.normalScale);
  return { geo, material: m, fixedNormals: fixed, size: [size.x * k, size.y * k, size.z * k].map(v => +v.toFixed(2)), triangles: geo.attributes.position.count / 3 };
}
export async function loadPropModels(scene) {
  const out = {}, info = {};
  for (const [name, spec] of Object.entries(PROPS)) {
    const url = MODELS[name]; if (!url) continue;
    try { const r = await loadOne(url, spec.size); const mesh = new InstancedMesh(r.geo, r.material, spec.cap); mesh.count = 0; mesh.castShadow = spec.shadow; mesh.frustumCulled = false; mesh.name = 'prop-' + name; scene.add(mesh); out[name] = mesh; info[name] = { size: r.size, triangles: r.triangles, fixedNormals: r.fixedNormals }; }
    catch (e) { info[name] = { error: String(e && e.message || e).slice(0, 120) }; }
  }
  return { meshes: out, info };
}
