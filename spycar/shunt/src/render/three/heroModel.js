// The imported hero model (assets/models/hero.glb at the repo root). The build embeds whatever file sits at that path, so a new
// version (the textured one) only needs to replace the file and rebuild; if the file is missing the build still works and the code
// hero (hero.js) stays. ?hero=code shows the code hero for comparison.
// Fitting, done once at load: every mesh is merged into one geometry; the longest axis is the length, the shortest the height; the
// nose is found from the roof (the cabin sits behind the middle on a car, so the nose is the far end from the roof's centre), unless
// NOSE says otherwise; then the car is turned so the nose is -z (as the code hero), scaled uniformly to fit the hero collision box
// (4.5 m long, 2.55 m wide: T.sizes.player x M), centred, and set on the road (lowest point at y = 0).
import { Mesh, Group, InstancedMesh, Object3D, MeshStandardMaterial, Color, Matrix4, Vector3, Box3, BoxGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T } from '../../sim/constants.js';
import { M } from './scale.js';
import heroGlbUrl from 'virtual:hero-glb';   // vite.config.js: the repo's assets/models/hero.glb as a data URL, or null
export const HERO_GLB_URL = heroGlbUrl;
// 'auto', or the model-space direction of the nose ('+x', '-x', '+y', '-y', '+z', '-z') once someone has looked at the model
export const NOSE = '-x';   // hero.glb (Meshy, 2026-10-04): splitter and long hood at -x, ducktail at +x; the roof check agrees
export const HERO_FIT = { length: T.sizes.player[1] * M, width: T.sizes.player[0] * M };
const AXES = ['x', 'y', 'z'];
export async function loadHeroModel(url = HERO_GLB_URL, nose = new URLSearchParams(location.search).get('heroNose') || NOSE) {
  if (!url) return null;
  const gltf = await new GLTFLoader().loadAsync(url); gltf.scene.updateMatrixWorld(true);
  const parts = []; let srcTris = 0;
  gltf.scene.traverse((o) => { if (!o.isMesh) return; let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); g = g.index ? g.toNonIndexed() : g; srcTris += g.attributes.position.count / 3; parts.push(g); });
  if (!parts.length) throw new Error('hero.glb has no meshes');
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  // axes by extent: length (longest), height (shortest), width (the other)
  const box = new Box3().setFromBufferAttribute(geo.attributes.position); const size = box.getSize(new Vector3()), ctr = box.getCenter(new Vector3());
  const order = AXES.slice().sort((a, b) => size[b] - size[a]); const [lenAx, widAx, upAx] = order;
  // nose sign: explicit, or from the roof (top 15% of height) centroid along the length axis
  let noseSign;
  if (nose !== 'auto' && /^[+-][xyz]$/.test(nose)) { noseSign = nose[0] === '+' ? 1 : -1; if (nose[1] !== lenAx) console.warn('heroNose axis', nose, 'is not the length axis', lenAx); }
  else { const p = geo.attributes.position; const top = box.max[upAx] - size[upAx] * 0.15; let sum = 0, n = 0; for (let i = 0; i < p.count; i++) { const v = { x: p.getX(i), y: p.getY(i), z: p.getZ(i) }; if (v[upAx] >= top) { sum += v[lenAx] - ctr[lenAx]; n++; } } noseSign = n && sum / n > 0 ? -1 : 1; }
  // basis: model length axis (nose) -> -z, model up -> +y, the third follows (right-handed, so the car is not mirrored)
  const unit = (ax, s) => { const v = new Vector3(); v[ax] = s; return v; };
  const fwd = unit(lenAx, noseSign), up = unit(upAx, 1), right = new Vector3().crossVectors(fwd, up);   // model-space right
  const rot = new Matrix4().makeBasis(right, up, fwd.clone().negate()).transpose();   // rows: where right, up, back go
  geo.translate(-ctr.x, -ctr.y, -ctr.z); geo.applyMatrix4(rot);
  const b2 = new Box3().setFromBufferAttribute(geo.attributes.position); const s2 = b2.getSize(new Vector3());
  const k = Math.min(HERO_FIT.length / s2.z, HERO_FIT.width / s2.x); geo.scale(k, k, k);
  const b3 = new Box3().setFromBufferAttribute(geo.attributes.position); geo.translate(0, -b3.min.y, 0);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const fin = new Box3().setFromBufferAttribute(geo.attributes.position).getSize(new Vector3());
  const wheels = findWheels(geo, fin); paint(geo, fin, wheels);
  const body = new Mesh(geo, heroMaterial()); body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false; body.name = 'heroGlb';
  const spin = wheelSet(wheels); const car = new Group(); car.name = 'heroGlbCar'; car.add(body, spin.mesh);
  car.userData.info = { triangles: geo.attributes.position.count / 3, wheelTriangles: spin.triangles, sourceTriangles: srcTris, meshes: parts.length, lengthAxis: lenAx, upAxis: upAx, nose: (noseSign > 0 ? '+' : '-') + lenAx, noseFrom: nose === 'auto' ? 'roof' : 'set', scale: +k.toFixed(3), size: [fin.x, fin.y, fin.z].map(v => +v.toFixed(2)), wheels: wheels.map(w => [w.x, w.y, w.z].map(v => +v.toFixed(2))), wheelRadius: +wheels[0].r.toFixed(2) };
  // per frame: wheels turn with the road speed (metres per second over the radius); the tail-light bar brightens under braking
  car.userData.tick = (dt, mps, braking) => { spin.turn(dt * mps / wheels[0].r); BRAKE.value += ((braking ? 1 : 0) - BRAKE.value) * Math.min(1, dt * 14); };
  return car;
}
// ---- paint: regions by position (u along the car from the nose, h up, s out from the centre line) and facet angle ----
const C = (hex) => new Color(hex);
const SURF = {   // colour, roughness, metalness, glow, brake-flag
  body: [C('#37e6ff'), 0.24, 0.55, 0.1, 0], glass: [C('#223a5a'), 0.06, 0.6, 0, 0], trim: [C('#1a1e26'), 0.85, 0.1, 0, 0],
  rim: [C('#b8c0cc'), 0.3, 0.85, 0, 0], tyre: [C('#101214'), 0.95, 0, 0, 0], head: [C('#fff3c4'), 0.2, 0, 3.0, 0], tail: [C('#ff3b3b'), 0.3, 0, 1.6, 1],
};
const BRAKE = { value: 0 };
function heroMaterial() {
  const m = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 1, envMapIntensity: 1.7 });
  m.onBeforeCompile = (sh) => { sh.uniforms.uBrake = BRAKE;
    sh.vertexShader = 'attribute vec4 surf; varying vec4 vSurf;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSurf = surf;');
    sh.fragmentShader = 'varying vec4 vSurf; uniform float uBrake;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = vSurf.x;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = vSurf.y;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vSurf.z * (1.0 + vSurf.w * uBrake * 2.5);'); };
  m.customProgramCacheKey = () => 'heroGlb'; return m;
}
// the four wheels: low points out at the sides cluster at the two axles; the radius is the height of the arch-free band there
function findWheels(geo, size) {
  const p = geo.attributes.position, L = size.z, W = size.x, H = size.y; const z0 = -L / 2; const fr = [], rr = [];
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < H * 0.12 && Math.abs(x) > W * 0.3) ((z - z0) / L < 0.5 ? fr : rr).push(z); }
  const mid = (a, d) => a.length ? a.sort((q, w) => q - w)[a.length >> 1] : z0 + d * L;
  const zf = mid(fr, 0.18), zr = mid(rr, 0.8); const r = Math.min(0.42, Math.max(0.28, H * 0.29)); const x = W / 2 - 0.16;
  return [[-x, zf], [x, zf], [-x, zr], [x, zr]].map(([wx, wz]) => ({ x: wx, y: r, z: wz, r }));
}
function paint(geo, size, wheels) {
  const p = geo.attributes.position, n = geo.attributes.normal, N = p.count; const L = size.z, W = size.x, H = size.y;
  const col = new Float32Array(N * 3), surf = new Float32Array(N * 4); const counts = {};
  for (let f = 0; f < N; f += 3) {
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += p.getX(f + k) / 3; cy += p.getY(f + k) / 3; cz += p.getZ(f + k) / 3; }
    const nx = n.getX(f), ny = n.getY(f), nz = n.getZ(f);   // flat: one normal per facet
    const u = (cz + L / 2) / L, h = cy / H, s = Math.abs(cx) / (W / 2);
    let kind = 'body';
    const wd = wheels.reduce((d, w) => Math.min(d, Math.hypot(cz - w.z, cy - w.y) / w.r + (Math.sign(cx) === Math.sign(w.x) ? 0 : 9)), 9);
    if (wd < 0.92 && s > 0.62 && cy < wheels[0].y + wheels[0].r * 0.8) kind = wd < 0.62 && Math.abs(nx) > 0.5 ? 'rim' : 'tyre';   // inside the wheel only: arch edges stay paint
    else if (u < 0.09 && nz < -0.35 && h > 0.28 && h < 0.6 && s > 0.38 && s < 0.92) kind = 'head';
    else if (u > 0.9 && nz > 0.35 && h > 0.38 && h < 0.66 && s < 0.9) kind = 'tail';
    else if (h > 0.6 && u > 0.2 && u < 0.88 && ny < 0.86 && ny > -0.2 && (Math.abs(nz) > 0.25 || Math.abs(nx) > 0.55)) kind = 'glass';
    else if (h > 0.55 && s < 0.8 && ((u > 0.26 && u < 0.46 && nz < -0.18) || (u > 0.62 && u < 0.86 && nz > 0.18)) && ny < 0.97) kind = 'glass';   // raked windshield and rear window
    else if (h < 0.17 || (u < 0.05 && h < 0.34) || (u > 0.95 && h < 0.34) || ny < -0.6) kind = 'trim';
    counts[kind] = (counts[kind] || 0) + 1; const S = SURF[kind];
    for (let k = 0; k < 3; k++) { const i = f + k; col[i * 3] = S[0].r; col[i * 3 + 1] = S[0].g; col[i * 3 + 2] = S[0].b; surf[i * 4] = S[1]; surf[i * 4 + 1] = S[2]; surf[i * 4 + 2] = S[3]; surf[i * 4 + 3] = S[4]; }
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3)); geo.setAttribute('surf', new Float32BufferAttribute(surf, 4)); geo.userData.paint = counts;
}
// spinning wheel pieces over the fused ones: a tyre, a rim face and five spokes, merged; four instances; one draw call
function wheelSet(wheels) {
  const r = wheels[0].r * 1.04, w = 0.3; const parts = [];
  const tag = (g, S) => { g = g.index ? g.toNonIndexed() : g; const c = new Float32Array(g.attributes.position.count * 3), su = new Float32Array(g.attributes.position.count * 4); for (let i = 0; i < c.length / 3; i++) { c[i * 3] = S[0].r; c[i * 3 + 1] = S[0].g; c[i * 3 + 2] = S[0].b; su[i * 4] = S[1]; su[i * 4 + 1] = S[2]; su[i * 4 + 2] = S[3]; su[i * 4 + 3] = S[4]; } g.setAttribute('color', new Float32BufferAttribute(c, 3)); g.setAttribute('surf', new Float32BufferAttribute(su, 4)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'surf'].includes(k)) g.deleteAttribute(k); return g; };
  parts.push(tag(new CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), SURF.tyre), tag(new CylinderGeometry(r * 0.66, r * 0.66, w + 0.02, 14).rotateZ(Math.PI / 2), SURF.trim));
  for (let i = 0; i < 5; i++) parts.push(tag(new BoxGeometry(w + 0.04, r * 1.2, 0.07).translate(0, r * 0.3, 0).rotateX(i * Math.PI * 2 / 5), SURF.rim));
  parts.push(tag(new CylinderGeometry(r * 0.16, r * 0.16, w + 0.06, 8).rotateZ(Math.PI / 2), SURF.rim));
  const g = mergeGeometries(parts, false); const mesh = new InstancedMesh(g, heroMaterial(), 4); mesh.castShadow = true; mesh.frustumCulled = false; mesh.name = 'heroGlbWheels';
  const D = new Object3D(); let ang = 0;
  const turn = (da) => { ang = (ang - da) % (Math.PI * 2); wheels.forEach((wh, i) => { D.position.set(wh.x, wh.y, wh.z); D.rotation.set(ang, 0, 0); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix); }); mesh.instanceMatrix.needsUpdate = true; };
  turn(0); return { mesh, turn, triangles: g.attributes.position.count / 3 * 4 };
}
