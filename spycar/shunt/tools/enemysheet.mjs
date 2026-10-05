// The enemy top-view approval sheet: draws src/render/three/enemyShapes.js (the same data the 3D models are built from) as an SVG,
// then a PNG. Three rows: each design in detail; the outline test (black silhouettes 60 px tall); all five at true relative size
// beside the hero.   node tools/enemysheet.mjs <outDir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ENEMY_SHAPES, ENEMY_WHEELS, ENEMY_ROLES } from '../src/render/three/enemyShapes.js';
const out = process.argv[2] || 'shots'; fs.mkdirSync(out, { recursive: true });
const SIZES = { weak: [30, 52], bruiser: [40, 70], gunner: [40, 76], armored: [120, 150], truck: [56, 110], player: [34, 60] };   // T.sizes (pt)
const KINDS = ['weak', 'bruiser', 'gunner', 'armored', 'truck'];
const pts = (poly, s, ox, oy) => poly.map(([x, y]) => `${(ox + x * s).toFixed(1)},${(oy + y * s).toFixed(1)}`).join(' ');
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(Math.min(255, v * k))); return `rgb(${c.join(',')})`; };
// one car drawn top-down: wheels, then layers low to high (higher layers a little lighter, as if lit from above); glow parts get a halo
function car(kind, s, ox, oy, silhouette = false) {
  let g = ''; const wheel = (x, y, w, l) => `<rect x="${(ox + (x - w / 2) * s).toFixed(1)}" y="${(oy + (y - l / 2) * s).toFixed(1)}" width="${(w * s).toFixed(1)}" height="${(l * s).toFixed(1)}" rx="${(s * 1.2).toFixed(1)}" fill="${silhouette ? '#000' : '#0b0c0f'}"/>`;
  for (const [x, y, w, l] of ENEMY_WHEELS[kind]) g += wheel(x, y, w, l) + wheel(-x, y, w, l);
  const layers = ENEMY_SHAPES[kind].slice().sort((a, b) => a.h[1] - b.h[1]);
  for (const L of layers) {
    const fill = silhouette ? '#000' : L.glow ? L.col : shade(L.col, 1 + L.h[1] * 0.12); const halo = !silhouette && L.glow ? ' filter="url(#glow)"' : '';
    if (L.ring) { const [cx, cy, r] = L.ring; g += L.band ? `<circle cx="${ox + cx * s}" cy="${oy + cy * s}" r="${r * s}" fill="none" stroke="${fill}" stroke-width="${L.band * s}"${halo}/>` : `<circle cx="${ox + cx * s}" cy="${oy + cy * s}" r="${r * s}" fill="${fill}"${halo}/>`; }
    else g += `<polygon points="${pts(L.poly, s, ox, oy)}" fill="${fill}"${halo}/>`;
  }
  return g;
}
const W = 1500, H = 1180; let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Rajdhani, 'Avenir Next Condensed', Arial, sans-serif">
<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect width="${W}" height="${H}" fill="#121318"/>
<text x="40" y="52" fill="#f4f6fa" font-size="34" font-weight="700" letter-spacing="2">SHUNT · ENEMY TOP VIEWS · FOR APPROVAL</text>
<text x="40" y="82" fill="#8a909c" font-size="18">Sprint C, Stop 2. Nose up. Original shapes from role descriptions only. Each fits its sim footprint (unchanged). Cyan is the hero's alone.</text>`;
// row 1: detail cards, each fitted into a 230 x 300 box
KINDS.forEach((k, i) => { const x0 = 40 + i * 290, y0 = 110; const [w, l] = SIZES[k]; const s = Math.min(230 / w, 300 / l) * 0.9; const R = ENEMY_ROLES[k];
  svg += `<rect x="${x0}" y="${y0}" width="270" height="470" rx="14" fill="#1a1c23" stroke="#2a2d36"/>`;
  svg += car(k, s, x0 + 135, y0 + 175);
  svg += `<text x="${x0 + 18}" y="${y0 + 360}" fill="#f4f6fa" font-size="26" font-weight="700">${R.name.toUpperCase()}</text><rect x="${x0 + 222}" y="${y0 + 340}" width="30" height="22" rx="5" fill="${R.accent}" filter="url(#glow)"/>`;
  const words = R.role.split(' '); let line = '', ly = y0 + 390; for (const wd of words) { if ((line + wd).length > 30) { svg += `<text x="${x0 + 18}" y="${ly}" fill="#b8bec9" font-size="17">${line}</text>`; ly += 22; line = ''; } line += wd + ' '; } svg += `<text x="${x0 + 18}" y="${ly}" fill="#b8bec9" font-size="17">${line}</text>`;
  svg += `<text x="${x0 + 18}" y="${y0 + 455}" fill="#6c7280" font-size="15">${(w * 0.075).toFixed(1)} m x ${(l * 0.075).toFixed(1)} m (sim ${w} x ${l} pt)</text>`; });
// row 2: outline test, black silhouettes exactly 60 px tall on a light card
svg += `<rect x="40" y="610" width="${W - 80}" height="170" rx="14" fill="#d9dde4"/><text x="60" y="642" fill="#1a1c23" font-size="20" font-weight="700">OUTLINE TEST · each silhouette 60 px tall, no colour</text>`;
KINDS.forEach((k, i) => { const [w, l] = SIZES[k]; const s = 60 / (l + (k === 'gunner' ? 8 : 0)); const cx = 150 + i * 270; svg += car(k, s, cx, 712 + (k === 'gunner' ? 4 * s : 0), true); svg += `<text x="${cx}" y="768" fill="#3a3d46" font-size="16" text-anchor="middle">${ENEMY_ROLES[k].name}</text>`; });
// row 3: true relative size with the hero
svg += `<rect x="40" y="810" width="${W - 80}" height="340" rx="14" fill="#1a1c23" stroke="#2a2d36"/><text x="60" y="842" fill="#f4f6fa" font-size="20" font-weight="700">TRUE RELATIVE SIZE · same scale, hero (cyan) for reference</text>`;
{ const s = 1.85; let x = 110; const base = 1000; const heroW = 34, heroL = 60;
  svg += `<rect x="${x - heroW / 2 * s}" y="${base - heroL / 2 * s}" width="${heroW * s}" height="${heroL * s}" rx="${8 * s}" fill="none" stroke="#37e6ff" stroke-width="3" filter="url(#glow)"/><text x="${x}" y="${base + 150}" fill="#37e6ff" font-size="16" text-anchor="middle">hero</text>`; x += 110;
  for (const k of KINDS) { const [w] = SIZES[k]; x += w / 2 * s; svg += car(k, s, x, base); svg += `<text x="${x}" y="${base + 150}" fill="#b8bec9" font-size="16" text-anchor="middle">${ENEMY_ROLES[k].name}</text>`; x += w / 2 * s + 70; } }
svg += `</svg>`;
fs.writeFileSync(path.join(out, 'enemies-topview.svg'), svg);
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:#121318">${svg}</body></html>`); await page.screenshot({ path: path.join(out, 'enemies-topview.png') }); await browser.close();
console.log('wrote', path.join(out, 'enemies-topview.svg'), 'and .png');
