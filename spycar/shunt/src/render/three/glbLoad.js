// The one way a GLB gets into the game (hero, enemies, traffic, props, gatling). Two things it does that GLTFLoader.loadAsync(url) does not:
//  1. It decodes the embedded data URL itself and parses the bytes: no fetch() of a data: URL, which a strict content security policy
//     (a sandboxed artifact page, an in-app web view) can refuse.
//  2. It keeps the texture decode on the plain Image path. GLTFLoader picks createImageBitmap() whenever it cannot see "Safari" in the
//     user agent (iOS in-app web views have no such token) and for Safari 17 and later; createImageBitmap with the flip and colour space
//     options is where older iOS web views throw, and one thrown texture fails the whole model. The Image path works everywhere.
// Every load is recorded (MODEL_STATUS) so the Show FPS panel can say "models 17/19" and name the ones that failed: no silent fallback to boxes.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import MODELS from 'virtual:models';
const EXPECTED = Object.keys(MODELS).filter(k => /^data:model\//.test(MODELS[k]));   // every embedded .glb
export const MODEL_STATUS = { expected: EXPECTED, ok: new Set(), failed: new Map(), loading: new Set(), notex: new Set() };
const nameOf = (url) => EXPECTED.find(k => MODELS[k] === url) || String(url).slice(0, 24);
function bytesOf(url) {
  const m = /^data:[^,]*;base64,(.*)$/s.exec(url); if (!m) return null;
  const bin = atob(m[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8.buffer;
}
class PlainImageGLTFLoader extends GLTFLoader {
  // the parser is built synchronously inside parse(): while it is, createImageBitmap is hidden so it chooses the Image path
  parse(data, path, onLoad, onError) {
    const cib = globalThis.createImageBitmap; globalThis.createImageBitmap = undefined;
    try { return super.parse(data, path, onLoad, onError); } finally { globalThis.createImageBitmap = cib; }
  }
}
export function loadGlb(url) {
  const name = nameOf(url); MODEL_STATUS.loading.add(name);
  return new Promise((resolve, reject) => {
    const fail = (e) => { const msg = String(e && (e.message || e.type || e) || 'unknown').slice(0, 140); MODEL_STATUS.failed.set(name, msg); MODEL_STATUS.loading.delete(name); reject(new Error(name + ': ' + msg)); };
    try {
      const buf = bytesOf(url); const loader = new PlainImageGLTFLoader();
      const done = (g) => { const want = (g.parser && g.parser.json.textures || []).length; let have = 0; g.scene.traverse(o => { if (o.isMesh && o.material && o.material.map && o.material.map.image) have++; }); if (want && !have) MODEL_STATUS.notex.add(name);   // GLTFLoader logs a texture that will not decode and carries on without it: the model would then be drawn untextured
      MODEL_STATUS.ok.add(name); MODEL_STATUS.failed.delete(name); MODEL_STATUS.loading.delete(name); resolve(g); };
      if (buf) loader.parse(buf, '', done, fail); else loader.load(url, done, undefined, fail);   // a plain URL (never in the single-file build) goes through the loader
    } catch (e) { fail(e); }
  });
}
// the line for the frame counter: "models 19/19", or "models 17/19 FAIL dart, ram" (and the first error)
export function modelLine() {
  const n = MODEL_STATUS.ok.size, y = EXPECTED.length, f = [...MODEL_STATUS.failed.keys()];
  let s = 'models ' + n + '/' + y; if (MODEL_STATUS.loading.size) s += ' (loading ' + MODEL_STATUS.loading.size + ')'; if (f.length) s += '\nFAILED ' + f.join(', ') + '\n' + [...MODEL_STATUS.failed.values()][0]; if (MODEL_STATUS.notex.size) s += '\nNO TEXTURE ' + [...MODEL_STATUS.notex].join(', ');
  return s;
}
