// Pointer and keyboard. The sim never sees events: input.snapshot() builds one snapshot per fixed step.
import { S } from '../settings.js';
import { H, REF, STEP, T } from '../sim/constants.js';
import { G } from '../sim/state.js';
import { stage, ui, view } from '../ui/dom.js';
export const TRAIL = 24;   // ring of recent thumb samples {x, t(ms, event timeStamp)}
export const input = {
  playing: false, allowIdleTouch: true, now: 0, id: null, anchor: null, carAnchor: 0, cur: null, keys: {}, trail: [], trailN: 0, flickT: -1e9, lastKeyTap: { k: null, t: -9 }, brake: false, padId: null, gas: false, gasId: null, fireHeld: false, fireId: null, slamReq: 0, specialReq: false, flickN: 0, boostReq: false, mineReq: false, holdTimer: 0,
  reset() { this.id = null; this.anchor = null; this.cur = null; this.trailN = 0; this.brake = false; this.padId = null; this.gas = false; this.gasId = null; this.fireHeld = false; this.fireId = null; this.slamReq = 0; this.specialReq = false; this.flickN = 0; this.boostReq = false; this.mineReq = false; clearTimeout(this.holdTimer); ui.pad.classList.remove('held'); ui.gas.classList.remove('held'); ui.fire.classList.remove('held'); },
  requestSlam(dir) { this.slamReq = dir; }, requestSpecial() { this.specialReq = true; },
  // one snapshot per fixed step: everything the simulation may read from the player. The keyboard moves the anchor here, in step time.
  // a frozen (hit-stop) step could not use these requests: hold them for the next live step
  relatch(i) { if (i.slam) this.slamReq = i.slam; if (i.special) this.specialReq = true; if (i.boost) this.boostReq = true; if (i.mine) this.mineReq = true; this.flickN += i.flicks; },
  snapshot(out, playing) { if (this.keys.left || this.keys.right) this.carAnchor += ((this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0)) * T.maxLateral * S.sens * STEP; let off = this.carAnchor; if (this.anchor && !(this.keys.left || this.keys.right)) { let dx = this.cur.x - this.anchor.x; if (Math.abs(dx) < T.deadZone) dx = 0; else dx -= Math.sign(dx) * T.deadZone; off += dx * T.thumbRatio * S.sens; } if (!Number.isFinite(off)) { off = 0; this.carAnchor = 0; }   // a NaN here would make a replay (JSON turns NaN into null) differ from the run
    out.off = off; out.brake = this.brake; out.gas = this.gas || !!this.keys.gas; out.fire = this.fireHeld || !!this.keys.fire; out.special = this.specialReq; out.slam = this.slamReq; out.flicks = this.flickN; out.p = playing ? 1 : 0; out.turn = 0; out.boost = this.boostReq; out.mine = this.mineReq; this.slamReq = 0; this.specialReq = false; this.flickN = 0; this.boostReq = false; this.mineReq = false; return out; },
  push(x, t, y) { if (this.trail.length < TRAIL) this.trail.push({ x, y, t }); const i = this.trailN % TRAIL; this.trail[i].x = x; this.trail[i].y = y; this.trail[i].t = t; this.trailN++; },
  sample(back) { return this.trail[(this.trailN - 1 - back + TRAIL * 2) % TRAIL]; },   // back = 0 is the newest
  // carAnchor is the car's target as an offset from the road centre, so no input means holding the lane while the road wanders
  down(id, x, y, ts) { if (this.id !== null) return; if (!this.playing && !this.allowIdleTouch) return; this.id = id; this.anchor = { x, y }; this.cur = { x, y }; this.carAnchor = G ? G.targetX - G.road.at(G.dist).center : 0; this.trailN = 0; this.push(x, ts, y);
    if (S.tapSlam && G && this.playing) { if (Math.abs(x - this.carAnchorScreen()) > 90) { /* tap far from the car: a Slam toward that side */ this.pendingTapSlam = x < view.SW / 2 ? -1 : 1; this.tapT = this.now; } } },
  carAnchorScreen() { return view.SW / 2 + (G.x - REF); },
  // Flick (audit): at least 60 stage pt in under 100 ms, from a thumb that moved less than 10 pt in the 120 ms before that, judged on
  // event timestamps rather than the frame clock. A detected flick asks for a contextual Slam; with no enemy beside the car it is
  // simply a fast lane change, which the relative drag already delivers.
  move(id, x, y, ts) { if (id !== this.id) return; this.cur = { x, y }; this.push(x, ts, y);
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
  key(k) { if (k === 'boost') this.boostReq = true; if (k === 'mine') this.mineReq = true; if (k === 'left' || k === 'right') { const dir = k === 'left' ? -1 : 1; if (this.lastKeyTap.k === k && this.now - this.lastKeyTap.t < 0.25) this.requestSlam(dir); this.lastKeyTap = { k, t: this.now }; } if (k === 'slamL') this.requestSlam(-1); if (k === 'slamR') this.requestSlam(1); },
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
const KEYS = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ' ': 'fire', j: 'fire', f: 'fire', k: 'special', x: 'special', q: 'slamL', e: 'slamR', Shift: 'brake', s: 'brake', ArrowDown: 'brake', ArrowUp: 'gas', w: 'gas', b: 'boost', m: 'mine' };
window.addEventListener('keydown', e => { const k = KEYS[e.key]; if (!k) { if (e.key === 'p' || e.key === 'Escape') app.onPause(); return; } e.preventDefault(); app.onTouch(); if (e.repeat) return; app.onStart(); if (app.onRestartKey && k === 'fire' && app.onRestartKey()) return; if (k === 'special') input.requestSpecial(); else input.key(k); input.keys[k] = true; if (k === 'brake') { input.brake = true; ui.pad.classList.add('held'); } if (k === 'gas') ui.gas.classList.add('held'); if (k === 'fire') ui.fire.classList.add('held'); });
window.addEventListener('keyup', e => { const k = KEYS[e.key]; if (k) { e.preventDefault(); input.keys[k] = false; if (k === 'brake') { input.brake = false; ui.pad.classList.remove('held'); } if (k === 'gas') ui.gas.classList.remove('held'); if (k === 'fire') ui.fire.classList.remove('held'); } });
// gas and fire: hold buttons like the pedal pad
for (const [el, field, idField] of [[ui.gas, 'gas', 'gasId'], [ui.fire, 'fireHeld', 'fireId']]) { let y0 = 0, swiped = false; el.addEventListener('pointerdown', e => { e.preventDefault(); app.onTouch(); input[field] = true; input[idField] = e.pointerId; y0 = e.clientY; swiped = false; el.classList.add('held'); try { el.setPointerCapture(e.pointerId); } catch (err) {} });
  // a swipe up on FIRE launches the special (missile) as well as the SPECIAL button
  if (field === 'fireHeld') el.addEventListener('pointermove', e => { if (e.pointerId === input[idField] && !swiped && y0 - e.clientY > 36) { swiped = true; if (input.playing) input.requestSpecial(); } }); const up = e => { if (e.pointerId === input[idField]) { input[field] = false; input[idField] = null; el.classList.remove('held'); } }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); window.addEventListener('pointerup', up); }
// pedal pad: hold to brake; hold while steering to drift; release after a drift for the mini-turbo
ui.pad.addEventListener('pointerdown', e => { e.preventDefault(); app.onTouch(); input.brake = true; input.padId = e.pointerId; ui.pad.classList.add('held'); try { ui.pad.setPointerCapture(e.pointerId); } catch (err) {} });
const padUp = e => { if (e.pointerId === input.padId) { input.brake = false; input.padId = null; ui.pad.classList.remove('held'); } };
ui.pad.addEventListener('pointerup', padUp); ui.pad.addEventListener('pointercancel', padUp); window.addEventListener('pointerup', padUp);
// MISSILE: a tap fires it (on release); holding it for T.mine.hold s drops a shock mine instead. BOOST is its own button above BRAKE.
{ let held = false, longDone = false; const cancel = () => { clearTimeout(input.holdTimer); ui.special.classList.remove('charging'); };
  ui.special.addEventListener('pointerdown', e => { e.preventDefault(); app.onTouch(); held = true; longDone = false; try { ui.special.setPointerCapture(e.pointerId); } catch (err) {} ui.special.classList.add('charging'); clearTimeout(input.holdTimer); input.holdTimer = setTimeout(() => { if (held && input.playing) { longDone = true; input.mineReq = true; ui.special.classList.remove('charging'); } }, T.mine.hold * 1000); });
  const end = e => { if (!held) return; held = false; cancel(); if (!longDone && input.playing) input.requestSpecial(); };
  ui.special.addEventListener('pointerup', end); ui.special.addEventListener('pointercancel', () => { held = false; cancel(); }); }
ui.boost.addEventListener('pointerdown', e => { e.preventDefault(); app.onTouch(); if (input.playing) input.boostReq = true; ui.boost.classList.add('held'); });
const boostUp = () => ui.boost.classList.remove('held'); ui.boost.addEventListener('pointerup', boostUp); ui.boost.addEventListener('pointercancel', boostUp);
ui.pause.addEventListener('click', () => { app.onTouch(); app.onPause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) app.onHide(); });
}
