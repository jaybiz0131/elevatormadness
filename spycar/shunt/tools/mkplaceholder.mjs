// Makes PLACEHOLDER theme files so the music pipeline can be built and tested before Jack's real recordings exist: assets/audio/theme_loop.m4a (exactly 32 bars, 0 to 82.5612 s, seamless
// loop: every note's tail folds back over the start) and assets/audio/theme_full.m4a (a 2-bar riser that builds into the beat, then the same 32 bars). Not music Jack made: it is a plain synth
// loop at 93.02 BPM in A minor. Replace both files with the real ones (same names) and nothing else needs to change.
//   node tools/mkplaceholder.mjs [outDir]       needs ffmpeg
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); const out = path.resolve(process.argv[2] || path.join(here, '..', '..', '..', 'assets', 'audio'));
const SR = 44100, LOOP = 82.5612, BAR = LOOP / 32, BEAT = BAR / 4, N = Math.round(LOOP * SR), INTRO = 2 * BAR;
let seed = 99; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const mk = (n) => [new Float32Array(n), new Float32Array(n)];
// a note's tail past the end of the buffer folds back to the start (wrap = true), so the loop has no seam
function add(buf, t0, dur, fn, wrap, pan = 0) { const n = buf[0].length, i0 = Math.round(t0 * SR), len = Math.round(dur * SR); const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < len; i++) { let j = i0 + i; if (j >= n) { if (!wrap) break; j -= n; } if (j < 0) continue; const v = fn(i / SR, i); buf[0][j] += v * gl; buf[1][j] += v * gr; } }
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const kick = (t) => { const f = 45 + 90 * Math.exp(-t / 0.035); return Math.sin(2 * Math.PI * (45 * t + 90 * 0.035 * (1 - Math.exp(-t / 0.035)))) * Math.exp(-t / 0.16) * 0.95; };
const clap = (t) => rnd() * Math.exp(-t / 0.07) * 0.5 * (Math.sin(t * 1400) > -0.4 ? 1 : 0.6);
const hat = (t, open) => { const v = rnd() - 0.6 * (rnd() * 0.5); return v * Math.exp(-t / (open ? 0.11 : 0.025)) * (open ? 0.1 : 0.12); };
function body(buf, wrap, t0) {   // 32 bars from t0
  const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G, two bars each, repeated: 8 bars a section, four sections
  for (let bar = 0; bar < 32; bar++) { const bt = t0 + bar * BAR, sec = Math.floor(bar / 8), ch = prog[Math.floor((bar % 8) / 2)];
    for (let b = 0; b < 4; b++) { const t = bt + b * BEAT; add(buf, t, 0.3, kick, wrap); if (b === 1 || b === 3) add(buf, t, 0.25, clap, wrap, 0.1); }
    for (let e = 0; e < 8; e++) { const t = bt + e * BEAT / 2; add(buf, t, 0.15, (x) => hat(x, e % 2 === 1), wrap, e % 2 ? 0.3 : -0.3); }
    // the bass: eighth-note pulses on the chord root, an octave jump on the last
    for (let e = 0; e < 8; e++) { const m = ch[0] - 24 + (e === 7 ? 12 : 0); const f = hz(m); add(buf, bt + e * BEAT / 2, BEAT / 2 * 0.92, (x) => { let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * x + h) / h; return v * 0.26 * Math.exp(-x / 0.2) * Math.min(1, x / 0.004) * (0.7 + 0.3 * Math.exp(-x / 0.04)); }, wrap, 0); }
    // the pad: the chord, held two bars at a time, slow swell
    if (bar % 2 === 0) for (const m of ch) { const f = hz(m + 12); add(buf, bt, BAR * 2.2, (x) => { const e = Math.sin(Math.PI * Math.min(1, x / (BAR * 2.2))) ** 1.4; return (Math.sin(2 * Math.PI * f * x) + Math.sin(2 * Math.PI * f * 1.004 * x + 1) + Math.sin(2 * Math.PI * f * 0.996 * x + 2)) * 0.035 * e; }, wrap, (m % 3 - 1) * 0.4); }
    // the lead: sixteenth arpeggio from the second section on
    if (sec >= 1) for (let s = 0; s < 16; s++) { if (sec === 1 && s % 2) continue; const m = ch[[0, 1, 2, 1][s % 4]] + 24 + (s >= 8 && sec >= 2 ? 12 : 0); const f = hz(m); add(buf, bt + s * BEAT / 4, BEAT / 4 * 1.8, (x) => (Math.sign(Math.sin(2 * Math.PI * f * x)) * 0.5 + Math.sin(2 * Math.PI * f * x) * 0.5) * 0.06 * Math.exp(-x / 0.12) * Math.min(1, x / 0.003), wrap, s % 2 ? 0.5 : -0.5); }
  } }
// the loop file: exactly N samples
const loop = mk(N); body(loop, true, 0);
// the full file: the riser, then the same body (no wrap needed, nothing follows it but the loop crossfade)
const NF = N + Math.round(INTRO * SR) + Math.round(3 * SR); const full = mk(NF);
{ // riser: noise sweeping up, a pad swelling, a snare roll that doubles in speed, a reverse-crash into the downbeat
  const t0 = 0; add(full, 0, INTRO, (x) => { const k = x / INTRO; const cut = 0.04 + 0.7 * k * k; let lp = 0; return rnd() * (0.02 + 0.22 * k * k * k) * Math.min(1, x / 0.5); }, false, 0);
  for (let i = 0; i < 4; i++) { const f = hz(57 + [0, 7, 12, 16][i]); add(full, 0, INTRO, (x) => { const k = x / INTRO; return Math.sin(2 * Math.PI * f * (1 + 0.5 * k) * x) * 0.06 * k * k; }, false, (i - 1.5) * 0.4); }
  let t = BAR * 0.8; let gap = BEAT; while (t < INTRO - 0.02) { add(full, t, 0.12, (x) => rnd() * Math.exp(-x / 0.05) * (0.15 + 0.35 * (t / INTRO)), false, 0.1); t += gap; gap = Math.max(BEAT / 8, gap * 0.8); }
  add(full, 0, INTRO, (x) => Math.sin(2 * Math.PI * hz(33 + 24 * (x / INTRO)) * x) * 0.1 * (x / INTRO), false, 0);
  add(full, INTRO, 1.6, (x) => rnd() * Math.exp(-x / 0.5) * 0.22, false, 0);   // the crash on the drop
  add(full, INTRO - 0.02, 0.5, (x) => Math.sin(2 * Math.PI * 38 * x) * Math.exp(-x / 0.4) * 0.5, false, 0);
  body(full, false, INTRO); }
const norm = (b) => { let pk = 0; for (const c of b) for (let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i])); const k = pk > 0 ? 0.8 / pk : 1; for (const c of b) for (let i = 0; i < c.length; i++) c[i] *= k; };
norm(loop); norm(full);
function wav(buf, file) { const n = buf[0].length, bytes = Buffer.alloc(44 + n * 4); bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + n * 4, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 4, 28); bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[0][i])) * 32767), 44 + i * 4); bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[1][i])) * 32767), 46 + i * 4); } fs.writeFileSync(file, bytes); }
fs.mkdirSync(out, { recursive: true }); const tmp = fs.mkdtempSync(path.join(out, '.tmp-'));
for (const [name, buf] of [['theme_loop', loop], ['theme_full', full]]) { const w = path.join(tmp, name + '.wav'); wav(buf, w); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(out, name + '.m4a')]); }
fs.rmSync(tmp, { recursive: true, force: true }); console.log('wrote', out, '(placeholders: loop', (N / SR).toFixed(4), 's, full', (NF / SR).toFixed(2), 's, riser', INTRO.toFixed(3), 's)');
