// Rajdhani (SIL Open Font License, via Fontsource; see CREDITS.md), embedded in the build so the HUD and cards use it offline and on
// first load; it no longer depends on Google Fonts. Two weights: 600 (labels) and 700 (score, buttons). Latin only, about 31 KB.
import w600 from './fonts/rajdhani-latin-600-normal.woff2?inline';
import w700 from './fonts/rajdhani-latin-700-normal.woff2?inline';
const css = [[600, w600], [700, w700]].map(([w, url]) => `@font-face { font-family: "Rajdhani"; font-style: normal; font-weight: ${w}; font-display: block; src: url(${url}) format("woff2"); }`).join('\n');
const el = document.createElement('style'); el.textContent = css; document.head.appendChild(el);
export const fontsReady = document.fonts ? Promise.all([600, 700].map(w => document.fonts.load(`${w} 20px Rajdhani`))).catch(() => null) : Promise.resolve();
