// Builds src/assets/wpn_gatling.glb: the hood-mounted gatling gun. Original design, three parts and three materials so it costs three
// draw calls: a housing (dark metal), a trim (cyan, emissive: the game boosts it with every muzzle flash) and a barrel cluster (a named
// node the game spins about its z axis). Named nodes the game looks up: barrel_cluster, muzzle, eject. Metres; forward is -z; the
// origin is the centre of the mount plate on the hood; the gun is about 1.55 m long and 0.45 m tall.
//   node tools/make-gatling.mjs
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'node:fs';
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend && this.onloadend({ target: this }); }); } readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = 'data:' + (b.type || 'application/octet-stream') + ';base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend({ target: this }); }); } };
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cyl = (r, len, x, y, z, seg = 12) => { const g = new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
const flat = (gs) => mergeGeometries(gs.map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }), false);
const AX = 0.30;   // height of the barrel axis above the mount plate
// housing: mount plate, side cheeks, rear body and motor cap, ammo box and feed chute, a fixed front collar either side of the barrels
const housing = flat([
  box(0.56, 0.05, 0.74, 0, 0.025, 0.02), box(0.06, 0.28, 0.46, 0.2, 0.19, -0.02), box(0.06, 0.28, 0.46, -0.2, 0.19, -0.02),
  box(0.34, 0.30, 0.52, 0, AX, 0.26), box(0.26, 0.2, 0.12, 0, AX + 0.02, 0.58), cyl(0.07, 0.1, 0, AX, 0.66, 16),
  box(0.22, 0.2, 0.42, -0.3, 0.2, 0.26), box(0.15, 0.07, 0.16, -0.17, AX + 0.03, 0.2),
  box(0.1, 0.08, 0.18, 0.2, AX + 0.12, -0.28), box(0.1, 0.08, 0.18, -0.2, AX + 0.12, -0.28), box(0.16, 0.18, 0.1, 0, AX - 0.02, -0.1),
]);
// trim: thin cyan strips along the rear body, a cross strip, and a ring around the muzzle clamp
const trim = flat([
  box(0.035, 0.014, 0.44, 0.1, AX + 0.157, 0.26), box(0.035, 0.014, 0.44, -0.1, AX + 0.157, 0.26), box(0.30, 0.014, 0.03, 0, AX + 0.157, 0.04),
  box(0.014, 0.05, 0.3, 0.177, AX, 0.26), box(0.014, 0.05, 0.3, -0.177, AX, 0.26), cyl(0.121, 0.025, 0, AX, -0.86, 24),
]);
// barrels: six tubes round a hub, three clamp rings, a muzzle brake collar; the cluster turns about z
const parts = [cyl(0.05, 0.98, 0, 0, -0.44, 12)];
for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; parts.push(cyl(0.026, 0.98, Math.cos(a) * 0.078, Math.sin(a) * 0.078, -0.44, 8)); }
for (const z of [-0.12, -0.5, -0.82]) parts.push(cyl(0.115, 0.045, 0, 0, z, 20));
parts.push(cyl(0.125, 0.07, 0, 0, -0.95, 20));
const barrels = flat(parts);
const mat = (name, color, rough, metal, emissive) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal }); m.name = name; if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1; } return m; };
const root = new THREE.Group(); root.name = 'wpn_gatling';
const mh = new THREE.Mesh(housing, mat('gatling_housing', '#262b34', 0.5, 0.6)); mh.name = 'housing'; root.add(mh);
const mt = new THREE.Mesh(trim, mat('gatling_trim', '#0b6f80', 0.4, 0.2, '#37e6ff')); mt.name = 'trim'; root.add(mt);
const bc = new THREE.Group(); bc.name = 'barrel_cluster'; bc.position.set(0, AX, 0); root.add(bc);
const mb = new THREE.Mesh(barrels, mat('gatling_barrels', '#59606c', 0.32, 0.9)); mb.name = 'barrels'; mb.geometry.translate(0, 0, 0); bc.add(mb);
const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, AX, -1.0); root.add(muzzle);
const eject = new THREE.Object3D(); eject.name = 'eject'; eject.position.set(0.19, AX + 0.06, 0.22); root.add(eject);
const out = await new Promise((res, rej) => new GLTFExporter().parse(root, res, rej, { binary: true }));
fs.mkdirSync(new URL('../src/assets/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../src/assets/wpn_gatling.glb', import.meta.url), Buffer.from(out));
let tris = 0; for (const g of [housing, trim, barrels]) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
console.log('wrote src/assets/wpn_gatling.glb', out.byteLength, 'bytes,', tris, 'triangles, 3 meshes');
