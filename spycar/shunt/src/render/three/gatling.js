// The hood gatling: Jack's wpn_gatling.glb (assets/models/, textured Meshy model, about 4,000 triangles, 1 unit long with the barrels
// along -X, embedded at build by vite.config.js). It is one mesh, so the barrels cannot turn; the spin is shown by a ring of glints at
// the muzzle (cars.js). The model is very dark, so its cyan texels (rims, trim) get a glow that the game raises with the spin and with
// every muzzle flash. Fitted here: barrels turned to point forward (-z), scaled to GUN.length, sat on the hood at GUN.at.
import { Group, Mesh, Object3D, MeshStandardMaterial, Color } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import MODELS from 'virtual:models';
export const GUN = { length: 1.5, at: [0, 0.74, -1.3] };   // metres; the mount point on the hero's hood (hero local: forward -z)
export async function loadGatling(url = MODELS.wpn_gatling) {
  if (!url) throw new Error('wpn_gatling.glb is not in the build');
  const gltf = await new GLTFLoader().loadAsync(url); const model = gltf.scene; const glow = { value: 0.4 };
  model.traverse((o) => {
    o.frustumCulled = false; if (!o.isMesh) return; o.castShadow = true;
    const old = o.material; const m = new MeshStandardMaterial({ map: old.map || null, normalMap: old.normalMap || null, metalnessMap: old.metalnessMap || null, roughnessMap: old.roughnessMap || null, metalness: 1, roughness: 1, envMapIntensity: 1.6 });
    // cyan texels glow (the per-texel mask the car models use): emissive where blue and green beat red and the texel is coloured
    m.onBeforeCompile = (sh) => { sh.uniforms.uGlow = glow; sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 { vec3 tc = diffuseColor.rgb; float ts = max(tc.r, max(tc.g, tc.b)) - min(tc.r, min(tc.g, tc.b)); float cyanW = clamp((min(tc.g, tc.b) - tc.r) * 4.0, 0.0, 1.0) * step(0.12, ts); totalEmissiveRadiance += vec3(0.22, 0.95, 1.0) * cyanW * uGlow; } `); };
    m.customProgramCacheKey = () => 'gatling'; o.material = m;
  });
  // the model's own axes: barrels along -X; turn so they point along -z, and fit the length
  const holder = new Group(); holder.name = 'wpn_gatling'; model.rotation.y = -Math.PI / 2; model.scale.setScalar(GUN.length); holder.add(model); holder.position.set(...GUN.at);
  const muzzle = new Object3D(); muzzle.position.set(0, 0, -GUN.length * 0.5); holder.add(muzzle);          // the barrel tips
  const eject = new Object3D(); eject.position.set(GUN.length * 0.3, GUN.length * 0.1, GUN.length * 0.1); holder.add(eject);   // the right side, mid body
  holder.userData = { glow, muzzle, eject, model };
  return holder;
}
