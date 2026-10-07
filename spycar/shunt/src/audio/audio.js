// Web Audio: engine and drive layers read G each frame; one-shot sounds arrive as sim events.
import { S } from '../settings.js';
// 0.1 s of silence, 8 kHz mono 8-bit PCM, as a data URI (the media element that holds the playback session on iOS)
const le16 = n => String.fromCharCode(n & 255, (n >> 8) & 255), le32 = n => le16(n & 0xffff) + le16(n >>> 16);
const SILENT_WAV = 'data:audio/wav;base64,' + btoa('RIFF' + le32(36 + 800) + 'WAVEfmt ' + le32(16) + le16(1) + le16(1) + le32(8000) + le32(8000) + le16(1) + le16(8) + 'data' + le32(800) + '\x80'.repeat(800));
export const audio = {
  ctx: null, master: null, sfx: null, musicG: null, engine: null, engineGain: null, layers: [], nextBeat: 0, beat: 0,
  init(ctx) { if (this.ctx) return; try { this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination); this.sfx = c.createGain(); this.sfx.gain.value = S.sound ? 1 : 0; this.sfx.connect(this.master); this.musicG = c.createGain(); this.musicG.gain.value = S.music ? 0.5 : 0; this.musicG.connect(this.master);
    this.makeBuffers(); this.makeEngine(); },
  resume() { if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} } },
  // Mobile unlock, called from real user gestures (touchend, click, keydown): resume the context, start a silent buffer (the iOS
  // unlock), and loop a silent <audio> element so the page counts as media playback and the ring/silent switch no longer mutes it.
  unlock() { this.init(); this.resume(); if (!this.ctx) return;
    if (!this.unlocked) { try { const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); } catch (e) {}
      try { if (!this.el) { const el = document.createElement('audio'); el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); el.loop = true; el.volume = 0.01; el.src = SILENT_WAV; this.el = el; } const p = this.el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      if (this.ctx.state === 'running') this.unlocked = true; } },
  state() { return this.ctx ? this.ctx.state + (this.unlocked ? ' unlocked' : '') + (this.el && !this.el.paused ? ' media' : '') : 'no ctx'; },
  // One shared 2 s white-noise buffer (seeded, so clips are repeatable) for the tyre, rail and rumble layers: each layer reads it through its own looping source.
  getNoise() { if (this.noiseBuf) return this.noiseBuf; const c = this.ctx, n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let s = 4242; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 4294967296 * 2 - 1; } this.noiseBuf = b; return b; },
  // Continuous driving layers, built on the first frame that needs them and cut off from the output (so the browser stops processing them) half a second after they go quiet.
  //  squeal: a stick-slip tyre squeal: two detuned saws and a sine a fifth-ish above (inharmonic), a slow pitch wobble (6 Hz) and a rough amplitude flutter (30 to 90 Hz), through a lowpass that follows the pitch;
  //  scrub:  band-passed noise (200 to 3,000 Hz) with the same flutter, the gritty skid;
  //  roar:   low-passed noise chopped by a burble LFO, the spinning wheels of a burnout (its cutoff and burble rate rise with the revs);
  //  rail:   the high-passed screech of the rail scrape.
  initDrive() { if (this.drive || !this.ctx) return; const c = this.ctx; const bus = c.createGain(); bus.gain.value = 0.8;
    const src = c.createBufferSource(); src.buffer = this.getNoise(); src.loop = true;
    const oa = c.createOscillator(), ob = c.createOscillator(), oc = c.createOscillator(); oa.type = 'sawtooth'; ob.type = 'sawtooth'; oc.type = 'sine'; ob.detune.value = 29; oc.detune.value = 731;
    const wob = c.createOscillator(), wobD = c.createGain(); wob.frequency.value = 6.2; wobD.gain.value = 36; wob.connect(wobD); wobD.connect(oa.detune); wobD.connect(ob.detune); wobD.connect(oc.detune);
    const fl = c.createOscillator(), flD = c.createGain(); fl.type = 'triangle'; fl.frequency.value = 40; flD.gain.value = 0.28; fl.connect(flD);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.8; const qa = c.createGain(); qa.gain.value = 0.72; flD.connect(qa.gain); const sqG = c.createGain(); sqG.gain.value = 0;
    const ocG = c.createGain(); ocG.gain.value = 0.4; oa.connect(lp); ob.connect(lp); oc.connect(ocG); ocG.connect(lp); lp.connect(qa); qa.connect(sqG); sqG.connect(bus);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.8; const skF = c.createGain(); skF.gain.value = 0.72; flD.connect(skF.gain); const skG = c.createGain(); skG.gain.value = 0; src.connect(bp); bp.connect(skF); skF.connect(skG); skG.connect(bus);
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 300; rl.Q.value = 1.1; const bl = c.createOscillator(), blD = c.createGain(); bl.frequency.value = 14; blD.gain.value = 0.3; bl.connect(blD);
    const rF = c.createGain(); rF.gain.value = 0.7; blD.connect(rF.gain); const rG = c.createGain(); rG.gain.value = 0; src.connect(rl); rl.connect(rF); rF.connect(rG); rG.connect(bus);
    const sc = c.createBiquadFilter(); sc.type = 'highpass'; sc.frequency.value = 2600; const cg = c.createGain(); cg.gain.value = 0; src.connect(sc); sc.connect(cg); cg.connect(bus);
    src.start(0, 0.3); oa.start(); ob.start(); oc.start(); wob.start(); fl.start(); bl.start();
    this.drive = { bus, oa, ob, oc, fl, lp, sqG, bp, skG, rl, bl, rG, cg, live: false, last: 0, armed: true, chirpT: -9, chirpK: 0, lockOn: false, lockT: -9 }; },
  // o = { slip, burn, turn, lock, speed, scrape }, called every frame:
  //  slip 0..1   a drift or slide (the squeal sweeps 700 to 1,600 Hz with it), turn 0..1 hard cornering load in grip (a quieter, higher squeal, 1,450 to 2,100 Hz),
  //  burn 0..1   the burnout (a deep roar, a wheelspin squeal, both rising with the revs), lock 0 or 1 a brake lock-up (a short squeal on the rising edge),
  //  speed 0..1.3 (1 is 1,000 pt/s: slow tyres squeal softer), scrape 0..1 the rail scrape. All of it is smoothed here, so a raw per-frame value is fine.
  setDrive(o) { if (!this.ctx) return; o = o || {}; const c = this.ctx, t = c.currentTime; const k = (v) => Math.max(0, Math.min(1, +v || 0));
    const sl = k(o.slip), bu = k(o.burn), tu = k(o.turn), lk = k(o.lock), sc = k(o.scrape), sp = Math.max(0, Math.min(1.3, +o.speed || 0));
    if (!this.drive) { if (sl + bu + tu + lk + sc < 0.01) return; this.initDrive(); if (!this.drive) return; } const d = this.drive;
    // a brake lock-up: a squeal that dies in about 0.4 s whatever the pedal does
    if (lk > 0.5 && !d.lockOn) { d.lockOn = true; d.lockT = t; } else if (lk <= 0.5) d.lockOn = false;
    const slE = Math.max(sl, d.lockOn ? 0.5 * Math.exp(-(t - d.lockT) / 0.2) : 0);
    // the chirp: grip lets go, the pitch overshoots and settles in about 0.15 s, with a puff of scrub
    if (d.armed && slE > 0.18) { d.armed = false; if (t - d.chirpT > 0.3) { d.chirpT = t; d.chirpK = 0.45 + 0.55 * Math.min(1, slE * 1.5); } } else if (slE < 0.08) d.armed = true;
    const ce = d.chirpK * Math.exp(-(t - d.chirpT) / 0.07); const sf = 0.35 + 0.65 * Math.min(1, sp / 0.45), spc = Math.min(1, sp);
    const qS = 0.8 * Math.pow(slE, 0.85) * sf, qT = 0.5 * tu * sf * (1 - 0.5 * slE), qB = 0.4 * bu; let Q = Math.min(1.1, qS + qT + qB); const qs = qS + qT + qB + 1e-4;
    let f = (qS * (720 + 620 * slE + 260 * spc) + qT * (1450 + 420 * tu + 200 * spc) + qB * (700 + 450 * bu)) / qs; f = Math.max(700, Math.min(2200, f)) * (1 + 0.34 * ce); Q = Q * (1 + 0.8 * ce) + 0.12 * ce;
    const dk = 0.6 + 0.4 * (this.engDuck || 1);   // a little under the gatling too, so squeal + guns + engine keep their headroom
    const N = 0.5 * Math.pow(slE, 0.9) * sf + 0.2 * tu * sf + 0.2 * bu + 0.25 * ce, R = 0.5 * bu, Sc = 0.125 * sc;
    const act = Math.max(Q, N, R, Sc); if (act > 0.004) { d.last = t; if (!d.live) { d.live = true; d.jump = true; d.bus.connect(this.sfx); } } else if (d.live && t - d.last > 0.6) { d.live = false; try { d.bus.disconnect(); } catch (e) {} } if (!d.live) return;
    const j = d.jump; d.jump = false; const put = (p, v, tc) => { if (j) { p.cancelScheduledValues(t); p.setValueAtTime(v, t); } else p.setTargetAtTime(v, t, tc); };
    put(d.oa.frequency, f, 0.02); put(d.ob.frequency, f, 0.02); put(d.oc.frequency, f * 1.0, 0.02); put(d.lp.frequency, Math.min(6000, f * 2.1 + 400), 0.03); put(d.fl.frequency, 30 + 45 * slE + 25 * spc + 20 * bu, 0.1);
    put(d.sqG.gain, 0.12 * dk * Q, Q * 0.12 * dk > d.sqG.gain.value ? 0.02 : 0.045);
    put(d.bp.frequency, 650 + 1500 * slE + 500 * tu + 400 * ce, 0.05); put(d.skG.gain, 0.3 * dk * N, 0.03);
    put(d.rl.frequency, 260 + 1000 * bu, 0.08); put(d.bl.frequency, 11 + 26 * bu, 0.1); put(d.rG.gain, dk * R, 0.06);
    put(d.cg.gain, Sc, 0.05); },
  turbo(tier) { this.noise(0.35, 0.3 + 0.15 * tier, 1500 + 800 * tier); this.tone('sawtooth', 180 * tier, 500 * tier, 0.3, 0.07); },
  draft() { this.noise(0.5, 0.25, 1200); this.tone('square', 600, 900, 0.08, 0.06, 0.5); },
  brake() { this.noise(0.2, 0.25, 500); },
  // Stop 5: BOOST (a rising roar and a burst of air), the mine dropping (a click and two beeps) and the shock (a crack, a falling zap, a thump)
  boost() { this.noise(0.6, 0.55, 2400); this.tone('sawtooth', 90, 520, 0.55, 0.14); this.tone('square', 180, 700, 0.4, 0.06, 0.04); this.tone('sine', 60, 40, 0.5, 0.35); },
  mine() { this.tone('square', 1200, 1200, 0.04, 0.06); this.tone('square', 900, 900, 0.05, 0.06, 0.1); this.tone('sine', 120, 70, 0.1, 0.2); },
  shock() { this.noise(0.25, 0.9, 5000); this.tone('sawtooth', 2400, 200, 0.35, 0.16); this.tone('square', 1500, 120, 0.25, 0.1, 0.05); this.tone('sine', 70, 30, 0.4, 0.45, 0.04); },
  pop() { this.noise(0.05, 0.4, 2000); this.tone('square', 90, 60, 0.06, 0.12); },
  chirp() { this.tone('triangle', 1400, 900, 0.05, 0.06); },
  apply() { if (!this.ctx) return; this.sfx.gain.value = S.sound ? 1 : 0; this.musicG.gain.value = S.music ? 0.5 : 0; },
  // The engine (Stop 2 finish): a deep, heavy V8-like beast, built from scratch here, nothing sampled or copied.
  //  pulse loop: a 20 Hz train of uneven combustion thumps (a lopsided firing order) played faster as the revs rise, through a low-pass that
  //              never opens past 1.1 kHz, so there is no thin whine at top speed;
  //  growl:      two detuned saws an octave and a bit above the pulse, squashed by a waveshaper (the harmonics are what a phone speaker can
  //              play), chopped at the firing rate;
  //  sub:        a sine at 30 to 52 Hz with a soft second harmonic, the weight you feel;
  //  crackle:    pops and burbles when the throttle lifts; bark: a rev surge and a low bang on every kill speed burst.
  makeEngine() {
    const c = this.ctx, sr = c.sampleRate; const N = Math.floor(sr * 0.8); const buf = c.createBuffer(1, N, sr), d = buf.getChannelData(0);
    let seed = 777; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
    const lope = [1, 0.8, 0.95, 0.72, 1, 0.84, 0.9, 0.76, 1, 0.8, 0.98, 0.7, 0.96, 0.86, 0.92, 0.78];   // 16 pulses, uneven like a cross-plane V8
    for (let k = 0; k < 16; k++) { const t0 = Math.floor((k / 20 + rnd() * 0.0012) * sr); let lp = 0;
      for (let i = 0; i < 0.09 * sr; i++) { const t = i / sr; const idx = (t0 + i) % N; lp += (rnd() - lp) * 0.12;
        const body = (Math.sin(2 * Math.PI * 72 * t) * Math.exp(-t / 0.02) + 0.7 * Math.sin(2 * Math.PI * 144 * t) * Math.exp(-t / 0.014) + 0.45 * Math.sin(2 * Math.PI * 216 * t) * Math.exp(-t / 0.01));
        d[idx] += lope[k] * (body + lp * Math.exp(-t / 0.012) * 1.3); } }
    let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(d[i])); for (let i = 0; i < N; i++) d[i] /= pk;
    const loop = c.createBufferSource(); loop.buffer = buf; loop.loop = true; const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 400; lpf.Q.value = 1.2; const pulseG = c.createGain(); pulseG.gain.value = 0;
    loop.connect(lpf); lpf.connect(pulseG);
    const sa = c.createOscillator(), sb = c.createOscillator(); sa.type = 'sawtooth'; sb.type = 'sawtooth'; const gf = c.createBiquadFilter(); gf.type = 'lowpass'; gf.frequency.value = 500; gf.Q.value = 2;
    const shaper = c.createWaveShaper(); { const n = 512, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(x * 3.2) * 0.9; } shaper.curve = cv; shaper.oversample = '2x'; }
    const chop = c.createGain(); chop.gain.value = 0.7; const lfo = c.createOscillator(); lfo.type = 'sine'; const lfoD = c.createGain(); lfoD.gain.value = 0.3; lfo.connect(lfoD); lfoD.connect(chop.gain);
    const growlG = c.createGain(); growlG.gain.value = 0; sa.connect(shaper); sb.connect(shaper); shaper.connect(gf); gf.connect(chop); chop.connect(growlG);
    const sub = c.createOscillator(), sub2 = c.createOscillator(); sub.type = 'sine'; sub2.type = 'sine'; const subG = c.createGain(); subG.gain.value = 0; const sub2G = c.createGain(); sub2G.gain.value = 0.3; sub.connect(subG); sub2.connect(sub2G); sub2G.connect(subG);
    this.engBus = c.createGain(); this.engBus.gain.value = 0; const sat = c.createWaveShaper(); { const n = 256, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(x * 1.6); } sat.curve = cv; }
    pulseG.connect(sat); growlG.connect(sat); subG.connect(sat); sat.connect(this.engBus); this.engBus.connect(this.sfx);
    loop.start(); sa.start(); sb.start(); sub.start(); sub2.start(); lfo.start();
    this.eng = { loop, lpf, pulseG, sa, sb, gf, growlG, sub, sub2, subG, lfo, chop }; this.engDuck = 1; this.barkT = -9; this.prevGas = false; this.popT = 0; this.crackleN = 0; this.crackleNext = 0;
  },
  setEngine(speed01, running, o) {
    if (!this.ctx || !this.eng) return; o = o || {}; const c = this.ctx, t = c.currentTime, e = this.eng; const s = Math.max(0, Math.min(1.3, speed01));
    const bark = Math.max(0, 1 - (t - this.barkT) / 0.55); const limp = o.limp ? 1 : 0;
    const rate = (0.72 + 1.05 * s) * (1 + 0.28 * bark) * (1 - 0.18 * limp) + (o.gas ? 0.05 : 0);   // pulses per second: 14 at idle to about 36 flat out
    e.loop.playbackRate.setTargetAtTime(rate, t, 0.08); e.lpf.frequency.setTargetAtTime(300 + 700 * Math.min(1, s) + 250 * bark, t, 0.1);
    const f0 = 46 * rate; e.sa.frequency.setTargetAtTime(f0, t, 0.08); e.sb.frequency.setTargetAtTime(f0 * 1.503, t, 0.08); e.gf.frequency.setTargetAtTime(450 + 800 * Math.min(1, s), t, 0.1); e.lfo.frequency.setTargetAtTime(20 * rate, t, 0.08);
    e.sub.frequency.setTargetAtTime(29 + 24 * Math.min(1, s) + 7 * bark, t, 0.1); e.sub2.frequency.setTargetAtTime(58 + 48 * Math.min(1, s) + 14 * bark, t, 0.1);
    const load = running ? (o.gas ? 1 : 0.8) : 0.55; e.pulseG.gain.setTargetAtTime(0.95 * load + 0.2 * bark, t, 0.08); e.growlG.gain.setTargetAtTime((0.55 + 0.75 * Math.min(1, s)) * load + 0.35 * bark, t, 0.1); e.subG.gain.setTargetAtTime(0.3 + 0.06 * Math.min(1, s) + 0.45 * bark, t, 0.1);
    // under the gatling while it fires (down to 38%, quickly), back up in about a third of a second after
    const duckT = o.firing ? 0.38 : 1; this.engDuck += (duckT - this.engDuck) * (duckT < this.engDuck ? 0.25 : 0.06);
    this.engBus.gain.setTargetAtTime((running ? 0.62 : 0.08) * this.engDuck * (S.sound ? 1 : 0), t, 0.05); this.setFiring(!!o.firing);
    // pops and crackle when the throttle lifts at speed, a sputter now and then in limp
    const lift = this.prevGas && !o.gas && s > 0.3; this.prevGas = !!o.gas; if (lift) { this.crackleN = 3 + Math.floor(Math.random() * 4); this.crackleNext = t; }
    if (this.crackleN > 0 && t >= this.crackleNext) { this.crackleN--; this.crackleNext = t + 0.05 + Math.random() * 0.1; this.crackle(0.5 + Math.random() * 0.5); }
    if (limp && t > this.popT) { this.popT = t + 0.35 + Math.random() * 0.5; this.crackle(0.7); }
  },
  // one exhaust pop: a band of noise and a short falling thump
  crackle(v) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime; const n = Math.floor(c.sampleRate * 0.07), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let lp = 0;
    for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.5; d[i] = lp * Math.exp(-i / (c.sampleRate * 0.012)); } const src = c.createBufferSource(); src.buffer = b; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500 + Math.random() * 700; bp.Q.value = 0.9; const g = c.createGain(); g.gain.value = 0.55 * v * (this.engDuck || 1); src.connect(bp); bp.connect(g); g.connect(this.sfx); src.start(t);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.06); og.gain.setValueAtTime(0.4 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07); o.connect(og); og.connect(this.sfx); o.start(t); o.stop(t + 0.08); },
  // a deep bark on a kill speed burst: the revs jump (in setEngine), a low bang, a throaty saw burst
  bark() { if (!this.ctx) return; const c = this.ctx, t = c.currentTime; this.barkT = t;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.28); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.34); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.36);
    const sw = c.createOscillator(), sg = c.createGain(), lf = c.createBiquadFilter(); sw.type = 'sawtooth'; sw.frequency.setValueAtTime(70, t); sw.frequency.exponentialRampToValueAtTime(52, t + 0.3); lf.type = 'lowpass'; lf.frequency.setValueAtTime(700, t); lf.frequency.exponentialRampToValueAtTime(180, t + 0.3); sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.38, t + 0.02); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.32); sw.connect(lf); lf.connect(sg); sg.connect(this.sfx); sw.start(t); sw.stop(t + 0.34);
    this.crackleN = 2; this.crackleNext = t + 0.2; },  tone(type, f0, f1, dur, vol, when = 0, dest) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.02); },
  noise(dur, vol, cutoff, when = 0) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when; const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); },
  // Pre-rendered one-shots (Sprint D): the gatling fires 20 rounds a second, so a round is one buffer source, not a handful of nodes.
  // shot: a crack on top of a short low thump (heavy, a little different each time); hit: a metal tick; kill: sub boom, crunch and ring;
  // ram: a thud, a grind and a metal ring.
  makeBuffers() {
    const c = this.ctx, sr = c.sampleRate; let ph = 0, lp = 0, prev = 0, seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
    const mk = (dur, fn) => { ph = 0; prev = 0; lp = 0; const n = Math.floor(sr * dur), b = c.createBuffer(1, n, sr), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = fn(i / sr, i); let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); const k = peak > 0 ? 0.92 / peak : 1; for (let i = 0; i < n; i++) d[i] *= k; return b; };
    // The gatling round (Jack: deep, fast, punchy, a big machine gun, no whine): a low-mid chunk (a sine and a little triangle sweeping 220 to 60 Hz with a hard attack), a short sub (40 to 60 Hz),
    // a mid thwack (a noise burst through a 560 to 780 Hz band-pass, soft-clipped), a very short dark crack (noise through a 2 kHz low-pass), all through a tanh shaper and a last low-pass at about 2.2 kHz,
    // so nothing steady above 1.2 kHz survives. Five variants differ in pitch, thwack centre and noise; the sixth is the heavier first round of a burst (longer chunk, more sub).
    const gun = (v, accent) => { const pit = [1, 0.9, 1.1, 0.95, 1.06, 0.88][v], fc = [560, 620, 700, 600, 740, 520][v], F = 2 * Math.sin(Math.PI * fc / sr), dur = accent ? 0.17 : 0.11; let p1 = 0, p2 = 0, cl = 0, lo = 0, bd = 0, ol = 0;
      return mk(dur, (t) => { p1 += 2 * Math.PI * (60 + 160 * Math.exp(-t / 0.022)) * pit * (accent ? 0.92 : 1) / sr; const ph1 = p1 + 1.0; const tri = Math.asin(Math.sin(ph1)) * 2 / Math.PI;
        const chunk = (0.8 * Math.sin(ph1) + 0.4 * tri) * Math.min(1, t / 0.0004) * Math.exp(-t / (accent ? 0.05 : 0.03));
        p2 += 2 * Math.PI * (40 + 20 * Math.exp(-t / 0.012)) * pit / sr; const sub = Math.sin(p2) * Math.exp(-t / (accent ? 0.03 : 0.018));
        const n = rnd(); const hi = n - lo - bd * 0.95; bd += F * hi; lo += F * bd; const thw = Math.tanh(bd * 2.4 * Math.exp(-t / 0.012)) * 0.8;
        cl += (n - cl) * 0.3; const crack = cl * Math.exp(-t / 0.0035) * 1.2;
        const x = Math.tanh((chunk * 1.0 + sub * (accent ? 0.7 : 0.4) + thw * 1.0 + crack * 0.45) * 1.9); ol += (x - ol) * 0.27; return ol * Math.min(1, (dur - t) / 0.006); }); };
    this.buf = { shot: [0, 1, 2, 3, 4].map(v => gun(v, false)), heavy: gun(5, true),
      hit: mk(0.06, (t) => { const n = rnd(); const tick = (n - prev) * Math.exp(-t / 0.004); prev = n; return tick * 0.6 + Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t / 0.012) * 0.5; }),
      kill: mk(0.7, (t) => { ph += 2 * Math.PI * (95 - 62 * Math.min(1, t / 0.4)) / sr; const boom = Math.sin(ph) * Math.exp(-t / 0.2); lp += (rnd() - lp) * 0.18; const rumble = lp * Math.exp(-t / 0.16) * 2.2; const n = rnd(); const crack = (n - prev) * Math.exp(-t / 0.012); prev = n; const crunch = rnd() * Math.sin(2 * Math.PI * 640 * t) * Math.exp(-t / 0.07) * 0.6; return boom * 1.0 + rumble + crack * 0.9 + crunch; }),
      ram: mk(0.5, (t) => { ph += 2 * Math.PI * (80 - 40 * Math.min(1, t / 0.3)) / sr; const thud = Math.sin(ph) * Math.exp(-t / 0.13); lp += (rnd() - lp) * 0.25; const grind = lp * Math.exp(-t / 0.18) * 1.6; const ring = (Math.sin(2 * Math.PI * 310 * t) + 0.7 * Math.sin(2 * Math.PI * 477 * t)) * Math.exp(-t / 0.09) * 0.35; const n = rnd(); const crack = (n - prev) * Math.exp(-t / 0.01); prev = n; return thud * 1.1 + grind + ring + crack * 0.9; }) };
  },
  play(buf, rate = 1, gain = 1) { if (!this.ctx || !buf) return; const c = this.ctx; const s = c.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; const g = c.createGain(); g.gain.value = gain; s.connect(g); g.connect(this.sfx); s.start(); },
  // a round: one of five variants (never the same twice running) with a little pitch and level drift; the first round after a pause is the heavier accent
  shot() { if (!this.buf) return; const t = this.ctx.currentTime; const first = t - (this.lastShot === undefined ? -9 : this.lastShot) > 0.3; this.lastShot = t; let v; do { v = Math.floor(Math.random() * 5); } while (v === this.lastV); this.lastV = v;
    this.play(first ? this.buf.heavy : this.buf.shot[v], (0.95 + Math.random() * 0.1) * (first ? 0.97 : 1), (first ? 0.4 : 0.3) * (0.9 + Math.random() * 0.2)); },
  // The rumble bed under a burst: a 47 Hz triangle (its odd harmonics at 141 and 235 Hz are what a phone speaker plays) and a sliver of low-passed noise, in over 50 ms, out over 150 ms; setEngine drives it from o.firing.
  setFiring(on) { if (!this.ctx) return; on = !!on; const c = this.ctx, t = c.currentTime;
    if (!this.bed) { if (!on) return; const bus = c.createGain(), o = c.createOscillator(), n = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = 47; n.buffer = this.getNoise(); n.loop = true; lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 1; g.gain.value = 0; o.connect(g); n.connect(lp); lp.connect(g); g.connect(bus); o.start(); n.start(0, 1.1); this.bed = { bus, g, live: false, last: 0 }; }
    const b = this.bed; if (on) { b.last = t; if (!b.live) { b.live = true; b.bus.connect(this.sfx); } b.g.gain.setTargetAtTime(0.1, t, 0.017); } else { b.g.gain.setTargetAtTime(0, t, 0.05); if (b.live && t - b.last > 0.7) { b.live = false; try { b.bus.disconnect(); } catch (e) {} } } },
  hit() { if (this.buf) this.play(this.buf.hit, 0.9 + Math.random() * 0.3, 0.28); },
  kill(n) { this.bark(); if (!this.buf) return; this.play(this.buf.kill, 1 - Math.min(n, 5) * 0.015, 0.95); if (n > 1) this.tone('triangle', 500 + n * 90, 500 + n * 90, 0.12, 0.1, 0.05); },
  ram(light) { if (this.buf) this.play(this.buf.ram, light ? 1.25 : 1, light ? 0.75 : 1); },
  whoosh() { this.noise(0.3, 0.25, 3200); this.tone('sine', 900, 300, 0.25, 0.05); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.5, 0.14, i * 0.12)); this.tone('sawtooth', 130, 260, 0.9, 0.1); },
  // (the gatling's spin-up whine was removed in Stop 2: the barrels come up to speed silently, the rounds are the sound)
  setGunSpin() {},
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
