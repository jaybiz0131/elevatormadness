// ?tune=1: a live panel for every look value (lil-gui from three's examples). Changes apply at once; "print" writes the current
// look as JSON to the console so the numbers can be copied into looks.js and design/style-guide.md.
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
export function createTune(renderer, LOOKS) {
  const gui = new GUI({ title: 'Look: ' + renderer.look, width: 280 }); gui.domElement.style.cssText += ';position:fixed;right:8px;top:8px;z-index:50;font-size:12px;max-height:90vh;overflow:auto';
  const P = renderer.P; const re = () => renderer.applyLook();
  const f1 = gui.addFolder('Sky and fog'); for (const k of ['sky', 'horizon', 'fog']) f1.addColor(P, k).onChange(re); f1.add(P, 'fogDensity', 0, 0.01, 0.0001).onChange(re);
  const f2 = gui.addFolder('Light'); f2.addColor(P, 'sunColor').onChange(re); f2.add(P, 'sunIntensity', 0, 6, 0.05).onChange(re); f2.add(P, 'sunAzimuth', 0, 360, 1).onChange(re); f2.add(P, 'sunElevation', -10, 80, 0.5).onChange(re); f2.addColor(P, 'hemiSky').onChange(re); f2.addColor(P, 'hemiGround').onChange(re); f2.add(P, 'hemiIntensity', 0, 3, 0.05).onChange(re); f2.add(P, 'envIntensity', 0, 2, 0.05).onChange(re); f2.add(P, 'exposure', 0.3, 2.5, 0.05).onChange(re);
  const f3 = gui.addFolder('Post'); f3.add(P, 'bloomThreshold', 0, 1.5, 0.01).onChange(re); f3.add(P, 'bloomIntensity', 0, 4, 0.05).onChange(re); f3.add(P, 'bloomRadius', 0, 1, 0.01).onChange(re); f3.add(P, 'vignetteOffset', 0, 1, 0.01).onChange(re); f3.add(P, 'vignetteDarkness', 0, 1, 0.01).onChange(re); f3.add(P, 'grain', 0, 0.5, 0.01).onChange(re); f3.add(P, 'toneMapping', ['agx', 'aces']).onChange(re); f3.add(P, 'lutStrength', 0, 1, 0.05).onChange(re);
  const f4 = gui.addFolder('Grade'); f4.add(P, 'gradeSat', 0, 2, 0.05).onChange(re); f4.add(P, 'gradeContrast', 0.5, 1.6, 0.01).onChange(re); f4.add(P, 'gradeWarm', -0.2, 0.2, 0.01).onChange(re); f4.add(P, 'gradeLift', -0.1, 0.2, 0.005).onChange(re);
  const f5 = gui.addFolder('City and road'); f5.add(P, 'neon', 0, 1, 0.05).onChange(re); f5.add(P, 'wet', 0, 1, 0.05).onChange(re); f5.add(P, 'steam', 0, 1.5, 0.05).onChange(re); f5.add(P, 'rain', 0, 1, 0.05).onChange(re);
  gui.add({ print() { console.log(JSON.stringify(P)); const t = document.createElement('textarea'); t.value = JSON.stringify(P); document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); } }, 'print').name('print look JSON');
  return gui;
}
