// Renders a short motion clip of the look-dev page: frames via headless
// Chromium, encoded with ffmpeg. Usage: node clip.mjs <outDir> [state] [seconds] [fps]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'out');
const state = process.argv[3] || 'night';
const seconds = parseFloat(process.argv[4] || '3');
const fps = parseInt(process.argv[5] || '30');
const frames = path.join(out, `frames-${state}`);
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('pageerror', e.message));
const n = Math.round(seconds * fps);
for (let i = 0; i < n; i++) {
  const t = 4.2 + i / fps;
  await page.goto('file://' + path.join(here, 'index.html') + `?state=${state}&t=${t}`);
  await page.waitForFunction(() => document.title === 'rendered', null, { timeout: 60000 });
  await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
}
await browser.close();
const ffmpeg = process.env.FFMPEG || 'ffmpeg';   // needs an ffmpeg with libx264
const mp4 = path.join(out, `${state}.mp4`);
execFileSync(ffmpeg, ['-y', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-vf', 'scale=390:844', mp4], { stdio: 'inherit' });
console.log('wrote', mp4);
