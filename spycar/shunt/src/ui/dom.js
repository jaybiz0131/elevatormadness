// DOM handles, the callout band and the special button. Everything here is presentation.
export const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
export const view = { SW: 390, safeTop: 0, dpr: Math.min(window.devicePixelRatio || 1, 3) };
export const stage = document.getElementById('stage'), shakeEl = document.getElementById('shake'), cv = document.getElementById('cv');
export const $ = (id) => document.getElementById(id);
export const ui = { callout: $('callout'), pause: $('pause'), special: $('special'), pad: $('pad'), gas: $('gas'), fire: $('fire'), camBtn: $('camBtn'), camSel: $('camSel'), boost: $('boost'), specialIcon: $('specialIcon'), specialPips: $('specialPips'), specialMines: $('specialMines'), puck: $('puck'), puckDot: $('puckDot'), ebrake: $('ebrake'), ui: $('ui'), card: $('card'), logo: $('cardLogo'), title: $('cardTitle'), score: $('cardScore'), newBest: $('cardNewBest'), stars: $('cardStars'), lines: $('cardLines'), bar: $('cardBar'), barFill: $('cardBarFill'), settings: $('settings'), primary: $('btnPrimary'), a: $('btnA'), b: $('btnB'), c: $('btnC'), row: $('cardRow'), tap: $('tapStart'), tapText: $('tapText'), tapNote: $('tapNote'), skipHint: $('skipHint'), punch: $('punchFlash') };
export let calloutTimer = null;
export function callout(text, sub, ms = 1000, big = false) { if (Array.isArray(sub)) sub = sub[isTouch ? 0 : 1]; ui.callout.textContent = text; if (sub) { const s = document.createElement('small'); s.textContent = sub; ui.callout.appendChild(s); } ui.callout.classList.toggle('big', !!big); ui.callout.style.opacity = 1; clearTimeout(calloutTimer); if (ms > 0) calloutTimer = setTimeout(() => { ui.callout.style.opacity = 0; }, ms); }
export function hideCallout() { clearTimeout(calloutTimer); ui.callout.style.opacity = 0; }
export const ICONS = { missiles: '<svg viewBox="0 0 32 32"><path d="M16 2l5 10v12l-5 6-5-6V12z" fill="#ffd23f"/><path d="M11 20l-5 5 5-1zM21 20l5 5-5-1z" fill="#ffd23f"/></svg>', oil: '<svg viewBox="0 0 32 32"><path d="M16 3c5 7 9 11 9 17a9 9 0 0 1-18 0c0-6 4-10 9-17z" fill="#ffd23f"/></svg>', nitro: '<svg viewBox="0 0 32 32"><path d="M18 2L6 18h8l-2 12 14-18h-8z" fill="#ffd23f"/></svg>' };
export function updateSpecial(G) { if (!G || !G.special) { ui.specialIcon.innerHTML = ''; ui.specialPips.innerHTML = ''; return; } ui.special.classList.toggle('empty', G.special.ammo <= 0); ui.specialIcon.innerHTML = ICONS[G.special.kind]; ui.specialPips.textContent = String(Math.max(0, G.special.ammo)); if (G.special.ammo <= 0) ui.special.classList.remove('armed'); }
export function pulseSpecial() { ui.special.classList.add('pulse'); setTimeout(() => ui.special.classList.remove('pulse'), 1300); }
// Stop 5: the BOOST meter fills the button from the bottom (ready at 30%: a tap spends the whole meter), and the shock-mine count rides on MISSILE
let lastFill = -1, lastMines = -1, lastOn = null, lastReady = null;
export function updateBoost(G) {
  const f = Math.round(Math.min(1, G.bst) * 100); if (f !== lastFill) { lastFill = f; ui.boost.style.setProperty('--fill', f + '%'); const r = G.bst >= 0.3; if (r !== lastReady) { lastReady = r; ui.boost.classList.toggle('ready', r); } }
  const on = G.bstT > 0; if (on !== lastOn) { lastOn = on; ui.boost.classList.toggle('on', on); }
  if (G.mineAmmo !== lastMines) { lastMines = G.mineAmmo; ui.specialMines.textContent = String(G.mineAmmo); ui.specialMines.classList.toggle('none', G.mineAmmo <= 0); }
}
export function resetBoostUi() { lastFill = -1; lastMines = -1; lastOn = null; lastReady = null; }
