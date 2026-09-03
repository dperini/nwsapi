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

      // The result is a plain boolean and, crucially, arrives without the
      // engine calling back out through the host matcher: a re-entrant call
      // is what exhausted the stack in 2.2.26/2.2.27 and was then swallowed
      // as `false` (dperini/nwsapi#172).
      expect(typeof NW.match(pseudo, element)).toBe('boolean');
      expect(calls(), `${pseudo} re-entered Element.prototype.matches`).toBe(0);
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

  test('an unclosed argument is closed by EOF', () => {
    const { document, NW } = build('<!doctype html><body><div id=a class=x></div><div id=b></div></body>');
    const ids = selector => NW.select(selector, document.body).map(e => e.id);

    // CSS Syntax closes any construct left open at EOF, so these are valid.
    expect(ids('div:not([class]')).toEqual(['b']);
    expect(ids('div:not([class')).toEqual(['b']);
    expect(ids('div:is([class="x"')).toEqual(['a']);
  });
});
