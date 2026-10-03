// Web Audio: engine and drive layers read G each frame; one-shot sounds arrive as sim events.
import { S } from '../settings.js';
export const audio = {
  ctx: null, master: null, sfx: null, musicG: null, engine: null, engineGain: null, layers: [], nextBeat: 0, beat: 0,
  init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination); this.sfx = c.createGain(); this.sfx.gain.value = S.sound ? 1 : 0; this.sfx.connect(this.master); this.musicG = c.createGain(); this.musicG.gain.value = S.music ? 0.5 : 0; this.musicG.connect(this.master);
    const g = c.createGain(); g.gain.value = 0; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 70; o2.frequency.value = 35; o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx); o1.start(); o2.start(); this.engine = [o1, o2, f]; this.engineGain = g; },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  // continuous driving layers: tyre squeal (rises with slip angle) and the rail screech, from one looping noise buffer
  initDrive() { if (this.drive || !this.ctx) return; const c = this.ctx; const n = c.sampleRate, buf = c.createBuffer(1, n, n), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const sq = c.createBiquadFilter(); sq.type = 'bandpass'; sq.frequency.value = 1100; sq.Q.value = 6; const sg = c.createGain(); sg.gain.value = 0; src.connect(sq); sq.connect(sg); sg.connect(this.sfx);
    const sc = c.createBiquadFilter(); sc.type = 'highpass'; sc.frequency.value = 2600; const cg = c.createGain(); cg.gain.value = 0; src.connect(sc); sc.connect(cg); cg.connect(this.sfx); src.start();
    this.drive = { sq, sg, cg }; },
  setDrive(slip01, scrape01) { if (!this.ctx) return; this.initDrive(); const t = this.ctx.currentTime; this.drive.sg.gain.setTargetAtTime(0.12 * slip01, t, 0.05); this.drive.sq.frequency.setTargetAtTime(900 + 700 * slip01, t, 0.05); this.drive.cg.gain.setTargetAtTime(0.1 * scrape01, t, 0.05); },
  turbo(tier) { this.noise(0.35, 0.3 + 0.15 * tier, 1500 + 800 * tier); this.tone('sawtooth', 180 * tier, 500 * tier, 0.3, 0.07); },
  draft() { this.noise(0.5, 0.25, 1200); this.tone('square', 600, 900, 0.08, 0.06, 0.5); },
  brake() { this.noise(0.2, 0.25, 500); },
  pop() { this.noise(0.05, 0.4, 2000); this.tone('square', 90, 60, 0.06, 0.12); },
  chirp() { this.tone('triangle', 1400, 900, 0.05, 0.06); },
  apply() { if (!this.ctx) return; this.sfx.gain.value = S.sound ? 1 : 0; this.musicG.gain.value = S.music ? 0.5 : 0; },
  setEngine(speed01, running) { if (!this.ctx) return; const t = this.ctx.currentTime; this.engine[0].frequency.setTargetAtTime(60 + 90 * speed01, t, 0.1); this.engine[1].frequency.setTargetAtTime(30 + 45 * speed01, t, 0.1); this.engine[2].frequency.setTargetAtTime(300 + 900 * speed01, t, 0.1); this.engineGain.gain.setTargetAtTime(running ? 0.04 + 0.04 * speed01 : 0.012, t, 0.1); },
  tone(type, f0, f1, dur, vol, when = 0, dest) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.02); },
  noise(dur, vol, cutoff, when = 0) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when; const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); },
  shot() { this.noise(0.05, 0.55, 2600); this.tone('square', 190, 70, 0.06, 0.16); this.tone('sine', 110, 40, 0.08, 0.2); },
  // the rotary barrels: a whine that rises with spin, silent at rest (started lazily on first use)
  setGunSpin(s) { if (!this.ctx) return; if (!this.rotary) { const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 60; o2.frequency.value = 61; g.gain.value = 0; o.connect(g); o2.connect(g); g.connect(this.sfx); o.start(); o2.start(); this.rotary = { o, o2, g }; } const t = this.ctx.currentTime; this.rotary.o.frequency.setTargetAtTime(60 + 260 * s, t, 0.05); this.rotary.o2.frequency.setTargetAtTime(90 + 390 * s, t, 0.05); this.rotary.g.gain.setTargetAtTime(s > 0.02 ? 0.025 * s : 0, t, 0.05); },
  cannon() { this.noise(0.14, 0.8, 1100); this.tone('square', 160, 50, 0.16, 0.2); this.tone('sine', 70, 30, 0.25, 0.35); },
  ping(kill) { this.tone('triangle', kill ? 2600 : 2200, kill ? 3200 : 1800, 0.05, 0.05); },
  crunch(bass) { this.noise(0.16, 0.7, 1800); this.tone('sawtooth', 140, 50, 0.16, 0.2); if (bass) this.tone('sine', 70, 30, 0.3, 0.4); },
  wreck() { this.tone('sine', 180, 420, 0.08, 0.15); this.noise(0.5, 0.9, 1200, 0.06); this.tone('sine', 80, 28, 0.55, 0.5, 0.06); },
  chain(n) { this.tone('triangle', 500 + n * 90, 500 + n * 90, 0.12, 0.12); if (n === 3 || n === 5 || n === 8) { this.tone('square', 330 * (n / 3), 660 * (n / 3), 0.25, 0.1, 0.05); this.tone('square', 495 * (n / 3), 990 * (n / 3), 0.35, 0.1, 0.15); } },
  chime() { this.tone('triangle', 660, 660, 0.1, 0.12); this.tone('triangle', 990, 990, 0.25, 0.12, 0.09); },
  horn() { this.tone('sawtooth', 300, 220, 0.4, 0.12); },
  damage() { this.noise(0.25, 0.9, 1500); this.tone('square', 880, 880, 0.08, 0.08, 0.05); this.tone('square', 880, 880, 0.08, 0.08, 0.2); },
  launch() { this.noise(0.5, 0.35, 600); this.tone('sawtooth', 120, 240, 0.5, 0.1); },
  land() { this.noise(0.12, 0.6, 500); this.tone('sine', 90, 50, 0.15, 0.25); },
  stomp() { this.wreck(); this.tone('sine', 50, 25, 0.5, 0.5); },
  missile() { this.noise(0.4, 0.5, 2500); this.tone('sawtooth', 400, 900, 0.4, 0.08); },
  slam() { this.tone('sawtooth', 200, 600, 0.12, 0.08); this.noise(0.08, 0.3, 3000); },
  nitro() { this.tone('sawtooth', 100, 500, 0.6, 0.12); this.noise(0.6, 0.4, 800); },
  sight() { this.tone('square', 1200, 1200, 0.06, 0.05); this.tone('square', 1200, 1200, 0.06, 0.05, 0.12); },
  death() { this.noise(1.0, 1.0, 900); this.tone('sawtooth', 200, 30, 1.0, 0.25); this.tone('sine', 60, 20, 1.2, 0.5); },
  // music: three procedural layers tied to the director's wave intensity
  music(dt, intensity) { if (!this.ctx || !S.music) return; const c = this.ctx; if (c.currentTime < this.nextBeat) return; const bpm = 128, beatLen = 60 / bpm; this.nextBeat = Math.max(c.currentTime, this.nextBeat) + beatLen / 2; const b = this.beat++;
    const root = [55, 55, 65.4, 49][Math.floor(b / 16) % 4];
    if (b % 2 === 0) this.tone('square', root, root, 0.18, 0.08, 0, this.musicG);                               // layer 1: bass pulse
    if (intensity >= 1 && b % 4 === 2) this.tone('triangle', root * 4, root * 4, 0.08, 0.05, 0, this.musicG);  // layer 2: off-beat tick
    if (intensity >= 2) { const arp = [1, 1.5, 2, 1.5][b % 4]; this.tone('sawtooth', root * 2 * arp, root * 2 * arp, 0.12, 0.035, 0, this.musicG); } // layer 3: arpeggio
  },
};
export const buzz = (p) => { if (!S.haptics) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
