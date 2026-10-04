// Title, pause, death and settings cards. `app` carries the run and the bests; `screen` is what is showing.
import { S } from '../settings.js';
import { fmt, localDate } from '../sim/constants.js';
import { $, ui } from './dom.js';
let screenNow = 'title', settingsFromNow = 'title';
export function screen() { return screenNow; }
export function settingsFrom() { return settingsFromNow; }
export function setScreen(k) { screenNow = k; }
export function setSettingsFrom(k) { settingsFromNow = k; }
export function showCard(kind, app) {
  const { G, dailyMode, best, bestDaily, cash } = app; screenNow = kind; ui.card.hidden = false; ui.card.classList.toggle('over', kind === 'over'); ui.logo.hidden = kind !== 'title'; ui.newBest.hidden = true; ui.bar.hidden = true; ui.settings.hidden = kind !== 'settings';
  ui.score.hidden = kind === 'settings';
  if (kind === 'title') { ui.title.textContent = dailyMode ? 'Daily run · ' + localDate() : 'Spy car brawler · gray-box'; ui.score.textContent = 'BEST ' + fmt(dailyMode ? bestDaily : best); ui.lines.innerHTML = 'Slide to steer. Flick to Slam.<br>Cash ' + fmt(cash) + (app.diag ? '<br><span style="font-size:11px;opacity:0.7">' + app.diag + '</span>' : ''); ui.primary.textContent = 'TOUCH TO DRIVE'; ui.a.textContent = dailyMode ? 'RANDOM ROAD' : 'DAILY RUN'; ui.b.textContent = 'SETTINGS'; ui.c.hidden = true; }
  if (kind === 'pause') { ui.title.textContent = 'Paused'; ui.score.textContent = fmt(G.score); ui.lines.textContent = ''; ui.primary.textContent = 'RESUME'; ui.a.textContent = 'RESTART'; ui.b.textContent = 'SETTINGS'; ui.c.hidden = false; ui.c.textContent = 'QUIT TO TITLE'; }
  if (kind === 'over') { const isBest = G.score > (dailyMode ? bestDaily : best); ui.title.textContent = G.cause || 'Wrecked'; ui.score.textContent = fmt(G.score); ui.newBest.hidden = !isBest; const earned = Math.round(G.score * 0.1);
    // no "next car at 5,000" promise: the garage does not exist yet (audit, UI section)
    ui.lines.innerHTML = 'BEST ' + fmt(Math.max(G.score, dailyMode ? bestDaily : best)) + ' &nbsp;·&nbsp; WRECKS ' + G.kills + ' &nbsp;·&nbsp; SLAMS ' + G.slams + ' &nbsp;·&nbsp; COMBO ×' + G.comboPeak + ' &nbsp;·&nbsp; ' + Math.round(G.t) + ' s<br>DRIFTS ' + G.drifts + (G.driftSlams ? ' &nbsp;·&nbsp; DRIFT SLAMS ' + G.driftSlams : '') + ' &nbsp;·&nbsp; TOP ' + Math.round(G.topSpeed) + ' pt/s' + (G.hairpins ? ' &nbsp;·&nbsp; HAIRPINS ' + G.hairpins : '') + '<br>' + (G.civHits ? G.civHits + ' civilian' + (G.civHits > 1 ? 's' : '') + ' hit &nbsp;·&nbsp; ' : '') + '+' + fmt(earned) + ' cash';
    ui.primary.textContent = 'DRIVE AGAIN'; ui.a.textContent = 'NEW ROAD'; ui.b.textContent = 'TITLE'; ui.c.hidden = false; ui.c.textContent = 'SETTINGS'; }
  if (kind === 'settings') { ui.title.textContent = 'Settings'; ui.lines.textContent = ''; ui.primary.textContent = 'BACK'; ui.a.hidden = true; ui.b.hidden = true; ui.c.hidden = true; refreshSettings(); return; }
  ui.a.hidden = false; ui.b.hidden = false;
}
export function refreshSettings() { for (const [id, key] of [['sSound', 'sound'], ['sMusic', 'music'], ['sHaptics', 'haptics'], ['sShake', 'shake'], ['sMotion', 'motion'], ['sTapSlam', 'tapSlam'], ['sAutoDrift', 'autoDrift']]) { const el = $(id); el.classList.toggle('on', !!S[key]); el.setAttribute('aria-checked', S[key] ? 'true' : 'false'); } $('sHand').textContent = S.left ? 'LEFT' : 'RIGHT'; $('sSens').value = S.sens; $('sSensVal').textContent = S.sens.toFixed(1) + '×'; ui.special.classList.toggle('left', S.left); ui.pad.classList.toggle('left', S.left); ui.gas.classList.toggle('left', S.left); ui.fire.classList.toggle('left', S.left); }
