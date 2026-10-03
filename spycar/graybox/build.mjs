// Wraps index.html (the artifact page, no doctype by contract) into shunt.html, a standalone file for phones and browsers.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const i = src.indexOf('<div id="frame">'); const head = src.slice(0, i), body = src.slice(i);
const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#1b1d22">
<title>Shunt Graybox</title>
${head.slice(head.indexOf('<style>')).trim()}
</head>
<body>
${body.trim()}
</body>
</html>
`;
fs.writeFileSync(new URL('./shunt.html', import.meta.url), out); console.log('shunt.html', out.length, 'bytes');
