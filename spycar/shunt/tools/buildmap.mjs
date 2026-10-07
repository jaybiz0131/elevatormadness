// A top-down map of the street round one place on one seed: the road strip (grey, the whole road), every building part (teal when it clears the road by 40 pt or
// more, red when it does not), the old generator beside the new one: node tools/buildmap.mjs <out.png> [--seed=1] [--s=30880] [--r=700]
// (--s is a place on the road; the map is centred on the point of the road at s, which for the default is where seed 1's road crosses itself.)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Road } from '../src/sim/road.js';
import { layoutChunk, roadClearance, roadContext, LAYOUT_CHUNK } from '../src/render/three/layout.js';
import sharp from 'sharp';
const args = process.argv.slice(2); const out = path.resolve(args.find(a => !a.startsWith('--')) || 'buildmap.png');
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const seed = Number(opt.seed || 1), s0 = Number(opt.s || 30880), R = Number(opt.r || 700);
const road = new Road(seed); road.ensure(s0 + 6000); const ctx = roadContext(seed); const c = { ...road.frame(s0) }; const cx = c.X, cy = c.Y;
function panel(legacy, title) {
  const W = 760, scale = W / (2 * R); const P = (X, Y) => [((X - cx) * scale + W / 2).toFixed(1), (W / 2 - (Y - cy) * scale).toFixed(1)];
  let svg = `<g><rect width="${W}" height="${W}" fill="#10131a"/>`;
  // the road: a polygon strip per 30 pt, every s whose centre is in view
  let strips = '';
  for (let s = -2400; s < 128000; s += 30) { const f = { ...road.frame(s) }; if (Math.abs(f.X - cx) > R * 1.3 || Math.abs(f.Y - cy) > R * 1.3) continue; const w = road.at(s).width / 2 + 2, f2 = { ...road.frame(s + 30) }, w2 = road.at(s + 30).width / 2 + 2;
    const pts = [[f.X + Math.cos(f.psi) * -w, f.Y - Math.sin(f.psi) * -w], [f.X + Math.cos(f.psi) * w, f.Y - Math.sin(f.psi) * w], [f2.X + Math.cos(f2.psi) * w2, f2.Y - Math.sin(f2.psi) * w2], [f2.X + Math.cos(f2.psi) * -w2, f2.Y - Math.sin(f2.psi) * -w2]].map(p => P(p[0], p[1]).join(',')).join(' '); strips += `<polygon points="${pts}" fill="#6b7384"/>`; }
  svg += strips; let bad = 0, n = 0;
  const k0 = Math.floor((s0 - 4200) / LAYOUT_CHUNK), k1 = Math.floor((s0 + 7000) / LAYOUT_CHUNK);
  const seen = new Set();
  // every chunk of the whole road that can put a building into view: scan them all (cheap, cached) and keep those near the map
  for (let k = -1; k < 320; k++) for (const b of layoutChunk(road, k, legacy ? { legacy: true } : {}).buildings) { if (Math.abs(b.cx / 0.075 - cx) > R * 1.5 && Math.abs(b.cx / 0.075 - cx) > 99999) continue;
    for (const part of b.parts) { const q = part.q; const mx = (q[0] + q[2] + q[4] + q[6]) / 4, my = (q[1] + q[3] + q[5] + q[7]) / 4; if (Math.abs(mx - cx) > R * 1.2 || Math.abs(my - cy) > R * 1.2) continue; n++; const clr = roadClearance(ctx, q, 200); const isBad = clr < 40; if (isBad) bad++;
      const pts = [0, 1, 2, 3].map(v => P(q[2 * v], q[2 * v + 1]).join(',')).join(' '); svg += `<polygon points="${pts}" fill="${isBad ? '#ff3b3b' : '#2fd0c4'}" fill-opacity="${isBad ? 0.9 : 0.45}" stroke="${isBad ? '#ffd0d0' : '#1c6f6a'}" stroke-width="1"/>`; } }
  svg += `<text x="14" y="30" fill="#fff" font-family="Arial" font-size="22" font-weight="700">${title}</text><text x="14" y="56" fill="${bad ? '#ff8a8a' : '#8cff9a'}" font-family="Arial" font-size="18">${bad ? bad + ' building parts closer than 40 pt to the road' : 'no building part closer than 40 pt'} (${n} parts in view)</text></g>`;
  return svg;
}
const left = panel(true, 'OLD generator (seed ' + seed + ')'), right = panel(false, 'NEW generator (same place)');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1540" height="760" viewBox="0 0 1540 760"><rect width="1540" height="760" fill="#10131a"/><g>${left}</g><g transform="translate(780,0)">${right}</g></svg>`;
await sharp(Buffer.from(svg)).png().toFile(out); console.log('wrote', out);
