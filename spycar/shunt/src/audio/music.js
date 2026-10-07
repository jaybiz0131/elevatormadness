// The theme (Stop 7 fix). ONE buffer, embedded in the page (assets/audio/theme_full_64k.m4a), played by one source:
//   from 0:00 on the TAP TO START tap, every time, whole: never skipped into, never faded in over the intro (the intro builds into the beat at FILES.theme.hit);
//   the source has Web Audio loop points (loopStart 12.045, loopEnd 94.6062: exactly 32 bars), so after the intro it plays the song on through the menus and the run and loops it seamlessly.
//   Nothing switches when a run starts: gameplay reuses the same buffer. If the file did not decode, `failed()` is true and the old synth music plays instead.
import { files, FILES, findHit } from './files.js';
export class Music {
  constructor(audio) { this.a = audio; this.state = 'idle'; this.fullAt = 0; this.full = null; this.hitAt = null; }
  bus() { const a = this.a; if (!this.in) { this.in = a.ctx.createGain(); this.in.connect(a.musicDuck); } return this.in; }
  ready() { return files.status('theme') === 'ready'; }
  failed() { return files.status('theme') === 'failed'; }
  // seconds the beat lands at, in the theme (the file's own `hit`, else found in it)
  hit() { if (this.hitAt !== null) return this.hitAt; const f = FILES.theme; if (f.hit !== null && f.hit !== undefined) return (this.hitAt = f.hit); const b = files.get('theme'); if (!b) return null; const h = findHit(b); return (this.hitAt = h === null ? 3 : h); }
  // from the tap: the theme from 0:00. Returns false if it is not decoded yet.
  startFull() {
    if (this.state !== 'idle') return true; const a = this.a, c = a.ctx, buf = files.get('theme'); if (!c || !buf) return false; const info = FILES.theme;
    const g = c.createGain(); g.gain.value = 1; g.connect(this.bus()); const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = info.loopStart; src.loopEnd = Math.min(info.loopEnd, buf.duration); src.connect(g);
    this.fullAt = c.currentTime; src.start(this.fullAt, 0); this.full = { src, g }; this.state = 'playing'; return true;
  }
  // how far into the song (s), through the intro and until the first loop; -1 when it is not playing
  time() { if (this.state !== 'playing') return -1; return Math.max(0, this.a.ctx.currentTime - this.fullAt); }
  // the run starts: nothing to switch (the same source goes on); kept so the callers need no change
  toLoop() {}
  update() {}
  stop() { const o = this.full; if (o) { try { o.src.stop(); } catch (e) {} } this.full = null; this.state = 'idle'; }
}
