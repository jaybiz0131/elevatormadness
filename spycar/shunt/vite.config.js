// Build config: the defaults, plus one virtual module. `virtual:models` embeds every .glb in the repo's assets/models/ as a data
// URL, keyed by file name without the extension ({ hero, dart, ... }), so adding or replacing a model file and rebuilding is all a
// new car needs. Missing files simply are not in the map.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = fileURLToPath(new URL('../../assets/models/', import.meta.url));
function models() {
  return {
    name: 'models',
    resolveId(id) { return id === 'virtual:models' ? '\0virtual:models' : null; },
    load(id) {
      if (id !== '\0virtual:models') return null;
      const out = {}; if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR)) if (f.endsWith('.glb')) { const p = path.join(DIR, f); this.addWatchFile(p); out[f.slice(0, -4)] = 'data:model/gltf-binary;base64,' + fs.readFileSync(p).toString('base64'); }
      return `export default ${JSON.stringify(out)};`;
    },
  };
}
export default { plugins: [models()] };
