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
  hotel_tower: { size: ['y', 70], cap: 1, shadow: true, lights: 'windows' },   // landmarks: one each, see LANDMARKS in city.js
  radio_tower: { size: ['y', 80], cap: 1, shadow: true, lights: 'tower' },
  parking_garage: { size: ['x', 40], cap: 1, shadow: true, lights: 'decks' },
};
// night lights for the landmarks, computed in the model's own space (metres, base at y = 0): the hotel's lit windows (a random mix of
// warm and cool, most dark) and magenta neon bands at the roof line and every 17.5 m; the garage's cool deck strips and a cyan roof band;
// the radio tower's red warning lights (its tip and three bands, blinking with PROP_BLINK, set each frame by city.js)
export const PROP_BLINK = { value: 1 };
function addLights(m, kind, H) {
  m.onBeforeCompile = (sh) => { sh.uniforms.uBlink = PROP_BLINK; sh.uniforms.uH = { value: H };
    sh.vertexShader = 'varying vec3 vOP; varying vec3 vON;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP = position; vON = normal;');
    const body = {
      windows: `float side = 1.0 - step(0.5, abs(vON.y)); vec2 cell = vec2((vOP.x + vOP.z) / 3.0, vOP.y / 3.4); vec2 ic = floor(cell), fr = fract(cell);
        float win = step(0.22, fr.x) * step(fr.x, 0.78) * step(0.28, fr.y) * step(fr.y, 0.72) * step(4.0, vOP.y) * step(vOP.y, uH - 3.0);
        float h = fract(sin(dot(ic, vec2(12.9898, 78.233))) * 43758.5453); float lit = step(0.52, h);
        vec3 wc = mix(vec3(1.0, 0.72, 0.42), vec3(0.55, 0.8, 1.0), step(0.8, h)); glowAdd += side * win * lit * wc * 1.5;
        float band = (1.0 - step(0.5, abs(vOP.y - (uH - 1.2)))) + (1.0 - step(0.25, abs(mod(vOP.y, 17.5) - 0.3))) * step(6.0, vOP.y);
        glowAdd += side * min(band, 1.0) * vec3(1.0, 0.18, 0.82) * 2.6;`,
      decks: `float side = 1.0 - step(0.5, abs(vON.y)); float lvl = uH / 5.0; float strip = 1.0 - step(0.06, fract(vOP.y / lvl));
        glowAdd += side * strip * step(1.0, vOP.y) * vec3(0.8, 0.92, 1.0) * 1.3; glowAdd += side * (1.0 - step(0.45, abs(vOP.y - (uH - 0.6)))) * vec3(0.13, 0.9, 1.0) * 2.4;`,
      tower: `float tip = step(uH * 0.965, vOP.y); float bands = 0.0; for (int i = 1; i <= 3; i++) bands += 1.0 - step(0.5, abs(vOP.y - uH * float(i) * 0.24));
        glowAdd += (tip + min(bands, 1.0)) * vec3(1.0, 0.08, 0.05) * 4.0 * uBlink;`,
    }[kind];
    sh.fragmentShader = 'varying vec3 vOP; varying vec3 vON; uniform float uBlink; uniform float uH;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { vec3 glowAdd = vec3(0.0);\n' + body + '\n totalEmissiveRadiance += glowAdd; }'); };
  m.customProgramCacheKey = () => 'prop-lights-' + kind;
}
async function loadOne(url, [axis, metres], lights) {
  const gltf = await new GLTFLoader().loadAsync(url); gltf.scene.updateMatrixWorld(true);
  const parts = []; let mat = null;
  gltf.scene.traverse((o) => { if (!o.isMesh) return; if (!mat) mat = o.material; let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); g = g.index ? g.toNonIndexed() : g; parts.push(g); });
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  const box = new Box3().setFromBufferAttribute(geo.attributes.position); const size = box.getSize(new Vector3()), ctr = box.getCenter(new Vector3());
  const k = metres / size[axis]; geo.translate(-ctr.x, -box.min.y, -ctr.z); geo.scale(k, k, k); const fixed = geo.attributes.normal ? fixNormals(geo) : (geo.computeVertexNormals(), 0); geo.computeBoundingSphere();
  const m = new MeshStandardMaterial({ map: mat && mat.map || null, normalMap: mat && mat.normalMap || null, roughness: 0.75, metalness: 0.1, envMapIntensity: 0.8 });
  if (mat && mat.normalScale) m.normalScale.copy(mat.normalScale);
  if (lights) addLights(m, lights, size.y * k);
  return { geo, material: m, fixedNormals: fixed, size: [size.x * k, size.y * k, size.z * k].map(v => +v.toFixed(2)), triangles: geo.attributes.position.count / 3 };
}
export async function loadPropModels(scene) {
  const out = {}, info = {};
  for (const [name, spec] of Object.entries(PROPS)) {
    const url = MODELS[name]; if (!url) continue;
    try { const r = await loadOne(url, spec.size, spec.lights); const mesh = new InstancedMesh(r.geo, r.material, spec.cap); mesh.count = 0; mesh.castShadow = spec.shadow; mesh.frustumCulled = false; mesh.name = 'prop-' + name; scene.add(mesh); out[name] = mesh; info[name] = { size: r.size, triangles: r.triangles, fixedNormals: r.fixedNormals }; }
    catch (e) { info[name] = { error: String(e && e.message || e).slice(0, 120) }; }
  }
  return { meshes: out, info };
}
