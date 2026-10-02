// Renders icon.html to a 1024x1024 PNG (no alpha) for the asset catalog.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, '..', 'Moonwake', 'Resources', 'Assets.xcassets', 'AppIcon.appiconset', 'icon-1024.png');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, 'icon.html'));
await page.waitForFunction(() => document.title === 'rendered');
await page.screenshot({ path: out, omitBackground: false, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
await browser.close();
console.log('wrote', out);
