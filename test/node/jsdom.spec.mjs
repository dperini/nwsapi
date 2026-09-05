/*
 * Regressions that only show up when nwsapi runs as the selector engine of a
 * host that routes Element.prototype.matches back into it. jsdom is that
 * host, and jsdom is how most of nwsapi's traffic arrives, so these run in
 * node against jsdom rather than in the browser (see test/upstream for the
 * browser-side WPT suite).
 *
 * No browser is needed: this project is declared without a browserName in
 * playwright.config.mjs.
 */
import { createRequire } from 'node:module';
import v8 from 'node:v8';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const nwsapiPath = path.resolve(here, '..', '..', 'src', 'nwsapi.js');

// The factory is stateful per document, so each test builds its own.
function build(html) {
  const dom = new JSDOM(html);
  const { window } = dom;
  // Fresh module instance per document, matching how jsdom loads it.
  delete require.cache[require.resolve(nwsapiPath)];
  const NW = require(nwsapiPath)({
    document: window.document,
    DOMException: window.DOMException,
  });
  return { window, document: window.document, NW };
}

// A host whose Element.prototype.matches delegates to nwsapi, like jsdom's.
function wireMatchesToNwsapi(window, NW) {
  let calls = 0;
  window.Element.prototype.matches = function (selector) {
    ++calls;
    return NW.match(selector, this);
  };
  return () => calls;
}

const STATE_PSEUDOS = [':modal', ':fullscreen', ':picture-in-picture', ':open', ':closed'];

test.describe('state pseudo-classes under a host that delegates to nwsapi', () => {
  for (const pseudo of STATE_PSEUDOS) {
    test(`${pseudo} does not re-enter the engine`, () => {
      const { window, document, NW } = build('<!doctype html><body><div id=d></div></body>');
      const element = document.getElementById('d');
      const calls = wireMatchesToNwsapi(window, NW);

      // The result is a plain boolean, and the engine asks the host matcher
      // at most once. A re-entrant call is what exhausted the stack in
      // 2.2.26/2.2.27 and was then swallowed as `false`
      // (dperini/nwsapi#172), so what matters is that the recursion stops,
      // not that the host is never asked: a host whose matcher is real, as
      // in a browser, is where the answer has to come from.
      expect(typeof NW.match(pseudo, element)).toBe('boolean');
      expect(calls(), `${pseudo} re-entered Element.prototype.matches`)
        .toBeLessThanOrEqual(1);

      // Having learned that this host routes back into the engine, it is not
      // asked again for the same document.
      const asked = calls();
      for (let i = 0; i < 10; ++i) {
        NW.match(pseudo, element);
      }
      expect(calls(), `${pseudo} kept asking a host that delegates`).toBe(asked);
    });
  }

  test(':modal resolves quickly and repeatedly', () => {
    const { window, document, NW } = build('<!doctype html><body><button id=b>x</button></body>');
    const element = document.getElementById('b');
    wireMatchesToNwsapi(window, NW);

    // 2.2.26 spent roughly a second per call here, exhausting the stack each
    // time. A generous ceiling still separates the two behaviors by orders
    // of magnitude, so this stays meaningful without being timing-flaky.
    const started = Date.now();
    for (let i = 0; i < 50; ++i) {
      expect(NW.match(':modal', element)).toBe(false);
    }
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('an open <dialog> still matches :modal via the fullscreen flag', () => {
    const { document, NW } = build('<!doctype html><body><dialog id=g open>hi</dialog></body>');
    const dialog = document.getElementById('g');

    // Without a native matcher there is no "is modal" flag to read, so the
    // detectable half is the fullscreen element pointer.
    expect(NW.match(':modal', dialog)).toBe(false);
    Object.defineProperty(document, 'fullscreenElement', {
      value: dialog,
      configurable: true,
    });
    expect(NW.match(':modal', dialog)).toBe(true);
  });

  test(':open and :closed read the DOM state without a native matcher', () => {
    const { document, NW } = build(
      '<!doctype html><body><details id=o open></details><details id=c></details></body>',
    );
    expect(NW.match(':open', document.getElementById('o'))).toBe(true);
    expect(NW.match(':closed', document.getElementById('o'))).toBe(false);
    expect(NW.match(':open', document.getElementById('c'))).toBe(false);
    expect(NW.match(':closed', document.getElementById('c'))).toBe(true);
  });
});

test.describe('logical selector arguments containing parentheses', () => {
  // dperini/nwsapi#165: the argument of :is()/:where() was delimited by a
  // regular expression, so a nested :not()/:nth-child() ended the argument at
  // the wrong parenthesis and the selector silently matched nothing.
  test(':is() with a nested :not() and :nth-child() matches', () => {
    const { document, NW } = build(
      '<table><thead><tr><th data-column-index="1"><div role="button">Sort</div></th></tr></thead></table>',
    );
    const thead = document.querySelector('thead');
    const expected = document.querySelector('div[role=button]');

    expect(NW.first(':is(th[data-column-index="1"]) [role=button]', thead)).toBe(expected);
    expect(NW.first(':is(tr > th) [role=button]', thead)).toBe(expected);
    expect(
      NW.first(
        ':is(th[data-column-index="1"], tr:not([data-group-level]) > *:nth-child(1)) [role=button]',
        thead,
      ),
    ).toBe(expected);
  });

  test('nested logical selectors keep their own closing parenthesis', () => {
    const { document, NW } = build('<!doctype html><body><div id=a></div><span id=b></span></body>');
    const ids = selector => NW.select(selector, document.body).map(e => e.id);

    expect(ids(':not(:is(div))')).toEqual(['b']);
    expect(ids(':not(:not(div))')).toEqual(['a']);
    expect(ids(':is(div, :is(span))')).toEqual(['a', 'b']);
  });

  test('a pseudo-class may be followed by a quoted attribute selector', () => {
    // dperini/nwsapi#175: the combinator inside the validator's pseudo-class
    // pattern consumed the character after it, eating the '[' of the next
    // attribute selector. Needs all three: the i flag, a pseudo-class on the
    // same compound, and a quoted attribute selector after the combinator.
    const { document, NW } = build('<div><p class="a">t</p><p class="b" id="t"></p></div>');
    const target = document.getElementById('t');

    expect(NW.match("[class*='a' i]:not(:empty) + [class*='b']", target)).toBe(true);
    expect(NW.match('[class*="a" i]:not(:empty) + [class*="b"]', target)).toBe(true);
    expect(NW.match("[class*='a' i]:not(.x) + [class*='b']", target)).toBe(true);
    expect(NW.match("[class*='a' i]:not(:empty) + [class*='zz']", target)).toBe(false);
  });

  test('a parse error reports the selector, not the fragments that matched', () => {
    const { NW } = build('<!doctype html><body></body>');
    // The fragments joined by String() read as a corrupted selector, which is
    // how dperini/nwsapi#175 came to be reported as mangled quotes.
    expect(() => NW.select('div ??? span')).toThrow(/'div \?\?\? span'/);
  });

  test('an unclosed argument is closed by EOF', () => {
    const { document, NW } = build('<!doctype html><body><div id=a class=x></div><div id=b></div></body>');
    const ids = selector => NW.select(selector, document.body).map(e => e.id);

    // CSS Syntax closes any construct left open at EOF, so these are valid.
    expect(ids('div:not([class]')).toEqual(['b']);
    expect(ids('div:not([class')).toEqual(['b']);
    expect(ids('div:is([class="x"')).toEqual(['a']);
  });
});

test.describe('what the selector cache holds on to', () => {
  // The cache keeps a plan per selector. A plan that also carried the result
  // list and the context kept every element it had matched alive for as long
  // as that selector stayed cached, which in a jsdom suite means for the life
  // of the document. WeakRef answers this directly, where a heap reading only
  // ever suggests an answer.
  function exposeGc() {
    if (typeof globalThis.gc === 'function') {
      return globalThis.gc;
    }
    // Playwright runs this file without --expose-gc.
    v8.setFlagsFromString('--expose-gc');
    try {
      return vm.runInNewContext('gc');
    } finally {
      v8.setFlagsFromString('--no-expose-gc');
    }
  }

  async function collectGarbage(gc) {
    for (let i = 0; i < 5; ++i) {
      gc();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  async function subtreeSurvives({ query }) {
    const gc = exposeGc();
    const { document, NW } = build('<!doctype html><body></body>');

    const ref = (() => {
      const host = document.createElement('div');
      host.className = 'host';
      for (let i = 0; i < 200; ++i) {
        const leaf = document.createElement('span');
        leaf.className = 'leaf';
        host.appendChild(leaf);
      }
      document.body.appendChild(host);
      if (query) {
        NW.select(query, document);
      }
      host.remove();
      return new WeakRef(host);
    })();

    await collectGarbage(gc);
    const alive = ref.deref() !== undefined;
    // The engine has to outlive the reading, or there is nothing to retain.
    expect(NW).toBeTruthy();
    return alive;
  }

  test('a removed subtree is collectable, queried or not', async () => {
    // Control: with no query at all the subtree must already be collectable,
    // otherwise the test proves nothing about the cache.
    expect(await subtreeSurvives({ query: null })).toBe(false);
    expect(await subtreeSurvives({ query: 'div.host span.leaf' })).toBe(false);
    // Two required ancestor tags, which is what turns on the ancestor
    // filter: its summaries key on elements, so they have to be dropped with
    // the call rather than held until the next one.
    expect(await subtreeSurvives({ query: 'body div span' })).toBe(false);
  });

  test('a cached plan is reused across contexts', () => {
    const { document, NW } = build(
      '<!doctype html><body><div id=one><p class=t>a</p></div>' +
        '<div id=two><p class=t>b</p><p class=t>c</p></div></body>',
    );
    // The plan is context-free, so the second context must not see the first
    // context's answer: caching the results is exactly how that would happen.
    expect(NW.select('p.t', document.getElementById('one')).length).toBe(1);
    expect(NW.select('p.t', document.getElementById('two')).length).toBe(2);
    expect(NW.select('p.t', document.getElementById('one')).length).toBe(1);
    expect(NW.select('p.t', document).length).toBe(3);
  });
});

test.describe('id lookups without document.all', () => {
  // jsdom does not implement document.all, so nwsapi's id path fell through
  // to walking the subtree: 2.4ms against 43ns for getElementById on a
  // 6300-element document. These lock in the behavior the fast paths must
  // preserve — duplicate ids all match, an element-scoped query is scoped,
  // and an escaped id still resolves.
  const MARKUP =
    '<!doctype html><body>' +
    '<div id=outer><span id=dup>1</span></div>' +
    '<span id=dup>2</span><span id=uniq>3</span><b id="a.b">esc</b>' +
    '</body>';

  test('select() returns every element carrying the id', () => {
    const { document, NW } = build(MARKUP);
    const text = list => list.map(node => node.textContent);

    expect(text(NW.select('#dup', document))).toEqual(['1', '2']);
    expect(text(NW.select('#dup', document.getElementById('outer')))).toEqual(['1']);
    expect(text(NW.select('#uniq', document))).toEqual(['3']);
    expect(NW.select('#nope', document)).toEqual([]);
  });

  test('select() finds ids inside a detached subtree', () => {
    // The miss fast path asks the document, which knows nothing about a
    // detached subtree, so that case has to keep walking.
    const { document, NW } = build(MARKUP);
    const detached = document.createElement('div');
    detached.innerHTML = '<b id=det>d</b>';
    expect(NW.select('#det', detached).map(node => node.textContent)).toEqual(['d']);
  });

  test('first() returns the first in tree order', () => {
    const { document, NW } = build(MARKUP);
    const text = node => (node ? node.textContent : null);

    expect(text(NW.first('#dup', document))).toBe('1');
    expect(text(NW.first('#dup', document.getElementById('outer')))).toBe('1');
    expect(text(NW.first('#uniq', document))).toBe('3');
    expect(text(NW.first('#a\\.b', document))).toBe('esc');
    expect(NW.first('#nope', document)).toBeNull();
  });

  test('first() still invokes the callback', () => {
    const { document, NW } = build(MARKUP);
    const seen = [];
    const found = NW.first('#uniq', document, node => seen.push(node.textContent));
    expect(found.textContent).toBe('3');
    expect(seen).toEqual(['3']);
  });

  test('an id lookup does not walk the document', () => {
    // A document big enough that walking it is visible: the fast path is
    // sub-microsecond and a walk is milliseconds, so the ceiling separates
    // the two by orders of magnitude without being timing-flaky.
    let markup = '<!doctype html><body>';
    for (let i = 0; i < 4000; ++i) {
      markup += `<div class=n><span>${i}</span></div>`;
    }
    markup += '<i id=needle>found</i></body>';
    const { document, NW } = build(markup);

    const started = Date.now();
    for (let i = 0; i < 200; ++i) {
      expect(NW.first('#needle', document).textContent).toBe('found');
      expect(NW.select('#missing', document)).toEqual([]);
    }
    expect(Date.now() - started).toBeLessThan(500);
  });
});

test.describe('generated code that only reads correctly by accident', () => {
  // /^a|area$/ alternates '^a' with 'area$' instead of anchoring an
  // alternation, so it accepts any name starting with 'a'. The engine
  // agreed with browsers on <a> and <area>, which is why the WPT suite
  // never caught it.
  test(':link and :any-link need an <a> or <area>', () => {
    const { document, NW } = build(
      '<!doctype html><body>' +
        '<a id=a href="#">a</a><area id=r href="#">' +
        '<abbr id=b href="#">abbr</abbr><article id=c href="#">art</article>' +
        '<audio id=d href="#"></audio>' +
        '</body>',
    );
    const ids = selector => NW.select(selector, document).map(node => node.id);

    expect(ids(':link')).toEqual(['a', 'r']);
    expect(ids(':any-link')).toEqual(['a', 'r']);
    expect(ids(':visited')).toEqual([]);
    // an <a> without href is not a link
    document.getElementById('a').removeAttribute('href');
    expect(ids(':link')).toEqual(['r']);
  });

  test(':placeholder-shown needs an <input> or <textarea>', () => {
    // Same shape of mistake, /^input|textarea$/, masked by the conditions
    // around it rather than by being right.
    const { document, NW } = build(
      '<!doctype html><body>' +
        '<input id=a placeholder=p>' +
        '<input-thing id=b placeholder=p></input-thing>' +
        '<textarea id=c placeholder=p></textarea>' +
        '</body>',
    );
    expect(NW.select(':placeholder-shown', document).map(node => node.id)).toEqual(['a', 'c']);
  });
});

test.describe(':hover tracking is installed on demand', () => {
  function buildCounting(html) {
    const dom = new JSDOM(html);
    const { window } = dom;
    const seen = [];
    const original = window.document.addEventListener.bind(window.document);
    window.document.addEventListener = function (type, ...rest) {
      seen.push(type);
      return original(type, ...rest);
    };
    delete require.cache[require.resolve(nwsapiPath)];
    const NW = require(nwsapiPath)({
      document: window.document,
      DOMException: window.DOMException,
    });
    return { window, document: window.document, NW, mouseListeners: () => seen.filter(t => t.startsWith('mouse')) };
  }

  test('no listeners until a :hover selector is compiled', () => {
    const { document, NW, mouseListeners } = buildCounting('<!doctype html><body><p id=p>x</p></body>');
    expect(mouseListeners()).toEqual([]);

    NW.select('p', document);
    expect(mouseListeners(), 'an ordinary selector must not install them').toEqual([]);

    expect(NW.select('p:hover', document)).toEqual([]);
    expect(mouseListeners()).toEqual(['mouseover', 'mouseout']);
  });

  test(':hover still matches once tracking is installed', () => {
    const { window, document, NW } = buildCounting('<!doctype html><body><p id=p>x</p></body>');
    const target = document.getElementById('p');

    expect(NW.match(':hover', target)).toBe(false);
    target.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    expect(NW.match(':hover', target)).toBe(true);
    target.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
    expect(NW.match(':hover', target)).toBe(false);
  });
});

test.describe('what a cached plan replays', () => {
  test('an escaped identifier resolves the same way twice', () => {
    // The plan records the token its candidate list is fetched with. It used
    // to record the escaped form while the first run selected on the
    // unescaped one, so the second call — the one served from the cache —
    // asked the document for a different name.
    const { document, NW } = build(
      '<!doctype html><body><i id=t class="a.b">x</i><i id=u class="c d">y</i></body>',
    );
    for (const selector of ['.a\\.b', 'i.a\\.b', '.c.d']) {
      const first = NW.select(selector, document).map(node => node.id);
      const second = NW.select(selector, document).map(node => node.id);
      expect(second, `${selector} differs when served from the cache`).toEqual(first);
      expect(first.length).toBe(1);
    }
  });

  test('a selector still resolves after the cache has turned over', () => {
    // More distinct selectors than the cache holds, so the entry for the
    // selector under test is evicted and rebuilt. The two-generation policy
    // drops a whole generation at a time, which is exactly where a stale or
    // half-dropped plan would show up.
    const { document, NW } = build('<!doctype html><body><b id=hot class=hot>h</b></body>');
    const hot = () => NW.select('b.hot', document).map(node => node.id);

    expect(hot()).toEqual(['hot']);
    for (let i = 0; i < 5000; ++i) {
      NW.select(`.filler-${i}:not(.other-${i})`, document);
    }
    expect(hot(), 'evicted and recompiled must agree with the first answer').toEqual(['hot']);
  });
});

test.describe('agreement with the reference engine', () => {
  // jsdom 30 resolves selectors with @asamuzakjp/dom-selector, so
  // querySelectorAll here is a second implementation rather than this one.
  // These are the shapes whose candidate list the optimizer had to be taught
  // to read; a wrong list changes the answer, not just the speed.
  const SELECTORS = [
    'div:not(:nth-of-type(2n))',
    'div:not(:nth-child(3))',
    'div:is(.a):not(:where(.b))',
    'div:not(:not(:not(span)))',
    'div:has(:is(.a .b))',
    'p:nth-child(3)',
    'p:nth-last-child(3)',
    'p:nth-of-type(3)',
    'p:nth-child(2n+1)',
    'div > p:not(.a):nth-child(2)',
    '.a:not([data-x]) + p',
    'div:not(:is(svg|div))',
    // a comma inside a nested functional pseudo-class does not separate two
    // selectors; splitting the group on it produced fragments like ' span)'
    ':is(p:not(.b), span)',
    ':is(p:is(.a, .c), span)',
    'div:not(p:not(.a), span)',
    ':is([data-x="a,b"], span)',
    ':where(svg|div)',
  ];

  test('the same elements, in the same order', () => {
    let markup = '<!doctype html><body>';
    for (let i = 0; i < 40; ++i) {
      markup += `<div id=d${i} class="${i % 3 === 0 ? 'a' : 'b'}"${i % 5 === 0 ? ' data-x=1' : ''}>` +
        `<p id=p${i}a class="${i % 2 ? 'a' : 'c'}">1</p><p id=p${i}b>2</p><span id=s${i}>3</span>` +
        '</div>';
    }
    markup += '</body>';
    const { document, NW } = build(markup);

    for (const selector of SELECTORS) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      expect(mine, `${selector} disagrees with the reference engine`).toEqual(reference);
    }
  });

  test('the form pseudo-classes answer what a browser answers', () => {
    // The expected sets here come from Chromium, not from jsdom: on these
    // four selectors jsdom's engine and the browser disagree, and this engine
    // sides with the browser. test/upstream/browser-agreement.spec.mjs is
    // where that comparison is made against a live browser; this pins the
    // answers so they can be checked without one, and
    // docs/dom-selector-differences.md records the disagreement.
    const { document, NW } = build(
      '<!doctype html><body><div id=d>' +
        '<input id=i1 disabled><input id=i2><input id=i3 required>' +
        '<input id=i4 type=email value="not-an-email">' +
        '<fieldset id=fs disabled><legend id=lg><input id=li1></legend><input id=fi1></fieldset>' +
        '<fieldset id=fs2><input id=fi2></fieldset>' +
        '<form id=f1><input id=fi3 required><button id=b1>go</button></form>' +
        '</div></body>',
    );
    const ids = selector => NW.select(selector, document).map(node => node.id);

    // a disabled control is barred from constraint validation, so it matches
    // neither ':valid' nor ':invalid'
    expect(ids(':valid')).toEqual(['i2', 'fs', 'li1', 'fs2', 'fi2', 'b1']);
    expect(ids(':invalid')).toEqual(['i3', 'i4', 'f1', 'fi3']);
    expect(ids('input:valid')).toEqual(['i2', 'li1', 'fi2']);

    // a button is optional outright, and a fieldset-disabled control is
    // read-only rather than read-write
    expect(ids(':optional')).toEqual(['i1', 'i2', 'i4', 'li1', 'fi1', 'fi2', 'b1']);
    expect(ids('button:optional')).toEqual(['b1']);
    expect(ids(':read-write')).toEqual(['i2', 'i3', 'i4', 'li1', 'fi2', 'fi3']);
    expect(ids('fieldset :read-write')).toEqual(['li1', 'fi2']);
    expect(ids('input:not(:read-write)')).toEqual(['i1', 'fi1']);
  });

  test(':defined matches every element that is not an undefined custom one', () => {
    const { window, document, NW } = build(
      '<!doctype html><body><div id=d1></div><my-thing id=mt></my-thing>' +
        '<button id=b1 is="fancy-btn">x</button></body>',
    );
    const ids = () => NW.select(':defined', document).map(node => node.id).filter(Boolean);

    // a built-in element is defined; a custom element is not until it has a
    // definition and has been upgraded to it, and a customized built-in whose
    // definition does not exist is in the same position
    expect(ids()).toEqual(['d1']);

    window.customElements.define('my-thing', class extends window.HTMLElement {});
    expect(ids()).toEqual(['d1', 'mt']);

    window.customElements.define('fancy-btn', class extends window.HTMLButtonElement {}, { extends: 'button' });
    // the existing element is not upgraded by a later definition of an 'is'
    // form, which is what the reference engine says too
    expect(ids()).toEqual(Array.from(document.querySelectorAll(':defined'), node => node.id).filter(Boolean));
  });

  test(':disabled and :enabled are complements, fieldsets included', () => {
    // A control inside a disabled fieldset is disabled unless it sits in that
    // fieldset's first legend child, and an option is disabled by the
    // optgroup it belongs to. ':enabled' used to read only the element's own
    // property, so it matched controls that ':disabled' matched as well.
    const { document, NW } = build(
      '<!doctype html><body><div><input id=i1 disabled><input id=i2>' +
        '<fieldset id=fs disabled><legend id=lg><input id=i5></legend><input id=i4>' +
          '<fieldset id=fs3><legend id=lg3><input id=i7></legend></fieldset></fieldset>' +
        '<fieldset id=fs2><input id=i6></fieldset>' +
        '<fieldset id=fs4 disabled><div><legend id=lg4><input id=i8></legend></div></fieldset>' +
        '<select id=se><optgroup id=og disabled><option id=op>o</option></optgroup>' +
          '<optgroup id=og2><option id=op2 disabled>o</option><option id=op3>o</option></optgroup>' +
        '</select></div></body>',
    );
    const ids = selector => NW.select(selector, document).map(node => node.id);
    const reference = selector => Array.from(document.querySelectorAll(selector), node => node.id);

    for (const selector of [':disabled', ':enabled', 'input:disabled', 'option:disabled']) {
      expect(ids(selector), selector).toEqual(reference(selector));
    }
    // and no element is both
    const both = ids(':disabled').filter(id => ids(':enabled').includes(id));
    expect(both).toEqual([]);
  });

  test('the class of an SVG element is not a string', () => {
    // Element.className reflects the class attribute as a string, except on
    // SVGElement, where SVG 1.1 defined it as an SVGAnimatedString and the
    // browsers still ship that. jsdom implements it the same way, so this
    // covers the browser behavior too. Reading it without checking the type
    // matches the class against '[object SVGAnimatedString]' and quietly
    // finds nothing.
    const { document, NW } = build(
      '<!doctype html><body><div class="x big" id=d></div>' +
        '<svg id=s class="y wide"><rect id=r class=z></rect></svg></body>',
    );
    expect(typeof document.getElementById('s').className).toBe('object');

    // the class has to be a part the fetch did not use, or the resolver never
    // tests it: candidates come back from getElementsByClassName already
    for (const selector of [
      '.y.wide', '.wide.y', 'svg.y.wide', '.y > .z', '.y .z', '.y rect',
      '.x.big', 'div.x.big', '[class~="y"]',
    ]) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      expect(mine, selector).toEqual(reference);
    }
    expect(NW.match('.y.wide', document.getElementById('s'))).toBe(true);
  });

  test('LEGACY restores the handling a pre-2015 host needed', () => {
    // The generated tests read reflected properties and call the host without
    // asking whether it has the method, because every host that can run this
    // source returns elements from a tag or class lookup. LEGACY is for one
    // that does not: IE up to 8 put comment nodes in a '*' collection.
    const { document, NW } = build(
      '<!doctype html><body><a href="#" id=a class="x big">x</a><!-- c --></body>',
    );
    const comment = document.body.childNodes[1];
    const scope = document.createElement('div');
    scope.innerHTML = '<a href="#" id=b class="x big">y</a>';
    const link = scope.firstChild;
    // a host handing back something that is not an element
    scope.getElementsByTagName = () => [link, document.createComment('c')];
    scope.getElementsByClassName = () => [link, document.createComment('c')];

    // by default the fetch is trusted, so a collection like that is an error
    // rather than a non-match
    expect(() => NW.select('[href]', scope)).toThrow();
    expect(() => NW.select('.x.big', scope)).toThrow();
    // a tag test reads a property, so it rejects the comment either way
    expect(NW.select('a.x', scope).map(node => node.id)).toEqual(['b']);

    try {
      NW.configure({ LEGACY: true });
      expect(NW.select('[href]', scope).map(node => node.id)).toEqual(['b']);
      expect(NW.select('.x.big', scope).map(node => node.id)).toEqual(['b']);
      expect(NW.match('.x', comment)).toBe(false);
      expect(NW.match('[href]', comment)).toBe(false);
      expect(NW.match('#a', comment)).toBe(false);

      // and the ordinary answers do not change under it
      for (const selector of ['a.x', 'a#a', '#a.big', 'a[href]', '.x.big']) {
        const mine = NW.select(selector, document).map(node => node.id);
        const reference = Array.from(document.querySelectorAll(selector), node => node.id);
        expect(mine, selector).toEqual(reference);
      }
    } finally {
      NW.configure({ LEGACY: false });
    }

    // flipping the flag has to reach the compiled resolvers, not just the
    // next selector nobody has asked for yet
    expect(() => NW.select('[href]', scope)).toThrow();
  });

  test('an id the resolver tests, escaped every way the syntax allows', () => {
    // A plain '#id' is looked up by the id map. An id anywhere else in the
    // selector is compiled into a comparison against the value the DOM hands
    // back, so the escapes in the selector have to be resolved to the same
    // string the document holds.
    const { document, NW } = build(
      '<!doctype html><body><div id=plain><p id="a.b">1</p><p id="a:b">2</p>' +
        '<p id="café">3</p><p id="x y">4</p></div><div id=PLAIN></div></body>',
    );
    for (const selector of [
      'div#plain', 'p#a\\.b', 'p#a\\3A b', 'p#caf\\e9 ', 'p#café',
      'div#plain p#a\\.b', '#plain > #a\\.b', 'div#PLAIN', 'p#x\\ y',
      '[id="a.b"]', 'div:not(#plain)',
    ]) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      expect(mine, selector).toEqual(reference);
    }
  });

  test('a forgiving list drops only the item it cannot read', () => {
    const { document, NW } = build('<!doctype html><body><div id=d><p id=p>x</p></div></body>');
    const ids = selector => NW.select(selector, document).map(node => node.id);
    const reference = selector => Array.from(document.querySelectorAll(selector), node => node.id);

    // The unreadable item is the namespace-qualified one; the readable item
    // beside it still applies.
    for (const selector of ['p:is(svg|p, p)', 'div:is(svg|div, #d)', ':where(svg|p, p)']) {
      expect(ids(selector), selector).toEqual(reference(selector));
    }
    // A list of nothing but unreadable items matches nothing, and does not
    // throw the way a non-forgiving list does.
    expect(ids(':is(svg|p)')).toEqual([]);
    expect(() => NW.select('svg|p', document)).toThrow();
  });

  test('the namespace gap is where it is known to be', () => {
    // The one shape the engine still does not answer the way the reference
    // does, and older than this branch: 2.2.24 and 2.2.27 throw on it too.
    // Asserted rather than left out, so moving the boundary is deliberate.
    const { document, NW } = build('<!doctype html><body><div id=d><p id=p>x</p></div></body>');

    // A namespace-qualified type selector is not supported on its own. The
    // reference matches the div, since '*|div' is any namespace.
    expect(() => NW.select('*|div', document)).toThrow();
    expect(Array.from(document.querySelectorAll('*|div'), node => node.id)).toEqual(['d']);
  });
});

test.describe('a descendant chain of tags answered by descending', () => {
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
      expect(mine, selector).toEqual(reference);
    }
  });

  test('a nested match is returned once', () => {
    // u3 sits inside u2, so a3 is reachable through both; descending level by
    // level would collect it twice without the containment check.
    const { document, NW } = fixture();
    expect(NW.select('ul li a', document).map(node => node.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(NW.select('ul ul li a', document).map(node => node.id)).toEqual(['a3']);
  });

  test('scoped to an element, and to a detached subtree', () => {
    const { document, NW } = fixture();
    const scope = document.getElementById('d2');
    expect(NW.select('ul li a', scope).map(node => node.id)).toEqual(['a2', 'a3']);
    expect(Array.from(scope.querySelectorAll('ul li a'), node => node.id)).toEqual(['a2', 'a3']);

    const detached = document.createElement('div');
    detached.innerHTML = '<ul><li><a id=x>x</a></li></ul>';
    expect(NW.select('ul li a', detached).map(node => node.id)).toEqual(['x']);
  });

  test('a callback still sees every match', () => {
    // The descent returns the answer rather than a candidate list, so a query
    // carrying a callback has to stay on the ordinary path.
    const { document, NW } = fixture();
    const seen = [];
    const found = NW.select('ul li a', document, node => seen.push(node.id));
    expect(found.map(node => node.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(seen).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  test('first() returns the first in tree order', () => {
    const { document, NW } = fixture();
    expect(NW.first('div ul li a', document).id).toBe('a1');
    expect(NW.first('ul ul li a', document).id).toBe('a3');
    expect(NW.first('div span a', document)).toBeNull();
  });

  test('a chain that is not plain tags is unaffected', () => {
    const { document, NW } = fixture();
    for (const selector of ['div.x ul li a', 'div ul li a.y', 'div > ul li a', 'div ul li a:first-child']) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      expect(mine, selector).toEqual(reference);
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
      expect(mine, selector).toEqual(reference);
      expect(mine.length, selector).toBeGreaterThan(0);
    }
  });

  test('a count taken before a change does not decide the answer', () => {
    // Nothing of the last part is in the document, so the count taken on the
    // first query is zero. It may pick the route for the second query and
    // must not stand in for its answer.
    const { document, NW } = wide(() => '');
    expect(NW.select('ul li a', document)).toEqual([]);

    const link = document.createElement('a');
    link.id = 'late';
    document.getElementById('l7').append(link);
    expect(NW.select('ul li a', document).map(node => node.id)).toEqual(['late']);

    link.remove();
    expect(NW.select('ul li a', document)).toEqual([]);
  });
});

test.describe(':not() with a compound argument', () => {
  // The argument compiles in place rather than going back out through match()
  // once per candidate, so these cover the shapes that inline, the shapes that
  // must not, and that an inlined argument leaves the surrounding walk alone.
  function fixture() {
    return build(
      '<!doctype html><body>' +
        '<div id=d1 class=x><p id=p1 class=a>1</p><p id=p2 class=b>2</p><p id=p3>3</p></div>' +
        '<div id=d2><span id=s1></span></div>' +
        '<div id=d3><div id=d4><p id=p4 class=a>4</p></div></div>' +
        '</body>',
    );
  }

  test('the same answer as the reference engine', () => {
    const { document, NW } = fixture();
    for (const selector of [
      // compound arguments, which compile in place
      'p:not(.a)', 'p:not(#p1)', 'p:not([class])', 'p:not([class="a"])',
      'p:not(:first-child)', 'p:not(:nth-of-type(2n))', 'div:not(:nth-of-type(2n))',
      'p:not(:is(.a, .b))', 'p:not(:not(.a))', 'div:not(:has(p))',
      'p:not(.a):not(.b)', 'div p:not(.a)', 'div:not(.x) p',
      // arguments that keep the call: a list, and a combinator
      'p:not(.a, .b)', 'div:not(p > span)', 'div:not(div p)',
    ]) {
      const mine = NW.select(selector, document).map(node => node.id);
      const reference = Array.from(document.querySelectorAll(selector), node => node.id);
      expect(mine, selector).toEqual(reference);
    }
  });

  test('match() agrees with select() on the same element', () => {
    const { document, NW } = fixture();
    const p2 = document.getElementById('p2');
    expect(NW.match('p:not(.a)', p2)).toBe(true);
    expect(NW.match('p:not(.b)', p2)).toBe(false);
    expect(NW.match('p:not(:nth-of-type(2n))', p2)).toBe(false);
    expect(NW.match('div p:not(.a)', p2)).toBe(true);
  });

  test('an argument the engine cannot read is a syntax error', () => {
    const { document, NW } = fixture();
    for (const selector of ['p:not(@@)', 'p:not()', 'div:not(svg|div)']) {
      expect(() => NW.select(selector, document), selector).toThrow();
      expect(() => document.querySelectorAll(selector), selector).toThrow();
    }
    // an argument left unclosed is closed by EOF, as the syntax parser does
    expect(NW.select('p:not(.a', document).map(node => node.id)).toEqual(['p2', 'p3']);
  });
});
