// The tune panel (?tune=1, or Settings > Developer > Tune panel): a live panel for every look value (lil-gui from three's examples).
// Changes apply at once and stay with that look for the session (the renderer keeps a working copy per look, so switching looks no
// longer drops the edits or leaves the panel editing a stale copy); the panel rebuilds on a look change. "Copy look JSON" puts the
// current values on the clipboard (and in the console) for looks.js and design/style-guide.md. Rows are 13 px and touch height.
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { CAM_PRESETS, setCamPreset, camBase, labSave, labReset } from './camera.js';
import { SHOTS, SHOT_NAMES } from './shots.js';
import { PUCK, PUCK_DEFAULT, savePuck, input } from '../../input/input.js';
const CSS = `.lil-gui.tune { --font-size: 13px; --input-font-size: 13px; --widget-height: 30px; --title-height: 36px; --name-width: 44%; --font-family: var(--font-body);
  position: fixed; right: 8px; top: calc(8px + env(safe-area-inset-top, 0px)); z-index: 50; width: min(300px, 86vw); max-height: 80vh; overflow: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; }`;
function copy(text) { console.log(text); try { if (navigator.clipboard) return navigator.clipboard.writeText(text); } catch (e) {} const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); }
export function createTune(renderer) {
  if (!document.getElementById('tuneCss')) { const s = document.createElement('style'); s.id = 'tuneCss'; s.textContent = CSS; document.head.appendChild(s); }
  let gui = null, tick = 0, open = { 'Camera Lab': false, 'Sky and fog': false, Light: false, Post: false, Grade: false, 'City and road': false, Puck: true };
  function build(startOpen) {
    if (gui) { for (const f of gui.folders) open[f._title] = !f._closed; gui.destroy(); }
    const P = renderer.P; const re = () => renderer.applyLook();
    gui = new GUI({ title: 'Tune: ' + P.name, width: 300 }); gui.domElement.classList.add('tune'); gui.domElement.addEventListener('pointerdown', e => e.stopPropagation());   // touches on the panel never steer the car
    const folder = (name) => { const f = gui.addFolder(name); if (!open[name]) f.close(); return f; };
    const f1 = folder('Sky and fog'); for (const k of ['sky', 'horizon', 'fog']) f1.addColor(P, k).onChange(re); f1.add(P, 'fogDensity', 0, 0.01, 0.0001).onChange(re);
    const f2 = folder('Light'); f2.addColor(P, 'sunColor').onChange(re); f2.add(P, 'sunIntensity', 0, 6, 0.05).onChange(re); if (P.rim) { f2.addColor(P, 'rim').onChange(re); f2.add(P, 'rimIntensity', 0, 6, 0.05).onChange(re); } f2.add(P, 'sunAzimuth', 0, 360, 1).onChange(re); f2.add(P, 'sunElevation', -10, 80, 0.5).onChange(re); f2.addColor(P, 'hemiSky').onChange(re); f2.addColor(P, 'hemiGround').onChange(re); f2.add(P, 'hemiIntensity', 0, 3, 0.05).onChange(re); f2.add(P, 'envIntensity', 0, 2, 0.05).onChange(re); f2.add(P, 'exposure', 0.3, 2.5, 0.05).onChange(re);
    const f3 = folder('Post'); f3.add(P, 'bloomThreshold', 0, 1.5, 0.01).onChange(re); f3.add(P, 'bloomIntensity', 0, 4, 0.05).onChange(re); f3.add(P, 'bloomRadius', 0, 1, 0.01).onChange(re); f3.add(P, 'vignetteOffset', 0, 1, 0.01).onChange(re); f3.add(P, 'vignetteDarkness', 0, 1, 0.01).onChange(re); f3.add(P, 'grain', 0, 0.5, 0.01).onChange(re); f3.add(P, 'toneMapping', ['agx', 'aces']).onChange(re); f3.add(P, 'lutStrength', 0, 1, 0.05).onChange(re);
    const f4 = folder('Grade'); f4.add(P, 'gradeSat', 0, 2, 0.05).onChange(re); f4.add(P, 'gradeContrast', 0.5, 1.6, 0.01).onChange(re); f4.add(P, 'gradeWarm', -0.2, 0.2, 0.01).onChange(re); f4.add(P, 'gradeLift', -0.1, 0.2, 0.005).onChange(re);
    const f5 = folder('City and road'); f5.add(P, 'neon', 0, 1, 0.05).onChange(re); f5.add(P, 'wet', 0, 1, 0.05).onChange(re); f5.add(P, 'steam', 0, 1.5, 0.05).onChange(re); f5.add(P, 'rain', 0, 1, 0.05).onChange(re);
    // Camera Lab: A, B and C and every named shot, live. height, distance and angle are three views of one number pair (height = distance x sin angle):
    // changing one keeps the right one of the others. Edits are kept in this browser; "Copy camera values" puts the JSON on the clipboard.
    const f6 = folder('Camera Lab'); const refreshAll = () => { for (const c of gui.controllersRecursive()) c.updateDisplay(); };
    const sync = () => { if (CAM_PRESETS[camBase()]) setCamPreset(camBase()); labSave(); refreshAll(); };
    const rig = (o, parent, keys) => { const v = { get height() { return o.dist * Math.sin(o.pitch * Math.PI / 180); }, set height(h) { o.dist = h / Math.max(0.05, Math.sin(o.pitch * Math.PI / 180)); }, get distance() { return o.dist; }, set distance(d) { o.dist = d; }, get angle() { return o.pitch; }, set angle(a) { o.pitch = a; } };
      parent.add(v, 'height', 0.5, 90, 0.1).name('height (m)').onChange(sync); parent.add(v, 'distance', 5, 120, 0.5).name('distance (m)').onChange(sync); parent.add(v, 'angle', 0, 80, 0.5).name('angle (deg)').onChange(sync);
      parent.add(o, 'fov', 20, 90, 0.5).name('lens width (fov)').onChange(sync); if ('lowerThird' in o) parent.add(o, 'lowerThird', 0.15, 0.6, 0.01).name('car on screen').onChange(sync); if ('lower' in o) parent.add(o, 'lower', 0.15, 0.6, 0.01).name('car on screen').onChange(sync);
      parent.add(o, 'lean', 0, 14, 0.5).name('lean into turns').onChange(sync); parent.add(o, 'blend', 0.15, 2.5, 0.05).name('blend (s)').onChange(sync); for (const k of keys || []) parent.add(o, k, k === 'yaw' ? -120 : 0, k === 'yaw' ? 120 : 40, 1).onChange(sync); };
    const hold = { shot: '(director)' }; f6.add(hold, 'shot', ['(director)', ...Object.keys(SHOTS)]).name('hold a shot').onChange(v => { if (renderer.director) renderer.director.force = v === '(director)' ? null : v; });
    for (const k of Object.keys(CAM_PRESETS)) { const g = f6.addFolder('Camera ' + k + (k === 'A' ? ' (high)' : k === 'B' ? ' (chase)' : ' (close)')); g.close(); rig(CAM_PRESETS[k], g, []); g.add(CAM_PRESETS[k], 'pitchHi', 0, 80, 0.5).name('lift angle').onChange(sync); g.add(CAM_PRESETS[k], 'distHi', 5, 140, 0.5).name('lift distance').onChange(sync); }
    for (const k of Object.keys(SHOTS)) { const g = f6.addFolder(SHOT_NAMES[k] || k); g.close(); rig(SHOTS[k], g, ['yaw']); if ('aim' in SHOTS[k]) g.add(SHOTS[k], 'aim', 0, 40, 1).name('aim at exit (deg)').onChange(sync); if ('hold' in SHOTS[k]) g.add(SHOTS[k], 'hold', 1, 3, 0.1).name('length (s)').onChange(sync); }
    f6.add({ copy() { copy(JSON.stringify({ presets: CAM_PRESETS, shots: SHOTS })); } }, 'copy').name('Copy camera values'); f6.add({ reset() { labReset(); refreshAll(); } }, 'reset').name('Reset cameras');
    // Stop 7: the control puck. The numbers are fractions of the puck's radius (measured from its centre). They apply at once and are kept in this browser; Copy puck values puts them on the clipboard.
    // The readout shows what the thumb is telling the car right now (try it with a thumb on the puck while this panel is open)
    const f7 = folder('Puck'); const live = { gas: '', fire: '', ebrake: '' }; const pk = () => { savePuck(); };
    f7.add(PUCK, 'lift', 0.05, 0.9, 0.01).name('gas lifts at (middle)').onChange(pk); f7.add(PUCK, 'liftSide', 0.2, 1.0, 0.01).name('gas lifts at (fire, e-brake)').onChange(pk); f7.add(PUCK, 'run', 0.05, 0.8, 0.01).name('then full brake after').onChange(pk); f7.add(PUCK, 'zone', 0.15, 0.7, 0.01).name('fire / e-brake from').onChange(pk);
    f7.add(live, 'gas').name('gas now').listen().disable(); f7.add(live, 'fire').name('fire now').listen().disable(); f7.add(live, 'ebrake').name('e-brake now').listen().disable();
    if (tick) clearInterval(tick); tick = setInterval(() => { const t = input.puckId !== null ? input.puckThr : 0; live.gas = input.puckId === null ? 'off the puck (coast)' : t >= 0.99 ? 'full gas' : t > 0.05 ? Math.round(t * 100) + '% gas' : t > -0.05 ? 'coast' : Math.round(-t * 100) + '% brake'; live.fire = input.puckFire ? 'FIRE' : '-'; live.ebrake = input.puckEb ? 'E-BRAKE' : '-'; }, 100);
    f7.add({ copy() { copy(JSON.stringify(PUCK)); } }, 'copy').name('Copy puck values'); f7.add({ reset() { Object.assign(PUCK, PUCK_DEFAULT); pk(); refreshAll(); } }, 'reset').name('Reset puck');
    gui.add({ copy() { copy(JSON.stringify(renderer.P)); } }, 'copy').name('Copy look JSON');
    gui.add({ reset() { renderer.resetLook(); build(true); } }, 'reset').name('Reset this look');
    if (!startOpen) gui.close();
  }
  build(true);
  return { refresh() { build(!gui._closed); }, toggle() { gui.domElement.hidden = !gui.domElement.hidden; return !gui.domElement.hidden; }, get gui() { return gui; } };
}
