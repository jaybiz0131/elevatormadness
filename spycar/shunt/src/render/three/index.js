// The three.js renderer. Reads G and the view state, writes nothing back. WebGL2 through WebGLRenderer; one directional key light
// with a shadow box fitted around the player and snapped to texels; hemisphere fill; a small pre-filtered environment map; every
// other light is emissive or additive. Dynamic resolution between 1.25 and the capped device pixel ratio (never above 2). Handles
// context loss. Everything three.js lives under render/three so the backend can change later.
import { WebGLRenderer, Scene, Color, DirectionalLight, HemisphereLight, Vector3, PCFShadowMap, Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture, AdditiveBlending, RepeatWrapping, SRGBColorSpace } from 'three';
import { REF, H, T, clamp, lerp } from '../../sim/constants.js';
import { S } from '../../settings.js';
import { view } from '../../ui/dom.js';
import { M, toWorld } from './scale.js';
import { RoadCamera, CAM } from './camera.js';
import { RoadMesh } from './road.js';
import { CarSystem } from './cars.js';
import { Props } from './props.js';
import { FX } from './fx.js';
import { City } from './city.js';
import { Sky, buildLut } from './sky.js';
import { createPost } from './post.js';
import { LOOKS, lookFor } from './looks.js';
import { loadHeroModel, HERO_GLB_URL } from './heroModel.js';
import { loadEnemyModels } from './enemyModels.js';
import { loadPropModels } from './propModels.js';
import { MODELS } from './carModel.js';
const V = new Vector3(), V2 = new Vector3(), SUN = new Vector3();
function rainTexture() { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256); let a = 7; const rng = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 1; for (let i = 0; i < 90; i++) { const px = rng() * 256, py = rng() * 256, l = 14 + rng() * 26; x.globalAlpha = 0.3 + rng() * 0.6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 2, py + l); x.stroke(); } const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; return t; }
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export function createThreeRenderer(canvas, opts = {}) {
  if (IS_IOS && !opts.shadowMap) opts.shadowMap = 1024;   // iPhone memory is the tight budget; 1024 is the brief's fallback
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
  // ?lite=1: half resolution, no shadows, no post: for headless bots on software GL, where the sim must run at pace
  const LITE = new URLSearchParams(location.search).get('lite') === '1';
  // ?cam=pitch,dist,fov[,yaw,screenY] overrides the road camera for comparison and close-up shots (e.g. ?cam=47,76,42; a three-quarter
  // close-up ?cam=18,11,40,35,0.5): yaw orbits the camera round the car in degrees; screenY is where the car sits (1/3 = lower third)
  { const c = new URLSearchParams(location.search).get('cam'); if (c) { const [p, d, f, y, t] = c.split(',').map(Number); if (p) CAM.pitch = p; if (d) CAM.dist = d; if (f) CAM.fov = f; if (y) CAM.yaw = y; if (t) CAM.lowerThird = t; if (y || t) CAM.fixed = true; } }
  renderer.shadowMap.enabled = !LITE; renderer.shadowMap.type = PCFShadowMap; renderer.toneMapping = 0; renderer.autoClear = true; renderer.info.autoReset = false;
  const scene = new Scene();
  const roadCam = new RoadCamera(view.SW / H); const camera = roadCam.cam;
  const key = new DirectionalLight(0xffffff, 1); key.castShadow = true; key.shadow.mapSize.set(opts.shadowMap || 2048, opts.shadowMap || 2048); key.shadow.camera.near = 1; key.shadow.camera.far = 500; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.25;
  const SB = 80; key.shadow.camera.left = -SB; key.shadow.camera.right = SB; key.shadow.camera.top = SB; key.shadow.camera.bottom = -SB; scene.add(key); scene.add(key.target);
  const hemi = new HemisphereLight(0x8899ff, 0x202020, 0.6); scene.add(hemi);
  const sky = new Sky(scene, renderer); if (MODELS.skyline) sky.addSkyline(MODELS.skyline);
  const road = new RoadMesh(scene), cars = new CarSystem(scene), props = new Props(scene), fx = new FX(scene), city = new City(scene, fx); roadCam.setOccluders(city.group);
  // rain streaks (a ?tune=1 option): a scrolling streak quad in front of the camera
  const rain = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ map: rainTexture(), transparent: true, opacity: 0, blending: AdditiveBlending, depthTest: false, depthWrite: false })); rain.renderOrder = 20; rain.frustumCulled = false; camera.add(rain); rain.position.set(0, 0, -1.2); scene.add(camera);
  let look = lookFor(opts.look || 'night'), P = Object.assign({}, LOOKS[look]); if (IS_IOS) P.msaa = 2;
  let post = createPost(renderer, scene, camera, P);
  const state = { scale: 1, cap: 1, frameMs: 16, lost: false, chroma: 0, fovKick: 0, elapsed: 0, postError: null, glError: null, frames: 0 };
  function applyLook() {
    const az = P.sunAzimuth * Math.PI / 180, el = Math.max(3, P.sunElevation) * Math.PI / 180; SUN.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); fx.setSun(SUN); fx.setLook(P);
    key.color.set(P.sunColor); key.intensity = P.sunIntensity; hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGround); hemi.intensity = P.hemiIntensity;
    sky.apply(P, SUN); city.setLook(P); road.setLook(P); renderer.toneMappingExposure = P.exposure; post.apply(P);
    post.setLut(buildLut({ sat: P.gradeSat, contrast: P.gradeContrast, lift: [P.gradeLift + P.gradeWarm * 0.5, P.gradeLift, P.gradeLift - P.gradeWarm * 0.5], gain: [1 + P.gradeWarm * 0.6, 1, 1 - P.gradeWarm * 0.6] }), P.lutStrength);
    rain.material.opacity = P.rain * 0.35;
  }
  applyLook();
  // dynamic resolution: the backing store is the stage size x scale; the cap is the device pixel ratio after the stage's CSS scale, never above 2
  function setScale(k) { state.scale = k; renderer.setPixelRatio(k); renderer.setSize(view.SW, H, false); post.composer.setSize(view.SW, H); }
  function resize() {
    const cssScale = Math.min(window.innerWidth / view.SW, window.innerHeight / H); state.cap = LITE ? 0.5 : Math.min(2, (window.devicePixelRatio || 1) * cssScale); setScale(Math.min(state.cap, Math.max(state.scale, Math.min(1.25, state.cap))));
    camera.aspect = view.SW / H; camera.updateProjectionMatrix(); const a = Math.tan(camera.fov / 2 * Math.PI / 180) * 1.2 * 2; rain.scale.set(a * camera.aspect, a, 1);
  }
  function adapt(dt) {
    // frames over 15 ms for a while lower the scale, frames under 10 ms raise it, within [1.25, cap]; headless and desktop DPR 1 sit at their cap
    state.frameMs = lerp(state.frameMs, dt * 1000, 0.08); const lo = Math.min(1.25, state.cap);
    if (state.frameMs > 15 && state.scale > lo) { setScale(Math.max(lo, state.scale - 0.125)); state.frameMs = 14; }
    else if (state.frameMs < 10 && state.scale < state.cap) { setScale(Math.min(state.cap, state.scale + 0.125)); state.frameMs = 12; }
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); state.lost = true; }, false);
  canvas.addEventListener('webglcontextrestored', () => { post.dispose(); post = createPost(renderer, scene, camera, P); applyLook(); road.reset(); city.reset(); state.lost = false; prewarm(); }, false);
  // the shadow box rides with the player and snaps to shadow-map texels so edges do not swim
  function placeKey(target) { const texel = (2 * SB) / key.shadow.mapSize.x; key.target.position.set(Math.round(target.x / texel) * texel, 0, Math.round(target.z / texel) * texel); key.position.copy(key.target.position).addScaledVector(SUN, 220); key.target.updateMatrixWorld(); }
  let roadRef = null;
  function render(dt, st) {
    if (state.lost) return; state.elapsed = st.elapsed; const G = st.G; roadRef = G.road;
    const alpha = clamp(G.acc * 120, 0, 1); let rx, rdist, frame = null;
    if (st.phase === 'over' && G.replay.count) { const R = G.replay; const span = R.count / 30 / 0.6 + 0.5; const t = G.replayT % span; const idx = Math.min(R.count - 1, Math.floor(t * 0.6 * 30)); frame = R.frames[(R.head - R.count + idx + 45 * 2) % 45]; rx = frame.x; rdist = frame.y; }
    else { rx = lerp(G.px, G.x, alpha); rdist = lerp(G.pdist, G.dist, alpha); }   // rx is road-space x (centre 195)
    const shakeOn = S.shake && !S.motion && st.phase !== 'over';
    state.fovKick += (((G.turboT > 0 || G.nitro > 0) ? (G.nitro > 0 ? 10 : 6) : 0) - state.fovKick) * Math.min(1, dt * 6);
    roadCam.update(G, rdist, 0, dt, st.elapsed, shakeOn, state.fovKick, rx); sky.update(roadCam.pos);
    road.update(G, rdist, roadCam.pos); placeKey(roadCam.anchor);
    const scroll = rdist - 270, yTop = rdist + 1500;
    fx.begin(); props.update(G, scroll, yTop, st.elapsed); city.update(G, rdist, st.elapsed, P);
    if (frame) { cars.update({ road: G.road, cars: frame.cars.slice(0, frame.n).map(c => Object.assign(c, { alive: true, px: c.x, py: c.y })), x: G.x }, 1, fx, st.elapsed); cars.updatePlayer(G, rx, rdist, fx, { phase: 'over', lean: frame.lean }, st.elapsed); }
    else { cars.update(G, alpha, fx, st.elapsed); cars.updatePlayer(G, rx, rdist, fx, st, st.elapsed); }
    fx.update(G, alpha, st.elapsed, roadCam.pos); fx.end();
    const topK = clamp((G.speed - 0.85 * T.drive.top) / (0.15 * T.drive.top), 0, 1); state.chroma += (topK - state.chroma) * Math.min(1, dt * 4); post.setChroma(state.chroma);
    if (P.rain > 0) rain.material.map.offset.y -= dt * 2.2;
    renderer.info.reset();
    // post can fail on a device this container cannot test; the game then renders without it rather than going black
    if (LITE || state.postError) renderer.render(scene, camera); else { try { post.composer.render(dt); } catch (e) { state.postError = String(e && e.message || e).slice(0, 120); renderer.render(scene, camera); } }
    if (state.frames++ < 3) { const gl = renderer.getContext(); const err = gl.getError(); if (err !== gl.NO_ERROR && !state.glError) state.glError = 'GL error 0x' + err.toString(16); }
    adapt(dt);
  }
  // stage-space screen position of road-space (x, s): for the HUD's floating text and off-screen chevrons
  function project(x, s, out, lift = 0) { toWorld(roadRef, x, s, V); V.y += lift; V.project(camera); out.x = (V.x + 1) / 2 * view.SW; out.y = (1 - V.y) / 2 * H; out.visible = V.z < 1 && V.x > -1 && V.x < 1 && V.y > -1 && V.y < 1; return out; }
  // how far ahead (in road pt) the top centre of the screen reaches on the ground: the warning-time measure
  function visibleAhead(G) { V.set(0, 1, 0.5).unproject(camera); V2.copy(V).sub(camera.position).normalize(); if (V2.y >= 0) return 3000; const t = -camera.position.y / V2.y; V.copy(camera.position).addScaledVector(V2, t); let best = 0, bd = 1e18; for (let s = G.dist; s < G.dist + 3000; s += 20) { toWorld(G.road, REF, s, V2); const d = (V2.x - V.x) ** 2 + (V2.z - V.z) ** 2; if (d < bd) { bd = d; best = s; } } return best - G.dist; }
  // the imported hero: loaded before the shader prewarm so its material compiles with the rest; ?hero=code keeps the code hero
  const HERO_MODE = new URLSearchParams(location.search).get('hero') === 'code' ? 'code' : 'glb';
  async function loadHero() { if (!HERO_GLB_URL || state.heroInfo) return; try { const m = await loadHeroModel(); if (m) { cars.setHeroModel(m, HERO_MODE === 'code'); state.heroInfo = m.userData.info; } } catch (e) { state.heroError = String(e && e.message || e).slice(0, 120); } }
  async function loadEnemies() { if (state.enemyInfo) return; const map = await loadEnemyModels(scene); cars.setEnemyModels(map); state.enemyInfo = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.info || v])); }
  async function loadProps() { if (state.propInfo) return; const r = await loadPropModels(scene); city.setPropModels(r.meshes); props.setPropModels(r.meshes); state.propInfo = r.info; }
  async function prewarm() {
    await loadHero(); await loadEnemies(); await loadProps(); state.modelsReady = true;
    // every material compiled before play: one of each car kind in the scene, every batch with one instance, then one composer frame
    const temp = []; for (const k of Object.keys(cars.geo)) { const m = cars.acquire(k); m.userData.kind = k; temp.push(m); }
    fx.begin(); fx.glow(0, 0, 0, 1, 1, 1, 1, 0); fx.puff(0, 0, 0, 1, 0); fx.shadow(V.set(0, 0, 0), 1, 1); fx.ring(0, 0, 0, 1, 0xffffff, 0, 1); fx.spark(0, 0, 0, 0, 0, 0); fx.poolAt(0, 0, 0, 1, 1, 1, 0, 1); fx.cone(0, 0, 0, 1, 1, 1, 1, 0); fx.end();
    try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
    for (const m of temp) cars.release(m); fx.begin(); fx.end();
  }
  // one line for the title card and the frame counter: what the device is running
  function diag() { let gpu = '?'; try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {} return `${renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1'} · ${String(gpu).slice(0, 40)} · post ${post.config}${state.postError ? ' · post failed: ' + state.postError : ''}${state.glError ? ' · ' + state.glError : ''}${state.lost ? ' · CONTEXT LOST' : ''} · hero ${state.heroInfo && HERO_MODE === 'glb' ? 'glb ' + state.heroInfo.triangles + ' tris' : 'code'}${state.heroError ? ' (glb failed: ' + state.heroError + ')' : ''} · shadow ${key.shadow.mapSize.x} · scale ${state.scale.toFixed(2)}/${state.cap.toFixed(2)} · dpr ${window.devicePixelRatio}`; }
  function stats() { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, scale: state.scale, cap: state.cap, frameMs: state.frameMs, programs: i.programs ? i.programs.length : 0 }; }
  function setLook(name) { look = lookFor(name); P = Object.assign({}, LOOKS[look]); if (IS_IOS) P.msaa = 2; applyLook(); }
  function reset() { roadCam.reset(); road.reset(); city.reset(); cars.reset(); fx.reset(); }
  resize();
  return { kind: 'three', render, reset, resize, stats, diag, project, visibleAhead, prewarm, setLook, get look() { return look; }, get P() { return P; }, applyLook, camera: roadCam, renderer, scene, setRoad(r) { roadRef = r; }, fx, props, cars, city, state, CAM, get post() { return post; }, simulateContextLoss() { const ext = renderer.getContext().getExtension('WEBGL_lose_context'); if (ext) { ext.loseContext(); setTimeout(() => ext.restoreContext(), 800); return true; } return false; } };
}
