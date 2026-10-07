// The theme (Stop 7). Two files, played by one director:
//   theme_full.m4a   starts at 0:00 on the TAP TO START tap, every time, whole: never skipped into, never faded in over the intro (the intro builds into the beat); it plays on through the menus
//   theme_loop.m4a   the 32-bar loop (Web Audio loopStart/loopEnd); the run starting crossfades into it (equal power), and it plays on through pauses and result cards
// If the full theme ends before the run starts the loop takes over at once. A music director never waits for audio that is not there: if a file failed to load, `ok()` is false and the old
// synth music plays instead.
import { files, FILES, findHit } from './files.js';
const curve = (up) => { const n = 48, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1); a[i] = up ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2); } return a; };
const UP = curve(true), DOWN = curve(false);
export class Music {
  constructor(audio) { this.a = audio; this.state = 'idle'; this.fullAt = 0; this.full = null; this.loop = null; this.wantLoop = 0; this.hitAt = null; }
  bus() { const a = this.a; if (!this.in) { this.in = a.ctx.createGain(); this.in.connect(a.musicDuck); } return this.in; }
  ready(name) { return files.status(name) === 'ready'; }
  failed() { return files.status('theme_full') === 'failed' && files.status('theme_loop') === 'failed'; }
  // seconds the beat lands at, in the full theme (the file's own `hit`, else found in it)
  hit() { if (this.hitAt !== null) return this.hitAt; const f = FILES.theme_full; if (f.hit !== null && f.hit !== undefined) return (this.hitAt = f.hit); const b = files.get('theme_full'); if (!b) return null; const h = findHit(b); return (this.hitAt = h === null ? 3 : h); }
  // from the tap: the whole theme from 0:00. Returns false if it is not decoded yet (the tap screen does not take the tap until it is).
  startFull() {
    if (this.state !== 'idle') return true; const a = this.a, c = a.ctx, buf = files.get('theme_full'); if (!c || !buf) return false;
    const g = c.createGain(); g.gain.value = 1; g.connect(this.bus()); const src = c.createBufferSource(); src.buffer = buf; src.connect(g); this.fullAt = c.currentTime; src.start(this.fullAt, 0);
    this.full = { src, g }; this.state = 'full'; src.onended = () => { if (this.state === 'full') this.toLoop(0.25); }; return true;
  }
  // how far into the full theme (s), or -1 when it is not the thing playing
  time() { if (this.state !== 'full') return -1; return Math.max(0, this.a.ctx.currentTime - this.fullAt); }
  // the run starts: crossfade into the loop (or start it, if nothing plays); waits for the loop file if it is not decoded yet
  toLoop(fade = 1.6) {
    if (this.state === 'loop') return; if (!this.a.ctx) return; this.wantLoop = fade;
    const buf = files.get('theme_loop'); if (!buf) { if (files.status('theme_loop') === 'failed' && this.state === 'idle') this.state = 'none'; return; }
    const c = this.a.ctx, t = c.currentTime, info = FILES.theme_loop; const g = c.createGain(); g.connect(this.bus()); const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = info.loopStart || 0; src.loopEnd = Math.min(info.loopEnd || buf.duration, buf.duration); src.connect(g);
    const f = Math.max(0.05, fade); if (this.state === 'full' && this.full) { try { this.full.g.gain.cancelScheduledValues(t); this.full.g.gain.setValueCurveAtTime(DOWN, t, f); this.full.src.onended = null; this.full.src.stop(t + f + 0.05); } catch (e) {} g.gain.setValueCurveAtTime(UP, t, f); } else g.gain.value = 1;
    src.start(t, 0); this.loop = { src, g }; this.state = 'loop'; this.wantLoop = 0;
  }
  // per frame: a loop that was asked for before its file was decoded starts when it is
  update() { if (this.wantLoop && this.state !== 'loop') this.toLoop(this.wantLoop); }
  stop() { for (const k of ['full', 'loop']) { const o = this[k]; if (o) { try { o.src.stop(); } catch (e) {} } this[k] = null; } this.state = 'idle'; this.wantLoop = 0; }
}
