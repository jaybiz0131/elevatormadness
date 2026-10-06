// Build config: the defaults, plus one virtual module. `virtual:models` embeds every .glb (and .jpg) in the repo's assets/models/ as a data
// URL, keyed by file name without the extension ({ hero, dart, ... }), so adding or replacing a model file and rebuilding is all a
// new car needs. Missing files simply are not in the map.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
const DIR = fileURLToPath(new URL('../../assets/models/', import.meta.url));
// files kept in assets/models but not built in yet (no page weight until they are used)
// boss.glb: the villain car (Sprint G, see design/roadmap.md, Level 1 climax); (wpn_gatling.glb is built in: the Sprint D hood gatling);
// wpn_missile, wpn_laser, wpn_booster: the Sprint G Refit modules (see design/roadmap.md, The Refit); boss: Sprint G
const NOT_YET = new Set(['boss', 'wpn_missile', 'wpn_laser', 'wpn_booster']);
function models() {
  return {
    name: 'models',
    resolveId(id) { return id === 'virtual:models' ? '\0virtual:models' : null; },
    load(id) {
      if (id !== '\0virtual:models') return null;
      const out = {}; if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR)) { const m = /^(.*)\.(glb|jpg)$/.exec(f); if (!m || NOT_YET.has(m[1])) continue; const p = path.join(DIR, f); this.addWatchFile(p); out[m[1]] = 'data:' + (m[2] === 'glb' ? 'model/gltf-binary' : 'image/jpeg') + ';base64,' + fs.readFileSync(p).toString('base64'); }   // .glb models and .jpg backdrops (skyline.jpg)
      return `export default ${JSON.stringify(out)};`;
    },
  };
}
// Rapier (the crash physics, deterministic build) ships its 3.1 MB WebAssembly inlined as base64 (4.1 MB). This plugin takes that string out
// of the package and puts the same bytes back gzipped (1.2 MB, 1.6 MB as base64) in `virtual:rapier-wasm`; src/sim/crash.js inflates them
// with fflate into globalThis.__rapierWasm before RAPIER.init(), and the package's init reads that instead of its own string.
function rapierWasm() {
  const RE = /[A-Za-z_$][\w$]*\.toByteArray\("(AGFzbQ[A-Za-z0-9+/=]+)"\)/;
  let gz = null; const gzOf = (b64) => gz || (gz = zlib.gzipSync(Buffer.from(b64, 'base64'), { level: 9 }).toString('base64'));
  const PKG = fileURLToPath(new URL('./node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs', import.meta.url));
  return {
    name: 'rapier-wasm',
    resolveId(id) { return id === 'virtual:rapier-wasm' ? '\0virtual:rapier-wasm' : null; },
    load(id) { if (id !== '\0virtual:rapier-wasm') return null; const m = RE.exec(fs.readFileSync(PKG, 'utf8')); if (!m) throw new Error('rapier-wasm: inlined wasm not found'); return `export default ${JSON.stringify(gzOf(m[1]))};`; },
    transform(code, id) {
      if (!/rapier3d-deterministic-compat[\\/]dist[\\/]rapier\.mjs$/.test(id)) return null;
      const m = RE.exec(code); if (!m) throw new Error('rapier-wasm: inlined wasm not found'); gzOf(m[1]);
      return { code: code.replace(RE, 'globalThis.__rapierWasm'), map: null };
    },
  };
}
export default { plugins: [models(), rapierWasm()], optimizeDeps: { exclude: ['@dimforge/rapier3d-deterministic-compat'] } };
