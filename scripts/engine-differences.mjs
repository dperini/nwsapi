/*
 * Where the three engines disagree, and whose disagreement it is.
 *
 * Four answers are collected for every selector and fixture:
 *
 *   chromium/native   the browser's own engine, which is the reference
 *   chromium/nwsapi   this engine, in the same page
 *   jsdom/native      jsdom's engine, @asamuzakjp/dom-selector
 *   jsdom/nwsapi      this engine, on jsdom
 *
 * Comparing them separates three different things that all look like "the
 * engines disagree":
 *
 *   - this engine is wrong: chromium/nwsapi differs from chromium/native.
 *     Those are ours to fix, and the browser is the arbiter.
 *   - jsdom's engine is wrong: jsdom/native differs from chromium/native
 *     while this engine agrees with the browser on both hosts.
 *   - the host cannot express the state: this engine answers differently on
 *     jsdom than in the browser. That is jsdom's DOM, not either engine, and
 *     ':hover' or ':focus' will show up here.
 *
 * A finding here is a candidate, not a verdict. Reading the properties the
 * selector depends on decides which of the three it is, which is why
 * docs/dom-selector-differences.md records the verdicts by hand and this
 * script only produces the evidence.
 *
 * Usage:
 *   node scripts/engine-differences.mjs [--markdown] [--all]
 */

/* global document, window */
// ^ the page.evaluate() callback below runs inside Chromium, not in Node.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { chromium } from '@playwright/test';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const enginePath = path.join(repoRoot, 'src', 'nwsapi.js');
const engineSource = readFileSync(enginePath, 'utf8');

const { values } = parseArgs({
  args: process.argv.slice(2).filter(arg => arg !== '--'),
  options: {
    markdown: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log('Usage: node scripts/engine-differences.mjs [--markdown] [--all]');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Fixtures, each one shaped for the selectors that follow it
// ---------------------------------------------------------------------------

const FIXTURES = {
  forms: {
    note: 'form controls, a disabled fieldset with a legend, an optgroup',
    html: `<!doctype html><html lang="en"><body><div id="d1">
      <input id="i1" disabled>
      <input id="i2">
      <input id="i3" required>
      <input id="i4" type="email" value="not-an-email">
      <input id="i5" disabled required>
      <input id="i6" type="number" min="1" max="5" value="3">
      <input id="i7" type="number" min="1" max="5" value="9">
      <input id="i8" readonly value="x">
      <input id="i9" type="checkbox" checked>
      <input id="i10" type="checkbox" indeterminate>
      <textarea id="t1"></textarea>
      <textarea id="t2" readonly></textarea>
      <fieldset id="fs" disabled>
        <legend id="lg"><input id="li1"></legend>
        <input id="fi1">
        <fieldset id="fs2"><legend id="lg2"><input id="li2"></legend></fieldset>
      </fieldset>
      <fieldset id="fs3"><input id="fi2"></fieldset>
      <form id="f1"><input id="fi3" required><button id="b1">go</button></form>
      <select id="se">
        <optgroup id="og" disabled><option id="op1">a</option></optgroup>
        <optgroup id="og2"><option id="op2" disabled>b</option><option id="op3" selected>c</option></optgroup>
      </select>
      <div id="ce" contenteditable="true"><span id="ce1">e</span></div>
    </div></body></html>`,
    selectors: [
      ':enabled', ':disabled', ':required', ':optional', ':valid', ':invalid',
      ':in-range', ':out-of-range', ':read-only', ':read-write', ':checked',
      ':indeterminate', ':default', ':placeholder-shown',
      'input:disabled', 'input:enabled', 'option:disabled', 'button:optional',
      'fieldset :read-write', 'div:has(> input:required)', ':not(:enabled)',
      'select:has(option:checked)', 'input:not(:read-write)',
    ],
  },
  elements: {
    note: 'a custom element, a customized built-in, links and a target',
    html: `<!doctype html><html lang="en"><body><div id="d1">
      <my-thing id="mt"></my-thing>
      <button id="b2" is="fancy-btn">x</button>
      <a id="a1" href="#x">link</a>
      <a id="a2">no href</a>
      <a id="a3" href="http://example.test/other">absolute</a>
      <span id="x">target</span>
      <p id="p1" lang="fr">fr</p>
      <p id="p2">inherit</p>
      <bdi id="bd">auto</bdi>
      <div id="empty"></div>
      <div id="ws"> </div>
    </div></body></html>`,
    selectors: [
      ':defined', ':any-link', ':link', ':visited', ':target', ':empty',
      ':root', ':scope', ':lang(en)', ':lang(fr)', ':dir(ltr)', ':dir(rtl)',
      'a:not([href])', 'my-thing:defined', 'button:defined',
      'div:empty', 'div:has(+ div)', ':is(a, p):not(:empty)',
    ],
  },
  tree: {
    note: 'plain structure, for the shapes both engines should always agree on',
    html: `<!doctype html><html><body><div id="d1" class="box wide" data-k="v" title="a b">
      <p id="p1" class="a first">one</p><p id="p2" class="b">two</p>
      <p id="p3" class="a last">three</p><span id="s1"></span>
      <ul id="u1"><li id="l1">1</li><li id="l2" class="row">2</li><li id="l3">3</li></ul>
      <table id="tb"><tbody><tr id="r1"><td id="c1">c</td></tr></tbody></table>
    </div></body></html>`,
    selectors: [
      'div', '.box', 'p.a', '#p2', '[data-k="v"]', '[title~="b"]',
      '[title|="a"]', '[data-k^="v"]', '[data-k$="v"]', '[data-k*="="]',
      'div p', 'div > p', 'p + p', 'p ~ p', 'ul li', 'li:first-child',
      'li:last-child', 'li:nth-child(2)', 'li:nth-of-type(2n)',
      'p:only-of-type', 'td', 'tr > td', ':not(p)', ':is(p, li)',
      ':where(.a, .row)', 'div:has(ul li)', 'p:nth-last-child(1)',
    ],
  },
};

// The injected script also makes the browser's <head> non-empty, which is a
// property of how the engine gets into the page rather than of either engine.
const ARTIFACTS = { ':empty': new Set(['head']) };

// Selectors whose answer depends on interaction or layout, which no static
// document can settle. Skipped unless --all, since they are noise here.
const INTERACTIVE = new Set([':hover', ':focus', ':active', ':focus-visible', ':focus-within']);

// ---------------------------------------------------------------------------

function answersInJsdom(name, html, selectors) {
  const dom = new JSDOM(html, { url: `http://example.test/${name}#x` });
  const { document } = dom.window;
  delete require.cache[require.resolve(enginePath)];
  const engine = require(enginePath)({
    document,
    DOMException: dom.window.DOMException,
  });
  const ids = nodes => Array.from(nodes)
    .filter(node => node.nodeName !== 'SCRIPT')
    .map(node => node.id || node.nodeName.toLowerCase())
    .join(',');
  const out = {};
  for (const selector of selectors) {
    let native;
    let ours;
    try {
      native = ids(document.querySelectorAll(selector));
    } catch (error) {
      native = `THREW ${error && error.name}`;
    }
    try {
      ours = ids(engine.select(selector, document));
    } catch (error) {
      ours = `THREW ${error && error.name}`;
    }
    out[selector] = { native, ours };
  }
  return out;
}

// The fixture is served rather than set as content, so the page has a real
// URL with the fragment ':target' needs. One URL per fixture, because a
// navigation that only changes the fragment does not reload the document.
const pageUrl = name => `http://example.test/${name}#x`;
let served = '';

async function answersInChromium(page, name, html, selectors) {
  served = html;
  await page.goto(pageUrl(name));
  await page.addScriptTag({ content: engineSource });
  return page.evaluate(list => {
    const ids = nodes => Array.from(nodes)
      .filter(node => node.nodeName !== 'SCRIPT')
      .map(node => node.id || node.nodeName.toLowerCase())
      .join(',');
    const out = {};
    for (const selector of list) {
      let native;
      let ours;
      try {
        native = ids(document.querySelectorAll(selector));
      } catch (error) {
        native = `THREW ${error && error.name}`;
      }
      try {
        ours = ids(window.NW.Dom.select(selector, document));
      } catch (error) {
        ours = `THREW ${error && error.name}`;
      }
      out[selector] = { native, ours };
    }
    return out;
  }, selectors);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('**/*', route => route.fulfill({
  status: 200,
  contentType: 'text/html',
  body: served,
}));

const findings = [];
for (const [name, fixture] of Object.entries(FIXTURES)) {
  const selectors = fixture.selectors.filter(selector => values.all || !INTERACTIVE.has(selector));
  const inBrowser = await answersInChromium(page, name, fixture.html, selectors);
  const inJsdom = answersInJsdom(name, fixture.html, selectors);

  for (const selector of selectors) {
    const drop = ARTIFACTS[selector];
    const clean = value => (drop
      ? value.split(',').filter(id => !drop.has(id)).join(',')
      : value);
    const browserNative = clean(inBrowser[selector].native);
    const browserOurs = clean(inBrowser[selector].ours);
    const jsdomNative = clean(inJsdom[selector].native);
    const jsdomOurs = clean(inJsdom[selector].ours);

    const whose = [];
    if (browserOurs !== browserNative) { whose.push('nwsapi'); }
    if (jsdomNative !== browserNative) { whose.push('dom-selector'); }
    if (jsdomOurs !== browserOurs) { whose.push('jsdom host'); }
    if (!whose.length) { continue; }

    findings.push({
      fixture: name,
      selector,
      whose,
      browserNative,
      browserOurs,
      jsdomNative,
      jsdomOurs,
    });
  }
}

await browser.close();

const counted = { nwsapi: 0, 'dom-selector': 0, 'jsdom host': 0 };
for (const finding of findings) {
  for (const who of finding.whose) { counted[who] += 1; }
}

if (values.markdown) {
  console.log('| selector | fixture | differs | Chromium | dom-selector | nwsapi |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const finding of findings) {
    console.log(`| \`${finding.selector}\` | ${finding.fixture} | ${finding.whose.join(', ')} ` +
      `| ${finding.browserNative || '(none)'} | ${finding.jsdomNative || '(none)'} ` +
      `| ${finding.browserOurs || '(none)'} |`);
  }
} else {
  for (const finding of findings) {
    console.log(`${finding.selector}  [${finding.fixture}]  differs: ${finding.whose.join(', ')}`);
    console.log(`  chromium/native  ${finding.browserNative || '(none)'}`);
    console.log(`  chromium/nwsapi  ${finding.browserOurs || '(none)'}`);
    console.log(`  jsdom/native     ${finding.jsdomNative || '(none)'}`);
    console.log(`  jsdom/nwsapi     ${finding.jsdomOurs || '(none)'}`);
    console.log('');
  }
}

console.log('');
console.log(`${findings.length} selector(s) differ somewhere: ` +
  `${counted.nwsapi} where this engine differs from the browser, ` +
  `${counted['dom-selector']} where jsdom's engine does, ` +
  `${counted['jsdom host']} where the host cannot express the state`);
console.log(`jsdom ${require('jsdom/package.json').version}, ` +
  `dom-selector ${createRequire(require.resolve('jsdom'))('@asamuzakjp/dom-selector/package.json').version}`);

// this engine differing from the browser is a failure; the other two are notes
process.exitCode = counted.nwsapi ? 1 : 0;
