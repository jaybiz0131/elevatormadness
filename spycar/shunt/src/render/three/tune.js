// The tune panel (?tune=1, or Settings > Developer > Tune panel): a live panel for every look value (lil-gui from three's examples).
// Changes apply at once and stay with that look for the session (the renderer keeps a working copy per look, so switching looks no
// longer drops the edits or leaves the panel editing a stale copy); the panel rebuilds on a look change. "Copy look JSON" puts the
// current values on the clipboard (and in the console) for looks.js and design/style-guide.md. Rows are 13 px and touch height.
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
const CSS = `.lil-gui.tune { --font-size: 13px; --input-font-size: 13px; --widget-height: 30px; --title-height: 36px; --name-width: 44%; --font-family: var(--font-body);
  position: fixed; right: 8px; top: calc(8px + env(safe-area-inset-top, 0px)); z-index: 50; width: min(300px, 86vw); max-height: 80vh; overflow: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; }`;
function copy(text) { console.log(text); try { if (navigator.clipboard) return navigator.clipboard.writeText(text); } catch (e) {} const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); }
export function createTune(renderer) {
  if (!document.getElementById('tuneCss')) { const s = document.createElement('style'); s.id = 'tuneCss'; s.textContent = CSS; document.head.appendChild(s); }
  let gui = null, open = { 'Sky and fog': false, Light: false, Post: false, Grade: false, 'City and road': false };
  function build(startOpen) {
    if (gui) { for (const f of gui.folders) open[f._title] = !f._closed; gui.destroy(); }
    const P = renderer.P; const re = () => renderer.applyLook();
    gui = new GUI({ title: 'Tune: ' + P.name, width: 300 }); gui.domElement.classList.add('tune'); gui.domElement.addEventListener('pointerdown', e => e.stopPropagation());   // touches on the panel never steer the car
    const folder = (name) => { const f = gui.addFolder(name); if (!open[name]) f.close(); return f; };
    const f1 = folder('Sky and fog'); for (const k of ['sky', 'horizon', 'fog']) f1.addColor(P, k).onChange(re); f1.add(P, 'fogDensity', 0, 0.01, 0.0001).onChange(re);
    const f2 = folder('Light'); f2.addColor(P, 'sunColor').onChange(re); f2.add(P, 'sunIntensity', 0, 6, 0.05).onChange(re); f2.add(P, 'sunAzimuth', 0, 360, 1).onChange(re); f2.add(P, 'sunElevation', -10, 80, 0.5).onChange(re); f2.addColor(P, 'hemiSky').onChange(re); f2.addColor(P, 'hemiGround').onChange(re); f2.add(P, 'hemiIntensity', 0, 3, 0.05).onChange(re); f2.add(P, 'envIntensity', 0, 2, 0.05).onChange(re); f2.add(P, 'exposure', 0.3, 2.5, 0.05).onChange(re);
    const f3 = folder('Post'); f3.add(P, 'bloomThreshold', 0, 1.5, 0.01).onChange(re); f3.add(P, 'bloomIntensity', 0, 4, 0.05).onChange(re); f3.add(P, 'bloomRadius', 0, 1, 0.01).onChange(re); f3.add(P, 'vignetteOffset', 0, 1, 0.01).onChange(re); f3.add(P, 'vignetteDarkness', 0, 1, 0.01).onChange(re); f3.add(P, 'grain', 0, 0.5, 0.01).onChange(re); f3.add(P, 'toneMapping', ['agx', 'aces']).onChange(re); f3.add(P, 'lutStrength', 0, 1, 0.05).onChange(re);
    const f4 = folder('Grade'); f4.add(P, 'gradeSat', 0, 2, 0.05).onChange(re); f4.add(P, 'gradeContrast', 0.5, 1.6, 0.01).onChange(re); f4.add(P, 'gradeWarm', -0.2, 0.2, 0.01).onChange(re); f4.add(P, 'gradeLift', -0.1, 0.2, 0.005).onChange(re);
    const f5 = folder('City and road'); f5.add(P, 'neon', 0, 1, 0.05).onChange(re); f5.add(P, 'wet', 0, 1, 0.05).onChange(re); f5.add(P, 'steam', 0, 1.5, 0.05).onChange(re); f5.add(P, 'rain', 0, 1, 0.05).onChange(re);
    gui.add({ copy() { copy(JSON.stringify(renderer.P)); } }, 'copy').name('Copy look JSON');
    gui.add({ reset() { renderer.resetLook(); build(true); } }, 'reset').name('Reset this look');
    if (!startOpen) gui.close();
  }
  build(true);
  return { refresh() { build(!gui._closed); }, toggle() { gui.domElement.hidden = !gui.domElement.hidden; return !gui.domElement.hidden; }, get gui() { return gui; } };
}
