import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const dom = new JSDOM(readFileSync('test/speed/example/selectors.html', 'utf8'));
const { document } = dom.window;
const NW = require(process.cwd() + '/src/nwsapi.js')({ document, DOMException: dom.window.DOMException });
console.log('matches:', NW.select('div:not(:nth-of-type(2n))', document).length,
  '| native:', document.querySelectorAll('div:not(:nth-of-type(2n))').length);
const started = Date.now();
let n = 0;
while (Date.now() - started < 5000) n += NW.select('div:not(:nth-of-type(2n))', document).length;
console.log('checksum', n);
