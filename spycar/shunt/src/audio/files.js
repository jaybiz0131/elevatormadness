// Audio files (Stop 7). The theme is inside the page (published files beside a claude.ai artifact did not load on Jack's iPhone). Later recordings can still be separate files: to add a recording
// (an engine idle, a gunfire loop, a crash), put the file in assets/audio/, add one line to FILES below, and read it with `files.get('name')` (an AudioBuffer, or null until it is ready);
// `audio.playFile(name, opts)` plays one. Files are fetched and decoded once, in the order given to loadAll, with one retry. Nothing here blocks the game: a file that fails to load
// simply stays null, and whatever needed it falls back (the music to the old synth, a sound effect to its synthesised version).
//   url        where it lives, relative to the page (or to ?audio=<base url>, for trying a server by hand)
//   loopStart, loopEnd   (seconds) the seamless loop points for Web Audio's loopStart/loopEnd; the loop file is exactly 32 bars
import themeData from '../../../../assets/audio/theme_full_64k.m4a?inline';   // the theme is inside the page (a base64 data URL): nothing to fetch, so no URL that can fail on a phone
export const FILES = {
  // the whole theme, one buffer. TAP TO START plays it from 0:00 (the intro builds into the beat at `hit`, never skipped); from `loopStart` on it loops between loopStart and loopEnd (Web Audio loop points),
  // so gameplay plays the very same buffer: 12.045 to 94.6062 s is exactly 32 bars. `hit` is where theme_loop starts inside the full theme (cross-correlation, 0.96) after a one bar riser (9.46 to 12.05);
  // findHit, the fallback when `hit` is null, picks 1.35 on this song, which is wrong. The file is the first 95 s of the song at 64 kbps (the rest is never played).
  theme: { url: 'theme_full_64k.m4a', data: themeData, hit: 12.045, loopStart: 12.045, loopEnd: 94.6062 },
  // engine_idle: { url: 'audio/engine_idle.m4a', loopStart: 0.1, loopEnd: 2.9 },   (later: Jack's engine recordings, fetched from beside the page)
};
export const files = {
  buf: {}, state: {}, err: {}, bytes: {}, waiters: [],
  get(name) { return this.buf[name] || null; },
  status(name) { return this.state[name] || 'idle'; },
  set(name, buffer) { this.buf[name] = buffer; this.state[name] = 'ready'; this.fire(); },   // tests and tools hand a decoded buffer straight in
  fire() { for (const f of this.waiters.slice()) f(); },
  onChange(f) { this.waiters.push(f); },
  async load(ctx, name) {
    const info = FILES[name]; if (!info || this.state[name] === 'ready' || this.state[name] === 'loading') return this.buf[name] || null; this.state[name] = 'loading'; this.fire();
    // (a decode that never answers ends in the synth fallback, not in silence: 20 s)
    for (let attempt = 0; attempt < 2; attempt++) {   // (a fresh ArrayBuffer each time: decoding detaches it)
      try { const data = await bytesOf(info); this.bytes[name] = data.byteLength; this.buf[name] = await Promise.race([decode(ctx, data), new Promise((_, rej) => setTimeout(() => rej(new Error('decode timed out')), 20000))]); this.state[name] = 'ready'; this.err[name] = ''; this.fire(); return this.buf[name]; }
      catch (e) { this.err[name] = String(e && e.message || e).slice(0, 80); }
    }
    this.state[name] = 'failed'; this.fire(); return null;
  },
  // fetch and decode in order (the first is what the TAP TO START waits for)
  async loadAll(ctx, names = Object.keys(FILES)) { for (const n of names) await this.load(ctx, n); },
  // Show FPS: one line that says whether the music is the real files or the synth stand-in (a file that did not load, or has not yet)
  audioLine() { const bad = [], wait = []; for (const n of Object.keys(FILES)) { const st = this.status(n); if (st === 'failed') bad.push(FILES[n].url.replace(/^.*\//, '')); else if (st !== 'ready') wait.push(n); } return bad.length ? 'audio FALLBACK: ' + bad.join(', ') : wait.length ? 'audio loading' : 'audio OK'; },
  line() { return Object.keys(FILES).map(n => n + ' ' + this.status(n) + (this.bytes[n] ? ' ' + Math.round(this.bytes[n] / 1024) + 'KB' : '') + (this.err[n] ? ' (' + this.err[n] + ')' : '')).join(', '); },
};
// where the beat lands in the theme: the first moment the 50 ms level jumps to at least 1.8 times what it was half a second before AND is above 40% of the loudest moment in the first
// 40 s (a riser climbs slowly, a drop jumps); null if nothing in the file does that. FILES.theme.hit overrides it.
export function findHit(buf) {
  if (!buf) return null; const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.round(sr * 0.05), n = Math.min(Math.floor(d.length / win), Math.floor(40 / 0.05)); const E = new Float32Array(n); let mx = 0;
  for (let i = 0; i < n; i++) { let a = 0; for (let k = 0; k < win; k += 2) { const v = d[i * win + k]; a += v * v; } E[i] = Math.sqrt(a / (win / 2)); if (E[i] > mx) mx = E[i]; }
  for (let i = 20; i < n; i++) { let p = 0; for (let k = i - 11; k < i - 1; k++) p += E[k]; p /= 10; if (E[i] > 1.8 * p && E[i] > 0.4 * mx) return i * 0.05; }
  return null;
}
