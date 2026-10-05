// Prop kit: multi-part props merged into one geometry each, so a lamp (pole, arm, head, lens) or a gantry is one instanced draw.
// Every vertex carries a colour and a glow value; one shared material lights the colour and adds colour x glow as emission, so the
// lens of a lamp or the face of a chevron board blooms while the pole stays matte. Built once at load; nothing here runs per frame.
import { BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, IcosahedronGeometry, ExtrudeGeometry, Shape, Float32BufferAttribute, MeshStandardMaterial, Color } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const C = new Color();
// one part: a geometry, its colour, how much it glows (0 = matte), placed by translate/rotate before tagging
export function part(geo, hex, glow = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose(); C.set(hex); const n = g.attributes.position.count; const col = new Float32Array(n * 3), gl = new Float32Array(n);
  for (let i = 0; i < n; i++) { col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; gl[i] = glow; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3)); g.setAttribute('glow', new Float32BufferAttribute(gl, 1)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'glow'].includes(k)) g.deleteAttribute(k); return g;
}
export function assemble(parts) { const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); g.computeBoundingSphere(); return g; }
// the shared material: vertex colours, per-vertex glow scaled by the look's neon value (uGlow)
export const kitGlow = { value: 1 };
export function kitMaterial(extra = {}) {
  const m = new MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.7, metalness: 0.15 }, extra));
  m.onBeforeCompile = (sh) => { sh.uniforms.uGlow = kitGlow; sh.vertexShader = 'attribute float glow; varying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = glow;'); sh.fragmentShader = 'varying float vGlow; uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vGlow * uGlow;'); };
  m.customProgramCacheKey = () => 'kit'; return m;
}
const box = (w, h, d, x = 0, y = 0, z = 0) => new BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r0, r1, h, seg, x = 0, y = 0, z = 0) => new CylinderGeometry(r0, r1, h, seg).translate(x, y, z);
// an extruded outline (points in x/y metres), depth d, centred on z
function extrude(pts, d) { const s = new Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return new ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2); }
// the jersey-barrier profile: wide foot, sloped face, narrow top; 1 m long along z, 0.85 m high
function jersey(len = 1, h = 0.85) { return extrude([[-0.3, 0], [0.3, 0], [0.26, 0.08], [0.11, 0.26], [0.08, h], [-0.08, h], [-0.11, 0.26], [-0.26, 0.08]], len); }   // runs along z
export const KIT = {
  // street lamp: tapered pole on a base, a curved arm out over the road (+x), a flat head with a glowing lens underneath
  lamp() { return assemble([part(cyl(0.11, 0.16, 6.2, 8, 0, 3.1, 0), '#4c525e'), part(cyl(0.24, 0.28, 0.5, 8, 0, 0.25, 0), '#3a3f49'), part(box(1.5, 0.12, 0.12, 0.7, 6.3, 0).rotateZ(0), '#4c525e'), part(box(0.12, 0.35, 0.12, 0.05, 6.1, 0), '#4c525e'), part(box(0.95, 0.16, 0.42, 1.35, 6.3, 0), '#2a2e36'), part(box(0.8, 0.04, 0.32, 1.35, 6.2, 0), '#ffd9a0', 2.2)]); },
  // rail post: a short steel post with an amber reflector on +x (the caller turns it to face the road)
  post() { return assemble([part(cyl(0.09, 0.09, 0.95, 6, 0, 0.475, 0), '#7c8594'), part(box(0.05, 0.1, 0.16, 0.09, 0.8, 0), '#ffb02a', 1.4)]); },
  // planter tree: concrete planter, slim trunk, two offset canopy lumps
  tree() { return assemble([part(box(1.4, 0.5, 1.4, 0, 0.25, 0), '#3a3d45'), part(cyl(0.1, 0.16, 2.4, 6, 0, 1.6, 0), '#3b2f26'), part(new IcosahedronGeometry(1.25, 0).translate(0, 3.2, 0), '#24563a'), part(new IcosahedronGeometry(0.9, 0).translate(0.5, 3.9, 0.3), '#2e6a45')]); },
  // billboard: two legs, a catwalk, a framed panel; the face glows (lit from the catwalk lamps)
  board() { return assemble([part(box(0.2, 2.2, 0.2, -1.6, 1.1, 0), '#3b404a'), part(box(0.2, 2.2, 0.2, 1.6, 1.1, 0), '#3b404a'), part(box(5.2, 1.8, 0.25, 0, 3.1, 0), '#1c1f26'), part(box(4.8, 1.4, 0.05, 0, 3.1, 0.14), '#ffd23f', 0.9), part(box(5.2, 0.08, 0.6, 0, 2.15, 0.25), '#3b404a')]); },
  // chevron board: a post and a board with a bold chevron (the colour is passed in; the chevron mark is near-black)
  chevron(hex, dir = 1) { const chev = extrude([[-0.35, -0.45], [-0.05, -0.45], [0.4, 0], [-0.05, 0.45], [-0.35, 0.45], [0.1, 0]].map(([x, y]) => [x * dir, y]), 0.04); return assemble([part(box(0.12, 0.6, 0.12, 0, 0.3, 0), '#5d6675'), part(box(2.1, 1.3, 0.1, 0, 1.2, 0), hex, 0.8), part(chev.translate(0, 1.2, 0.07), '#141414'), part(chev.clone().translate(-0.6, 0, 0), '#141414'), part(chev.clone().translate(0.6, 0, 0), '#141414')]); },
  // roadblock: a striped jersey section 1 m long across the road (scaled along x by the caller)
  block() { const parts = [part(jersey(1, 0.85).rotateY(Math.PI / 2), '#e8e8e8')]; for (const x of [-0.25, 0.25]) parts.push(part(box(0.22, 0.3, 0.62, x, 0.5, 0), '#ff3b3b', 0.5)); parts.push(part(box(0.12, 0.08, 0.12, 0, 0.92, 0), '#ffb02a', 2)); return assemble(parts); },
  // median: a jersey barrier along the road, 1 m long (scaled), with a reflector strip
  median() { return assemble([part(jersey(1, 0.85), '#8a8f99'), part(box(0.18, 0.05, 0.9, 0, 0.62, 0).translate(0, 0, 0), '#ffb02a', 0.7)]); },
  // launch ramp: a true wedge (1 m cube scaled by the caller) with chevron stripes up the deck
  ramp() { const w = extrude([[-0.5, 0], [0.5, 0], [0.5, 1]], 1).rotateY(Math.PI / 2); return assemble([part(w, '#c9ced6'), part(box(1.01, 0.05, 0.05, 0, 0.98, -0.5), '#ffd23f', 2.2), part(box(1.01, 0.02, 0.06, 0, 0.01, 0.48), '#ffd23f', 1.2), part(box(0.04, 0.5, 1.0, -0.5, 0.25, 0).translate(0, 0, 0), '#ff3b3b', 0.4), part(box(0.04, 0.5, 1.0, 0.5, 0.25, 0), '#ff3b3b', 0.4)]); },   // high lip forward (-z)
  // supply crate: framed box with a glowing band (pickups must read brightest)
  crate() { const parts = [part(box(1.3, 1.3, 1.3, 0, 0.75, 0), '#d8a92a', 0.35)]; for (const x of [-0.68, 0.68]) for (const z of [-0.68, 0.68]) parts.push(part(box(0.14, 1.5, 0.14, x, 0.75, z), '#3a3020')); parts.push(part(box(1.42, 0.16, 1.42, 0, 0.75, 0), '#fff1a0', 1.6)); return assemble(parts); },
  // oil drum: ribbed barrel with two hazard bands
  barrel() { return assemble([part(cyl(0.52, 0.52, 1.5, 12, 0, 0.8, 0), '#ff7a1c'), part(cyl(0.55, 0.55, 0.08, 12, 0, 0.3, 0), '#2a2a2a'), part(cyl(0.55, 0.55, 0.08, 12, 0, 1.3, 0), '#2a2a2a'), part(cyl(0.53, 0.53, 0.18, 12, 0, 0.8, 0), '#f2f2f2', 0.4), part(cyl(0.45, 0.45, 0.04, 12, 0, 1.56, 0), '#3a3a3a')]); },
  // traffic cone: square base, cone, a reflective collar
  cone() { return assemble([part(box(0.75, 0.06, 0.75, 0, 0.03, 0), '#2a2a2a'), part(new ConeGeometry(0.33, 1.0, 10).translate(0, 0.56, 0), '#ff7a1c'), part(cyl(0.2, 0.25, 0.16, 10, 0, 0.62, 0), '#f2f2f2', 0.5)]); },
  // overhead gantry: two posts 10.5 m apart, a truss beam, the board (the text label sits on its face)
  gantry() { const p = []; for (const x of [-5.25, 5.25]) p.push(part(cyl(0.16, 0.2, 5.4, 8, x, 2.7, 0), '#7c8594')); p.push(part(box(12.4, 0.2, 0.2, 0, 5.2, -0.3), '#7c8594'), part(box(12.4, 0.2, 0.2, 0, 2.8, -0.3), '#7c8594'), part(box(12, 2.8, 0.2, 0, 4.0, 0), '#1f6b3a'), part(box(12.1, 0.08, 0.3, 0, 5.45, 0.05), '#d8dce4', 1.2)); return assemble(p); },
  // name-board post (corner boards and small signs)
  signPost() { return assemble([part(cyl(0.08, 0.1, 2.4, 6, 0, 1.2, 0), '#8a929e')]); },
  // spectator: legs, body, head, in a random-looking jacket colour per instance band (colour picked by the caller's batch)
  spectator(hex) { return assemble([part(box(0.34, 0.8, 0.22, 0, 0.4, 0), '#23252b'), part(box(0.46, 0.65, 0.28, 0, 1.12, 0), hex), part(new SphereGeometry(0.14, 6, 4).translate(0, 1.6, 0), '#c89a78')]); },
  // city: bollard with a lit band, bench, vending machine (glowing front), hydrant, overpass pillar and deck, steam vent grate
  bollard() { return assemble([part(cyl(0.13, 0.16, 1, 8, 0, 0.5, 0), '#6b7380'), part(cyl(0.14, 0.14, 0.08, 8, 0, 0.85, 0), '#7ad8ff', 1.5)]); },
  bench() { return assemble([part(box(1.8, 0.08, 0.5, 0, 0.45, 0), '#6a4e36'), part(box(1.8, 0.4, 0.06, 0, 0.75, -0.24), '#6a4e36'), part(box(0.08, 0.45, 0.45, -0.8, 0.22, 0), '#2a2d33'), part(box(0.08, 0.45, 0.45, 0.8, 0.22, 0), '#2a2d33')]); },
  vending() { return assemble([part(box(1, 1.9, 0.8, 0, 0.95, 0), '#22283a'), part(box(0.8, 1.2, 0.04, -0.05, 1.15, 0.41), '#7ad8ff', 1.4), part(box(0.15, 0.5, 0.04, 0.38, 1.1, 0.41), '#ff2fd0', 1.2)]); },
  hydrant() { return assemble([part(cyl(0.16, 0.2, 0.7, 8, 0, 0.35, 0), '#d92f2f'), part(new SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.7, 0), '#d92f2f'), part(cyl(0.07, 0.07, 0.42, 6, 0, 0.45, 0).rotateZ(Math.PI / 2), '#b02424')]); },
  pillar() { return assemble([part(box(1.6, 7, 1.6, 0, 3.5, 0), '#3a3f4c'), part(box(2.2, 0.5, 2.2, 0, 6.85, 0), '#30343e'), part(box(1.7, 0.25, 1.7, 0, 1.0, 0), '#ffb02a', 0.6)]); },
  // overpass deck, 1 m wide along x (scaled by road width), 4 m deep: slab, two girders under it, side parapets with a light strip
  deck() { return assemble([part(box(1, 0.9, 4, 0, 0.45, 0), '#2c3038'), part(box(1, 0.6, 0.4, 0, -0.3, -1.3), '#252830'), part(box(1, 0.6, 0.4, 0, -0.3, 1.3), '#252830'), part(box(1, 0.9, 0.2, 0, 1.35, -1.9), '#3a3f4c'), part(box(1, 0.9, 0.2, 0, 1.35, 1.9), '#3a3f4c'), part(box(1, 0.06, 0.06, 0, 0.0, -2.02), '#22e6ff', 2.5), part(box(1, 0.06, 0.06, 0, 0.0, 2.02), '#22e6ff', 2.5)]); },
  vent() { const p = [part(cyl(0.65, 0.72, 0.18, 10, 0, 0.09, 0), '#3e434d')]; for (let i = -2; i <= 2; i++) p.push(part(box(1.0, 0.05, 0.08, 0, 0.2, i * 0.2), '#1c1f24')); return assemble(p); },
};
