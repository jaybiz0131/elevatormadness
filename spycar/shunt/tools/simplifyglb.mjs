// Simplifies a GLB's geometry to about a target triangle count with meshoptimizer (weld first so the simplifier can collapse edges;
// UV seams and borders are respected so the texture still fits; where seams stop it short, a sloppy pass finishes). Textures untouched.
//   node tools/simplifyglb.mjs <in.glb> <out.glb> <targetTriangles> [maxError, default 0.02 of the model size]
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [src, out, target, err = '0.02'] = process.argv.slice(2); const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc = await io.read(src);
const tris = () => { let n = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); n += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return n; };
const before = tris(); await MeshoptSimplifier.ready;
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, Number(target) / before), error: Number(err), lockBorder: false }));
// UV seams stop the careful simplifier short of the target; then the sloppy one (meshoptimizer's simplifySloppy) takes it the rest of the way
if (tris() > Number(target) * 1.1) for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const idx = p.getIndices(), pos = p.getAttribute('POSITION'); const want = Math.floor(Number(target) / doc.getRoot().listMeshes().length) * 3;   // an index count
  const ia = new Uint32Array(idx.getArray()); const [out] = MeshoptSimplifier.simplifySloppy(ia, new Float32Array(pos.getArray()), 3, null, want, Number(err));
  idx.setArray(new Uint32Array(out));
}
await doc.transform(dedup(), prune());
await io.write(out, doc); console.log(src.split('/').pop(), before, '->', tris(), 'triangles,', (fs.statSync(src).size / 1024).toFixed(0), '->', (fs.statSync(out).size / 1024).toFixed(0), 'KB');
