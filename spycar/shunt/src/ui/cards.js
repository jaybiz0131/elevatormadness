// Title, pause, death and settings cards. `app` carries the run and the bests; `screen` is what is showing.
import { S } from '../settings.js';
import { T, fmt, localDate } from '../sim/constants.js';
import { $, ui } from './dom.js';
let screenNow = 'title', settingsFromNow = 'title';
export function screen() { return screenNow; }
export function settingsFrom() { return settingsFromNow; }
export function setScreen(k) { screenNow = k; }
export function setSettingsFrom(k) { settingsFromNow = k; }
const STAR = '<svg viewBox="0 0 24 24" class="CLS"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z"/></svg>';
const mmss = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
export function showCard(kind, app) {
  const { G, dailyMode, best, bestDaily, cash } = app; screenNow = kind; ui.card.hidden = false; ui.card.classList.toggle('over', kind === 'over'); ui.card.classList.toggle('showroom', kind === 'title'); ui.card.classList.toggle('settings', kind === 'settings'); ui.logo.hidden = kind !== 'title'; ui.stars.hidden = true; ui.newBest.hidden = true; ui.bar.hidden = true; ui.settings.hidden = kind !== 'settings';
  ui.score.hidden = kind === 'settings'; ui.pause.hidden = kind === 'title' || kind === 'settings';
  if (kind === 'title') { ui.title.textContent = dailyMode ? 'Daily run · ' + localDate() : 'Spy car brawler'; ui.score.textContent = 'BEST ' + fmt(dailyMode ? bestDaily : best); ui.lines.innerHTML = ''; ui.primary.textContent = 'PLAY'; ui.a.textContent = dailyMode ? 'RANDOM ROAD' : 'DAILY RUN'; ui.b.textContent = 'SETTINGS'; ui.c.hidden = true; }
  if (kind === 'pause') { ui.title.textContent = 'Paused'; ui.score.textContent = fmt(G.score); ui.lines.textContent = ''; ui.primary.textContent = 'RESUME'; ui.a.textContent = 'RESTART'; ui.b.textContent = 'SETTINGS'; ui.c.hidden = false; ui.c.textContent = 'QUIT TO TITLE'; }
  if (kind === 'over') { const won = G.won; const isBest = G.score > (dailyMode ? bestDaily : best); ui.title.textContent = won ? 'City reached' : (G.cause || 'Wrecked'); ui.score.textContent = fmt(G.score); ui.newBest.hidden = !isBest; const earned = Math.round(G.score * 0.1);
    if (won) { ui.stars.hidden = false; ui.stars.innerHTML = '<span class="grade g' + (G.grade || 'C') + '">' + (G.grade || 'C') + '</span>' + [1, 2, 3].map(i => STAR.replace('CLS', i <= G.stars ? 'on' : 'off')).join(''); }
    const city = Math.min(100, Math.floor(100 * G.dist / T.goal.city));
    // no "next car at 5,000" promise: the garage does not exist yet (audit, UI section)
    const bestTxt = fmt(Math.max(G.score, dailyMode ? bestDaily : best));
    ui.lines.innerHTML = (won ? 'TIME ' + mmss(G.t) + ' &nbsp;·&nbsp; KILLS ' + G.kills + ' &nbsp;·&nbsp; BEST COMBO ×' + G.comboPeak + '<br>ARMOR LEFT ' + G.armorLeft + (G.limpCount ? ' &nbsp;·&nbsp; LIMPED ' + G.limpCount + '×' : '') + (G.nearMisses ? ' &nbsp;·&nbsp; NEAR MISSES ' + G.nearMisses : '') + '<br>' + (G.stars < 3 ? 'A FASTER RUN AND MORE KILLS EARN MORE STARS &nbsp;·&nbsp; ' : '') + 'BEST ' + bestTxt
      : 'CITY ' + city + '% &nbsp;·&nbsp; BEST ' + bestTxt + '<br>WRECKS ' + G.kills + ' &nbsp;·&nbsp; COMBO ×' + G.comboPeak + ' &nbsp;·&nbsp; ' + mmss(G.t) + '<br>SLAMS ' + G.slams + ' &nbsp;·&nbsp; DRIFTS ' + G.drifts + (G.nearMisses ? ' &nbsp;·&nbsp; NEAR MISSES ' + G.nearMisses : ''))
      + '<br>' + (G.civHits ? G.civHits + ' civilian' + (G.civHits > 1 ? 's' : '') + ' hit &nbsp;·&nbsp; ' : '') + '+' + fmt(earned) + ' cash';
    ui.primary.textContent = won ? 'GO AGAIN' : 'DRIVE AGAIN'; ui.a.textContent = 'NEW ROAD'; ui.b.textContent = 'TITLE'; ui.c.hidden = false; ui.c.textContent = 'SETTINGS'; }
  if (kind === 'settings') { ui.title.textContent = 'Settings'; ui.lines.innerHTML = app.diag ? '<span style="font-size:11px;opacity:0.6">' + app.diag + '</span>' : ''; ui.primary.textContent = 'BACK'; ui.a.hidden = true; ui.b.hidden = true; ui.c.hidden = true; refreshSettings(); return; }
  ui.a.hidden = false; ui.b.hidden = false;
}
export function refreshSettings() { for (const [id, key] of [['sSound', 'sound'], ['sMusic', 'music'], ['sHaptics', 'haptics'], ['sShake', 'shake'], ['sMotion', 'motion'], ['sTapSlam', 'tapSlam'], ['sAutoDrift', 'autoDrift'], ['sDebug', 'debug']]) { const el = $(id); el.classList.toggle('on', !!S[key]); el.setAttribute('aria-checked', S[key] ? 'true' : 'false'); } $('sHand').textContent = S.left ? 'LEFT' : 'RIGHT'; { const g = S.gfx || 'auto'; $('sGfx').textContent = g === 'auto' ? 'AUTO' : g.toUpperCase(); $('sGfxNote').textContent = g === 'auto' ? (S.gfxAuto === 'low' ? 'auto chose low, it held 50 fps' : 'auto picks what holds 50 fps') : g === 'low' ? '1.5x pixels, no shadows or MSAA' : 'up to 2x pixels, shadows, MSAA'; } $('sCam').innerHTML = S.cam === 'B' ? '<span style="opacity:0.45">A</span> / B' : 'A / <span style="opacity:0.45">B</span>'; $('sSens').value = S.sens; $('sSensVal').textContent = S.sens.toFixed(1) + '×'; ui.special.classList.toggle('left', S.left); ui.pad.classList.toggle('left', S.left); ui.gas.classList.toggle('left', S.left); ui.fire.classList.toggle('left', S.left); }
