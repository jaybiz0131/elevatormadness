// Renders a 10 s clip of the engine and gunfire offline (OfflineAudioContext in headless Chromium) and writes it as a WAV:
// idle, a pull away to full speed, the gatling firing (the engine ducks under it), a kill speed burst (the bark), then lifting off the gas (crackle).
//   node tools/audioclip.mjs <out.wav>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const out = process.argv[2] || 'clip.wav';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?lite=1'); await page.waitForFunction(() => window.__shunt, null, { timeout: 60000, polling: 500 });
const b64 = await page.evaluate(async () => {
  const audio = window.__shunt.audio, sr = 44100, secs = 10; const off = new OfflineAudioContext(2, sr * secs, sr); audio.ctx = null; audio.init(off);
  const q = (t) => Math.ceil(t * sr / 128) * 128 / sr; let shotAt = 0, killed = false, lifted = false;
  const step = (t) => { let s, gas = true, firing = false;
    if (t < 1) { s = 0; gas = false; } else if (t < 4) s = (t - 1) / 3 * 1.0; else if (t < 7.5) s = 1.0; else { s = Math.max(0.45, 1.0 - (t - 7.5) * 0.22); gas = false; }
    if (t >= 4 && t < 6.6) { firing = true; for (let k = 0; k < 2; k++) audio.shot(); }   // 2 rounds per 0.1 s step is a slow 20 a second
    if (t >= 6 && !killed) { killed = true; audio.kill(2); }
    audio.setEngine(s, true, { firing, gas }); };
  const proms = []; for (let t = 0.1; t < secs - 0.1; t += 0.05) proms.push(off.suspend(q(t)).then(() => { step(t); off.resume(); }));
  const buf = await off.startRendering(); const L = buf.getChannelData(0), R = buf.getChannelData(1); const n = L.length; const bytes = new Uint8Array(44 + n * 4); const dv = new DataView(bytes.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); const k = pk > 0.95 ? 0.95 / pk : 1;
  for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * k)) * 32767, true); }
  let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return { b64: btoa(s), peak: pk };
});
fs.writeFileSync(out, Buffer.from(b64.b64, 'base64')); console.log('wrote', out, 'peak before normalise', b64.peak.toFixed(2)); await browser.close();
