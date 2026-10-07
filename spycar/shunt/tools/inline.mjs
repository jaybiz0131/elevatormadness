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
// Stop 7: the audio files stay out of the page: copied beside it in dist/audio (for a local server and for the published artifact's `files`), and the GitHub Pages copy reads the repo's assets/audio
const audioSrc = new URL('../../../assets/audio/', import.meta.url); let audioNote = 'no audio files';
if (fs.existsSync(audioSrc)) { fs.mkdirSync(new URL('audio/', dist), { recursive: true }); let n = 0, bytes = 0; for (const f of fs.readdirSync(audioSrc)) { if (!/\.(m4a|mp3|ogg|wav)$/.test(f)) continue; fs.copyFileSync(new URL(f, audioSrc), new URL('audio/' + f, dist)); n++; bytes += fs.statSync(new URL(f, audioSrc)).size; } audioNote = n + ' audio files (' + (bytes / 1048576).toFixed(1) + ' MB) in dist/audio, outside the page'; }
fs.mkdirSync(new URL('../play/', import.meta.url), { recursive: true }); fs.writeFileSync(new URL('../play/index.html', import.meta.url), html.replace('<head>', '<head>\n<meta name="shunt-audio-base" content="../../../assets/audio/">'));
console.log(audioNote + '; play/index.html (for GitHub Pages);', 'dist/shunt.html', (html.length / 1024).toFixed(0), 'KB; dist/artifact.html', (art.length / 1024).toFixed(0), 'KB');
