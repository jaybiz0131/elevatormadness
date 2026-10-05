import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('file:///home/user/elevatormadness/spycar/shunt/dist/shunt.html?seed=3&cam=' + process.argv[3]);
await p.waitForFunction(() => window.__shunt && window.__shunt.renderer && window.__shunt.renderer().state.modelsReady, null, { timeout: 60000 }); await p.waitForTimeout(500);
await p.evaluate(() => window.__shunt.startPlaying()); await p.waitForFunction(() => window.__shunt.G.t > 3, null, { timeout: 300000 });
await p.evaluate(() => { const G = window.__shunt.G, d = G.dist; G.cars.length = 0; G.barriers.push({ y: d + 120, lanes: 3, lane0: 0 }); G.hitStop = 30; document.getElementById('ui').style.visibility = 'hidden'; });
await p.waitForTimeout(2500); await p.screenshot({ path: process.argv[2] }); await b.close();
