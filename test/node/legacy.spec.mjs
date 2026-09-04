/*
 * Config.LEGACY against a host shaped like the ones it exists for.
 *
 * The browsers in question cannot be run here, so test/node/legacy-host.mjs
 * stands in for them: a jsdom document with the modern APIs hidden and the
 * old answers put back. Each selector is checked against what jsdom's own
 * querySelectorAll says about the same markup, so the expectations come from
 * a second implementation rather than from this one.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { JSDOM } from 'jsdom';

import { legacyHost } from './legacy-host.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const nwsapiPath = path.resolve(here, '..', '..', 'src', 'nwsapi.js');

const MARKUP = '<!doctype html><html><body>' +
  '<div id=d1 class="box wide" data-k="v" title="a b">' +
    '<p id=p1 class="a first">one</p>' +
    '<p id=p2 class="b">two</p>' +
    '<p id=p3 class="a last">three</p>' +
    '<a id=a1 href="./go" for="x" title="hello-world">link</a>' +
    '<span id=s1></span>' +
  '</div>' +
  '<div id=d2 class="box">' +
    '<ul id=u1><li id=l1>1</li><li id=l2 class="row">2</li><li id=l3>3</li></ul>' +
    '<form id=f1><input id=i1 type=checkbox checked><input id=i2 disabled></form>' +
  '</div>' +
  '<div id=d3 style="color:red"><em id=e1>e</em></div>' +
  '</body></html>';

// Every shape the engine compiles differently, so the legacy reads are all
// exercised: tags, classes, ids, attributes with each operator, the four
// combinators, the structural pseudo-classes, the logical ones and lists.
const SELECTORS = [
  'div', '*', 'p', 'em',
  '.box', '.a', '.row', 'p.a', 'div.box.wide', ':not(.box)',
  '#d1', '#p2', 'div#d2', '#d1 p',
  '[data-k]', '[data-k="v"]', '[data-k^="v"]', '[data-k$="v"]', '[data-k*="="]',
  '[title~="b"]', '[title|="hello"]', '[title="A B" i]', '[for="x"]',
  'a[href]', 'input[checked]', 'input[disabled]', 'div[style]',
  'div p', 'div > p', 'p + p', 'p ~ p', 'ul li', 'div ul li', 'body div p',
  'p:first-child', 'p:last-child', 'span:only-child', 'li:first-child',
  'p:first-of-type', 'p:last-of-type', 'em:only-of-type',
  'p:nth-child(1)', 'p:nth-child(2)', 'p:nth-child(2n)', 'p:nth-child(odd)',
  'li:nth-child(3)', 'li:nth-last-child(1)', 'p:nth-of-type(2)',
  'p:nth-last-of-type(1)',
  'p:not(.a)', 'p:not(:first-child)', 'div:is(.box)', 'div:where(#d1, #d2)',
  'div:has(p)', 'div:has(> ul)', 'span:empty', ':root', 'html body',
  'p, span', 'li, em', 'div.box, .row',
];

function build(markup, options) {
  const dom = new JSDOM(markup);
  const { window } = dom;
  const host = legacyHost(window.document, options);
  delete require.cache[require.resolve(nwsapiPath)];
  const NW = require(nwsapiPath)({ document: host, DOMException: window.DOMException });
  return { window, host, document: window.document, NW };
}

const ids = nodes => Array.from(nodes, node => node.id || node.nodeName.toLowerCase());

test.describe('a host that needs the legacy handling', () => {
  test('the host is missing what those browsers were missing', () => {
    const { host } = build(MARKUP);
    const root = host.documentElement;
    expect(root.hasAttribute, 'hasAttribute').toBeUndefined();
    expect(root.localName, 'localName').toBeUndefined();
    expect(root.firstElementChild, 'firstElementChild').toBeUndefined();
    expect(root.nextElementSibling, 'nextElementSibling').toBeUndefined();
    expect(root.parentElement, 'parentElement').toBeUndefined();
    expect(root.classList, 'classList').toBeUndefined();
    expect(host.getElementsByClassName, 'getElementsByClassName').toBeUndefined();
    expect(root.getAttributeNames, 'getAttributeNames').toBeUndefined();
    expect(root.isConnected, 'isConnected').toBeUndefined();
    // and its tag collection is not all elements
    const all = Array.prototype.slice.call(host.getElementsByTagName('*'));
    expect(all.some(node => node.nodeType === 8), 'comment nodes in the collection').toBe(true);
  });

  test('the engine turns the handling on by itself', () => {
    const { NW } = build(MARKUP);
    expect(NW.configure().LEGACY).toBe(true);
  });

  test('every selector shape answers what the reference engine answers', () => {
    const { NW, host, document } = build(MARKUP);
    for (const selector of SELECTORS) {
      const mine = ids(NW.select(selector, host));
      const reference = ids(document.querySelectorAll(selector));
      expect(mine, selector).toEqual(reference);
    }
  });

  test('match, first and closest agree as well', () => {
    const { NW, host, document } = build(MARKUP);
    const byId = id => {
      const node = host.getElementById(id);
      expect(node, id).toBeTruthy();
      return node;
    };

    expect(NW.match('p.a', byId('p1'))).toBe(true);
    expect(NW.match('p.b', byId('p1'))).toBe(false);
    expect(NW.match('div > p:first-child', byId('p1'))).toBe(true);
    expect(NW.match('[for="x"]', byId('a1'))).toBe(true);
    expect(NW.match('input[checked]', byId('i1'))).toBe(true);

    expect(NW.first('div p', host).id).toBe(document.querySelector('div p').id);
    expect(NW.first('li.row', host).id).toBe('l2');
    expect(NW.first('table', host)).toBeNull();

    expect(NW.closest('div', byId('p1')).id).toBe('d1');
    expect(NW.closest('#d2', byId('p1'))).toBeNull();
  });

  test('a query scoped to an element stays inside it', () => {
    const { NW, host, document } = build(MARKUP);
    const scope = host.getElementById('d2');
    for (const selector of ['li', 'ul li', '.row', 'input[checked]', '*']) {
      const mine = ids(NW.select(selector, scope));
      const reference = ids(document.getElementById('d2').querySelectorAll(selector));
      expect(mine, selector).toEqual(reference);
    }
  });
});

test.describe('the attribute quirks that host had', () => {
  // The subject of jQuery's attr/prop split and of David Mark's My-Library:
  // getAttribute answered through the DOM property, so what came back was
  // not always the markup a selector compares against.
  test('a URL attribute compares as markup, not as the resolved URL', () => {
    const { NW, host } = build(MARKUP);
    const link = host.getElementById('a1');

    // what this host answers without the flag, which is not what the
    // selector is asking about
    expect(link.getAttribute('href')).toBe('http://legacy.example/go');
    expect(link.getAttribute('href', 2)).toBe('./go');

    expect(ids(NW.select('a[href="./go"]', host))).toEqual(['a1']);
    expect(ids(NW.select('a[href^="./"]', host))).toEqual(['a1']);
    expect(ids(NW.select('a[href="http://legacy.example/go"]', host))).toEqual([]);
  });

  test('class and for are read through the property that host exposed', () => {
    const { NW, host } = build(MARKUP);
    const link = host.getElementById('a1');

    // the markup name answered nothing at all
    expect(link.getAttribute('for')).toBeNull();
    expect(link.htmlFor).toBe('x');
    expect(host.getElementById('d1').getAttribute('class')).toBeNull();
    expect(host.getElementById('d1').className).toBe('box wide');

    expect(ids(NW.select('.box', host))).toEqual(['d1', 'd2']);
    expect(ids(NW.select('[class~="wide"]', host))).toEqual(['d1']);
    expect(ids(NW.select('[for="x"]', host))).toEqual(['a1']);
  });

  test('a boolean attribute is present rather than "true"', () => {
    const { NW, host } = build(MARKUP);
    expect(host.getElementById('i1').getAttribute('checked')).toBe(true);
    expect(ids(NW.select('input[checked]', host))).toEqual(['i1']);
    expect(ids(NW.select('input[checked="checked"]', host))).toEqual(['i1']);
    expect(ids(NW.select('input[disabled]', host))).toEqual(['i2']);
  });

  test('a style attribute is a presence test, not an object stringified', () => {
    const { NW, host } = build(MARKUP);
    expect(typeof host.getElementById('d3').getAttribute('style')).toBe('object');
    expect(ids(NW.select('div[style]', host))).toEqual(['d3']);
  });

  test('an attribute the markup never set is absent', () => {
    const { NW, host } = build(MARKUP);
    expect(ids(NW.select('[data-missing]', host))).toEqual([]);
    expect(ids(NW.select('input[readonly]', host))).toEqual([]);
    expect(NW.match('[data-missing]', host.getElementById('d1'))).toBe(false);
  });
});

test.describe('what LEGACY does to a host that does not need it', () => {
  test('the same answers, with the handling forced on', () => {
    const dom = new JSDOM(MARKUP);
    const { document } = dom.window;
    delete require.cache[require.resolve(nwsapiPath)];
    const NW = require(nwsapiPath)({ document, DOMException: dom.window.DOMException });
    expect(NW.configure().LEGACY, 'not detected on a modern host').toBe(false);

    const modern = SELECTORS.map(selector => ids(NW.select(selector, document)));
    NW.configure({ LEGACY: true });
    expect(NW.configure().LEGACY).toBe(true);
    const legacy = SELECTORS.map(selector => ids(NW.select(selector, document)));
    NW.configure({ LEGACY: false });

    for (let i = 0; i < SELECTORS.length; ++i) {
      expect(legacy[i], SELECTORS[i]).toEqual(modern[i]);
      expect(modern[i], SELECTORS[i]).toEqual(ids(document.querySelectorAll(SELECTORS[i])));
    }
  });
});
