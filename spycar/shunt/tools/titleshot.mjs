// The showroom title screen: waits for the models, lets the turntable run, then screenshots it with one frame's numbers.
//   node tools/titleshot.mjs <out.png> [extra query] [wait ms]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)); const pageFile = path.join(here, '..', 'dist', 'shunt.html');
const out = process.argv[2] || 'title.png'; const extra = process.argv[3] ? '?' + process.argv[3] : ''; const wait = Number(process.argv[4] || 3000);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts.g/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await p.goto('file://' + pageFile + extra);
await p.waitForFunction(() => window.__shunt && window.__shunt.renderer && window.__shunt.renderer().state.modelsReady, null, { timeout: 120000 }); await p.waitForTimeout(wait);
const st = await p.evaluate(() => { const R = window.__shunt.renderer(); return Object.assign(R.stats(), { phase: window.__shunt.phase, showroom: !!R.showroom, post: R.state.postError || null }); });
await p.screenshot({ path: out }); console.log(JSON.stringify({ calls: st.calls, tris: st.triangles, phase: st.phase, showroom: st.showroom, postError: st.post, errors })); await b.close();
