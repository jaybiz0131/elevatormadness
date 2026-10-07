// The HTML HUD over the 3D canvas: score and best, armor pips, speedometer, combo, replay label, off-screen chevrons, the damage
// vignette, speed lines, the ghost-thumb hint and floating score pops. Inside the safe areas; nothing under 13 px. Text nodes are
// only touched when their value changes.
import { T, fmt, clamp } from '../sim/constants.js';
import { REF } from '../sim/constants.js';
import { view, isTouch } from './dom.js';
import { S } from '../settings.js';
const CSS = `
#hud { position: absolute; inset: 0; pointer-events: none; font-family: var(--font-display); color: #f4f6f8; }
#hud .tl { position: absolute; left: 12px; top: calc(20px + var(--safe-top, 0px)); padding: 6px 22px 9px 12px; border-left: 3px solid #37e6ff; background: linear-gradient(90deg, rgba(4,7,14,0.7) 0%, rgba(4,7,14,0.45) 70%, rgba(4,7,14,0) 100%); border-radius: 2px 6px 6px 2px; }
#hud .score { font-size: 42px; font-weight: 700; line-height: 42px; letter-spacing: 0.01em; font-variant-numeric: tabular-nums; text-shadow: 0 2px 0 rgba(0,0,0,0.55), 0 0 18px rgba(0,0,0,0.6); display: flex; align-items: baseline; gap: 12px; }
#hud .goal { position: absolute; left: 18px; right: 18px; top: calc(9px + var(--safe-top, 0px)); height: 5px; border-radius: 3px; background: rgba(255,255,255,0.16); overflow: visible; }
#hud .goal i { display: block; height: 100%; width: 0; border-radius: 3px; background: linear-gradient(90deg, #37e6ff, #ffd23f); box-shadow: 0 0 8px rgba(55,230,255,0.5); }
#hud .goal b { position: absolute; top: -3px; width: 2px; height: 11px; background: rgba(255,255,255,0.55); } #hud .goal b.city { right: -1px; width: 3px; background: #ffd23f; }
#hud .goal.finale i { background: linear-gradient(90deg, #ffd23f, #ff5a3c); }
#hud .time { position: absolute; left: 0; right: 0; top: calc(17px + var(--safe-top, 0px)); text-align: center; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.08em; text-shadow: 0 2px 6px rgba(0,0,0,0.85); }
#hud .limp { margin-top: 6px; font-size: 14px; font-weight: 700; letter-spacing: 0.14em; color: #ff5a3c; text-shadow: 0 1px 6px rgba(0,0,0,0.9); }
#hud .limp[hidden] { display: none; }
#hud .limp.on { animation: limp 0.7s steps(2) infinite; } @keyframes limp { 0% { opacity: 1; } 100% { opacity: 0.45; } }
#hud .flash { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 60%, rgba(255,240,200,0.9) 0%, rgba(255,170,80,0.5) 40%, rgba(255,120,40,0) 75%); opacity: 0; mix-blend-mode: screen; }
#hud .combo { color: #ffd23f; font-size: 40px; font-weight: 700; line-height: 36px; display: flex; flex-direction: column; align-items: flex-start; text-shadow: 0 2px 10px rgba(0,0,0,0.85), 0 0 18px rgba(255,210,63,0.45); }
#hud .combo.bump { animation: bump 0.22s ease-out; } @keyframes bump { 0% { transform: scale(1.5); } 100% { transform: scale(1); } }
#hud .combo.hot { color: #ff8a3c; }
#hud .combo[hidden] { display: none; }
#hud .combobar { width: 60px; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.15); overflow: hidden; margin-top: 2px; }
#hud .combobar i { display: block; height: 100%; background: #ffd23f; width: 0; }
#hud .best { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.7); letter-spacing: 0.16em; margin-top: 1px; }
#hud .armor { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
#hud .armor b { font-size: 13px; font-weight: 700; letter-spacing: 0.16em; color: rgba(255,255,255,0.7); margin-right: 6px; }
#hud .armor i { width: 26px; height: 11px; transform: skewX(-18deg); background: rgba(255,255,255,0.14); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12); }
#hud .armor i.on { background: linear-gradient(180deg, #9ff4ff, #37e6ff); box-shadow: 0 0 8px rgba(55,230,255,0.6); } #hud .armor.low i.on { background: #ff3b3b; box-shadow: 0 0 10px rgba(255,59,59,0.8); }
#hud .speed { margin-top: 7px; font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
#hud .speed.fast { color: #ffd23f; } #hud .speed small { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; color: rgba(255,255,255,0.6); margin-left: 6px; }
#hud .replay { position: absolute; left: 0; right: 0; top: calc(18px + var(--safe-top, 0px)); text-align: center; font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.75); }
#hud .chev { position: absolute; width: 0; height: 0; border-left: 12px solid transparent; border-right: 12px solid transparent; }
#hud .chev.down { border-top: 18px solid #ff3b3b; bottom: calc(18px + var(--safe-bottom, 0px)); }
#hud .chev.up { border-bottom: 14px solid #fff; top: calc(84px + var(--safe-top, 0px)); border-left-width: 10px; border-right-width: 10px; }
#hud .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(255,0,0,0) 45%, rgba(255,30,30,0.45) 100%); opacity: 0; }
#hud .lines { position: absolute; inset: 0; opacity: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.0) 0 8px, rgba(255,255,255,0.35) 8px 10px, rgba(255,255,255,0) 10px 60px); mask-image: linear-gradient(90deg, #000 0, transparent 14%, transparent 86%, #000 100%); -webkit-mask-image: linear-gradient(90deg, #000 0, transparent 14%, transparent 86%, #000 100%); }
#hud .ghost { position: absolute; left: 0; width: 40%; bottom: calc(150px + var(--safe-bottom, 0px)); text-align: center; font-size: 15px; font-weight: 700; letter-spacing: 0.12em; opacity: 0; text-shadow: 0 1px 6px rgba(0,0,0,0.9); transition: opacity 0.3s; }
#hud .ghost.left { left: auto; right: 0; }
#hud .ghost i { display: block; width: 44px; height: 44px; border-radius: 22px; background: #fff; margin: 0 auto 8px; animation: ghost 1.6s infinite; opacity: 0.7; }
@keyframes ghost { 0% { transform: translateX(-40px); } 50% { transform: translateX(40px); } 100% { transform: translateX(-40px); } }
#hud .pop { position: absolute; transform: translate(-50%, -100%); font-size: 17px; font-weight: 700; color: #ffd23f; text-shadow: 0 1px 4px rgba(0,0,0,0.8); white-space: nowrap; }
#hud .pop.ride { font-size: 16px; color: #ffe27a; letter-spacing: 0.04em; text-shadow: 0 1px 3px rgba(0,0,0,0.95); }
#hud .pop.bad { color: #b8bcc6; } #hud .pop.small { font-size: 14px; } #hud .pop.big { font-size: 20px; color: #fff3a8; text-shadow: 0 0 10px rgba(255,160,40,0.8), 0 2px 4px rgba(0,0,0,0.9); }
#hud .look { position: absolute; left: 16px; top: calc(290px + var(--safe-top, 0px)); pointer-events: auto; display: flex; gap: 6px; }
#hud .look button { height: 32px; padding: 0 10px; border-radius: 16px; border: 0; background: rgba(20,24,30,0.7); color: #f4f6f8; font-family: var(--font-display); font-weight: 700; font-size: 13px; letter-spacing: 0.08em; }
#hud .look button.on { background: rgba(55,230,255,0.3); }
#hud .look[hidden] { display: none; }
`;
// pops stay out of the bottom band (gas, fire and the special pad) and below the HUD at the top
const POP_TOP = 96, POP_BOTTOM = 590;   // stage coordinates (390 by 844): the button band starts near y 620
export function createHud(container, renderer) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement('div'); el.id = 'hud'; el.innerHTML = `<div class="flash"></div><div class="goal" role="progressbar" aria-label="Distance to the city"><i></i><b style="left:90%"></b><b class="city"></b></div><div class="time">0:00</div><div class="vig"></div><div class="lines"></div><div class="tl"><div class="score"><span class="n">0</span><span class="combo" hidden><span class="c">×2</span><div class="combobar"><i></i></div></span></div><div class="best">BEST 0</div><div class="armor"><b>ARMOR</b></div><div class="limp on" hidden>LIMP · GRAB THE REPAIR</div><div class="speed"><span class="v">0</span><small>PT/S</small></div></div><div class="replay" hidden>● REPLAY</div><div class="ghost"><i></i>SLIDE TO STEER</div><div class="look"></div>`;
  container.appendChild(el);
  const q = (s) => el.querySelector(s); const nScore = q('.score .n'), combo = q('.combo'), comboN = q('.combo .c'), comboBar = q('.combobar i'), bestEl = q('.best'), armor = q('.armor'), limpEl = q('.limp'), timeEl = q('.time'), speedEl = q('.speed'), speedV = q('.speed .v'), speedTag = q('.speed small'), replay = q('.replay'), vig = q('.vig'), flash = q('.flash'), goal = q('.goal'), goalFill = q('.goal i'), lines = q('.lines'), ghost = q('.ghost');
  for (let i = 0; i < T.armor; i++) armor.appendChild(document.createElement('i')); const armorBars = armor.querySelectorAll('i');
  const chevs = []; for (let i = 0; i < 8; i++) { const c = document.createElement('div'); c.className = 'chev down'; c.hidden = true; el.appendChild(c); chevs.push(c); }
  const pops = []; for (let i = 0; i < 16; i++) { const p = document.createElement('div'); p.className = 'pop'; p.hidden = true; el.appendChild(p); pops.push(p); }
  const last = { limp: null, time: null, score: null, best: null, armor: null, low: null, speed: null, tag: null, combo: null, comboK: null, fast: null, replay: null, vig: null, lines: null, ghost: null };
  const set = (k, v, f) => { if (last[k] !== v) { last[k] = v; f(v); } };
  const pt = { x: 0, y: 0, visible: false };
  function update(st) {
    const G = st.G; const phase = st.phase; el.hidden = phase === 'title';
    set('score', G.score, v => nScore.textContent = fmt(v));
    set('best', Math.max(G.score, st.best), v => bestEl.textContent = 'BEST ' + fmt(v));
    set('armor', G.armor, v => { for (let i = 0; i < armorBars.length; i++) armorBars[i].classList.toggle('on', i < v); });
    set('limp', !!G.limp && phase === 'playing', v => limpEl.hidden = !v); set('time', Math.floor(G.t || 0), v => timeEl.textContent = Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'));
    set('low', G.armor === 1 && Math.sin(st.elapsed * 8) > 0, v => armor.classList.toggle('low', v));
    const showSpeed = phase !== 'over'; set('speedShow', showSpeed, v => speedEl.hidden = !v);
    if (showSpeed) { set('speed', Math.round(G.speed), v => speedV.textContent = String(v)); set('fast', G.speed > 850, v => speedEl.classList.toggle('fast', v)); set('tag', 'PT/S' + (G.turboT > 0 ? '  TURBO' : G.slipBoostT > 0 ? '  DRAFT' : G.nitro > 0 ? '  NITRO' : ''), v => speedTag.textContent = v); }
    set('combo', G.combo > 1 ? G.combo : 0, v => { combo.hidden = !v; if (v) { comboN.textContent = '×' + v; combo.classList.remove('bump'); if (!S.motion) { void combo.offsetWidth; combo.classList.add('bump'); } } });
    if (G.combo > 1) { const k = clamp(G.comboT / T.combo.hold, 0, 1); const live = G.comboT > T.combo.hold - T.combo.window; set('comboK', Math.round(k * 60) * 2 + (live ? 1 : 0), v => { comboBar.style.width = (v >> 1) + 'px'; comboBar.style.background = (v & 1) ? '#ffd23f' : '#ff7a3c'; }); }
    set('goal', Math.round(G.prog * 1000) + (G.finale ? 1e6 : 0), v => { goalFill.style.width = (G.prog * 100).toFixed(1) + '%'; goal.classList.toggle('finale', !!G.finale); });
    set('flash', S.motion ? 0 : Math.round(clamp(G.killFlash / 0.16, 0, 1) * 10), v => flash.style.opacity = v * 0.012);   // driver control: the kill flash cut way back so the crash stays visible   // no screen flash with Reduce motion
    set('replay', phase === 'over', v => replay.hidden = !v);
    set('vig', Math.round(G.vignette * 20) / 20, v => vig.style.opacity = v);
    const la = G.speedLines > 0 ? 0.5 : clamp((G.speed - 0.85 * T.drive.top) / (0.15 * T.drive.top), 0, 1) * 0.5; set('lines', Math.round(la * 20) / 20, v => lines.style.opacity = v);
    set('ghost', G.ghostThumb > 0 && isTouch, v => ghost.style.opacity = v ? 1 : 0); set('ghostSide', S.left, v => ghost.classList.toggle('left', v));
    // off-screen threats: red chevrons at the bottom for enemies behind, white at the top for the supply truck, placed by projection
    let ci = 0; for (const c of G.cars) { if (!c.alive || c.wrecked || ci >= chevs.length) continue; const enemy = (c.kind === 'bruiser' || c.kind === 'gunner') && c.y < G.dist - 300; const truck = c.kind === 'truck' && !c.loaded; if (!enemy && !truck) continue; renderer.project(c.x, c.y, pt); if (truck && pt.visible) continue; if (truck && pt.y > 0) continue; const e = chevs[ci++]; e.hidden = false; e.className = 'chev ' + (enemy ? 'down' : 'up'); e.style.left = (clamp(pt.x, 24, view.SW - 24) - 12) + 'px'; e.style.opacity = enemy ? 0.5 + 0.5 * Math.sin(st.elapsed * 12) : 1; }
    for (; ci < chevs.length; ci++) chevs[ci].hidden = true;
    // Stop 3: a kill's score is a small number riding on its wreck as it flips (p.car), not a big popup
    let pi = 0; const placed = []; for (const p of G.pops) { if (pi >= pops.length) break; const rc = p.ride && p.car; if (rc) renderer.project(rc.x, rc.y, pt, (rc.h || 0.6) + 1.6); else renderer.project(p.x, p.y, pt, 1.2); const e = pops[pi++]; e.hidden = false; const cls = 'pop' + (rc ? ' ride' : '') + (p.bad ? ' bad' : '') + (p.small ? ' small' : '') + (p.big ? ' big' : '');
      if (e.textContent !== p.text || e.className !== cls) { e.textContent = p.text; e.className = cls; e._w = 0; } if (!e._w) e._w = e.offsetWidth || 120;   // the width is measured once per text
      let top = clamp(pt.y - (rc ? 8 + p.t * 10 : 24 + p.t * 40), POP_TOP, POP_BOTTOM); const left = clamp(pt.x, e._w / 2 + 8, view.SW - e._w / 2 - 8);
      for (let k = 0; k < 5 && placed.some(o => Math.abs(o.top - top) < 24 && Math.abs(o.left - left) < (o.w + e._w) / 2); k++) top = Math.max(POP_TOP, top - 24);   // two pops never sit on each other
      placed.push({ top, left, w: e._w }); e.style.left = left + 'px'; e.style.top = top + 'px'; e.style.opacity = 1 - p.t * p.t; }
    for (; pi < pops.length; pi++) pops[pi].hidden = true;
  }
  function lookToggle(names, current, onPick) { const box = q('.look'); box.innerHTML = ''; for (const n of names) { const b = document.createElement('button'); b.textContent = n.label; b.classList.toggle('on', n.key === current); b.addEventListener('click', () => { onPick(n.key); for (const o of box.children) o.classList.toggle('on', o === b); }); box.appendChild(b); } }
  return { el, update, lookToggle };
}
