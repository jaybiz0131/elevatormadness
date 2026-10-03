// Shunt: the main loop and the phase machine. The sim (src/sim) is headless and stepped at 120 Hz; the renderer, HUD, audio
// and input hang off it from here. window.__shunt exposes the hooks the bots and the replay tools use.
import { T, H, clamp, fnv1a, localDate } from './sim/constants.js';
import { S, saveSettings } from './settings.js';
import { G, newRun, beginRun } from './sim/state.js';
import { advance, simStep, setInputSource, setSink, decayPresentation, hashState, exportReplay, startRecording, attachReplay, runSteps, STEP_LEN } from './sim/step.js';
import { slamTarget } from './sim/physics.js';
import { audio, buzz } from './audio/audio.js';
import { stage, cv, ui, $, view, callout, hideCallout, updateSpecial, pulseSpecial } from './ui/dom.js';
import { showCard, refreshSettings, screen, setScreen, setSettingsFrom, settingsFrom } from './ui/cards.js';
import { input, bindInput } from './input/input.js';
import { createCanvasRenderer } from './render/canvas.js';
import { createThreeRenderer } from './render/three/index.js';
import { createHud } from './ui/hud.js';
import { createPerf } from './ui/perf.js';
import { createStudio } from './render/three/studio.js';

let syncRun = false, phase = 'title', now = 0, lastT = 0, elapsed = 0, countdown = 0, pausedFrom = 'playing';
const Q = new URLSearchParams(location.search);
let seed = Q.get('seed') !== null ? (Number(Q.get('seed')) >>> 0) : (Math.random() * 4294967296) >>> 0, dailyMode = false, best = 0, bestDaily = 0, cash = 0, hadRun = false;
try { best = Number(localStorage.getItem('shunt-best') || 0); bestDaily = Number(localStorage.getItem('shunt-best-' + localDate()) || 0); cash = Number(localStorage.getItem('shunt-cash') || 0); } catch (e) {}
const app = { get G() { return G; }, get dailyMode() { return dailyMode; }, get best() { return best; }, get bestDaily() { return bestDaily; }, get cash() { return cash; } };
// ?concepts=1: the hero-car concept studio instead of the game (tools/concepts.mjs drives it)
if (Q.get('concepts') === '1') { document.getElementById('ui').hidden = true; const studio = createStudio(cv, { look: Q.get('look') || 'night' }); const fitStudio = () => { view.SW = Math.round(clamp(H * window.innerWidth / window.innerHeight, 390, 1800)); const s = Math.min(window.innerWidth / view.SW, window.innerHeight / H); stage.style.width = view.SW + 'px'; stage.style.transform = `scale(${s})`; studio.resize(view.SW, H); }; fitStudio(); window.addEventListener('resize', fitStudio); let kind = Q.get('view') || 'front'; studio.view(kind); const loop = () => { studio.render(); requestAnimationFrame(loop); }; loop(); window.__studio = { setView(k) { kind = k; studio.view(k); }, focus(i, k) { studio.focus(i, k); }, studio }; throw new Error('studio mode'); }
// ?r=canvas keeps the Sprint C canvas renderer (the parity fallback); everything else renders in three.js. ?look= picks the look.
const useCanvas = Q.get('r') === 'canvas';
const renderer = useCanvas ? createCanvasRenderer(cv) : createThreeRenderer(cv, { look: Q.get('look') || 'night' });
const hud = useCanvas ? null : createHud($('ui'), renderer);
const perf = createPerf(Q, renderer, hud);
if (!useCanvas && Q.get('tune') === '1') import('./render/three/tune.js').then(m => m.createTune(renderer, null));
if (hud) hud.lookToggle([{ key: 'night', label: 'NIGHT' }, { key: 'dusk', label: 'DUSK' }, { key: 'bluehour', label: 'BLUE HOUR' }], renderer.look, (k) => renderer.setLook(k));

// ---------------- runs and phases ----------------
function freshRun(reseed) {
  if (reseed) seed = dailyMode ? fnv1a(localDate()) : (Math.random() * 4294967296) >>> 0;
  newRun(seed, { sens: S.sens, autoDrift: S.autoDrift, hairpinWall: Q.get('wall') !== '0' });
  if (renderer.setRoad) renderer.setRoad(G.road); renderer.reset(); input.reset(); ui.card.hidden = true; ui.special.hidden = true; ui.pad.hidden = true; updateSpecial(G);
}
function enterTitle() { phase = 'title'; showCard('title', app); }
function startPlaying() { phase = 'playing'; hideCallout(); hadRun = true; ui.card.hidden = true; ui.pad.hidden = false; beginRun(); }
function restartAndPlay(reseed) { freshRun(reseed); startPlaying(); }
function togglePause() { if (phase === 'paused') resume(); else if (phase === 'playing') pause(); }
function pause() { pausedFrom = phase === 'countdown' ? 'playing' : phase; phase = 'paused'; input.reset(); showCard('pause', app); }
function resume() { ui.card.hidden = true; input.reset(); lastT = 0; phase = 'countdown'; countdown = 3; callout('3', '', 0, true); }
function finishDeath() {
  phase = 'over'; const isDaily = dailyMode; const prev = isDaily ? bestDaily : best; const earned = Math.round(G.score * 0.1); cash += earned;
  try { if (G.score > prev) { if (isDaily) { bestDaily = G.score; localStorage.setItem('shunt-best-' + localDate(), String(bestDaily)); } else { best = G.score; localStorage.setItem('shunt-best', String(best)); } } localStorage.setItem('shunt-cash', String(cash)); } catch (e) {}
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
    else if (e.k === 'died') { phase = 'dying'; ui.special.hidden = true; ui.pad.hidden = true; input.reset(); }
    else if (e.k === 'special') { if (e.show) { const first = ui.special.hidden; ui.special.hidden = false; if (first) pulseSpecial(); } updateSpecial(G); ui.special.classList.toggle('armed', !!e.armed && !!(G.special && G.special.ammo > 0)); }
    else if (e.k === 'pulse') pulseSpecial();
  }
});
function simulate(dt, playing) {
  advance(dt, playing);
  const minute = G.t / 60;
  audio.setEngine(clamp((G.speed - 300) / 600, 0, 1) + (G.air > 0 ? 0.2 : 0) + (G.burnout > 0 ? 0.6 : 0), playing);
  audio.setDrive(playing && G.air <= 0 ? clamp((Math.abs(G.slip) * 180 / Math.PI - 8) / 30, 0, 1) + (G.burnout > 0 ? 0.6 : 0) : 0, playing && G.scraping ? 1 : 0);
  audio.music(dt, G.wave === 'pressure' ? (minute > 1 ? 2 : 1) : 0);
}

// ---------------- input and UI wiring ----------------
bindInput({
  onTouch() { audio.init(); audio.resume(); },
  canTouch() { return !(phase === 'over' || phase === 'paused' || phase === 'countdown'); },
  onStart() { if (phase === 'title') { freshRun(false); startPlaying(); } },
  onRestartKey() { if (phase === 'over') { restartAndPlay(false); return true; } return false; },
  onPause() { togglePause(); },
  onHide() { if (phase === 'playing' || phase === 'countdown') pause(); },
});
for (const [id, key] of [['sSound', 'sound'], ['sMusic', 'music'], ['sHaptics', 'haptics'], ['sShake', 'shake'], ['sMotion', 'motion'], ['sHand', 'left'], ['sTapSlam', 'tapSlam'], ['sAutoDrift', 'autoDrift']]) $(id).addEventListener('click', () => { S[key] = !S[key]; saveSettings(); audio.apply(); refreshSettings(); });
$('sSens').addEventListener('input', e => { S.sens = parseFloat(e.target.value); saveSettings(); refreshSettings(); });
ui.primary.addEventListener('click', () => { audio.init(); audio.resume(); if (screen() === 'title') { freshRun(false); startPlaying(); } else if (screen() === 'pause') resume(); else if (screen() === 'over') restartAndPlay(false); else if (screen() === 'settings') { if (settingsFrom() === 'pause') showCard('pause', app); else if (settingsFrom() === 'over') showCard('over', app); else enterTitle(); } });
ui.a.addEventListener('click', () => { audio.init(); if (screen() === 'title') { dailyMode = !dailyMode; freshRun(true); showCard('title', app); } else if (screen() === 'pause') { freshRun(false); startPlaying(); phase = 'playing'; } else if (screen() === 'over') restartAndPlay(true); });
ui.b.addEventListener('click', () => { audio.init(); if (screen() === 'title' || screen() === 'pause') { setSettingsFrom(screen()); showCard('settings', app); } else if (screen() === 'over') { freshRun(false); enterTitle(); } });
ui.c.addEventListener('click', () => { audio.init(); if (screen() === 'pause') { freshRun(false); enterTitle(); } else if (screen() === 'over') { setSettingsFrom('over'); showCard('settings', app); } });

// ---------------- loop ----------------
function frame(t) {
  const ts = t / 1000; if (!lastT) lastT = ts; const dt = Math.min(Math.max(ts - lastT, 0), 1 / 20); lastT = ts; now = ts; input.now = ts; input.playing = phase === 'playing';
  if (phase !== 'paused' && !syncRun) {
    elapsed += dt;
    if (phase === 'countdown') { countdown -= dt; const n = Math.ceil(countdown); if (n <= 0) { phase = 'playing'; hideCallout(); ui.callout.classList.remove('big'); } else callout(String(n), '', 0, true); }
    else if (phase === 'title') simulate(dt, false);
    else if (phase === 'playing') simulate(dt, true);
    else if (phase === 'dying') { G.deathT += dt; simulate(dt * 0.3, false); if (G.deathT >= 1.2) finishDeath(); }
    else if (phase === 'over') G.replayT += dt;
    const st = { G, phase, elapsed, best, bestDaily, dailyMode }; renderer.render(dt, st); if (hud) hud.update(st); perf.frame(dt, st);
  }
  requestAnimationFrame(frame);
}
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  view.SW = Math.round(clamp(H * vw / vh, 390, 600)); const s = Math.min(vw / view.SW, vh / H);
  stage.style.width = view.SW + 'px'; stage.style.transform = `scale(${s})`;
  renderer.resize();
  try { const pad = parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0; window.safeTop = Math.max(0, pad) / s; view.safeTop = window.safeTop; document.documentElement.style.setProperty('--safe-top', window.safeTop + 'px'); } catch (e) { window.safeTop = 0; }
}
window.addEventListener('resize', fit);
async function start() { fit(); refreshSettings(); freshRun(false); enterTitle(); try { localStorage.setItem('shunt-runs', String(Number(localStorage.getItem('shunt-runs') || 0) + 1)); } catch (e) {} if (renderer.prewarm) await renderer.prewarm(); requestAnimationFrame(frame); perf.start(loadReplay); }

// ---------------- hooks for bots and replays ----------------
function loadReplay(r) { seed = r.seed >>> 0; dailyMode = false; S.sens = r.cfg.sens; S.autoDrift = r.cfg.autoDrift; newRun(seed, { sens: r.cfg.sens, autoDrift: r.cfg.autoDrift, hairpinWall: !!r.cfg.hairpinWall }); if (renderer.setRoad) renderer.setRoad(G.road); renderer.reset(); input.reset(); ui.card.hidden = true; ui.special.hidden = true; ui.pad.hidden = true; updateSpecial(G); attachReplay(r); startPlaying(); return G; }
window.__shunt = {
  get phase() { return phase; }, get G() { return G; }, get T() { return T; }, get S() { return S; }, input, slamTarget,
  fireSpecial: () => input.requestFire(), trySlam: (d) => input.requestSlam(d),
  startPlaying: () => { freshRun(false); startPlaying(); },
  record: (bot) => startRecording(bot), exportReplay, loadReplay, runSteps: (n) => { syncRun = true; return runSteps(n, phase === 'playing'); }, hashState, STEP: STEP_LEN,
  renderer: () => renderer, perf, get phaseName() { return phase; },
};
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start); else start();
