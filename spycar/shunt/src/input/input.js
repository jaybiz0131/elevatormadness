// Pointer and keyboard. The sim never sees events: input.snapshot() builds one snapshot per fixed step.
import { S } from '../settings.js';
import { H, REF, STEP, T } from '../sim/constants.js';
import { G } from '../sim/state.js';
import { stage, ui, view } from '../ui/dom.js';
export const TRAIL = 24;   // ring of recent thumb samples {x, t(ms, event timeStamp)}
export const input = {
  playing: false, allowIdleTouch: true, now: 0, id: null, anchor: null, carAnchor: 0, cur: null, keys: {}, trail: [], trailN: 0, flickT: -1e9, lastKeyTap: { k: null, t: -9 }, brake: false, padId: null, slamReq: 0, fireReq: false, flickN: 0,
  reset() { this.id = null; this.anchor = null; this.cur = null; this.trailN = 0; this.brake = false; this.padId = null; this.slamReq = 0; this.fireReq = false; this.flickN = 0; ui.pad.classList.remove('held'); },
  requestSlam(dir) { this.slamReq = dir; }, requestFire() { this.fireReq = true; },
  // one snapshot per fixed step: everything the simulation may read from the player. The keyboard moves the anchor here, in step time.
  // a frozen (hit-stop) step could not use these requests: hold them for the next live step
  relatch(i) { if (i.slam) this.slamReq = i.slam; if (i.fire) this.fireReq = true; this.flickN += i.flicks; },
  snapshot(out, playing) { if (this.keys.left || this.keys.right) this.carAnchor += ((this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0)) * T.maxLateral * S.sens * STEP; let off = this.carAnchor; if (this.anchor && !(this.keys.left || this.keys.right)) { let dx = this.cur.x - this.anchor.x; if (Math.abs(dx) < T.deadZone) dx = 0; else dx -= Math.sign(dx) * T.deadZone; off += dx * T.thumbRatio * S.sens; } out.off = off; out.brake = this.brake; out.slam = this.slamReq; out.fire = this.fireReq; out.flicks = this.flickN; out.p = playing ? 1 : 0; this.slamReq = 0; this.fireReq = false; this.flickN = 0; return out; },
  push(x, t) { if (this.trail.length < TRAIL) this.trail.push({ x, t }); const i = this.trailN % TRAIL; this.trail[i].x = x; this.trail[i].t = t; this.trailN++; },
  sample(back) { return this.trail[(this.trailN - 1 - back + TRAIL * 2) % TRAIL]; },   // back = 0 is the newest
  // carAnchor is the car's target as an offset from the road centre, so no input means holding the lane while the road wanders
  down(id, x, y, ts) { if (this.id !== null) return; if (!this.playing && !this.allowIdleTouch) return; this.id = id; this.anchor = { x, y }; this.cur = { x, y }; this.carAnchor = G ? G.targetX - G.road.at(G.dist).center : 0; this.trailN = 0; this.push(x, ts);
    if (S.tapSlam && G && this.playing) { if (Math.abs(x - this.carAnchorScreen()) > 90) { /* tap far from the car: a Slam toward that side */ this.pendingTapSlam = x < view.SW / 2 ? -1 : 1; this.tapT = this.now; } } },
  carAnchorScreen() { return view.SW / 2 + (G.x - REF); },
  // Flick (audit): at least 60 stage pt in under 100 ms, from a thumb that moved less than 10 pt in the 120 ms before that, judged on
  // event timestamps rather than the frame clock. A detected flick asks for a contextual Slam; with no enemy beside the car it is
  // simply a fast lane change, which the relative drag already delivers.
  move(id, x, y, ts) { if (id !== this.id) return; this.cur = { x, y }; this.push(x, ts);
    if (ts - this.flickT < 250) return;   // one flick per gesture: the thumb is still moving after a flick, so nothing counts as quiet for a while
    const n = Math.min(this.trailN, TRAIL); let start = null;
    for (let b = 1; b < n; b++) { const p = this.sample(b); if (ts - p.t > T.slam.flickMs) break; if (Math.abs(x - p.x) >= T.slam.flickPt) start = b; }
    if (start === null) return;
    const s0 = this.sample(start); let quiet = true;
    for (let b = start + 1; b < n; b++) { const p = this.sample(b); if (s0.t - p.t > T.slam.quietMs) break; if (Math.abs(p.x - s0.x) >= T.slam.quietPt) { quiet = false; break; } }
    if (!quiet) return;
    if (G && this.playing) this.flickN++;
    this.flickT = ts; this.requestSlam(Math.sign(x - s0.x)); },
  up(id) { if (id === this.id) { if (this.pendingTapSlam && this.now - this.tapT < 0.15) this.requestSlam(this.pendingTapSlam); this.pendingTapSlam = 0; if (G) this.carAnchor = G.targetX - G.road.at(G.dist).center; this.id = null; this.anchor = null; this.cur = null; this.trailN = 0; } },
  key(k) { if (k === 'left' || k === 'right') { const dir = k === 'left' ? -1 : 1; if (this.lastKeyTap.k === k && this.now - this.lastKeyTap.t < 0.25) this.requestSlam(dir); this.lastKeyTap = { k, t: this.now }; } if (k === 'slamL') this.requestSlam(-1); if (k === 'slamR') this.requestSlam(1); },
};
function stagePoint(e) { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * view.SW, y: (e.clientY - r.top) / r.height * H }; }
// Wires the stage, pad, special and pause buttons and the keyboard. `app` answers: onTouch (audio unlock), canTouch (false on cards
// and in the countdown), onStart (a touch or key on the title starts a run), onFire, onPause, onRestart (fire on the death card).
export function bindInput(app) {
stage.addEventListener('pointerdown', e => {
  if (e.target.closest && e.target.closest('.tap')) return;
  e.preventDefault(); app.onTouch();
  if (!app.canTouch()) return;
  app.onStart();
  const p = stagePoint(e); input.down(e.pointerId, p.x, p.y, e.timeStamp);
  try { stage.setPointerCapture(e.pointerId); } catch (err) {}
});
// coalesced events carry every touch sample the OS saw since the last frame, each with its own timestamp
stage.addEventListener('pointermove', e => { const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null; if (list && list.length) { for (const ce of list) { const p = stagePoint(ce); input.move(ce.pointerId, p.x, p.y, ce.timeStamp || e.timeStamp); } } else { const p = stagePoint(e); input.move(e.pointerId, p.x, p.y, e.timeStamp); } });
const upH = e => input.up(e.pointerId);
stage.addEventListener('pointerup', upH); stage.addEventListener('pointercancel', upH);
const KEYS = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ' ': 'fire', j: 'fire', q: 'slamL', e: 'slamR', Shift: 'brake', s: 'brake', ArrowDown: 'brake' };
window.addEventListener('keydown', e => { const k = KEYS[e.key]; if (!k) { if (e.key === 'p' || e.key === 'Escape') app.onPause(); return; } e.preventDefault(); app.onTouch(); if (e.repeat) return; app.onStart(); if (app.onRestartKey && k === 'fire' && app.onRestartKey()) return; if (k === 'fire') input.requestFire(); else input.key(k); input.keys[k] = true; if (k === 'brake') { input.brake = true; ui.pad.classList.add('held'); } });
window.addEventListener('keyup', e => { const k = KEYS[e.key]; if (k) { e.preventDefault(); input.keys[k] = false; if (k === 'brake') { input.brake = false; ui.pad.classList.remove('held'); } } });
// pedal pad: hold to brake; hold while steering to drift; release after a drift for the mini-turbo
ui.pad.addEventListener('pointerdown', e => { e.preventDefault(); app.onTouch(); input.brake = true; input.padId = e.pointerId; ui.pad.classList.add('held'); try { ui.pad.setPointerCapture(e.pointerId); } catch (err) {} });
const padUp = e => { if (e.pointerId === input.padId) { input.brake = false; input.padId = null; ui.pad.classList.remove('held'); } };
ui.pad.addEventListener('pointerup', padUp); ui.pad.addEventListener('pointercancel', padUp); window.addEventListener('pointerup', padUp);
ui.special.addEventListener('pointerdown', e => { e.preventDefault(); app.onTouch(); if (input.playing) input.requestFire(); });
ui.pause.addEventListener('click', () => { app.onTouch(); app.onPause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) app.onHide(); });
}
