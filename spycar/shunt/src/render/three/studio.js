// Concept studio (?concepts=1): original hero-car silhouettes built from code, lit with the game's own key light, environment and
// post, shown from the gameplay angle and a three-quarter view. Nothing here references a real car. Each design is a side profile
// (nose to tail, in metres) extruded across the width, a narrower cabin profile, wheels, lights and trim. Pick one, then it becomes
// the player model in cars.js.
import { Scene, Color, DirectionalLight, HemisphereLight, Vector3, Mesh, Shape, ExtrudeGeometry, CylinderGeometry, BoxGeometry, MeshStandardMaterial, MeshBasicMaterial, PlaneGeometry, Group, PerspectiveCamera, PCFShadowMap, WebGLRenderer, CanvasTexture, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from './sky.js';
import { createPost } from './post.js';
import { LOOKS } from './looks.js';
import { buildHero } from './hero.js';
// profile points are [x along the car from the nose (0) to the tail (1), height in metres]; the car is `length` metres long
export const DESIGNS = [
  { name: 'A  Wedge', length: 4.5, width: 1.95, paint: '#37e6ff', body: [[0, 0.32], [0.02, 0.5], [0.42, 0.78], [0.98, 0.92], [1, 0.42], [0.96, 0.3]], cabin: [[0.4, 0.78], [0.5, 1.12], [0.78, 1.14], [0.9, 0.95]], cabinW: 0.72, wheel: 0.33, spoiler: 0.0, fins: false, pop: true },
  { name: 'B  Grand tourer', length: 4.9, width: 1.9, paint: '#2bb8d8', body: [[0, 0.36], [0.03, 0.62], [0.36, 0.8], [0.95, 0.82], [1, 0.5], [0.97, 0.3]], cabin: [[0.33, 0.8], [0.45, 1.24], [0.72, 1.26], [0.9, 0.84]], cabinW: 0.78, wheel: 0.34, spoiler: 0.0, fins: false, pop: true },
  { name: 'C  Muscle fastback', length: 4.8, width: 2.0, paint: '#19c2e6', body: [[0, 0.4], [0.02, 0.72], [0.4, 0.86], [0.96, 0.9], [1, 0.5], [0.97, 0.32]], cabin: [[0.38, 0.86], [0.46, 1.3], [0.66, 1.32], [0.98, 0.9]], cabinW: 0.8, wheel: 0.36, spoiler: 0.12, fins: false, pop: true },
  { name: 'D  Stealth', length: 4.6, width: 2.05, paint: '#1aa6c9', body: [[0, 0.3], [0.01, 0.44], [0.5, 0.74], [0.9, 0.86], [1, 0.6], [0.98, 0.3]], cabin: [[0.45, 0.74], [0.56, 1.02], [0.82, 1.06], [0.92, 0.86]], cabinW: 0.62, wheel: 0.33, spoiler: 0.0, fins: true, pop: false },
  { name: 'E  Retro roadster', length: 4.3, width: 1.8, paint: '#4de0f5', body: [[0, 0.38], [0.03, 0.66], [0.3, 0.76], [0.62, 0.76], [0.98, 0.84], [1, 0.46], [0.96, 0.3]], cabin: [[0.5, 0.76], [0.56, 1.1], [0.72, 1.1], [0.82, 0.8]], cabinW: 0.7, wheel: 0.34, spoiler: 0.0, fins: true, pop: true },
  { name: 'F  Wide body', length: 4.7, width: 2.15, paint: '#28d4ea', body: [[0, 0.3], [0.02, 0.56], [0.38, 0.8], [0.94, 0.88], [1, 0.44], [0.97, 0.28]], cabin: [[0.36, 0.8], [0.46, 1.16], [0.74, 1.18], [0.9, 0.9]], cabinW: 0.74, wheel: 0.36, spoiler: 0.16, fins: false, pop: true },
];
function profile(pts, length, base) { const s = new Shape(); s.moveTo(-length / 2, base); for (const [u, h] of pts) s.lineTo(-length / 2 + u * length, h); s.lineTo(length / 2, base); s.closePath(); return s; }
export function buildCar(d, mats) {
  const g = new Group(); const L = d.length, W = d.width;
  const body = new Mesh(new ExtrudeGeometry(profile(d.body, L, 0.28), { depth: W * 0.9, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 }), mats.paint); body.geometry.translate(0, 0, -W * 0.45); body.geometry.rotateY(Math.PI / 2); body.castShadow = true; g.add(body);
  const cab = new Mesh(new ExtrudeGeometry(profile(d.cabin, L, d.cabin[0][1] - 0.02), { depth: W * d.cabinW, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }), mats.glass); cab.geometry.translate(0, 0, -W * d.cabinW / 2); cab.geometry.rotateY(Math.PI / 2); g.add(cab);
  const roof = new Mesh(new BoxGeometry(W * d.cabinW * 0.8, 0.05, (d.cabin[2][0] - d.cabin[1][0]) * L * 0.9), mats.paint); roof.position.set(0, d.cabin[1][1] + 0.01, -(((d.cabin[1][0] + d.cabin[2][0]) / 2) - 0.5) * L); g.add(roof);
  const wheelGeo = new CylinderGeometry(d.wheel, d.wheel, 0.3, 20).rotateZ(Math.PI / 2); const rimGeo = new CylinderGeometry(d.wheel * 0.6, d.wheel * 0.6, 0.32, 10).rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const u of [0.2, 0.8]) { const w = new Mesh(wheelGeo, mats.tyre); w.position.set(sx * W / 2, d.wheel, -(u - 0.5) * L); w.castShadow = true; g.add(w); const r = new Mesh(rimGeo, mats.rim); r.position.copy(w.position); g.add(r); }
  // lights: warm headlights in the nose, red tail bar, cyan rim strip along the sill
  for (const sx of [-1, 1]) { const h = new Mesh(new BoxGeometry(0.34, 0.12, 0.08), mats.head); h.position.set(sx * W * 0.33, d.body[1][1] - 0.04, -L / 2 + 0.02); g.add(h); }
  const tail = new Mesh(new BoxGeometry(W * 0.8, 0.07, 0.06), mats.tail); tail.position.set(0, d.body[d.body.length - 2][1] - 0.06, L / 2 - 0.02); g.add(tail);
  for (const sx of [-1, 1]) { const strip = new Mesh(new BoxGeometry(0.03, 0.03, L * 0.7), mats.rim2); strip.position.set(sx * W * 0.47, 0.34, 0); g.add(strip); }
  if (d.spoiler) { const sp = new Mesh(new BoxGeometry(W * 0.9, 0.05, 0.3), mats.trim); sp.position.set(0, d.body[3][1] + d.spoiler, L / 2 - 0.3); g.add(sp); for (const sx of [-1, 1]) { const post = new Mesh(new BoxGeometry(0.06, d.spoiler, 0.1), mats.trim); post.position.set(sx * W * 0.35, d.body[3][1] + d.spoiler / 2, L / 2 - 0.3); g.add(post); } }
  if (d.fins) for (const sx of [-1, 1]) { const fin = new Mesh(new BoxGeometry(0.05, 0.3, 0.9), mats.trim); fin.position.set(sx * W * 0.4, d.body[3][1] + 0.12, L / 2 - 0.5); fin.rotation.x = 0.25; g.add(fin); }
  if (d.pop) for (const sx of [-1, 1]) { const gun = new Mesh(new CylinderGeometry(0.05, 0.05, 0.5, 8).rotateX(Math.PI / 2), mats.trim); gun.position.set(sx * (W / 2 + 0.03), 0.62, -L * 0.12); g.add(gun); }   // the side pop-out gun ports
  return g;
}
export function createStudio(canvas, opts = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap; renderer.toneMapping = 0;
  const scene = new Scene(); const P = Object.assign({}, LOOKS[opts.look || 'night']); const sky = new Sky(scene, renderer);
  const key = new DirectionalLight(new Color('#dfe8ff'), 3.4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -30; key.shadow.camera.right = 30; key.shadow.camera.top = 30; key.shadow.camera.bottom = -30; key.position.set(12, 20, 10); scene.add(key); scene.add(key.target);
  const hemi = new HemisphereLight(new Color('#6a7ab8'), new Color('#2a2630'), 1.6); scene.add(hemi);
  const rim = new DirectionalLight(new Color('#7fd8ff'), 2.2); rim.position.set(-14, 9, -18); scene.add(rim);   // cool edge light from behind, for the tail views
  const SUN = new Vector3(12, 20, 10).normalize(); sky.apply(P, SUN); scene.fog.density = 0.0; 
  const floor = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: new Color('#343a4a'), roughness: 0.3, metalness: 0.1, envMapIntensity: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const mats = { paint: null, glass: new MeshStandardMaterial({ color: new Color('#223a5a'), roughness: 0.12, metalness: 0.4, envMapIntensity: 2.0 }), tyre: new MeshStandardMaterial({ color: new Color('#101214'), roughness: 0.9 }), rim: new MeshStandardMaterial({ color: new Color('#b8c0cc'), roughness: 0.3, metalness: 0.9 }), rim2: new MeshBasicMaterial({ color: new Color(0.3, 2.2, 2.6) }), head: new MeshBasicMaterial({ color: new Color(3, 2.8, 2.2) }), tail: new MeshBasicMaterial({ color: new Color(3, 0.4, 0.4) }), trim: new MeshStandardMaterial({ color: new Color('#1a1e26'), roughness: 0.5, metalness: 0.5 }) };
  const cars = []; const plates = []; const gap = 7;
  const HEROES = [{ name: 'H1  White, cyan lights', paint: '#f4f6fa' }, { name: 'H2  Cyan', paint: '#37e6ff' }, { name: 'H3  Dark, cyan roof', paint: '#141820', paint2: '#37e6ff', roughness: 0.4, metalness: 0.5 }];
  const designs = opts.hero ? HEROES : DESIGNS;
  if (opts.hero) HEROES.forEach((h, i) => { const car = buildHero(h); car.position.set((i - (HEROES.length - 1) / 2) * gap, 0, 0); scene.add(car); cars.push(car); });
  else DESIGNS.forEach((d, i) => { const m = Object.assign({}, mats, { paint: new MeshStandardMaterial({ color: new Color('#37e6ff'), roughness: 0.3, metalness: 0.45, envMapIntensity: 1.3 }) }); const car = buildCar(d, m); car.position.set((i - (DESIGNS.length - 1) / 2) * gap, 0, 0); scene.add(car); cars.push(car); });
  // name plates
  for (let i = 0; i < designs.length; i++) { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.font = '700 56px Rajdhani, Arial, sans-serif'; x.textAlign = 'center'; x.fillText(designs[i].name, 256, 66); const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; const plate = new Mesh(new PlaneGeometry(5, 0.95), new MeshBasicMaterial({ map: t, transparent: true })); plate.rotation.x = -Math.PI / 2; plate.position.set(cars[i].position.x, 0.02, -4.0); scene.add(plate); plates.push(plate); }
  const camera = new PerspectiveCamera(32, 1, 0.5, 400); scene.add(camera);
  const post = createPost(renderer, scene, camera, P); post.apply(P); renderer.toneMappingExposure = 1.3;
  function view(kind) {
    if (kind === 'top') { camera.fov = 40; camera.position.set(0, 24, 20); camera.lookAt(0, 0, 0); }     // the gameplay angle: 55 degrees down
    else if (kind === 'front') { camera.fov = 30; camera.position.set(18, 5.5, 24); camera.lookAt(0, 0.8, 0); }   // three-quarter front
    else { camera.fov = 30; camera.position.set(-20, 4, -22); camera.lookAt(0, 0.8, 0); }                          // three-quarter rear
    camera.updateProjectionMatrix();
  }
  // one car per frame: the others hide; 'front' is a low three-quarter view of the nose, 'top' is the gameplay angle (55 degrees down)
  function focus(i, kind) { cars.forEach((c, j) => c.visible = j === i); plates.forEach((p, j) => p.visible = j === i && kind === 'top'); const c = cars[i].position; if (kind === 'top') { camera.fov = 36; camera.position.set(c.x + 0.8, 7.6, c.z + 5.3); camera.lookAt(c.x, 0.2, c.z); } else if (kind === 'rear') { camera.fov = 30; camera.position.set(c.x - 4.6, 1.5, c.z + 6.0); camera.lookAt(c.x, 0.6, c.z + 0.3); } else { camera.fov = 30; camera.position.set(c.x + 4.8, 1.5, c.z - 6.0); camera.lookAt(c.x, 0.6, c.z - 0.3); } camera.updateProjectionMatrix(); }
  function resize(w, h) { renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); post.composer.setSize(w, h); }
  function render() { post.composer.render(0.016); }
  return { renderer, scene, camera, cars, view, focus, resize, render, DESIGNS: designs };
}
