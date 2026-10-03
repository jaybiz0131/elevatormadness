// ?perf=1: a live overlay (fps, frame ms, draw calls, triangles, textures, resolution scale). ?bench=1: plays the recorded skilled run of
// the beauty route, then shows average fps, 1% low, worst frame and the resolution scale it settled on. ?bench=soak: ten minutes,
// first minute against last. ?shots=1 plays the same run for the postcard tool. Headless numbers are not iPhone numbers.
import bench from '../../replays/beauty.json';
export function createPerf(Q, renderer, hud) {
  const mode = Q.get('bench'); const show = Q.get('perf') === '1' || !!mode; const shots = Q.get('shots') === '1';
  let el = null; if (show) { el = document.createElement('div'); el.style.cssText = 'position:absolute;left:12px;top:calc(110px + var(--safe-top,0px));font:600 13px/1.4 monospace;color:#9fe;background:rgba(0,0,0,0.55);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre;z-index:5'; document.getElementById('ui').appendChild(el); }
  const frames = []; let t = 0, acc = 0, n = 0, worst = 0, running = false, results = null, soakStart = 0, loops = 0, lastPerf = 0, minutesDone = false; const minutes = [];
  function frame(dt, st) {
    if (!show && !shots) return; const ms = dt * 1000; acc += ms; n++; worst = Math.max(worst, ms); if (running) frames.push(ms);
    if (mode === 'soak' && running) { const m = Math.floor((st.elapsed - soakStart) / 60); if (!minutes[m]) minutes[m] = { ms: [], mem: [] }; minutes[m].ms.push(ms); if (performance.memory && n % 60 === 0) minutes[m].mem.push(performance.memory.usedJSHeapSize); }
    if (el && st.elapsed - lastPerf > 0.25) { lastPerf = st.elapsed; const s = renderer.stats ? renderer.stats() : null; const fps = n / (acc / 1000); el.textContent = `fps ${fps.toFixed(0)}  frame ${(acc / n).toFixed(1)} ms  worst ${worst.toFixed(0)}` + (s ? `\ncalls ${s.calls}  tris ${(s.triangles / 1000).toFixed(0)}k  tex ${s.textures}  geo ${s.geometries}\nscale ${s.scale.toFixed(2)} / cap ${s.cap.toFixed(2)}` : '') + (results ? '\n' + results : ''); acc = 0; n = 0; worst = 0; }
    if (running && mode === 'soak' && st.elapsed - soakStart >= 600) { minutesDone = true; finish(st); return; }   // ten minutes of wall time, whatever the frame rate
    if (running && st.phase === 'over') finish(st);
    if (running && window.__shunt.G.rep && window.__shunt.G.rep.ended) finish(st);
  }
  function finish(st) {
    const G = window.__shunt.G; if (mode === 'soak' && !minutesDone && st.elapsed - soakStart < 600) { loops++; if (window.__shunt.loadReplay) window.__shunt.loadReplay(bench); return; }
    running = false; const sorted = frames.slice().sort((a, b) => b - a); const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length); const low1 = sorted[Math.floor(sorted.length * 0.01)] || 0; const worst1 = sorted[0] || 0; const s = renderer.stats ? renderer.stats() : { scale: 1 };
    const r = { frames: frames.length, avgFps: 1000 / avg, avgMs: avg, low1Fps: 1000 / low1, worstMs: worst1, scale: s.scale, calls: s.calls, triangles: s.triangles, loops, headless: !!navigator.webdriver };
    if (mode === 'soak') { const f = minutes[0], l = minutes[minutes.length - 1]; const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); r.first = { avgMs: mean(f.ms), worst: Math.max(...f.ms), memMB: mean(f.mem) / 1048576 }; r.last = { avgMs: mean(l.ms), worst: Math.max(...l.ms), memMB: mean(l.mem) / 1048576 }; r.minutes = minutes.length; }
    window.__shunt.bench = r;
    results = `BENCH ${mode === 'soak' ? 'SOAK ' + r.minutes + ' min' : ''}\navg ${r.avgFps.toFixed(1)} fps (${r.avgMs.toFixed(2)} ms)\n1% low ${r.low1Fps.toFixed(1)} fps\nworst ${r.worstMs.toFixed(1)} ms\nscale ${r.scale.toFixed(2)}  calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(0)}k` + (r.first ? `\nfirst min ${r.first.avgMs.toFixed(2)} ms / ${r.first.memMB.toFixed(0)} MB\nlast min ${r.last.avgMs.toFixed(2)} ms / ${r.last.memMB.toFixed(0)} MB` : '') + (r.headless ? '\n(headless: not iPhone numbers)' : '');
    if (el) el.textContent = results;
    const card = document.createElement('div'); card.id = 'benchCard'; card.style.cssText = 'position:absolute;left:24px;right:24px;top:40%;background:rgba(0,0,0,0.8);color:#fff;font:700 17px/1.5 monospace;padding:16px;border-radius:12px;white-space:pre;z-index:6;pointer-events:none'; card.textContent = results; document.getElementById('ui').appendChild(card);
  }
  function start(loadReplay) { if (!mode && !shots) return; running = true; soakStart = 0; frames.length = 0; loadReplay(bench); if (el) el.textContent = 'bench running…'; }
  return { frame, start, get results() { return window.__shunt.bench; }, mode };
}
