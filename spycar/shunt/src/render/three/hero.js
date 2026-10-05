// The hero car, built from Jack's reference views (design/concepts/hero/): a lofted body (cross-sections along the length, so the
// plan view tapers to the arrow nose and swells at the hips), a glass cabin with a painted roof panel, splitter, diffuser, side gun
// pods, dorsal fin, ducktail, mirrors, hood vents and deck louvres, big wheels. Lights are HDR emissive so the bloom lifts them.
// Original work: no badge, no borrowed light signature. Forward is -z, up is +y, the car is `L` metres long, centred at the origin.
import { BufferGeometry, Float32BufferAttribute, Mesh, Group, BoxGeometry, CylinderGeometry, MeshStandardMaterial, MeshBasicMaterial, Color } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const HERO = { length: 4.6, width: 2.05 };
// loft: sections = [{ z, pts: [[x, y], ...] }], all with the same point count, closed rings; returns a BufferGeometry with flat normals
function loft(sections, capStart = true, capEnd = true) {
  const pos = []; const n = sections[0].pts.length;
  const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const P = (s, i) => [s.pts[i % n][0], s.pts[i % n][1], s.z];
  for (let k = 0; k + 1 < sections.length; k++) { const A = sections[k], B = sections[k + 1]; for (let i = 0; i < n; i++) { tri(P(A, i), P(B, i), P(B, i + 1)); tri(P(A, i), P(B, i + 1), P(A, i + 1)); } }
  const cap = (s, flip) => { const c = [0, s.pts.reduce((a, p) => a + p[1], 0) / n, s.z]; for (let i = 0; i < n; i++) { const a = P(s, i), b = P(s, i + 1); if (flip) tri(c, b, a); else tri(c, a, b); } };
  if (capStart) cap(sections[0], false); if (capEnd) cap(sections[sections.length - 1], true);
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
// a body ring: 10 points clockwise seen from the front, from the bottom left round the shoulder and the crown to the bottom right
function ring(w, h0, h1, crown, flank = 0.12) { return [[-w * 0.92, h0], [-w, h0 + flank], [-w * 0.98, h1 - 0.04], [-w * 0.9, h1], [-w * 0.45, h1 + crown * 0.7], [0, h1 + crown], [w * 0.45, h1 + crown * 0.7], [w * 0.9, h1], [w * 0.98, h1 - 0.04], [w, h0 + flank], [w * 0.92, h0]]; }
function rect(w, y0, y1, taper = 1) { return [[-w, y0], [-w * taper, y1], [w * taper, y1], [w, y0]]; }
// every static mesh that shares a material becomes one mesh: same look, a fraction of the draw calls. Only the materials in `shadowMats` cast shadows.
function mergeByMaterial(group, shadowMats) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || child.userData.keep) continue;
    child.updateMatrix(); let geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone(); geo.deleteAttribute('uv'); if (!geo.attributes.normal) geo.computeVertexNormals(); geo.applyMatrix4(child.matrix);
    if (!buckets.has(child.material)) buckets.set(child.material, []); buckets.get(child.material).push(geo); group.remove(child); child.geometry.dispose();
  }
  for (const [mat, list] of buckets) { const mesh = new Mesh(mergeGeometries(list, false), mat); mesh.castShadow = shadowMats.has(mat); group.add(mesh); for (const g of list) g.dispose(); }
}
export function buildHero(opts = {}) {
  const L = HERO.length, W = HERO.width, hw = W / 2; const z = (u) => -L / 2 + u * L;
  const paintColor = new Color(opts.paint || '#f4f6fa'); const accent = new Color(opts.accent || '#37e6ff');
  const M = {
    paint: new MeshStandardMaterial({ color: paintColor, roughness: opts.roughness ?? 0.32, metalness: opts.metalness ?? 0.35, envMapIntensity: opts.envMapIntensity ?? 1.3, emissive: new Color(opts.emissive || '#000000'), emissiveIntensity: opts.emissiveIntensity ?? 1 }),
    paint2: new MeshStandardMaterial({ color: new Color(opts.paint2 || opts.paint || '#f4f6fa'), roughness: 0.32, metalness: 0.35, envMapIntensity: 1.3 }),
    glass: new MeshStandardMaterial({ color: new Color('#16243a'), roughness: 0.1, metalness: 0.5, envMapIntensity: 2.0 }),
    trim: new MeshStandardMaterial({ color: new Color('#15181f'), roughness: 0.55, metalness: 0.4 }),
    tyre: new MeshStandardMaterial({ color: new Color('#0e1012'), roughness: 0.92 }),
    rim: new MeshStandardMaterial({ color: new Color('#2a2e36'), roughness: 0.35, metalness: 0.8 }),
    head: new MeshBasicMaterial({ color: accent.clone().multiplyScalar(opts.lightHdr ?? 7.0) }),
    tail: new MeshBasicMaterial({ color: new Color(5.0, 0.4, 0.35) }),
    tailAccent: new MeshBasicMaterial({ color: accent.clone().multiplyScalar(5.0) }),
    glow: new MeshBasicMaterial({ color: accent.clone().multiplyScalar(4.0) }),
  };
  const g = new Group(); const H0 = 0.27;   // sill height (ground clearance)
  // body: stations from the arrow nose to the tail; w = half width, h1 = shoulder/deck height, crown = centre rise over the shoulder
  const body = [
    { z: z(0.00), pts: ring(0.30, H0 + 0.08, 0.50, 0.03, 0.06) },
    { z: z(0.05), pts: ring(0.62, H0 + 0.02, 0.56, 0.05, 0.10) },
    { z: z(0.13), pts: ring(0.84, H0, 0.66, 0.07) },
    { z: z(0.22), pts: ring(0.96, H0, 0.74, 0.08) },
    { z: z(0.32), pts: ring(1.00, H0, 0.80, 0.06) },
    { z: z(0.45), pts: ring(0.97, H0, 0.82, 0.04) },
    { z: z(0.58), pts: ring(0.98, H0, 0.84, 0.04) },
    { z: z(0.72), pts: ring(1.02, H0, 0.90, 0.05) },
    { z: z(0.86), pts: ring(1.02, H0, 0.94, 0.05) },
    { z: z(0.96), pts: ring(0.98, H0 + 0.02, 0.98, 0.06) },
    { z: z(1.00), pts: ring(0.90, H0 + 0.10, 0.92, 0.04, 0.10) },
  ].map(s => ({ z: s.z, pts: s.pts.map(([x, y]) => [x * hw, y]) }));
  const bodyMesh = new Mesh(loft(body), M.paint); bodyMesh.castShadow = true; g.add(bodyMesh);
  // cabin: a tapered glass canopy from the cowl to the deck; windshield base at u 0.34, roof peak 1.17 m at u 0.55, tail of the canopy at 0.80
  const cab = [
    { z: z(0.33), pts: rect(0.68, 0.80, 0.82, 0.9) }, { z: z(0.42), pts: rect(0.66, 0.84, 1.04, 0.8) }, { z: z(0.52), pts: rect(0.64, 0.85, 1.16, 0.74) },
    { z: z(0.62), pts: rect(0.62, 0.86, 1.17, 0.74) }, { z: z(0.72), pts: rect(0.60, 0.88, 1.08, 0.78) }, { z: z(0.81), pts: rect(0.56, 0.92, 0.94, 0.9) },
  ].map(s => ({ z: s.z, pts: s.pts.map(([x, y]) => [x * hw, y]) }));
  const cabMesh = new Mesh(loft(cab), M.glass); g.add(cabMesh);
  // painted roof panel and the deck spine (dorsal fin) behind it
  const roof = new Mesh(new BoxGeometry(hw * 0.95, 0.04, L * 0.17), M.paint2); roof.position.set(0, 1.175, z(0.605)); g.add(roof);
  const fin = new Mesh(new BoxGeometry(0.06, 0.26, L * 0.2), M.paint2); fin.position.set(0, 0.98, z(0.9)); fin.rotation.x = -0.12; g.add(fin);
  // splitter and diffuser, both dark; a ducktail lip on the tail
  const splitter = new Mesh(new BoxGeometry(W * 0.98, 0.05, 0.36), M.trim); splitter.position.set(0, H0 - 0.02, z(0.045)); g.add(splitter);
  const diffuser = new Mesh(new BoxGeometry(W * 0.9, 0.16, 0.3), M.trim); diffuser.position.set(0, H0 + 0.06, z(0.98)); g.add(diffuser);
  const duck = new Mesh(new BoxGeometry(W * 0.86, 0.05, 0.26), M.paint2); duck.position.set(0, 1.0, z(0.99)); duck.rotation.x = 0.22; g.add(duck);
  const wing = new Mesh(new BoxGeometry(W * 0.92, 0.035, 0.24), M.paint2); wing.position.set(0, 1.16, z(0.965)); wing.rotation.x = 0.12; g.add(wing); for (const sx of [-1, 1]) { const post = new Mesh(new BoxGeometry(0.05, 0.18, 0.14), M.trim); post.position.set(sx * hw * 0.62, 1.07, z(0.965)); g.add(post); }
  // hood vents and deck louvres (dark slits), mirrors, side intakes
  for (const sx of [-1, 1]) { const v = new Mesh(new BoxGeometry(0.16, 0.02, 0.34), M.trim); v.position.set(sx * 0.32, 0.72, z(0.17)); v.rotation.y = sx * 0.25; g.add(v); }
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const lv = new Mesh(new BoxGeometry(0.3, 0.03, 0.06), M.trim); lv.position.set(sx * 0.42, 0.96 + i * 0.005, z(0.82 + i * 0.03)); g.add(lv); }
  for (const sx of [-1, 1]) { const mr = new Mesh(new BoxGeometry(0.22, 0.08, 0.14), M.trim); mr.position.set(sx * (hw + 0.1), 0.98, z(0.4)); g.add(mr); const intake = new Mesh(new BoxGeometry(0.06, 0.26, 0.5), M.trim); intake.position.set(sx * (hw * 0.99), 0.62, z(0.68)); g.add(intake); }
  // (the side gun pods are gone: the gatling on the hood, wpn_gatling.glb, replaces the machine guns; cars.js attaches it)
  // wheels: 0.72 m, pushed to the corners, dark rims with five spokes
  const R = 0.36; const wheelGeo = new CylinderGeometry(R, R, 0.3, 24).rotateZ(Math.PI / 2); const rimGeo = new CylinderGeometry(R * 0.66, R * 0.66, 0.32, 16).rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const u of [0.2, 0.805]) { const w = new Mesh(wheelGeo, M.tyre); w.position.set(sx * (hw - 0.08), R, z(u)); w.castShadow = true; g.add(w); const r = new Mesh(rimGeo, M.rim); r.position.copy(w.position); g.add(r); for (let s = 0; s < 5; s++) { const sp = new Mesh(new BoxGeometry(0.34, 0.05, R * 1.1), M.trim); sp.position.copy(w.position); sp.rotation.x = s * Math.PI * 2 / 5; g.add(sp); } }
  // lights: slanted head bars either side of the nose joined by a thin full-width blade, thick underglow strips along each sill
  for (const sx of [-1, 1]) { const hb = new Mesh(new BoxGeometry(0.46, 0.07, 0.07), M.head); hb.position.set(sx * 0.55, 0.63, z(0.085)); hb.rotation.y = sx * 0.35; hb.rotation.z = sx * 0.12; g.add(hb); }
  const nose = new Mesh(new BoxGeometry(W * 0.62, 0.025, 0.03), M.head); nose.position.set(0, 0.555, z(0.035)); g.add(nose);
  for (const sx of [-1, 1]) { const ug = new Mesh(new BoxGeometry(0.05, 0.04, L * 0.64), M.glow); ug.position.set(sx * (hw * 0.93), H0 + 0.03, z(0.5)); g.add(ug); const sill = new Mesh(new BoxGeometry(0.08, 0.06, L * 0.6), M.paint2); sill.position.set(sx * (hw * 0.98), H0 + 0.1, z(0.5)); g.add(sill); }
  // rear fascia: a dark inset panel, a full-width red tail bar with cyan corner blades below it, diffuser blades, twin exhausts
  const fascia = new Mesh(new BoxGeometry(W * 0.86, 0.3, 0.06), M.trim); fascia.position.set(0, 0.66, z(1.0) + 0.01); g.add(fascia);
  const tb = new Mesh(new BoxGeometry(W * 0.84, 0.07, 0.06), M.tail); tb.position.set(0, 0.9, z(1.0) + 0.02); g.add(tb);
  for (const sx of [-1, 1]) { const cb = new Mesh(new BoxGeometry(0.05, 0.3, 0.06), M.tailAccent); cb.position.set(sx * (hw * 0.86), 0.68, z(1.0) + 0.025); g.add(cb); const ex = new Mesh(new CylinderGeometry(0.06, 0.07, 0.2, 10).rotateX(Math.PI / 2), M.rim); ex.position.set(sx * 0.42, H0 + 0.2, z(0.99)); g.add(ex); }
  for (let i = -2; i <= 2; i++) { const blade = new Mesh(new BoxGeometry(0.03, 0.14, 0.34), M.trim); blade.position.set(i * 0.3, H0 + 0.02, z(0.96)); g.add(blade); }
  const dg = new Mesh(new BoxGeometry(W * 0.7, 0.02, 0.03), M.glow); dg.position.set(0, H0 + 0.14, z(1.0) + 0.02); g.add(dg);
  mergeByMaterial(g, new Set([M.paint, M.paint2, M.tyre]));   // about 90 small meshes become ten draw calls (the budget is 150 for the whole frame)
  g.userData.materials = M; return g;
}
