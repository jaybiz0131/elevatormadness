// Renders the car's sound offline (OfflineAudioContext in headless Chromium, driving src/audio/audio.js exactly as main.js does) and writes it as a WAV.
// The default 10 s clip: idle, a pull away, a drift screech, a brake lock-up, a hard turn, an e-brake 180, a burnout and its launch, then the gatling firing
// (the engine ducks, the rumble bed fades in, the first round is the heavy one), a kill speed burst (the bark), and lifting off the gas.
//   node tools/audioclip.mjs <out.wav> [scene] [--raw] [--noengine]
// scene: clip (default) | drift | burn | lock | turn | gun (a 1.4 s burst, gatling alone) | gunsingle (one round, 0.3 s)
// --noengine leaves the engine silent (to hear or measure a layer alone).
// --raw writes the render as it is (clipped at full scale) instead of normalising a peak above 0.95; the peak and RMS are printed either way.
// --src <dir> renders another checkout's src/ (for A/B against an older audio.js). No build is needed: src/ is served over a throwaway local http server.
// It uses a single headless Chromium and the CPU only for the length of the render (a few seconds).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const flag = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const srcDir = path.resolve(flag('--src') || path.join(here, '..', 'src')); const raw = args.includes('--raw'), noEng = args.includes('--noengine'); const pos = args.filter(a => !a.startsWith('--'));
const out = pos[0] || 'clip.wav'; const scene = pos[1] || 'clip';
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset=utf-8><script type="module">import { audio } from "/src/audio/audio.js"; window.__audio = audio;</script>'); return; }
  const f = path.join(srcDir, '..', u); if (!f.startsWith(path.join(srcDir, '..')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(); page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200))); page.on('console', m => { if (m.type() === 'error') console.log('console', m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:' + port + '/'); await page.waitForFunction(() => window.__audio, null, { timeout: 20000 });
const res = await page.evaluate(async ({ scene, raw, noEng }) => {
  const audio = window.__audio, sr = 44100; const secs = { clip: 10, drift: 3.5, burn: 3.5, lock: 1.5, turn: 3, gun: 1.6, gunsingle: 0.3 }[scene] || 10;
  const off = new OfflineAudioContext(2, Math.round(sr * secs), sr); audio.ctx = null; audio.init(off);
  const legacy = !audio.setFiring;   // an old audio.js (--src) with setDrive(slip, scrape), for A/B
  const dt = 1 / 60, ramp = (t, a, b, x0, x1) => x0 + (x1 - x0) * Math.max(0, Math.min(1, (t - a) / (b - a))), box = (t, a, b) => (t >= a && t < b ? 1 : 0);
  const D0 = { slip: 0, burn: 0, turn: 0, lock: 0, speed: 0, scrape: 0 }; let shotAcc = 0, killed = false;
  const frame = (t) => { let s = 0, gas = true, firing = false, drive = Object.assign({}, D0), shots = 0;
    if (scene === 'clip') {
      if (t < 0.6) { s = 0; gas = false; } else if (t < 1.6) s = ramp(t, 0.6, 1.6, 0, 0.9); else s = 0.9;
      drive.speed = s * 1.0;
      if (t >= 1.6 && t < 3.0) { drive.slip = t < 2.1 ? ramp(t, 1.6, 2.1, 0, 0.9) : ramp(t, 2.6, 3.0, 0.9, 0); drive.turn = 0.45 * box(t, 1.7, 2.9); }
      if (t >= 3.2 && t < 3.5) drive.scrape = 1;
      if (t >= 3.4 && t < 4.0) { s = ramp(t, 3.4, 4.0, 0.9, 0.55); gas = false; drive.lock = 1; drive.speed = s; }
      if (t >= 4.0 && t < 4.8) { s = 0.6; drive.turn = ramp(t, 4.0, 4.3, 0, 0.85) * (t < 4.6 ? 1 : ramp(t, 4.6, 4.8, 1, 0)); drive.slip = 0.12 * box(t, 4.1, 4.6); drive.speed = 0.6; }
      if (t >= 4.8 && t < 5.4) { s = ramp(t, 4.8, 5.4, 0.6, 0.15); gas = false; drive.slip = 0.95; drive.turn = 0.8; drive.speed = s; }
      if (t >= 5.4 && t < 7.0) { s = 0.15 + 0.6; drive.burn = 0.35 + 0.65 * Math.min(1, (t - 5.4) / 1.0); drive.speed = 0; if (t > 6.9) drive.burn = 0; }
      if (t >= 7.0 && t < 7.6) { s = ramp(t, 7.0, 7.6, 0.75, 0.9); drive.speed = ramp(t, 7.0, 7.6, 0.34, 0.9); drive.slip = 0.25 * box(t, 7.0, 7.3); }
      if (t >= 7.6) { s = 0.9; drive.speed = 0.9; }
      if (t >= 7.6 && t < 9.6) { firing = true; shotAcc += 20 * dt; while (shotAcc >= 1) { shotAcc -= 1; shots++; } }
      if (t >= 8.6 && !killed) { killed = true; audio.kill(2); }
      if (t >= 9.6) { s = Math.max(0.45, 0.9 - (t - 9.6) * 0.8); gas = false; drive.speed = s; }
    } else if (scene === 'drift') { s = 0.8; drive.speed = 0.8; drive.slip = t < 0.5 ? 0 : t < 1.0 ? ramp(t, 0.5, 1.0, 0, 0.9) : t < 2.2 ? 0.9 : ramp(t, 2.2, 2.6, 0.9, 0); drive.turn = 0.4 * box(t, 0.6, 2.4); }
    else if (scene === 'burn') { s = 0.7; drive.burn = t < 0.4 ? 0 : t < 2.4 ? 0.35 + 0.65 * Math.min(1, (t - 0.4) / 1.0) : 0; }
    else if (scene === 'lock') { s = 0.9; drive.speed = 0.9; drive.lock = t > 0.2 && t < 1.0 ? 1 : 0; }
    else if (scene === 'turn') { s = 0.8; drive.speed = 0.8; drive.turn = t < 0.4 ? 0 : t < 2.4 ? 0.9 : 0; }
    else if (scene === 'gun') { s = 0; gas = false; if (t >= 0.1 && t < 1.1) { firing = true; shotAcc += 20 * dt; while (shotAcc >= 1) { shotAcc -= 1; shots++; } } }
    else if (scene === 'gunsingle') { if (t >= 0.05 && !killed) { killed = true; shots = 1; } }
    return { s, gas, firing, drive, shots }; };
  const q = (t) => Math.ceil(t * sr / 128) * 128 / sr; const proms = [];
  for (let t = dt; t < secs - 0.05; t += dt) { const tt = t; proms.push(off.suspend(q(tt)).then(() => { const f = frame(tt); for (let i = 0; i < f.shots; i++) audio.shot(); if (scene === 'gun' || scene === 'gunsingle') { if (audio.setFiring) audio.setFiring(f.firing); } else if (!noEng) audio.setEngine(f.s, true, { firing: f.firing, gas: f.gas }); if (legacy) audio.setDrive(Math.max(f.drive.slip, f.drive.burn), f.drive.scrape); else audio.setDrive(f.drive); off.resume(); })); }
  const buf = await off.startRendering(); const L = buf.getChannelData(0), R = buf.getChannelData(1); const n = L.length;
  let pk = 0, sq = 0; for (let i = 0; i < n; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); sq += L[i] * L[i]; }
  const k = !raw && pk > 0.95 ? 0.95 / pk : 1; const bytes = new Uint8Array(44 + n * 4); const dv = new DataView(bytes.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * k)) * 32767, true); }
  let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return { b64: btoa(s), peak: pk, rms: Math.sqrt(sq / n) };
}, { scene, raw, noEng });
fs.writeFileSync(out, Buffer.from(res.b64, 'base64')); console.log('wrote', out, scene, 'peak before normalise', res.peak.toFixed(3), 'rms', res.rms.toFixed(4)); await browser.close(); server.close();
