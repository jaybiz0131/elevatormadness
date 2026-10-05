// Prepares a Meshy GLB for the game: textures down to 1024 px and re-encoded as WebP (base colour quality 80, normal map 90),
// every other texture map dropped (the material is tuned in code), unused data pruned. Geometry is left as it is.
//   node tools/prepglb.mjs <in.glb> <out.glb>
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const [src, out] = process.argv.slice(2); if (!src || !out) { console.log('usage: node tools/prepglb.mjs <in.glb> <out.glb>'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc = await io.read(src); const root = doc.getRoot();
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const before = root.listTextures().map(t => ({ name: t.getName() || t.getURI() || '?', mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage().byteLength }));
let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
console.log('in ', kb(fs.statSync(src).size), '|', root.listMeshes().length, 'meshes,', tris, 'triangles,', root.listMaterials().length, 'materials');
for (const t of before) console.log('   texture', t.name, t.mime, t.size && t.size.join('x'), kb(t.bytes));
// keep base colour and normal map; drop the rest (metallic-roughness, occlusion, emissive) from every material
const keep = new Set(); for (const mat of root.listMaterials()) { const b = mat.getBaseColorTexture(), n = mat.getNormalTexture(); if (b) keep.add(b); if (n) keep.add(n);
  for (const [name, get, set] of [['metallicRoughness', 'getMetallicRoughnessTexture', 'setMetallicRoughnessTexture'], ['occlusion', 'getOcclusionTexture', 'setOcclusionTexture'], ['emissive', 'getEmissiveTexture', 'setEmissiveTexture']]) if (mat[get]()) { console.log('   dropped', name, 'map from', mat.getName() || 'material'); mat[set](null); } }
await doc.transform(dedup(), prune());
const role = (t) => root.listMaterials().some(m => m.getNormalTexture() === t) ? 'normal' : 'base';
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 90, slots: /^normalTexture$/ }), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80, slots: /^baseColorTexture$/ }));
await doc.transform(prune());
await io.write(out, doc);
const after = root.listTextures().map(t => ({ name: t.getName() || '?', mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage().byteLength, role: role(t) }));
console.log('out', kb(fs.statSync(out).size));
for (const t of after) console.log('   texture', t.role, t.name, t.mime, t.size && t.size.join('x'), kb(t.bytes));
