// Audio as separate files (Stop 7). The recordings are NOT inside the page: they are published beside it and fetched after the page opens, so the page stays small. To add a recording
// (an engine idle, a gunfire loop, a crash), put the file in assets/audio/, add one line to FILES below, and read it with `files.get('name')` (an AudioBuffer, or null until it is ready);
// `audio.playFile(name, opts)` plays one. Files are fetched and decoded once, in the order given to loadAll, with one retry. Nothing here blocks the game: a file that fails to load
// simply stays null, and whatever needed it falls back (the music to the old synth, a sound effect to its synthesised version).
//   url        where it lives, relative to the page (or to ?audio=<base url>, for trying a server by hand)
//   loopStart, loopEnd   (seconds) the seamless loop points for Web Audio's loopStart/loopEnd; the loop file is exactly 32 bars
export const FILES = {
  theme_full: { url: 'audio/theme_full.m4a', hit: null },   // the whole theme: an intro that builds into the beat. `hit`: where the beat lands (s); null = found by listening to the file (findHit)
  theme_loop: { url: 'audio/theme_loop.m4a', loopStart: 0, loopEnd: 82.5612 },
  // engine_idle: { url: 'audio/engine_idle.m4a', loopStart: 0.1, loopEnd: 2.9 },   (later: Jack's engine recordings)
};
// where a file is fetched from: beside the page (audio/<file>); ?audio=<base url> tries a server by hand; <meta name="shunt-audio-base" content="../../../assets/audio/"> (set in play/index.html by the build) points the
// GitHub Pages copy at the repo's assets/audio folder instead of a second copy of the files
const urlOf = (info) => { try { const q = new URLSearchParams(location.search).get('audio'); const rest = info.url.replace(/^audio\//, ''); if (q) return new URL(rest, new URL(q.endsWith('/') ? q : q + '/', location.href)).href; const m = document.querySelector('meta[name="shunt-audio-base"]'); if (m && m.content) return new URL(rest, new URL(m.content, location.href)).href; return new URL(info.url, document.baseURI).href; } catch (e) { return info.url; } };
const decode = (ctx, data) => new Promise((res, rej) => { try { const p = ctx.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } });   // old Safari only has the callback form
export const files = {
  buf: {}, state: {}, err: {}, bytes: {}, waiters: [],
  get(name) { return this.buf[name] || null; },
  status(name) { return this.state[name] || 'idle'; },
  set(name, buffer) { this.buf[name] = buffer; this.state[name] = 'ready'; this.fire(); },   // tests and tools hand a decoded buffer straight in
  fire() { for (const f of this.waiters.slice()) f(); },
  onChange(f) { this.waiters.push(f); },
  async load(ctx, name) {
    const info = FILES[name]; if (!info || this.state[name] === 'ready' || this.state[name] === 'loading') return this.buf[name] || null; this.state[name] = 'loading'; this.fire();
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const r = await fetch(urlOf(info)); if (!r.ok) throw new Error('HTTP ' + r.status); const data = await r.arrayBuffer(); this.bytes[name] = data.byteLength; this.buf[name] = await decode(ctx, data); this.state[name] = 'ready'; this.err[name] = ''; this.fire(); return this.buf[name]; }
      catch (e) { this.err[name] = String(e && e.message || e).slice(0, 80); }
    }
    this.state[name] = 'failed'; this.fire(); return null;
  },
  // fetch and decode in order (the first is what the TAP TO START waits for)
  async loadAll(ctx, names = Object.keys(FILES)) { for (const n of names) await this.load(ctx, n); },
  line() { return Object.keys(FILES).map(n => n + ' ' + this.status(n) + (this.bytes[n] ? ' ' + Math.round(this.bytes[n] / 1024) + 'KB' : '') + (this.err[n] ? ' (' + this.err[n] + ')' : '')).join(', '); },
};
// where the beat lands in the theme: the first moment the 50 ms level jumps to at least 1.8 times what it was half a second before AND is above 40% of the loudest moment in the first
// 40 s (a riser climbs slowly, a drop jumps); null if nothing in the file does that. FILES.theme_full.hit overrides it.
export function findHit(buf) {
  if (!buf) return null; const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.round(sr * 0.05), n = Math.min(Math.floor(d.length / win), Math.floor(40 / 0.05)); const E = new Float32Array(n); let mx = 0;
  for (let i = 0; i < n; i++) { let a = 0; for (let k = 0; k < win; k += 2) { const v = d[i * win + k]; a += v * v; } E[i] = Math.sqrt(a / (win / 2)); if (E[i] > mx) mx = E[i]; }
  for (let i = 20; i < n; i++) { let p = 0; for (let k = i - 11; k < i - 1; k++) p += E[k]; p /= 10; if (E[i] > 1.8 * p && E[i] > 0.4 * mx) return i * 0.05; }
  return null;
}
