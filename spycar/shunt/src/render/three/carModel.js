// Imported car models (Meshy GLBs in the repo's assets/models/, embedded at build by vite.config.js): load, fit, measure, paint.
// Shared by the hero (heroModel.js) and the enemies (enemyModels.js). Done once at load, never per frame.
// Fit: every mesh merged into one non-indexed geometry; the longest axis is the length, the shortest the height; the nose comes from
// `nose` ('+x' ... '-z') or, with 'auto', from the roof (the cabin sits behind the middle, so the nose is the far end from the roof's
// centre); the car is turned so the nose is -z and up is +y (a pure rotation, never a mirror), scaled uniformly to fit the
// collision footprint (length x width in metres), centred, and set on the road (lowest point at y = 0).
// Wheels: measured from the mesh by vertical rays through each axle near the outer edge (ground contact to tyre top = diameter).
// Paint: per facet by position (u along from the nose, h up, s out from the centre line) and facet angle, into vertex colours plus a
// `surf` attribute (roughness, metalness, glow, brake flag) that one shared material reads: one draw call for the whole body.
import { MeshStandardMaterial, Color, Matrix4, Vector3, Box3, Float32BufferAttribute } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import MODELS from 'virtual:models';
export { MODELS };
const AXES = ['x', 'y', 'z'];
export async function fitGlb(url, { length, width, nose = 'auto' }) {
  const gltf = await new GLTFLoader().loadAsync(url); gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((o) => { if (!o.isMesh) return; let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); g = g.index ? g.toNonIndexed() : g; parts.push(g); });
  if (!parts.length) throw new Error('no meshes in the model');
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  const box = new Box3().setFromBufferAttribute(geo.attributes.position); const size = box.getSize(new Vector3()), ctr = box.getCenter(new Vector3());
  const [lenAx, , upAx] = AXES.slice().sort((a, b) => size[b] - size[a]);
  let noseSign;
  if (/^[+-][xyz]$/.test(nose)) noseSign = nose[0] === '+' ? 1 : -1;
  else { const p = geo.attributes.position; const top = box.max[upAx] - size[upAx] * 0.15; const V = new Vector3(); let sum = 0, n = 0; for (let i = 0; i < p.count; i++) { V.fromBufferAttribute(p, i); if (V[upAx] >= top) { sum += V[lenAx] - ctr[lenAx]; n++; } } noseSign = n && sum / n > 0 ? -1 : 1; }
  const unit = (ax, s) => { const v = new Vector3(); v[ax] = s; return v; };
  const fwd = unit(lenAx, noseSign), up = unit(upAx, 1), right = new Vector3().crossVectors(fwd, up);
  const rot = new Matrix4().makeBasis(right, up, fwd.clone().negate()).transpose();   // model -> car frame (right, up, back)
  geo.translate(-ctr.x, -ctr.y, -ctr.z); geo.applyMatrix4(rot);
  const s2 = new Box3().setFromBufferAttribute(geo.attributes.position).getSize(new Vector3());
  const k = Math.min(length / s2.z, width / s2.x); geo.scale(k, k, k);
  const b3 = new Box3().setFromBufferAttribute(geo.attributes.position); geo.translate(0, -b3.min.y, -(b3.min.z + b3.max.z) / 2);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const fin = new Box3().setFromBufferAttribute(geo.attributes.position).getSize(new Vector3());
  return { geo, size: fin, info: { triangles: geo.attributes.position.count / 3, meshes: parts.length, lengthAxis: lenAx, upAxis: upAx, nose: (noseSign > 0 ? '+' : '-') + lenAx, noseFrom: nose === 'auto' ? 'roof' : 'set', scale: +k.toFixed(3), size: [fin.x, fin.y, fin.z].map(v => +v.toFixed(2)) } };
}
// all ray hits (heights) of the vertical line through (x, z) with the mesh
function hitsVertical(p, x, z) {
  const ys = []; for (let t = 0; t < p.count; t += 3) {
    const ax = p.getX(t), az = p.getZ(t), bx = p.getX(t + 1), bz = p.getZ(t + 1), cx = p.getX(t + 2), cz = p.getZ(t + 2);
    if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) || z < Math.min(az, bz, cz) || z > Math.max(az, bz, cz)) continue;
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 >= 0 && l2 >= 0 && l3 >= 0) ys.push(l1 * p.getY(t) + l2 * p.getY(t + 1) + l3 * p.getY(t + 2));
  } return ys.sort((a, b) => a - b);
}
// the four wheels, measured: axles from where the outer underside touches the ground, radius from ground contact to tyre top
export function findWheels(geo, size, guess = [0.24, 0.82]) {
  const p = geo.attributes.position, L = size.z, W = size.x; const xs = [W / 2 - 0.15, W / 2 - 0.22, W / 2 - 0.1];
  const axles = guess.map((u) => { const z0 = -L / 2 + u * L; let best = null; for (let dz = -0.35; dz <= 0.35; dz += 0.025) { const ys = hitsVertical(p, xs[0], z0 + dz); if (ys.length && (!best || ys[0] < best.low)) best = { z: z0 + dz, low: ys[0] }; } return best ? best.z : z0; });
  const radii = []; for (const z of axles) for (const x of xs) { const ys = hitsVertical(p, x, z); if (ys.length < 2) continue; const bottom = ys[0]; const top = ys.find(y => y > bottom + 0.4 && y < bottom + 1.0); if (top) radii.push((top - bottom) / 2); }
  radii.sort((a, b) => a - b); const r = radii.length ? Math.min(0.5, Math.max(0.22, radii[radii.length >> 1])) : Math.min(0.42, Math.max(0.28, size.y * 0.29));
  const x = W / 2 - 0.16; return { r, measured: radii.length > 0, list: [[-x, axles[0]], [x, axles[0]], [-x, axles[1]], [x, axles[1]]].map(([wx, wz]) => ({ x: wx, y: r, z: wz, r })) };
}
// palettes: [colour, roughness, metalness, glow, brake flag]
const C = (hex) => new Color(hex);
export function palette(body, { accent = null, head = '#fff3c4', headGlow = 3.0, metal = 0.55, rough = 0.24, bodyGlow = 0.1 } = {}) {
  return { body: [C(body), rough, metal, bodyGlow, 0], glass: [C('#223a5a'), 0.06, 0.6, 0, 0], trim: [C('#1a1e26'), 0.85, 0.1, 0, 0], arch: [C('#1a1e26'), 0.9, 0.05, 0, 0],
    rim: [C('#b8c0cc'), 0.3, 0.85, 0, 0], tyre: [C('#101214'), 0.95, 0, 0, 0], head: [C(head), 0.2, 0, headGlow, 0], tail: [C('#ff3b3b'), 0.3, 0, 1.6, 1], accent: accent ? [C(accent), 0.3, 0.2, 1.3, 0] : null };
}
export function paintCar(geo, size, wheels, pal) {
  const p = geo.attributes.position, n = geo.attributes.normal, N = p.count; const L = size.z, W = size.x, H = size.y; const R = wheels.r, WH = wheels.list;
  const col = new Float32Array(N * 3), surf = new Float32Array(N * 4); const counts = {};
  for (let f = 0; f < N; f += 3) {
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += p.getX(f + k) / 3; cy += p.getY(f + k) / 3; cz += p.getZ(f + k) / 3; }
    const nx = n.getX(f), ny = n.getY(f), nz = n.getZ(f);
    const u = (cz + L / 2) / L, h = cy / H, s = Math.abs(cx) / (W / 2);
    const wd = WH.reduce((d, w) => Math.min(d, Math.hypot(cz - w.z, cy - w.y) / R + (Math.sign(cx) === Math.sign(w.x) ? 0 : 9)), 9);
    let kind = 'body';
    if (wd < 0.92 && s > 0.55) kind = wd < 0.62 && Math.abs(nx) > 0.5 ? 'rim' : 'tyre';
    else if (wd < 1.25 && s > 0.5 && cy > R * 0.6) kind = 'arch';   // the well itself
    else if (pal.intake && u > pal.intake[0] && u < pal.intake[1] && h > pal.intake[2] && h < pal.intake[3] && s > 0.7) kind = 'arch';   // a side intake (per model)
    else if (u < 0.09 && nz < -0.35 && h > 0.28 && h < 0.6 && s > 0.38 && s < 0.92) kind = 'head';
    else if (u > 0.9 && nz > 0.35 && h > 0.38 && h < 0.66 && s < 0.9) kind = 'tail';
    else if (h > 0.6 && u > 0.2 && u < 0.88 && ny < 0.86 && ny > -0.2 && (Math.abs(nz) > 0.25 || Math.abs(nx) > 0.55)) kind = 'glass';
    else if (h > 0.55 && s < 0.8 && ((u > 0.26 && u < 0.46 && nz < -0.18) || (u > 0.62 && u < 0.86 && nz > 0.18)) && ny < 0.97) kind = 'glass';   // raked windshield and rear window
    else if (h < 0.17 || (u < 0.05 && h < 0.34) || (u > 0.95 && h < 0.34) || ny < -0.6) kind = 'trim';
    else if (pal.accent && s < 0.14 && ny > 0.75 && u > 0.04 && u < 0.6) kind = 'accent';   // a centre stripe along the bonnet and roof
    counts[kind] = (counts[kind] || 0) + 1; const S = pal[kind];
    // the arch lip: body facets near a wheel blend to the dark arch colour per corner, by each corner's own distance from the wheel
    // centre (dark inside 1.25 r, paint beyond 1.5 r); the blend runs across each facet, so the lip ends in a soft circle instead of
    // following the mesh's jagged facet edges
    const lip = (kind === 'body' || kind === 'arch') && s > 0.5 && cy > R * 0.4;
    for (let k = 0; k < 3; k++) { const i = f + k; let a = 0;
      if (lip) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i); let d = 9; for (const w of WH) if (Math.sign(vx) === Math.sign(w.x)) d = Math.min(d, Math.hypot(vz - w.z, vy - w.y) / R); a = vy < R * 0.3 ? 0 : 1 - Math.min(1, Math.max(0, (d - 1.25) / 0.25)); }
      const A = pal.arch; const mix = (x, y) => x + (y - x) * a;
      col[i * 3] = mix(S[0].r, A[0].r); col[i * 3 + 1] = mix(S[0].g, A[0].g); col[i * 3 + 2] = mix(S[0].b, A[0].b); surf[i * 4] = mix(S[1], A[1]); surf[i * 4 + 1] = mix(S[2], A[2]); surf[i * 4 + 2] = mix(S[3], A[3]); surf[i * 4 + 3] = S[4]; }
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3)); geo.setAttribute('surf', new Float32BufferAttribute(surf, 4)); return counts;
}
// the shared material: vertex colours carry the paint; `surf` carries roughness, metalness, glow and the brake flag (lit by `brake`)
export function carMaterial(brake, key) {
  const m = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 1, envMapIntensity: 1.7 });
  m.onBeforeCompile = (sh) => { sh.uniforms.uBrake = brake;
    sh.vertexShader = 'attribute vec4 surf; varying vec4 vSurf;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSurf = surf;');
    sh.fragmentShader = 'varying vec4 vSurf; uniform float uBrake;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = vSurf.x;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = vSurf.y;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vSurf.z * (1.0 + vSurf.w * uBrake * 2.5);'); };
  m.customProgramCacheKey = () => 'car-' + key; return m;
}
// tag a code-built part (the hero's spinning wheels) with a palette entry so it draws with carMaterial
export function tagPart(g, S) { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count; const c = new Float32Array(n * 3), su = new Float32Array(n * 4); for (let i = 0; i < n; i++) { c[i * 3] = S[0].r; c[i * 3 + 1] = S[0].g; c[i * 3 + 2] = S[0].b; su[i * 4] = S[1]; su[i * 4 + 1] = S[2]; su[i * 4 + 2] = S[3]; su[i * 4 + 3] = S[4]; } g.setAttribute('color', new Float32BufferAttribute(c, 3)); g.setAttribute('surf', new Float32BufferAttribute(su, 4)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'surf'].includes(k)) g.deleteAttribute(k); return g; }
