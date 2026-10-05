// The showroom title screen: the hero on a slow turntable under studio light, on a dark glossy floor, with neon haze behind. Its own
// small scene, drawn through the game's post chain (bloom, tone mapping, grade) while the title card is up; the city is not drawn then.
// The floor reflection is a mirrored copy of the car and the neon under a part-transparent floor (no extra render pass). The paint
// reads from a studio environment map (a dark room with softboxes), pre-filtered once. Neon is magenta, violet and warm white:
// cyan stays the hero's alone. About 12 draw calls in the main pass.
import { Scene, Color, FogExp2, Group, Mesh, InstancedMesh, PlaneGeometry, BoxGeometry, SphereGeometry, CircleGeometry, MeshBasicMaterial, MeshStandardMaterial, DirectionalLight, HemisphereLight, PerspectiveCamera, PMREMGenerator, CanvasTexture, SRGBColorSpace, AdditiveBlending, BackSide, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HEAD_K } from './heroModel.js';
const BG = new Color('#05060b');
function radial(stops, size = 256, srgb = true) { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); for (const [t, col] of stops) g.addColorStop(t, col); x.fillStyle = g; x.fillRect(0, 0, size, size); const t = new CanvasTexture(c); if (srgb) t.colorSpace = SRGBColorSpace; return t; }
// a copy of the loaded hero that shares its geometry and materials (no userData copy: it holds the whole body mesh)
function copyCar(src) {
  const g = new Group();
  for (const c of src.children) { let m; if (c.isInstancedMesh) { m = new InstancedMesh(c.geometry, c.material, c.count); m.instanceMatrix.array.set(c.instanceMatrix.array); } else m = new Mesh(c.geometry, c.material); m.position.copy(c.position); m.quaternion.copy(c.quaternion); m.scale.copy(c.scale); m.frustumCulled = false; g.add(m); }
  return g;
}
// the neon wall: vertical tubes of mixed heights on an arc behind the car, one merged mesh, colours over 1 so they bloom
function neonGeometry() {
  const parts = []; const cols = [[3.2, 0.35, 2.6], [1.6, 0.5, 3.4], [3.0, 2.2, 1.4]];   // magenta, violet, warm white (linear, HDR)
  const add = (g, col) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(col, i * 3); g.setAttribute('color', new Float32BufferAttribute(a, 3)); g.deleteAttribute('uv'); parts.push(g); };
  // two staggered rows behind the car, inside the narrow portrait view (about 8 m either side at that depth)
  for (let i = 0; i < 26; i++) { const row = i % 2, x = -9 + i * 0.72, z = row ? -11 : -8.5, h = 1.2 + ((i * 7) % 5) * 0.5 + row * 0.9; const g = new BoxGeometry(0.08, h, 0.08).translate(x, h / 2 + 0.25, z); add(g, cols[(i * 5) % 7 === 0 ? 2 : (i % 3 === 0 ? 1 : 0)]); }
  return mergeGeometries(parts, false);
}
// the studio light for the paint: a dark room with a big soft top light, a magenta strip on one side, a violet strip on the other and
// a warm kicker low in front, pre-filtered once
function studioEnv(renderer) {
  const s = new Scene(); s.add(new Mesh(new SphereGeometry(40, 16, 8), new MeshBasicMaterial({ color: new Color('#07080d'), side: BackSide })));
  const box = (w, h, col, k, x, y, z, rx = 0, ry = 0) => { const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(col).multiplyScalar(k), side: 2 })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
  box(16, 8, '#ffffff', 3.2, 0, 14, 0, Math.PI / 2);          // top softbox
  box(2.2, 12, '#ff3fc8', 2.6, -16, 6, -2, 0, Math.PI / 2);   // magenta strip, left
  box(2.2, 12, '#8a5aff', 2.4, 16, 6, 2, 0, -Math.PI / 2);    // violet strip, right
  box(12, 1.6, '#ffd2a0', 1.6, 0, 1.5, 18, 0, Math.PI);       // warm kicker, front
  const pm = new PMREMGenerator(renderer); const t = pm.fromScene(s, 0.02).texture; pm.dispose(); return t;
}
export function createShowroom(renderer, hero, aspect) {
  const scene = new Scene(); scene.background = BG; scene.fog = new FogExp2(BG.getHex(), 0.03); scene.environment = studioEnv(renderer); scene.environmentIntensity = 1.0;
  const key = new DirectionalLight(new Color('#f2f4ff'), 2.4); key.position.set(5, 9, 7); scene.add(key);
  const rimL = new DirectionalLight(new Color('#ff4fd0'), 2.2); rimL.position.set(-8, 3, -6); scene.add(rimL);
  const rimR = new DirectionalLight(new Color('#9a7aff'), 1.6); rimR.position.set(8, 2.5, -5); scene.add(rimR);
  scene.add(new HemisphereLight(new Color('#3a3f66'), new Color('#08080c'), 0.5));
  // the turntable: the car and its mirror image under the floor turn together
  const table = new Group(); scene.add(table); const car = copyCar(hero); table.add(car);
  const mirror = new Group(); mirror.scale.y = -1; mirror.add(copyCar(hero)); table.add(mirror);
  const neonMat = new MeshBasicMaterial({ vertexColors: true }); const neonGeo = neonGeometry();
  scene.add(new Mesh(neonGeo, neonMat)); const neonMirror = new Mesh(neonGeo, neonMat); neonMirror.scale.y = -1; scene.add(neonMirror);
  // the floor: dark lacquer, a little see-through near the car so the reflection is strongest under it and fades with distance (the car
  // is HDR under it, so a few per cent of see-through already reads as a clear reflection)
  const floor = new Mesh(new CircleGeometry(40, 48).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: new Color('#05060a'), roughness: 0.3, metalness: 0.0, transparent: true, alphaMap: radial([[0, '#eeeeee'], [0.25, '#f6f6f6'], [0.45, '#ffffff']], 256, false), envMapIntensity: 0.04 }));
  floor.renderOrder = 1; scene.add(floor);
  const flat = (tex, size, col, op, additive, order, y = 0.01) => { const m = new Mesh(new PlaneGeometry(size, size).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: tex, color: col, transparent: true, opacity: op, depthWrite: false, blending: additive ? AdditiveBlending : 1, fog: false })); m.position.y = y; m.renderOrder = order; scene.add(m); return m; };
  flat(radial([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]), 9, new Color(0.13, 0.11, 0.2), 1, true, 2);   // the light pool on the floor
  flat(radial([[0, 'rgba(0,0,0,0.9)'], [0.55, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]), 6.4, new Color(1, 1, 1), 0.85, false, 3, 0.02);              // contact shadow
  // the haze: two soft coloured glows behind the car, facing the camera
  const hazeTex = radial([[0, 'rgba(255,255,255,0.9)'], [0.4, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]);
  const haze = []; for (const [col, x, y, s] of [[new Color(0.2, 0.02, 0.16), -5, 3.5, 18], [new Color(0.08, 0.05, 0.22), 6, 2.5, 16]]) { const m = new Mesh(new PlaneGeometry(s, s * 0.7), new MeshBasicMaterial({ map: hazeTex, color: col, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })); m.position.set(x, y, -12); m.renderOrder = 4; scene.add(m); haze.push(m); }
  const camera = new PerspectiveCamera(26, aspect, 0.5, 200); scene.add(camera);
  // a three-quarter view from a little above the floor; the car sits in the middle band, between the title and the buttons
  function place(aspectNow) { camera.aspect = aspectNow; const tall = aspectNow < 0.7; camera.fov = tall ? 27 : 22; camera.position.set(0, 2.6, tall ? 19.5 : 15); camera.lookAt(0, tall ? 0.15 : 0.5, 0); camera.updateProjectionMatrix(); for (const h of haze) h.lookAt(camera.position); }
  place(aspect);
  function update(dt, elapsed) { table.rotation.y = Math.PI - 0.75 + elapsed * 0.28; HEAD_K.value = 0.55; }   // starts on the front three-quarter
  return { scene, camera, update, resize: place };
}
