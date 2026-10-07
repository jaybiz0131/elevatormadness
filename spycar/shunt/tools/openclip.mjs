// The full opening as a clip WITH the music: TAP TO START, the tap, the logo punching in on the beat, the menu, PLAY, the opening scene, GO. Software GL cannot run the page at pace, so frames are stepped in
// a virtual clock (the page's UI timers read window.__clockMs) and the soundtrack is rendered offline from the game's own audio code (the Music director, introRoar, the tyre layer, the engine) on the same
// timeline, then muxed with ffmpeg. The theme files are decoded by ffmpeg (headless Chromium has no AAC decoder) and handed to the page as PCM.
//   node tools/openclip.mjs <out.mp4> [--fps=20] [--seed=3] [--dsf=2] [--scale=1.25] [--tail=2.5] [--noaudio]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const out = path.resolve(args.find(a => !a.startsWith('--')) || 'opening.mp4');
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const fps = Number(opt.fps || 20), seed = Number(opt.seed || 3), tail = Number(opt.tail || 2.5); const frames = out.replace(/\.mp4$/, '') + '-frames'; fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
const AUDIO = path.join(here, '..', '..', '..', 'assets', 'audio'); const pcm = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(AUDIO, f), '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 1 << 29 }).toString('base64');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(opt.dsf || 2), hasTouch: true }); page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
await page.goto('file://' + path.join(here, '..', 'dist', 'shunt.html') + '?scale=' + (opt.scale || 1.25) + '&seed=' + seed); await page.waitForFunction(() => window.__shunt && window.__shunt.renderer().state && window.__shunt.renderer().state.modelsReady, null, { timeout: 120000, polling: 500 }).catch(() => {}); await page.waitForTimeout(1500);
// the theme files in, as the loader would have decoded them
const PCM = { theme_full: pcm('theme_full.m4a'), theme_loop: pcm('theme_loop.m4a') };
await page.evaluate((P) => { const sh = window.__shunt, a = sh.audio; a.boot(); for (const n of ['theme_full', 'theme_loop']) { const u8 = Uint8Array.from(atob(P[n]), c => c.charCodeAt(0)); const f = new Float32Array(u8.buffer, 0, u8.length >> 2); const b = a.ctx.createBuffer(1, f.length, 22050); b.copyToChannel(f, 0); sh.files.set(n, b); } }, PCM);
const T = await page.evaluate(() => ({ intro: window.__shunt.T.intro }));
const tapAt = 2.5, hitWait = null; let vt = 0; const log = []; let punchVT = -1, menuVT = -1, playVT = -1, tapVT = -1;
const clock = async () => { await page.evaluate((ms) => { window.__clockMs = ms; }, vt * 1000 + 1000); };
// freeze every CSS animation at the virtual time since it began (the stepped clip cannot run them in real time)
const anim = (v) => page.evaluate(({ vt, punch, menu, tap }) => { for (const a of document.getAnimations()) { const n = a.animationName; const t0 = n === 'tapPulse' ? tap : (n === 'logoPunch' || n === 'flash') ? punch : n === 'playGlow' ? menu : 0; if (t0 < 0 && n !== 'tapPulse') continue; a.pause(); a.currentTime = Math.max(0, (vt - (t0 < 0 ? 0 : t0)) * 1000); } }, { vt, punch: punchVT, menu: menuVT, tap: 0 });
const shot = async (n) => { await page.screenshot({ path: path.join(frames, 'f' + String(n).padStart(5, '0') + '.png'), timeout: 180000 }); };
let n = 0, simFrames = 0; const dt = 1 / fps;
// 1. TAP TO START
for (; vt < tapAt; vt += dt) { await clock(); await page.evaluate(() => window.__shunt.uiStep()); await page.evaluate(() => window.__shunt.renderFrame(0.05)); await anim(); await shot(n++); }
// 2. the tap: the theme starts at tapAt on the virtual clock
tapVT = vt; await clock(); await page.evaluate((tv) => { const sh = window.__shunt; document.getElementById('tapStart').click(); sh.audio.theme.time = () => Math.max(0, window.__clockMs / 1000 - 1 - tv); }, tapVT);
let stage = 0; let menuAt = -1;
for (;;) { await clock(); await page.evaluate(() => window.__shunt.uiStep()); const st = await page.evaluate(() => window.__shunt.tpStage); if (st === 1 && punchVT < 0) { punchVT = vt; log.push('logo punches at ' + (vt - tapVT).toFixed(2) + ' s into the theme (' + vt.toFixed(2) + ' s of video)'); } if (st === 2) { menuVT = vt; log.push('menu at ' + vt.toFixed(2)); break; }
  await page.evaluate(() => window.__shunt.renderFrame(0.05)); await anim(); await shot(n++); vt += dt; }
// 3. the menu, then PLAY
const hold = 1.8; for (let k = 0; k < Math.round(hold * fps); k++) { await clock(); await page.evaluate(() => window.__shunt.renderFrame(0.05)); await anim(); await shot(n++); vt += dt; }
playVT = vt; await clock(); await page.evaluate(() => { window.__shunt.audio.theme.time = () => -1; document.getElementById('btnPrimary').click(); });
// 4. the opening scene, stepped: 120/fps sim steps a frame
const per = Math.round(120 / fps); let go = null, maxCalls = 0, maxTris = 0;
for (let k = 0; k < Math.round((T.intro.total + tail) * fps); k++) { const r = await page.evaluate(({ per }) => { const sh = window.__shunt; sh.runSteps(per); sh.renderFrame(per / 120); const G = sh.G; const st = sh.renderer().stats(); return { t: G.intro ? G.intro.t : -1, G: G.t, calls: st.calls, tris: st.triangles }; }, { per });
  maxCalls = Math.max(maxCalls, r.calls); maxTris = Math.max(maxTris, r.tris); if (r.t < 0 && go === null) { go = vt - playVT; log.push('GO at ' + go.toFixed(2) + ' s after PLAY'); }
  await anim(); await shot(n++); vt += dt; if (k % 20 === 0) console.log('frame', k, JSON.stringify(r)); }
// the audio, rendered offline on the same timeline
let wavPath = null;
if (!opt.noaudio) {
  const total = vt + 0.5, SR = 44100; const ev = { tap: tapVT, play: playVT, appear: playVT + T.intro.appear, slideEnd: playVT + T.intro.appear + T.intro.slide, roar: playVT + T.intro.roar, whip: playVT + T.intro.whipAt, go: playVT + (go === null ? T.intro.total : go) };
  const b64 = await page.evaluate(async ({ P, total, ev, T }) => {
    const sh = window.__shunt, audio = sh.audio, files = sh.files, SR = 44100; const off = new OfflineAudioContext(2, Math.ceil(SR * total), SR); audio.ctx = null; audio.noiseBuf = null; audio.drive = null; audio.init(off);
    for (const n of ['theme_full', 'theme_loop']) { const u8 = Uint8Array.from(atob(P[n]), c => c.charCodeAt(0)); const f = new Float32Array(u8.buffer, 0, u8.length >> 2); const b = off.createBuffer(1, f.length, 22050); b.copyToChannel(f, 0); files.set(n, b); }
    const q = (t) => Math.ceil(t * SR / 128) * 128 / SR; const steps = []; const at = (t, fn) => steps.push([q(Math.max(0.01, t)), fn]);
    at(ev.tap, () => audio.theme.startFull()); at(ev.play, () => audio.theme.toLoop(1.6)); at(ev.roar, () => audio.introRoar()); at(ev.whip, () => { audio.slam(); audio.brake(); }); at(ev.slideEnd, () => audio.turbo(1)); at(ev.go, () => audio.turbo(1));
    for (let t = ev.appear; t < ev.go + 2; t += 0.04) { const k = Math.min(1, Math.max(0, (t - ev.appear) / T.slide)); const sliding = t < ev.slideEnd; at(t, () => { audio.setDrive({ slip: sliding ? 1 : 0, speed: sliding ? 0.6 * (1 - k) : 0 }); audio.setEngine(sliding ? 0.5 * (1 - k) : 0, true, { quiet: false }); audio.updateMusic(0.04, {}); }); }
    for (let t = 0.05; t < ev.appear; t += 0.05) at(t, () => { audio.setEngine(0, true, { quiet: true }); audio.updateMusic(0.05, {}); });
    steps.sort((a, b) => a[0] - b[0]); for (const [t, fn] of steps) off.suspend(t).then(() => { fn(); off.resume(); }).catch(() => {});
    const buf = await off.startRendering(); const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length; const bytes = new Uint8Array(44 + n * 4), dv = new DataView(bytes.buffer); const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); const k = pk > 0.95 ? 0.95 / pk : 1; for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * k)) * 32767, true); }
    let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }, { P: PCM, total, ev, T: T.intro });
  wavPath = out.replace(/\.mp4$/, '.wav'); fs.writeFileSync(wavPath, Buffer.from(b64, 'base64')); }
await browser.close();
const vf = ['-vf', 'scale=390:-2'];
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%05d.png'), ...(wavPath ? ['-i', wavPath] : []), ...vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', ...(wavPath ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []), out]);
if (wavPath) fs.rmSync(wavPath); console.log(log.join('\n')); console.log('wrote', out, 'frames', n, 'max draw calls', maxCalls, 'max triangles', maxTris);
