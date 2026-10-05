// Build config: the defaults, plus one virtual module. `virtual:models` embeds every .glb (and .jpg) in the repo's assets/models/ as a data
// URL, keyed by file name without the extension ({ hero, dart, ... }), so adding or replacing a model file and rebuilding is all a
// new car needs. Missing files simply are not in the map.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = fileURLToPath(new URL('../../assets/models/', import.meta.url));
// files kept in assets/models but not built in yet (no page weight until they are used)
// boss.glb: the Sprint D villain car (see design/roadmap.md, Level 1 climax); wpn_gatling.glb: the Sprint D hood gatling;
// wpn_missile, wpn_laser, wpn_booster: the Sprint F Refit modules (see design/roadmap.md, The Refit)
const NOT_YET = new Set(['boss', 'wpn_gatling', 'wpn_missile', 'wpn_laser', 'wpn_booster']);
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
export default { plugins: [models()] };
