// After `vite build`: inline the bundle into one file so the game runs from file:// and as a claude.ai artifact (no external scripts).
// dist/shunt.html: standalone (doctype, metas). dist/artifact.html: artifact page format (title first, no doctype).
import fs from 'node:fs';
import path from 'node:path';
const dist = new URL('../dist/', import.meta.url);
let html = fs.readFileSync(new URL('index.html', dist), 'utf8');
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (m, src) => '<script type="module">' + fs.readFileSync(new URL('.' + src, dist), 'utf8').replace(/<\/script/g, '<\\/script') + '</script>');
html = html.replace(/<link rel="modulepreload"[^>]*>\n?/g, '');
html = html.replace(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/g, (m, href) => '<style>' + fs.readFileSync(new URL('.' + href, dist), 'utf8') + '</style>');
// the home-screen icon: assets/brand/apple-touch-icon-180.png goes into the page as a data URL (the placeholder __APPLE_TOUCH_ICON__ in index.html), like the theme and the title art: nothing is fetched from beside the page
const icon = 'data:image/png;base64,' + fs.readFileSync(new URL('../../../assets/brand/apple-touch-icon-180.png', import.meta.url)).toString('base64');
html = html.replaceAll('__APPLE_TOUCH_ICON__', icon);
fs.writeFileSync(new URL('shunt.html', dist), html);
const i = html.indexOf('<title>'); const j = html.indexOf('</head>');
const art = html.slice(i, j) + html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
fs.writeFileSync(new URL('artifact.html', dist), art.trim() + '\n');
fs.mkdirSync(new URL('../play/', import.meta.url), { recursive: true }); fs.writeFileSync(new URL('../play/index.html', import.meta.url), html);   // (GitHub Pages: the same single file)
console.log('play/index.html (for GitHub Pages); dist/shunt.html', (html.length / 1024).toFixed(0), 'KB; dist/artifact.html', (art.length / 1024).toFixed(0), 'KB');
