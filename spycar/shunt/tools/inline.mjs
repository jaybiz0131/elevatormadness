// After `vite build`: inline the bundle into one file so the game runs from file:// and as a claude.ai artifact (no external scripts).
// dist/shunt.html: standalone (doctype, metas). dist/artifact.html: artifact page format (title first, no doctype).
import fs from 'node:fs';
import path from 'node:path';
const dist = new URL('../dist/', import.meta.url);
let html = fs.readFileSync(new URL('index.html', dist), 'utf8');
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (m, src) => '<script type="module">' + fs.readFileSync(new URL('.' + src, dist), 'utf8').replace(/<\/script/g, '<\\/script') + '</script>');
html = html.replace(/<link rel="modulepreload"[^>]*>\n?/g, '');
html = html.replace(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/g, (m, href) => '<style>' + fs.readFileSync(new URL('.' + href, dist), 'utf8') + '</style>');
fs.writeFileSync(new URL('shunt.html', dist), html);
const i = html.indexOf('<title>'); const j = html.indexOf('</head>');
const art = html.slice(i, j) + html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
fs.writeFileSync(new URL('artifact.html', dist), art.trim() + '\n');
console.log('dist/shunt.html', (html.length / 1024).toFixed(0), 'KB; dist/artifact.html', (art.length / 1024).toFixed(0), 'KB');
