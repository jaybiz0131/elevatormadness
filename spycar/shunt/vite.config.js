// Build config: the defaults, plus one virtual module. `virtual:hero-glb` embeds the repo's assets/models/hero.glb as a data URL
// (or null when the file is missing), so replacing that file and rebuilding is all a new hero model needs.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const HERO_GLB = fileURLToPath(new URL('../../assets/models/hero.glb', import.meta.url));
function heroGlb() {
  return {
    name: 'hero-glb',
    resolveId(id) { return id === 'virtual:hero-glb' ? '\0virtual:hero-glb' : null; },
    load(id) {
      if (id !== '\0virtual:hero-glb') return null;
      if (!fs.existsSync(HERO_GLB)) return 'export default null; export const bytes = 0;';
      this.addWatchFile(HERO_GLB); const b = fs.readFileSync(HERO_GLB);
      return `export default ${JSON.stringify('data:model/gltf-binary;base64,' + b.toString('base64'))}; export const bytes = ${b.length};`;
    },
  };
}
export default { plugins: [heroGlb()] };
