import { expect } from 'playwright/test';
import { runScenarios } from './harness/scenarios';
import { run } from 'node:test';

runScenarios('w3c iframes', 'normal', [
  {
    name: 'syntax',
    html: `
      <!doctype html>
      <title>Selectors: syntax of case-sensitivity attribute selector</title>
      <link rel="help" href="https://drafts.csswg.org/selectors/#attribute-case">
      <style></style>
      <div id="log"></div>
      <div id="test" foo="BAR"></div>
      <iframe id="quirks"></iframe>
      <iframe id="xml"></iframe>
    `,
    setupPage: async (page) => {
      page.on('console', (msg) => { console.log(`[browser:${msg.type()}] ${msg.text()}`); });
      page.on('pageerror', (err) => { console.log(`[pageerror] ${err.message}`); });

      const results = await page.evaluate(async () => {

        const valid = [
          "[foo='BAR'] /* sanity check (valid) */",
          "[foo='bar' i]",
          "[foo='bar' I]",
          "[foo=bar i]",
          '[foo="bar" i]',
          "[foo='bar'i]",
          "[foo='bar'i ]",
          "[foo='bar' i ]",
          "[foo='bar' /**/ i]",
          "[foo='bar' i /**/ ]",
          "[foo='bar'/**/i/**/]",
          "[foo=bar/**/i]",
          "[foo='bar'\ti\t] /* \\t */",
          "[foo='bar'\ni\n] /* \\n */",
          "[foo='bar'\ri\r] /* \\r */",
          "[foo='bar' \\i]",
          "[foo='bar' \\69]",
          "[foo~='bar' i]",
          "[foo^='bar' i]",
          "[foo$='bar' i]",
          "[foo*='bar' i]",
          "[foo|='bar' i]",
          "[|foo='bar' i]",
          "[*|foo='bar' i]",
        ];

        const invalid = [
          "[foo[ /* sanity check (invalid) */",
          "[foo='bar' i i]",
          "[foo i ='bar']",
          "[foo= i 'bar']",
          "[i foo='bar']",
          "[foo='bar' i\u0000] /* \\0 */",
          "[foo='bar' \u0130]",
          "[foo='bar' \u0131]",
          "[foo='bar' ii]",
          "[foo='bar' ij]",
          "[foo='bar' j]",
          "[foo='bar' \\\\i]",
          "[foo='bar' \\\\69]",
          "[foo='bar' i()]",
          "[foo='bar' i ()]",
          "[foo='bar' () i]",
          "[foo='bar' (i)]",
          "[foo='bar' i []]",
          "[foo='bar' [] i]",
          "[foo='bar' [i]]",
          "[foo='bar' i {}]",
          "[foo='bar' {} i]",
          "[foo='bar' {i}]",
          "[foo='bar' 1i]",
          "[foo='bar' 1]",
          "[foo='bar' 'i']",
          "[foo='bar' url(i)]",
          "[foo='bar' ,i]",
          "[foo='bar' i,]",
          "[foo='bar']i",
          "[foo='bar' |i]",
          "[foo='bar' \\|i]",
          "[foo='bar' *|i]",
          "[foo='bar' \\*|i]",
          "[foo='bar' *]",
          "[foo='bar' \\*]",
          "[foo i]",
          "[foo/**/i]",
        ];

        const quirksFrame = document.querySelector<HTMLIFrameElement>('#quirks')!;
        const xmlFrame = document.querySelector<HTMLIFrameElement>('#xml')!;

        const waitForLoad = (frame: HTMLIFrameElement) =>
          new Promise<void>((resolve) => {
            frame.addEventListener('load', () => resolve(), { once: true });
          });

        const quirksLoaded = waitForLoad(quirksFrame);
        const xmlLoaded = waitForLoad(xmlFrame);

        quirksFrame.srcdoc = [
          '<style></style>',
          '<div id="test" foo="BAR"></div>',
          '<script>',
            `var mode = "quirks mode";`,
            // `console.log("quirks mode frame loaded");`,
          '</script>',
        ].join('\n');

        xmlFrame.srcdoc = [
          '<html xmlns="http://www.w3.org/1999/xhtml">',
          '  <head>',
          '    <style></style>',
          '  </head>',
          '  <body>',
          '    <div id="test" foo="BAR"></div>',
          '    <script>',
          `      var mode = "XML";`,
          // `      console.log("XML frame loaded");`,
          '    </script>',
          '  </body>',
          '</html>',
        ].join('\n');

        await quirksLoaded;
        await xmlLoaded;

        type Win = Window & typeof globalThis & { mode: string };
        const win = window as Win;
        const quirks = quirksFrame.contentWindow as Win;
        const xml = xmlFrame.contentWindow as Win;

        win.mode = 'top';
        quirks.mode = 'quirks';
        xml.mode = 'XML';

        const results: [string, string, boolean][] = [];
        const assert_equals = (actual: unknown, expected: unknown, testName: string, failMsg: string) => {
          const pass = actual === expected;
          results.push([testName, failMsg, pass]);
        };
        const assert_throws = (expectedError: string, func: () => void, testName: string, failMsg: string) => {
          let threw = false;
          try {
            func();
          } catch (e) {
            threw = true;
            assert_equals((e as Error).name, expectedError, testName, failMsg + ' threw wrong error');
          }
          assert_equals(threw, true, testName, failMsg + ' did not throw');
        };

        [win, quirks, xml].forEach(function(global) {
          const style = global.document.getElementsByTagName('style')[0]!;
          const elm = global.document.getElementById('test')!;
          function clean_slate(testName: string) {
            style.textContent = '';
            assert_equals(style.sheet?.cssRules.length, 0, testName, 'CSSOM was not empty for empty stylesheet');
            assert_equals(global.getComputedStyle(elm).visibility, 'visible', testName, 'computed style for empty stylesheet');
          }
          valid.forEach(function(s) {
            {
              const testName = s + ' in ' + global.mode;
              clean_slate(testName);
              style.textContent = s + ' { visibility:hidden }';
              assert_equals(style.sheet?.cssRules.length, 1, testName, 'valid rule didn\'t parse into CSSOM');
              assert_equals(global.getComputedStyle(elm).visibility, 'hidden', testName, 'valid selector didn\'t match');
            };
            {
              const testName = s + ' with querySelector in ' + global.mode;
              assert_equals(global.document.querySelector(s), elm, testName, 'valid selector');
            };
          });
          invalid.forEach(function(s) {
            {
              const testName = s + ' in ' + global.mode;
              clean_slate(testName);
              style.textContent = s + ' { visibility:hidden }';
              assert_equals(style.sheet?.cssRules.length, 0, testName, 'invalid rule parsed into CSSOM');
              assert_equals(global.getComputedStyle(elm).visibility, 'visible', testName, 'invalid selector matched');
            };
            {
              const testName = s + ' with querySelector in ' + global.mode;
              assert_throws("SyntaxError", function() {
                global.document.querySelector(s);
              }, testName, 'invalid selector');
            };
          });
        });

        return results;
      });

      // console.log(results);
      for (const [testName, failMsg, pass] of results) {
        expect(pass, `${testName}: ${failMsg}`).toBe(true);
      }
    },
    cases: [],
  },
]);

runScenarios('w3c', 'normal', [
  {
    name: 'syntax',
    status: 'fixme',
    html: `
      <!doctype html>
      <title>Selectors: syntax of case-sensitivity attribute selector</title>
      <link rel="help" href="https://drafts.csswg.org/selectors/#attribute-case">
      <style></style>
      <div id="log"></div>
      <div id="test" foo="BAR"></div>
      <iframe id="quirks"></iframe>
      <iframe id="xml"></iframe>
    `,
    cases: [
      { select: "[foo='BAR'] /* sanity check (valid) */" },
      { select: "[foo='bar' i]" },
      { select: "[foo='bar' I]" },
      { select: "[foo=bar i]" },
      { select: '[foo="bar" i]' },
      { select: "[foo='bar'i]" },
      { select: "[foo='bar'i ]" },
      { select: "[foo='bar' i ]" },
      { select: "[foo='bar' /**/ i]" },
      { select: "[foo='bar' i /**/ ]" },
      { select: "[foo='bar'/**/i/**/]" },
      { select: "[foo=bar/**/i]" },
      { select: "[foo='bar'\ti\t] /* \\t */" },
      { select: "[foo='bar'\ni\n] /* \\n */" },
      { select: "[foo='bar'\ri\r] /* \\r */" },
      { select: "[foo='bar' \\i]" },
      { select: "[foo='bar' \\69]" },
      { select: "[foo~='bar' i]" },
      { select: "[foo^='bar' i]" },
      { select: "[foo$='bar' i]" },
      { select: "[foo*='bar' i]" },
      { select: "[foo|='bar' i]" },
      { select: "[|foo='bar' i]" },
      { select: "[*|foo='bar' i]" },

      { select: "[foo[ /* sanity check (invalid) */", expect: { throws: true } },
      { select: "[foo='bar' i i]", expect: { throws: true } },
      { select: "[foo i ='bar']", expect: { throws: true } },
      { select: "[foo= i 'bar']", expect: { throws: true } },
      { select: "[i foo='bar']", expect: { throws: true } },
      { select: "[foo='bar' i\u0000] /* \\0 */", expect: { throws: true } },
      { select: "[foo='bar' \u0130]", expect: { throws: true } },
      { select: "[foo='bar' \u0131]", expect: { throws: true } },
      { select: "[foo='bar' ii]", expect: { throws: true } },
      { select: "[foo='bar' ij]", expect: { throws: true } },
      { select: "[foo='bar' j]", expect: { throws: true } },
      { select: "[foo='bar' \\\\i]", expect: { throws: true } },
      { select: "[foo='bar' \\\\69]", expect: { throws: true } },
      { select: "[foo='bar' i()]", expect: { throws: true } },
      { select: "[foo='bar' i ()]", expect: { throws: true } },
      { select: "[foo='bar' () i]", expect: { throws: true } },
      { select: "[foo='bar' (i)]", expect: { throws: true } },
      { select: "[foo='bar' i []]", expect: { throws: true } },
      { select: "[foo='bar' [] i]", expect: { throws: true } },
      { select: "[foo='bar' [i]]", expect: { throws: true } },
      { select: "[foo='bar' i {}]", expect: { throws: true } },
      { select: "[foo='bar' {} i]", expect: { throws: true } },
      { select: "[foo='bar' {i}]", expect: { throws: true } },
      { select: "[foo='bar' 1i]", expect: { throws: true } },
      { select: "[foo='bar' 1]", expect: { throws: true } },
      { select: "[foo='bar' 'i']", expect: { throws: true } },
      { select: "[foo='bar' url(i)]", expect: { throws: true } },
      { select: "[foo='bar' ,i]", expect: { throws: true } },
      { select: "[foo='bar' i,]", expect: { throws: true } },
      { select: "[foo='bar']i", expect: { throws: true } },
      { select: "[foo='bar' |i]", expect: { throws: true } },
      { select: "[foo='bar' \\|i]", expect: { throws: true } },
      { select: "[foo='bar' *|i]", expect: { throws: true } },
      { select: "[foo='bar' \\*|i]", expect: { throws: true } },
      { select: "[foo='bar' *]", expect: { throws: true } },
      { select: "[foo='bar' \\*]", expect: { throws: true } },
      { select: "[foo i]", expect: { throws: true } },
      { select: "[foo/**/i]", expect: { throws: true } },
    ],
  },
  {
    name: 'semantics',
    status: 'fixme',
    html: `<div id="test"></div>`,
    cases: [],
    setupPage: async (page) => {
      page.on('console', (msg) => { console.log(`[browser:${msg.type()}] ${msg.text()}`); });

      const results = await page.evaluate(async () => {
        type Attr = [ns: string, name: string, value: string];
        type TestCase = [selector: string, ...attrs: Attr[]];

        const match: TestCase[] = [
          ["[foo='BAR'] /* sanity check (match) */", ["", "foo", "BAR"]],
          ["[foo='bar' i]", ["", "foo", "BAR"]],
          ["[foo='' i]", ["", "foo", ""]],
          ["[foo='a\u0308' i] /* COMBINING in both */", ["", "foo", "A\u0308"]],
          ["[foo='A\u0308' i] /* COMBINING in both */", ["", "foo", "a\u0308"]],
          ["[*|foo='bar' i]", ["", "foo", "x"], ["a", "foo", "x"], ["b", "foo", "BAR"], ["c", "foo", "x"]],
          ["[*|foo='bar' i]", ["", "foo", "BAR"], ["a", "foo", "x"], ["b", "foo", "x"], ["c", "foo", "x"]],
          ["[align='left' i]", ["", "align", "LEFT"]],
          ["[align='LEFT' i]", ["", "align", "left"]],
          ["[class~='a' i]", ["", "class", "X A B"]],
          ["[class~='A' i]", ["", "class", "x a b"]],
          ["[id^='a' i]", ["", "id", "AB"]],
          ["[id$='A' i]", ["", "id", "xa"]],
          ["[lang|='a' i]", ["", "lang", "A-B"]],
          ["[lang*='A' i]", ["", "lang", "xab"]],
          ["[*|lang='a' i]", ["http://www.w3.org/XML/1998/namespace", "lang", "A"]],
          ["[*|lang='A' i]", ["http://www.w3.org/XML/1998/namespace", "lang", "a"]],
          // ["@namespace x 'http://www.w3.org/XML/1998/namespace'; [x|lang='A' i]", ["http://www.w3.org/XML/1998/namespace", "lang", "a"]],
          ["[foo='bar' i][foo='bar' i]", ["", "foo", "BAR"]],
          ["[foo='BAR'][foo='bar' i]", ["", "foo", "BAR"]],
          ["[foo='bar' i][foo='BAR']", ["", "foo", "BAR"]],
          ["[foo='bar' i]", ["", "FOO", "bar"]],
        ];
        const nomatch: TestCase[] = [
          ["[missingattr] /* sanity check (no match) */", ["", "foo", "BAR"]],
          ["[foo='' i]", ["", "foo", "BAR"]],
          ["[foo='\u0000' i] /* \\0 in selector */", ["", "foo", ""]],
          ["[foo='' i] /* \\0 in attribute */", ["", "foo", "\u0000"]],
          ["[foo='\u00E4' i]", ["", "foo", "\u00C4"]],
          ["[foo='\u00C4' i]", ["", "foo", "\u00E4"]],
          ["[foo='a\u0308' i] /* COMBINING in selector */", ["", "foo", "\u00C4"]],
          ["[foo~='a\u0308' i] /* COMBINING in selector */", ["", "foo", "\u00E4"]],
          ["[foo^='A\u0308' i] /* COMBINING in selector */", ["", "foo", "\u00C4"]],
          ["[foo$='A\u0308' i] /* COMBINING in selector */", ["", "foo", "\u00E4"]],
          ["[foo*='\u00E4' i] /* COMBINING in attribute */", ["", "foo", "a\u0308"]],
          ["[foo|='\u00E4' i] /* COMBINING in attribute */", ["", "foo", "A\u0308"]],
          ["[foo='\u00C4' i] /* COMBINING in attribute */", ["", "foo", "a\u0308"]],
          ["[foo='\u00C4' i] /* COMBINING in attribute */", ["", "foo", "A\u0308"]],
          ["[foo='a\u0308' i] /* COMBINING in selector */", ["", "foo", "a"]],
          ["[foo='a\u0308' i] /* COMBINING in selector */", ["", "foo", "A"]],
          ["[foo='A\u0308' i] /* COMBINING in selector */", ["", "foo", "a"]],
          ["[foo='A\u0308' i] /* COMBINING in selector */", ["", "foo", "A"]],
          ["[foo='a' i] /* COMBINING in attribute */", ["", "foo", "a\u0308"]],
          ["[foo='A' i] /* COMBINING in attribute */", ["", "foo", "a\u0308"]],
          ["[foo='a' i] /* COMBINING in attribute */", ["", "foo", "A\u0308"]],
          ["[foo='A' i] /* COMBINING in attribute */", ["", "foo", "A\u0308"]],
          ["[foo='i' i]", ["", "foo", "\u0130"]],
          ["[foo='i' i]", ["", "foo", "\u0131"]],
          ["[foo='I' i]", ["", "foo", "\u0130"]],
          ["[foo='I' i]", ["", "foo", "\u0131"]],
          ["[foo='\u0130' i]", ["", "foo", "i"]],
          ["[foo='\u0131' i]", ["", "foo", "i"]],
          ["[foo='\u0130' i]", ["", "foo", "I"]],
          ["[foo='\u0131' i]", ["", "foo", "I"]],
          ["[foo='bar' i]", ["", "foo", "x"], ["a", "foo", "BAR"]],
          ["[|foo='bar' i]", ["", "foo", "x"], ["a", "foo", "BAR"]],
          // ["[foo='bar' i]", ["", "FOO", "bar"]],
          ["[foo='\t' i] /* tab in selector */", ["", "foo", " "]],
          ["[foo=' ' i] /* tab in attribute */", ["", "foo", "\t"]],
          // ["@namespace x 'a'; [x|foo='' i]", ["A", "foo", ""]],
          // ["@namespace x 'A'; [x|foo='' i]", ["a", "foo", ""]],
          ["[foo='bar' i][foo='bar']", ["", "foo", "BAR"]],
          ["[foo='bar' i]", ["", "baz", "BAR"]],
        ];

        type Result = 'match' | 'nomatch' | 'throws';
        const results: { selector: string, attrsLabel: string, expected: Result, nw: Result, native: Result }[] = [];

        const runTestCase = (testCase: TestCase, expected: Result) => {
          const [selector, ...attrs] = testCase;
          
          const span = document.createElement('span');
          for (const [ns, name, value] of attrs) {
            if (ns) {
              span.setAttributeNS(ns, name, value);
            } else {
              span.setAttribute(name, value);
            }
          }
          const div = document.createElement('div');
          div.appendChild(span);

          let native: Result = 'nomatch';
          try {
            native = div.querySelector(selector) === span ? 'match' : 'nomatch';
          } catch (e) {
            native = 'throws';
          }

          let nw: Result = 'nomatch';
          try {
            nw = NW.Dom.select(selector, div)[0] === span ? 'match' : 'nomatch';
          } catch (e) {
            nw = 'throws';
          }

          const attrsLabel = attrs.map(([ns, name, value]) => `${ns ? `${ns}:` : ''}${name}="${value}"`).join(' ');
          results.push({ selector, attrsLabel, expected, native, nw });
        }

        match.forEach(testCase => runTestCase(testCase, 'match'));
        nomatch.forEach(testCase => runTestCase(testCase, 'nomatch'));

        return results;
      });

      // console.log(results);
      for (const r of results) {
        const label = `${r.selector} on <span ${r.attrsLabel}>`;
        expect(r.nw, `${label}: nw/native mismatch (${r.nw} vs ${r.native})`).toBe(r.native);
        expect(r.native, `${label}: native expected ${r.expected}, got ${r.native}`).toBe(r.expected);
        // expect(r.nw, `${label}: nw expected ${r.expected}, got ${r.nw}`).toBe(r.expected);
      }
    },
  },

  {
    name: 'child-indexed-pseudo-class',
    html: `<div></div>`,
    cases: [
      { select: 'div:first-child' },
      { select: 'div:last-child' },
      { select: 'div:only-child' },
      { select: 'div:first-of-type' },
      { select: 'div:last-of-type' },
      { select: 'div:only-of-type' },
      { select: 'div:nth-child(1)' },
      { select: 'div:nth-child(n)' },
      { select: 'div:nth-last-child(1)' },
      { select: 'div:nth-last-child(n)' },
      { select: 'div:nth-of-type(1)' },
      { select: 'div:nth-of-type(n)' },
      { select: 'div:nth-last-of-type(1)' },
      { select: 'div:nth-last-of-type(n)' },

      { select: 'div:nth-child(2)', expect: { count: 0 } },
      { select: 'div:nth-last-child(2)', expect: { count: 0 } },
      { select: 'div:nth-of-type(2)', expect: { count: 0 } },
      { select: 'div:nth-last-of-type(2)', expect: { count: 0 } },
    ],
  },

  {
    name: 'missing-right-token',
    htmlMode: 'document',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta id="expected" charset="utf-8">
        </head>
        <body>
          <div id="container">
            <span></span>
            <span class="cls"></span>
          </div>
        </body>
      </html>
    `,
    cases: [
      { select: 'meta[charset="utf-8"', expect: { ids: ['expected'] } },
      { select: 'meta[charset="utf-8', expect: { ids: ['expected'] } },
      { select: 'span:not([class])', scope: { by: 'id', id: 'container' }, expect: { count: 1 } },
      { select: 'span:not([class)', scope: { by: 'id', id: 'container' }, expect: { throws: true } },
    ],
  },
]);









