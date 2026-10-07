// Driver control: cars break into pieces. At load each car model is split by where its triangles sit into the pieces the sim can throw (crash.js PARTS:
// the front and rear bumpers, the hood, the two doors, the roof panel, the front-left wheel) and what is left (the shell). Each piece is centred on its
// own middle (that is where the sim's body is) and gets its own InstancedMesh on the car's material, so a broken wreck draws as its shell plus the
// pieces it still has, and a flying piece draws on its own: one draw call per piece type in use, nothing when no car is broken.
import { BufferGeometry, BufferAttribute, InstancedMesh, InstancedBufferAttribute, Vector3, Box3 } from 'three';
export const CHUNK_PARTS = ['fbump', 'hood', 'rbump', 'doorL', 'doorR', 'roof', 'wheel'];
// model frame: x right, y up from the road, z toward the tail (the nose is at -z)
function classify(cx, cy, cz, size, wheel) {
  const xn = cx / (size.x / 2), yn = cy / size.y, zn = -cz / (size.z / 2);   // zn: +1 at the nose
  if (wheel && cx < 0 && Math.hypot(cy - wheel.y, cz - wheel.z) < wheel.r * 1.15 && -cx > Math.abs(wheel.x) - wheel.r * 0.9) return 'wheel';
  if (zn > 0.8 && yn < 0.55) return 'fbump';
  if (zn < -0.8 && yn < 0.55) return 'rbump';
  if (yn > 0.82 && Math.abs(zn) < 0.5) return 'roof';
  if (zn > 0.25 && yn > 0.42 && Math.abs(xn) < 0.9) return 'hood';
  if (Math.abs(zn) < 0.42 && yn > 0.18 && yn < 0.75 && Math.abs(xn) > 0.6) return xn < 0 ? 'doorL' : 'doorR';
  return 'shell';
}
export function splitCar(geo, size, wheels) {
  const p = geo.attributes.position, N = p.count; const tri = {}; for (const k of CHUNK_PARTS.concat('shell')) tri[k] = [];
  const wheel = wheels && wheels.list ? wheels.list[0] : null;
  for (let f = 0; f < N; f += 3) { let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += p.getX(f + k) / 3; cy += p.getY(f + k) / 3; cz += p.getZ(f + k) / 3; } tri[classify(cx, cy, cz, size, wheel)].push(f); }
  const out = {}; const names = Object.keys(geo.attributes).filter(k => k !== 'aTint');
  for (const [part, list] of Object.entries(tri)) {
    if (!list.length) continue; const g = new BufferGeometry();
    for (const k of names) { const a = geo.attributes[k], s = a.itemSize; const arr = new a.array.constructor(list.length * 3 * s); let o = 0; for (const f of list) for (let v = 0; v < 3; v++) for (let c = 0; c < s; c++) arr[o++] = a.array[(f + v) * s + c]; g.setAttribute(k, new BufferAttribute(arr, s, a.normalized)); }
    const off = new Vector3(); if (part !== 'shell') { new Box3().setFromBufferAttribute(g.attributes.position).getCenter(off); g.translate(-off.x, -off.y, -off.z); }
    g.computeBoundingSphere(); out[part] = { geo: g, off, tris: list.length };
  }
  return out;
}
// one InstancedMesh per piece on the car's own material; per-instance tint the same way as the car (aTint for textured traffic, instanceColor otherwise)
export function chunkMeshes(scene, split, material, civ, cap, name) {
  const out = {};
  for (const [part, s] of Object.entries(split)) {
    const m = new InstancedMesh(s.geo, material, cap); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.name = name + '-' + part; m.visible = false;
    if (civ) { const a = new InstancedBufferAttribute(new Float32Array(cap * 4).fill(1), 4); s.geo.setAttribute('aTint', a); m.userData.aTint = a; } else m.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    scene.add(m); out[part] = { mesh: m, off: s.off, tris: s.tris };
  }
  return out;
}
