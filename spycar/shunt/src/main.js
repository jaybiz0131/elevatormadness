// BERN-1 (the repo and branch keep the old name, shunt): the main loop and the phase machine. The sim (src/sim) is headless and stepped at 120 Hz; the renderer, HUD, audio
// and input hang off it from here. window.__shunt exposes the hooks the bots and the replay tools use.
import { fontsReady } from './ui/fonts.js';
import { T, H, clamp, fnv1a, localDate } from './sim/constants.js';
import { S, saveSettings } from './settings.js';
import { G, newRun, beginRun } from './sim/state.js';
import { advance, simStep, setInputSource, setSink, decayPresentation, hashState, exportReplay, startRecording, attachReplay, runSteps, STEP_LEN } from './sim/step.js';
import { slamTarget, wreck, creditCar } from './sim/physics.js';
import { initCrash, CRASH, crashLine } from './sim/crash.js';
import { audio, buzz } from './audio/audio.js';
import { files } from './audio/files.js';
import logoData from '../../../assets/brand/bern1_title_fire.jpg?inline';
import { stage, cv, ui, $, view, callout, hideCallout, updateSpecial, pulseSpecial, updateBoost, resetBoostUi } from './ui/dom.js';
import { showCard, refreshSettings, screen, setScreen, setSettingsFrom, settingsFrom } from './ui/cards.js';
import { input, bindInput, applyControls, showInput } from './input/input.js';
import { createCanvasRenderer } from './render/canvas.js';
import { createThreeRenderer } from './render/three/index.js';
import { createHud } from './ui/hud.js';
import { createPerf } from './ui/perf.js';
import { createStudio } from './render/three/studio.js';
import { createTune } from './render/three/tune.js';

const nowMs = () => (window.__clockMs !== undefined ? window.__clockMs : performance.now());   // (the clip tools run a virtual clock)
let capElapsed = 0, syncRun = false, phase = 'tap', now = 0, lastT = 0, elapsed = 0, countdown = 0, pausedFrom = 'playing';
const Q = new URLSearchParams(location.search);
let seed = Q.get('seed') !== null ? (Number(Q.get('seed')) >>> 0) : (Math.random() * 4294967296) >>> 0, dailyMode = false, best = 0, bestDaily = 0, cash = 0, hadRun = false;
try { best = Number(localStorage.getItem('shunt-best') || 0); bestDaily = Number(localStorage.getItem('shunt-best-' + localDate()) || 0); cash = Number(localStorage.getItem('shunt-cash') || 0); } catch (e) {}
const app = { get G() { return G; }, get dailyMode() { return dailyMode; }, get best() { return best; }, get bestDaily() { return bestDaily; }, get cash() { return cash; }, get diag() { return (renderer.diag ? renderer.diag() : 'canvas renderer') + ' | ' + crashLine() + ' | audio ' + audio.state(); } };
// ?concepts=1: the hero-car concept studio instead of the game (tools/concepts.mjs drives it)
if (Q.get('concepts')) { document.getElementById('ui').hidden = true; const studio = createStudio(cv, { look: Q.get('look') || 'night', hero: Q.get('concepts') === 'hero' }); const fitStudio = () => { view.SW = Math.round(clamp(H * window.innerWidth / window.innerHeight, 390, 1800)); const s = Math.min(window.innerWidth / view.SW, window.innerHeight / H); stage.style.width = view.SW + 'px'; stage.style.transform = `scale(${s})`; studio.resize(view.SW, H); }; fitStudio(); window.addEventListener('resize', fitStudio); let kind = Q.get('view') || 'front'; studio.view(kind); const loop = () => { studio.render(); requestAnimationFrame(loop); }; loop(); window.__studio = { setView(k) { kind = k; studio.view(k); }, focus(i, k) { studio.focus(i, k); }, studio }; throw new Error('studio mode'); }
// ?r=canvas keeps the Sprint C canvas renderer (the parity fallback); everything else renders in three.js. ?look= picks the look.
const useCanvas = Q.get('r') === 'canvas';
const renderer = useCanvas ? createCanvasRenderer(cv) : createThreeRenderer(cv, { look: Q.get('look') || 'night' });
const hud = useCanvas ? null : createHud($('ui'), renderer);
const perf = createPerf(Q, renderer, hud);
// the tune panel: ?tune=1 opens it at load, Settings > Developer > Tune panel at any time
// (a static import: the single-file build has no separate chunks, so the old lazy import never loaded on the published link)
let tune = null; const openTune = () => Promise.resolve(tune ? tune.toggle() : (tune = createTune(renderer), true));
if (!useCanvas && Q.get('tune') === '1') openTune();
if (hud) hud.lookToggle([{ key: 'night', label: 'NIGHT' }, { key: 'dusk', label: 'DUSK' }, { key: 'bluehour', label: 'BLUE HOUR' }], renderer.look, (k) => { renderer.setLook(k); if (tune) tune.refresh(); });

// ---------------- runs and phases ----------------
function freshRun(reseed) {
  if (reseed) seed = dailyMode ? fnv1a(localDate()) : (Math.random() * 4294967296) >>> 0;
  newRun(seed, { sens: S.sens, autoDrift: S.autoDrift, hairpinWall: Q.get('wall') !== '0', intro: Q.get('intro') !== '0' });
  if (renderer.setRoad) renderer.setRoad(G.road); renderer.reset(); input.reset(); ui.card.hidden = true; ui.special.hidden = true; ui.boost.hidden = true; ui.puck.hidden = true; ui.ebrake.hidden = true; ui.pad.hidden = true; ui.gas.hidden = true; ui.fire.hidden = true; updateSpecial(G);
}
// Stop 7: the app opens on the showroom car with TAP TO START (iOS blocks audio until a tap). The tap plays the theme from 0:00, every time; the BERN-1 logo punches in on the beat, then the menu
// fades in with the music playing (tpStage: 0 waiting for the beat, 1 logo in, 2 menu). Nothing is skipped or seeked: a tap during the intro shows the menu early, the music runs on.
// the title art (assets/brand/bern1_title_fire.jpg, black background) is inside the page as a data URL; the CSS draws it with screen blending, so its black is the showroom showing through. The text BERN-1 stays
// hidden: it shows only if the picture cannot be decoded.
ui.logoImg.onload = () => ui.logo.classList.add('img'); ui.logoImg.onerror = () => ui.logo.classList.remove('img'); ui.logoImg.src = logoData;
let introWas = false, tpStage = 2, tapWall = 0, tapSince = nowMs();
function enterTap() { phase = 'tap'; ui.card.hidden = true; ui.pause.hidden = true; ui.tap.hidden = false; tapSince = nowMs(); updateTap(); }
function enterTitle() { phase = 'title'; tpStage = 2; delete ui.card.dataset.tp; showCard('title', app); }
function tapReady() { const st = files.status('theme'); return st === 'ready' || st === 'failed' || nowMs() - tapSince > 25000; }
function updateTap() { if (phase !== 'tap') return; const ok = tapReady(); ui.tap.classList.toggle('wait', !ok); ui.tapText.textContent = ok ? 'TAP TO START' : 'LOADING'; ui.tapNote.textContent = ok ? '' : (files.bytes.theme ? Math.round(files.bytes.theme / 1024) + ' KB' : ''); }
function tapStart() {
  if (phase !== 'tap' || !tapReady()) return; audio.init(); audio.unlock(); audio.resume();
  const playing = audio.theme.startFull(); ui.tap.hidden = true; phase = 'title'; tapWall = nowMs(); showCard('title', app);
  if (playing) { tpStage = 0; ui.card.dataset.tp = '0'; } else { tpStage = 2; delete ui.card.dataset.tp; }
}
function revealMenu() { tpStage = 2; delete ui.card.dataset.tp; }
function punchLogo() { tpStage = 1; ui.card.dataset.tp = '1'; ui.logo.classList.remove('punch'); void ui.logo.offsetWidth; ui.logo.classList.add('punch'); ui.punch.classList.remove('go'); void ui.punch.offsetWidth; ui.punch.classList.add('go'); buzz([20, 20, 40]); }
function stepTitle() {
  if (phase !== 'title' || tpStage >= 2) return; const t = audio.theme.time(), hit = audio.theme.hit(); const wall = (nowMs() - tapWall) / 1000;
  if (t < 0 || hit === null) { if (wall > 0.4) revealMenu(); return; }
  if (tpStage === 0 && (t >= hit || wall > hit + 4)) punchLogo(); else if (tpStage === 1 && (t >= hit + 0.6 || wall > hit + 5)) revealMenu();
}
function startPlaying() { audio.theme.toLoop(1.6); phase = 'playing'; hideCallout(); hadRun = true; ui.card.hidden = true; ui.pause.hidden = false; ui.camBtn.hidden = false; ui.pad.hidden = false; ui.gas.hidden = false; ui.fire.hidden = false; ui.special.hidden = false; ui.boost.hidden = false; ui.puck.hidden = false; ui.ebrake.hidden = false; applyControls(); resetBoostUi(); updateSpecial(G); updateBoost(G); ui.special.classList.toggle('armed', !!(G.special && G.special.ammo > 0)); lookBar(false); beginRun(); }
// iOS counts touchend and click as gestures for audio, not pointerdown: unlock on those, window-wide, until it sticks
for (const ev of ['touchend', 'click', 'keydown']) window.addEventListener(ev, () => audio.unlock(), { passive: true });
function lookBar(show) { const b = document.querySelector('#hud .look'); if (b) { if (show) b.removeAttribute('hidden'); else b.setAttribute('hidden', ''); } }
function restartAndPlay(reseed) { freshRun(reseed); startPlaying(); }
function togglePause() { if (phase === 'paused') resume(); else if (phase === 'playing') pause(); }
function pause() { pausedFrom = phase === 'countdown' ? 'playing' : phase; phase = 'paused'; input.reset(); showCard('pause', app); }
function resume() { ui.card.hidden = true; input.reset(); lastT = 0; phase = 'countdown'; countdown = 3; callout('3', '', 0, true); }
function finishDeath() {
  phase = 'over'; lookBar(true); const isDaily = dailyMode; const prev = isDaily ? bestDaily : best; const earned = Math.round(G.score * 0.1); cash += earned;
  try { if (G.score > prev) { if (isDaily) { bestDaily = G.score; localStorage.setItem('shunt-best-' + localDate(), String(bestDaily)); } else { best = G.score; localStorage.setItem('shunt-best', String(best)); } } localStorage.setItem('shunt-cash', String(cash)); } catch (e) {}
  showCard('over', app); if (G.score > prev) { ui.newBest.hidden = false; audio.chime(); }
}

function finishWin() {
  phase = 'victory'; hideCallout(); lookBar(true); const prev = dailyMode ? bestDaily : best; const earned = Math.round(G.score * 0.1); cash += earned;
  try { if (G.score > prev) { if (dailyMode) { bestDaily = G.score; localStorage.setItem('shunt-best-' + localDate(), String(bestDaily)); } else { best = G.score; localStorage.setItem('shunt-best', String(best)); } } localStorage.setItem('shunt-cash', String(cash)); } catch (e) {}
  showCard('over', app); if (G.score > prev) { ui.newBest.hidden = false; audio.chime(); }
}

// ---------------- the sim's outbox ----------------
setInputSource(input);
setSink((ev) => {
  for (const e of ev) {
    if (e.k === 'sfx') { const f = audio[e.name]; if (f) f.apply(audio, e.a); }
    else if (e.k === 'buzz') buzz(e.p);
    else if (e.k === 'say') { if (e.text === null) hideCallout(); else callout(e.text, e.sub, e.ms, e.big); }
    else if (e.k === 'rebase') input.carAnchor += e.d;
    else if (e.k === 'won') { phase = 'won'; ui.special.hidden = true; ui.boost.hidden = true; ui.puck.hidden = true; ui.ebrake.hidden = true; ui.camBtn.hidden = true; ui.pad.hidden = true; ui.gas.hidden = true; ui.fire.hidden = true; input.reset(); callout('City reached', '', 2400, true); }
    else if (e.k === 'died') { phase = 'dying'; ui.special.hidden = true; ui.boost.hidden = true; ui.puck.hidden = true; ui.ebrake.hidden = true; ui.pad.hidden = true; ui.gas.hidden = true; ui.fire.hidden = true; input.reset(); }
    else if (e.k === 'special') { if (e.show) { const first = ui.special.hidden; ui.special.hidden = false; if (first) pulseSpecial(); } updateSpecial(G); ui.special.classList.toggle('armed', !!e.armed && !!(G.special && G.special.ammo > 0)); }
    else if (e.k === 'pulse') pulseSpecial();
    else if (e.k === 'mines') updateBoost(G);
    else if (e.k === 'face') input.onFace();
  }
});
function simulate(dt, playing) {
  advance(dt, playing);
  const minute = G.t / 60;
  audio.setEngine(clamp((Math.abs(G.speed) - 300) / 1000, 0, 1) + (G.air > 0 ? 0.2 : 0) + (G.burnout > 0 ? 0.6 : 0) + (G.in.gas && playing ? 0.15 : 0), playing, { firing: playing && (G.flashT2 > 0 || G.gunSpin > 0.05), gas: !!(G.in.gas && playing), limp: !!G.limp && playing, quiet: !!G.heroHidden }); ui.fire.classList.toggle('hot', G.hot > 0);
  { const on = playing && G.air <= 0, sp = Math.abs(G.speed), lat = Math.abs(G.vx) / Math.max(120, sp);   // the tyres: slide (slip angle, the 180), burnout (the timer builds the revs), hard cornering (sideways speed, grip exceeded), brake lock-up
    audio.setDrive({ slip: on ? clamp((Math.abs(G.slip) * 180 / Math.PI - 8) / 30, 0, 1) * (G.drifting || G.slipping ? 1 : 0.7) + (G.flip ? 0.9 : 0) : 0, burn: on ? (G.bo > 0 ? 0.35 + 0.65 * clamp(G.bo / 1.0, 0, 1) : G.burnout > 0 ? 0.7 : 0) : 0,
      turn: on ? Math.max(clamp((lat - 0.1) / 0.3, 0, 1), G.slipping ? 0.55 : 0, G.flip ? 0.8 : 0, G.in.ebrake && sp > 150 ? 0.5 : 0) : 0, lock: on && G.braking && sp > 420 ? 1 : 0, speed: clamp(sp / 1000, 0, 1.3), scrape: playing && G.scraping ? 1 : 0 }); }
  audio.updateMusic(dt, { firing: playing && (G.flashT2 > 0 || G.gunSpin > 0.05) });
  audio.music(dt, G.finale ? 3 : G.prog > 0.3 ? 2 : 1);   // (the old synth music: only if the theme files failed to load)
}

// ---------------- input and UI wiring ----------------
bindInput({
  onTouch() { audio.init(); audio.resume(); if (renderer.skipShot) renderer.skipShot(); },   // a tap skips a hero shot
  canTouch() { return !(phase === 'over' || phase === 'victory' || phase === 'paused' || phase === 'countdown'); },
  onStart(how) { if (phase === 'title') { if (tpStage < 2 && nowMs() - tapWall > 900) revealMenu(); else if (how === 'key' && tpStage >= 2) { freshRun(false); startPlaying(); } } },   // a touch on the title no longer starts a run: PLAY does
  onRestartKey() { if (phase === 'over' || phase === 'victory') { restartAndPlay(false); return true; } return false; },
  onPause() { togglePause(); },
  onHide() { if (phase === 'playing' || phase === 'countdown') pause(); },
});
for (const [id, key] of [['sSound', 'sound'], ['sMusic', 'music'], ['sHaptics', 'haptics'], ['sShake', 'shake'], ['sMotion', 'motion'], ['sHand', 'left'], ['sTapSlam', 'tapSlam'], ['sAutoDrift', 'autoDrift'], ['sDebug', 'debug'], ['sFewShots', 'fewShots'], ['sSimple', 'simple']]) $(id).addEventListener('click', () => { S[key] = !S[key]; saveSettings(); applyControls(); audio.apply(); refreshSettings(); });
$('sMusicVol').addEventListener('input', e => { S.musicVol = parseFloat(e.target.value); saveSettings(); audio.apply(); refreshSettings(); });
$('sSfxVol').addEventListener('input', e => { S.sfxVol = parseFloat(e.target.value); saveSettings(); audio.apply(); refreshSettings(); });
$('sSfxVol').addEventListener('change', () => audio.ping(false));   // a blip at the new level when the thumb lets go
ui.tap.addEventListener('click', tapStart); ui.tap.addEventListener('touchend', (e) => { e.preventDefault(); tapStart(); }, { passive: false });
window.addEventListener('keydown', () => { if (phase === 'tap') tapStart(); });
$('sSens').addEventListener('input', e => { S.sens = parseFloat(e.target.value); saveSettings(); refreshSettings(); });
$('sBench').addEventListener('click', () => { ui.card.hidden = true; perf.startBench('1', loadReplay); });
const nextCam = () => { S.cam = S.cam === 'A' ? 'B' : S.cam === 'B' ? 'C' : 'A'; saveSettings(); if (renderer.setCamera) renderer.setCamera(S.cam); refreshSettings(); };
$('sCam3').addEventListener('click', nextCam); ui.camBtn.addEventListener('click', nextCam);
for (const b of ui.camSel.querySelectorAll('button')) b.addEventListener('click', () => { S.cam = b.dataset.c; saveSettings(); if (renderer.setCamera) renderer.setCamera(S.cam); refreshSettings(); });
$('sGfx').addEventListener('click', () => { const order = ['auto', 'low', 'high']; const next = order[(order.indexOf(S.gfx || 'auto') + 1) % 3]; if (next === 'auto') S.gfxAuto = null; if (renderer.setGfx) renderer.setGfx(next); else { S.gfx = next; saveSettings(); } refreshSettings(); });
$('sTune').addEventListener('click', () => { if (useCanvas) return; openTune().then(on => $('sTune').classList.toggle('on', !!on)); });
$('sPerf').addEventListener('click', () => { $('sPerf').classList.toggle('on', perf.togglePerf()); });
ui.primary.addEventListener('click', () => { audio.init(); audio.resume(); if (screen() === 'title') { freshRun(false); startPlaying(); } else if (screen() === 'pause') resume(); else if (screen() === 'over') restartAndPlay(false); else if (screen() === 'settings') { if (settingsFrom() === 'pause') showCard('pause', app); else if (settingsFrom() === 'over') showCard('over', app); else enterTitle(); } });
ui.a.addEventListener('click', () => { audio.init(); if (screen() === 'title') { dailyMode = !dailyMode; freshRun(true); showCard('title', app); } else if (screen() === 'pause') { freshRun(false); startPlaying(); phase = 'playing'; } else if (screen() === 'over') restartAndPlay(true); });
ui.b.addEventListener('click', () => { audio.init(); if (screen() === 'title' || screen() === 'pause') { setSettingsFrom(screen()); showCard('settings', app); } else if (screen() === 'over') { freshRun(false); enterTitle(); } });
ui.c.addEventListener('click', () => { audio.init(); if (screen() === 'pause') { freshRun(false); enterTitle(); } else if (screen() === 'over') { setSettingsFrom('over'); showCard('settings', app); } });

// ---------------- loop ----------------
function frame(t) {
  const ts = t / 1000; if (!lastT) lastT = ts; const dt = Math.min(Math.max(ts - lastT, 0), 1 / 20); lastT = ts; now = ts; input.now = ts; input.playing = phase === 'playing'; input.introOn = !!G.intro; input.introSkipOK = !!S.introSeen; ui.ui.classList.toggle('intro', !!G.intro); ui.skipHint.hidden = !(G.intro && S.introSeen); if (G.intro) introWas = true; else if (introWas) { introWas = false; if (!S.introSeen) { S.introSeen = true; saveSettings(); } }
  if (phase !== 'paused' && !syncRun) {
    elapsed += dt;
    if (phase === 'countdown') { countdown -= dt; const n = Math.ceil(countdown); if (n <= 0) { phase = 'playing'; hideCallout(); ui.callout.classList.remove('big'); } else callout(String(n), '', 0, true); }
    else if (phase === 'title' || phase === 'tap') { simulate(dt, false); stepTitle(); updateTap(); }
    else if (phase === 'playing') simulate(dt, true);
    else if (phase === 'dying') { G.deathT += dt; simulate(dt * 0.3, false); if (G.deathT >= 1.2) finishDeath(); }
    else if (phase === 'won') { G.winT += dt; simulate(dt, false); if (G.winT >= 2.6) finishWin(); }
    else if (phase === 'over') G.replayT += dt;
    else if (phase === 'victory') simulate(dt, false);
    const st = { G, phase, elapsed, best, bestDaily, dailyMode }; renderer.render(dt, st); if (hud) hud.update(st); if (phase === 'playing' || phase === 'countdown') { updateBoost(G); showInput(G.in); } perf.frame(dt, st);
  }
  requestAnimationFrame(frame);
}
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  view.SW = Math.round(clamp(H * vw / vh, 390, 600)); const s = Math.min(vw / view.SW, vh / H);
  stage.style.width = view.SW + 'px'; stage.style.transform = `scale(${s})`;
  renderer.resize();
  // the iPhone safe areas (the html padding carries env(safe-area-inset-*)), in stage pixels: the stage is centred and scaled, so an
  // inset counts only where it reaches past the letterbox; ?safe=59,34 fakes a notch and a home bar for headless shots
  try { const cs = getComputedStyle(document.documentElement); const fake = (Q.get('safe') || '').split(',').map(Number); const top = fake[0] || parseFloat(cs.paddingTop) || 0, bot = fake[1] || parseFloat(cs.paddingBottom) || 0; const gap = (vh - H * s) / 2;
    window.safeTop = Math.max(0, top - gap) / s; view.safeTop = window.safeTop; view.safeBottom = Math.max(0, bot - gap) / s; document.documentElement.style.setProperty('--safe-top', window.safeTop + 'px'); document.documentElement.style.setProperty('--safe-bottom', view.safeBottom + 'px'); } catch (e) { window.safeTop = 0; }
}
window.addEventListener('resize', fit);
audio.boot();   // the theme starts loading now, while the TAP TO START screen shows
async function start() { await Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))]); /* the crash physics (Rapier) must be up before the first run: every run builds its own world */ await initCrash(); fit(); refreshSettings(); freshRun(false); enterTap(); try { localStorage.setItem('shunt-runs', String(Number(localStorage.getItem('shunt-runs') || 0) + 1)); } catch (e) {} if (renderer.prewarm) await renderer.prewarm(); requestAnimationFrame(frame); perf.start(loadReplay); }

// ---------------- hooks for bots and replays ----------------
function loadReplay(r) { seed = r.seed >>> 0; dailyMode = false; S.sens = r.cfg.sens; S.autoDrift = r.cfg.autoDrift; newRun(seed, { sens: r.cfg.sens, autoDrift: r.cfg.autoDrift, hairpinWall: !!r.cfg.hairpinWall, intro: !!r.cfg.intro }); if (renderer.setRoad) renderer.setRoad(G.road); renderer.reset(); input.reset(); ui.card.hidden = true; ui.special.hidden = true; ui.boost.hidden = true; ui.puck.hidden = true; ui.ebrake.hidden = true; ui.pad.hidden = true; updateSpecial(G); attachReplay(r); startPlaying(); return G; }
window.__shunt = {
  get phase() { return phase; }, get G() { return G; }, get T() { return T; }, get S() { return S; }, input, slamTarget, app,
  // staging hook for the clip tools: wreck a car (the player's doing) and throw its body sideways at `v` m/s (negative is left)
  fling: (c, v, up = 3) => { creditCar(c, 'slam'); wreck(c, 'slam', true); if (c.rb) { const l = c.rb.linvel(); c.rb.setLinvel({ x: v, y: up, z: l.z }, true); } },
  fireSpecial: () => input.requestSpecial(), trySlam: (d) => input.requestSlam(d),
  startPlaying: () => { ui.tap.hidden = true; freshRun(false); startPlaying(); },   // (the tools skip the TAP TO START screen)
  resume: () => { syncRun = false; lastT = 0; },   // hand the sim back to the frame loop after synchronous stepping (capture tools)
  audio, files, uiStep: () => { stepTitle(); updateTap(); }, get tpStage() { return tpStage; }, CRASH, crashLine, record: (bot) => startRecording(bot), exportReplay, loadReplay, runSteps: (n) => { syncRun = true; return runSteps(n, phase === 'playing'); }, hashState, STEP: STEP_LEN,
  renderer: () => renderer, perf, get phaseName() { return phase; },
  // for the capture tool: render one frame now (the sim is stepped by runSteps, which stops the frame loop simulating)
  renderFrame: (dt) => { capElapsed += dt; const st = { G, phase, elapsed: capElapsed, best, bestDaily, dailyMode }; renderer.render(dt, st); if (hud) hud.update(st); updateBoost(G); showInput(G.in); },
};
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start); else start();
