// Post-build: pack the inlined JS with Roadroller (a context-mixing packer that
// beats gzip on JS). Extracts the single inline module script from the built
// index.html, compresses it into a self-extracting classic script, and writes
// it back. Run after `vite build`, before zipping.
import { readFileSync, writeFileSync } from 'node:fs';
import { Packer } from 'roadroller';

const file = new URL('../dist/index.html', import.meta.url);
let html = readFileSync(file, 'utf8');

const m = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no inline module script found in dist/index.html');
const js = m[1];

const packer = new Packer([{ data: js, type: 'js', action: 'eval' }], {});
await packer.optimize(1); // search a bit for better parameters
const { firstLine, secondLine } = packer.makeDecoder();
const packed = firstLine + '\n' + secondLine;

// Move the code to a classic script at the END of <body>. The original module
// script was deferred; a classic inline script is not (and `defer` is ignored
// on inline scripts), so it must run after the <canvas> exists.
html = html.replace(m[0], '');
html = html.replace('</body>', '<script>' + packed + '</script></body>');
writeFileSync(file, html);

console.log(`  roadroller: JS ${js.length} B -> packed ${packed.length} B`);
