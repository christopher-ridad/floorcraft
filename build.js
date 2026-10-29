// Builds index.html: inlines src/parse.js into src/app.html and wraps it in a full HTML document.
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const parser = src('parse.js').replace("if(typeof module !== 'undefined')", 'if(false)');
const app = src('app.html').replace('/*PARSER*/', parser);
const head = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
  'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
fs.writeFileSync(path.join(__dirname, 'index.html'), head + app + '</body></html>\n');
console.log('Built index.html');
