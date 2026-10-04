// ?perf=1: a live overlay (fps, frame ms, draw calls, triangles, textures, resolution scale). ?bench=1: plays the recorded skilled run of
// the beauty route, then shows average fps, 1% low, worst frame and the resolution scale it settled on. ?bench=soak: ten minutes,
// first minute against last. ?shots=1 plays the same run for the postcard tool. Headless numbers are not iPhone numbers.
import bench from '../../replays/beauty.json';
import { S } from '../settings.js';
// the debug readout: frames per second and draw calls for the whole frame (main pass, shadow pass and post), refreshed twice a
// second; amber when calls pass the 150 budget or fps drops under 55. On from Settings > Debug readout, or ?debug=1.
const CALL_BUDGET = 150;
function createDebug(Q, renderer) {
  const force = Q.get('debug') === '1'; let el = null, t = 0, n = 0, acc = 0;
  return function (dt, elapsed) {
    const on = force || S.debug; if (!on) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement('div'); el.id = 'dbg'; document.getElementById('ui').appendChild(el); } el.hidden = false;
    n++; acc += dt; if (performance.now() - t < 500) return; t = performance.now();
    const fps = n / Math.max(1e-3, acc); n = 0; acc = 0; const s = renderer.stats ? renderer.stats() : null; const calls = s ? s.calls : 0;
    el.textContent = `FPS ${fps.toFixed(0)}\nCALLS ${calls}` + (s ? `\nTRIS ${(s.triangles / 1000).toFixed(0)}k` : ''); el.classList.toggle('over', calls > CALL_BUDGET || fps < 55);
  };
}
export function createPerf(Q, renderer, hud) {
  let mode = Q.get('bench'); let show = Q.get('perf') === '1' || !!mode; const shots = Q.get('shots') === '1';
  let el = null; function overlay() { if (el) return; el = document.createElement('div'); el.style.cssText = 'position:absolute;left:12px;top:calc(110px + var(--safe-top,0px));font:600 13px/1.4 monospace;color:#9fe;background:rgba(0,0,0,0.55);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre;z-index:5'; document.getElementById('ui').appendChild(el); }
  if (show) overlay();
  const frames = []; let t = 0, acc = 0, n = 0, worst = 0, running = false, results = null, soakStart = 0, loops = 0, lastPerf = 0, minutesDone = false; const minutes = [];
  const debug = createDebug(Q, renderer);
  function frame(dt, st) {
    debug(dt, st.elapsed);
    if (!show && !shots) return; const ms = dt * 1000; acc += ms; n++; worst = Math.max(worst, ms); if (running) frames.push(ms);
    const wall = performance.now() / 1000;   // the soak runs on wall time, not the frame-capped elapsed clock
    if (mode === 'soak' && running) { const m = Math.floor((wall - soakStart) / 60); if (!minutes[m]) minutes[m] = { ms: [], mem: [] }; minutes[m].ms.push(ms); if (performance.memory && n % 60 === 0) minutes[m].mem.push(performance.memory.usedJSHeapSize); }
    if (el && st.elapsed - lastPerf > 0.25) { lastPerf = st.elapsed; const s = renderer.stats ? renderer.stats() : null; const fps = n / (acc / 1000); el.textContent = `fps ${fps.toFixed(0)}  frame ${(acc / n).toFixed(1)} ms  worst ${worst.toFixed(0)}` + (s ? `\ncalls ${s.calls}  tris ${(s.triangles / 1000).toFixed(0)}k  tex ${s.textures}  geo ${s.geometries}\nscale ${s.scale.toFixed(2)} / cap ${s.cap.toFixed(2)}` : '') + (renderer.diag ? '\n' + renderer.diag().replace(/ · /g, '\n') : '') + (results ? '\n' + results : ''); acc = 0; n = 0; worst = 0; }
    if (running && mode === 'soak' && wall - soakStart >= 600) { minutesDone = true; finish(st); return; }   // ten minutes of wall time, whatever the frame rate
    if (running && st.phase === 'over') finish(st);
    if (running && window.__shunt.G.rep && window.__shunt.G.rep.ended) finish(st);
  }
  function finish(st) {
    const G = window.__shunt.G; if (mode === 'soak' && !minutesDone && performance.now() / 1000 - soakStart < 600) { loops++; if (window.__shunt.loadReplay) window.__shunt.loadReplay(bench); return; }
    running = false; const sorted = frames.slice().sort((a, b) => b - a); const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length); const low1 = sorted[Math.floor(sorted.length * 0.01)] || 0; const worst1 = sorted[0] || 0; const s = renderer.stats ? renderer.stats() : { scale: 1 };
    const r = { frames: frames.length, avgFps: 1000 / avg, avgMs: avg, low1Fps: 1000 / low1, worstMs: worst1, scale: s.scale, calls: s.calls, triangles: s.triangles, loops, headless: !!navigator.webdriver };
    if (mode === 'soak') { const f = minutes[0], l = minutes[minutes.length - 1]; const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); r.first = { avgMs: mean(f.ms), worst: Math.max(...f.ms), memMB: mean(f.mem) / 1048576 }; r.last = { avgMs: mean(l.ms), worst: Math.max(...l.ms), memMB: mean(l.mem) / 1048576 }; r.minutes = minutes.length; }
    window.__shunt.bench = r;
    results = `BENCH ${mode === 'soak' ? 'SOAK ' + r.minutes + ' min' : ''}\navg ${r.avgFps.toFixed(1)} fps (${r.avgMs.toFixed(2)} ms)\n1% low ${r.low1Fps.toFixed(1)} fps\nworst ${r.worstMs.toFixed(1)} ms\nscale ${r.scale.toFixed(2)}  calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(0)}k` + (r.first ? `\nfirst min ${r.first.avgMs.toFixed(2)} ms / ${r.first.memMB.toFixed(0)} MB\nlast min ${r.last.avgMs.toFixed(2)} ms / ${r.last.memMB.toFixed(0)} MB` : '') + (r.headless ? '\n(headless: not iPhone numbers)' : '');
    if (el) el.textContent = results;
    const card = document.createElement('div'); card.id = 'benchCard'; card.style.cssText = 'position:absolute;left:24px;right:24px;top:40%;background:rgba(0,0,0,0.8);color:#fff;font:700 17px/1.5 monospace;padding:16px;border-radius:12px;white-space:pre;z-index:6;pointer-events:none'; card.textContent = results; document.getElementById('ui').appendChild(card);
  }
  function start(loadReplay) { if (!mode && !shots) return; running = true; soakStart = performance.now() / 1000; frames.length = 0; loadReplay(bench); if (el) el.textContent = 'bench running…'; }
  // from the Settings card: run the benchmark, or toggle the frame counter, without a URL parameter
  function startBench(m, loadReplay) { mode = m; show = true; overlay(); const old = document.getElementById('benchCard'); if (old) old.remove(); results = null; start(loadReplay); }
  function togglePerf() { show = !show; if (show) overlay(); else if (el) { el.remove(); el = null; } return show; }
  return { frame, start, startBench, togglePerf, get results() { return window.__shunt.bench; }, get mode() { return mode; } };
}
