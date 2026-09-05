'use strict';
const assert = require('node:assert/strict');
const { test, describe, afterEach } = require('node:test');
const { JSDOM } = require('jsdom');
const factory = require('../src/nwsapi.js');
const windows = [];
afterEach(() => { for (const window of windows.splice(0)) window.close(); });
function build(html) {
  const { window } = new JSDOM(html);
  windows.push(window);
  const NW = factory({ document: window.document, DOMException: window.DOMException });
  return { window, document: window.document, NW };
}

describe('a descendant chain of tags answered by descending', () => {

  test('tag-class parts preserve HTML case rules', () => {
    const { document, NW } = build('<!doctype html><DIV class=x><P id=p class=y></P></DIV>');
    for (const selector of ['DIV.x P.y', 'div.x p.y', 'DIV.x p.y']) {
      assert.deepEqual(NW.select(selector, document).map(e => e.id), ['p']);
    }
  });

  test('narrow chains fetch descendants instead of global final candidates', () => {
    const { document, NW } = build('<!doctype html><ul><li><a id=a></a></li></ul><a id=outside></a>');
    const reads = [];
    const original = document.getElementsByTagName.bind(document);
    document.getElementsByTagName = function(tag) { reads.push(tag); return original(tag); };
    assert.deepEqual(NW.select('ul li a', document).map(e => e.id), ['a']);
    assert.deepEqual(reads, ['ul'], 'only the first chain level uses a document-wide lookup');
    reads.length = 0;
    NW.select('ul li a', document, () => {});
    assert.ok(reads.includes('a'), 'callbacks use the ordinary rightmost candidate route');
  });

  test('XML and SVG tag-class parts retain case sensitivity', () => {
    const { window } = new JSDOM('<root><Parent><Child id="c" class="x"/></Parent></root>', { contentType: 'application/xml' });
    windows.push(window);
    const nw = factory(window);
    assert.deepEqual(nw.select('Parent Child.x').map(e => e.id), ['c']);
    assert.deepEqual(nw.select('Parent child.x'), []);
    const html = build('<!doctype html><svg><foreignObject class=x id=f></foreignObject></svg>');
    for (const selector of ['svg foreignObject.x', 'svg foreignobject.x', 'svg FOREIGNOBJECT.x']) {
      assert.deepEqual(html.NW.select(selector).map(e => e.id), [...html.document.querySelectorAll(selector)].map(e => e.id));
    }
  });

  test('fragments and legacy mode keep the ordinary route', () => {
    const { document, NW } = build('<!doctype html><ul><li><a id=a></a></li></ul>');
    const fragment = document.createDocumentFragment();
    fragment.append(document.querySelector('ul').cloneNode(true));
    assert.deepEqual(NW.select('ul li a', fragment).map(e => e.id), ['a']);
    NW.configure({ LEGACY: true }, true);
    const reads = [];
    const original = document.getElementsByTagName.bind(document);
    document.getElementsByTagName = function(tag) { reads.push(tag); return original(tag); };
    assert.deepEqual(NW.select('ul li a', document).map(e => e.id), ['a']);
    assert.ok(reads.includes('a'));
    assert.equal(reads.includes('ul'), false);
  });
  // 'div ul li a' matched right to left starts from every <a> in the context.
  // Descending from the leftmost tag instead returns the answer directly, so
  // these cover what the resolver would otherwise have guaranteed: document
  // order, no duplicates, scoping, and the cases that must not take the path.
  function fixture() {
    return build(
      '<!doctype html><body>' +
        '<div id=d1><ul id=u1><li id=l1><a id=a1>1</a></li></ul></div>' +
        // nested same-tag chains: the naive descent returns these twice
        '<div id=d2><div id=d3><ul id=u2><li id=l2><a id=a2>2</a>' +
        '<ul id=u3><li id=l3><a id=a3>3</a></li></ul></li></ul></div></div>' +
        '<ul id=u4><li id=l4><a id=a4>4</a></li></ul>' +
        '<a id=a5>5</a>' +
        '</body>',
    );
  }

  test('the same elements as the reference engine, in the same order', () => {
    const { document, NW } = fixture();
    for (const selector of [
      'div ul li a', 'div div ul li a', 'ul li a', 'body a', 'div ul', 'ul li',
      'body div div', 'html body ul li a',
    ]) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      assert.deepEqual(mine, reference, selector);
    }
  });

  test('a nested match is returned once', () => {
    // u3 sits inside u2, so a3 is reachable through both; descending level by
    // level would collect it twice without the containment check.
    const { document, NW } = fixture();
    assert.deepEqual(NW.select('ul li a', document).map(node => node.id), ['a1', 'a2', 'a3', 'a4']);
    assert.deepEqual(NW.select('ul ul li a', document).map(node => node.id), ['a3']);
  });

  test('scoped to an element, and to a detached subtree', () => {
    const { document, NW } = fixture();
    const scope = document.getElementById('d2');
    assert.deepEqual(NW.select('ul li a', scope).map(node => node.id), ['a2', 'a3']);
    assert.deepEqual(Array.from(scope.querySelectorAll('ul li a'), node => node.id), ['a2', 'a3']);

    const detached = document.createElement('div');
    detached.innerHTML = '<ul><li><a id=x>x</a></li></ul>';
    assert.deepEqual(NW.select('ul li a', detached).map(node => node.id), ['x']);
  });

  test('a callback still sees every match', () => {
    // The descent returns the answer rather than a candidate list, so a query
    // carrying a callback has to stay on the ordinary path.
    const { document, NW } = fixture();
    const seen = [];
    const found = NW.select('ul li a', document, node => seen.push(node.id));
    assert.deepEqual(found.map(node => node.id), ['a1', 'a2', 'a3', 'a4']);
    assert.deepEqual(seen, ['a1', 'a2', 'a3', 'a4']);
  });

  test('first() returns the first in tree order', () => {
    const { document, NW } = fixture();
    assert.equal(NW.first('div ul li a', document).id, 'a1');
    assert.equal(NW.first('ul ul li a', document).id, 'a3');
    assert.equal(NW.first('div span a', document), null);
  });

  test('a chain that is not plain tags is unaffected', () => {
    const { document, NW } = fixture();
    for (const selector of ['div.x ul li a', 'div ul li a.y', 'div > ul li a', 'div ul li a:first-child']) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      assert.deepEqual(mine, reference, selector);
    }
  });

  // A level wide enough to matter is routed by counting how many elements of
  // the last part the context holds, so these cover the wide shapes and the
  // one hazard the counting brings: a count outliving the document it
  // describes.
  function wide(inner, tail) {
    let html = '<!doctype html><body>';
    for (let i = 0; i < 200; ++i) {
      html += `<ul id=u${i}><li id=l${i}>${inner(i)}</li></ul>`;
    }
    return build(`${html}${tail ?? ''}</body>`);
  }

  test('a level too wide for the budget answers the same', () => {
    const { document, NW } = wide(i => `<a id=a${i}>${i}</a>`, '<a id=loose>x</a>');
    for (const selector of ['ul li a', 'ul li', 'body ul li a', 'body li a']) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      assert.deepEqual(mine, reference, selector);
      assert.ok((mine.length) > (0), selector);
    }
  });

  test('a count taken before a change does not decide the answer', () => {
    // Nothing of the last part is in the document, so the count taken on the
    // first query is zero. It may pick the route for the second query and
    // must not stand in for its answer.
    const { document, NW } = wide(() => '');
    assert.deepEqual(NW.select('ul li a', document), []);

    const link = document.createElement('a');
    link.id = 'late';
    document.getElementById('l7').append(link);
    assert.deepEqual(NW.select('ul li a', document).map(node => node.id), ['late']);

    link.remove();
    assert.deepEqual(NW.select('ul li a', document), []);
  });
});
