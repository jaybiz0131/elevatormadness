// Loads wpn_gatling.glb (built by tools/make-gatling.mjs, inlined into the bundle as a data URL) and hands back the model with the parts
// the game animates: the barrel cluster (spun about z), the cyan trim material (boosted with every muzzle flash), the muzzle and the
// ejection port (nodes the flash and the brass are placed at).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import glb from '../../assets/wpn_gatling.glb?inline';
function bytes(dataUrl) { const b = atob(dataUrl.slice(dataUrl.indexOf(',') + 1)); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; }
export function loadGatling() {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes(glb), '', (gltf) => {
      const g = gltf.scene; const u = g.userData; u.trimMat = null;
      g.traverse(o => { o.frustumCulled = false; if (o.isMesh) { o.castShadow = o.name !== 'trim'; if (o.material && o.material.name === 'gatling_trim') u.trimMat = o.material; } if (o.name === 'barrel_cluster') u.barrels = o; if (o.name === 'muzzle') u.muzzle = o; if (o.name === 'eject') u.eject = o; });
      resolve(g);
    }, reject);
  });
}
