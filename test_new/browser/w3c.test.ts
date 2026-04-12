import { expect } from '@playwright/test';
import { runScenarios } from './harness/scenarios';

runScenarios('w3c iframes', 'normal', [
  {
    name: 'css/selectors/syntax',
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
    name: 'css/selectors/syntax',
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
    name: 'css/selectors/semantics',
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
    name: 'dom/nodes/child-indexed-pseudo-class',
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
    name: 'dome/nodes/missing-right-token',
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
      { select: 'span:not([class])', ref: { by: 'id', id: 'container' }, expect: { count: 1 } },
      { select: 'span:not([class)', ref: { by: 'id', id: 'container' }, expect: { throws: true } },
    ],
  },

  {
    name: 'dom/nodes/element-closest',
    htmlMode: 'document',
    html: `
      <!DOCTYPE HTML>
      <html>
      <meta charset=utf8>
      <title>Test for Element.closest</title>
      <body id="body">
        <div id="test8" class="div3" style="display:none">
          <div id="test7" class="div2">
            <div id="test6" class="div1">
              <form id="test10" class="form2"></form>
              <form id="test5" class="form1" name="form-a">
                <input id="test1" class="input1" required>
                <fieldset class="fieldset2" id="test2">
                  <select id="test3" class="select1" required>
                    <option default id="test4" value="">Test4</option>
                    <option selected id="test11">Test11</option>
                    <option id="test12">Test12</option>
                    <option id="test13">Test13</option>
                  </select>
                  <input id="test9" type="text" required>
                </fieldset>
              </form>
            </div>
          </div>
        </div>
        <div id=log></div>
      </body>
      </html>
    `,
    cases: [
      { closest: 'select', ref: { by: 'id', id: 'test12' }, expect: { ids: ['test3'] } },
      { closest: 'fieldset', ref: { by: 'id', id: 'test13' }, expect: { ids: ['test2'] } },
      { closest: 'div', ref: { by: 'id', id: 'test13' }, expect: { ids: ['test6'] } },
      { closest: 'body', ref: { by: 'id', id: 'test3' }, expect: { ids: ['body'] } },

      { closest: '[default]', ref: { by: 'id', id: 'test4' }, expect: { ids: ['test4'] } },
      { closest: '[selected]', ref: { by: 'id', id: 'test4' }, expect: { count: 0 } },
      { closest: '[selected]', ref: { by: 'id', id: 'test11' }, expect: { ids: ['test11'] } },
      { closest: '[name="form-a"]', ref: { by: 'id', id: 'test12' }, expect: { ids: ['test5'] } },
      { closest: 'form[name="form-a"]', ref: { by: 'id', id: 'test13' }, expect: { ids: ['test5'] } },
      { closest: 'input[required]', ref: { by: 'id', id: 'test9' }, expect: { ids: ['test9'] } },
      { closest: 'select[required]', ref: { by: 'id', id: 'test9' }, expect: { count: 0 } },

      { closest: 'div:not(.div1)', ref: { by: 'id', id: 'test13' }, expect: { ids: ['test7'] } },
      { closest: 'div.div3', ref: { by: 'id', id: 'test6' }, expect: { ids: ['test8'] } },
      { closest: 'div#test7', ref: { by: 'id', id: 'test1' }, expect: { ids: ['test7'] } },

      { closest: '.div3 > .div2', ref: { by: 'id', id: 'test12' }, expect: { ids: ['test7'] } },
      { closest: '[class="div2"]:has(div)', ref: { by: 'id', id: 'test12' }, expect: { ids: ['test7'] } },
      { closest: '.div3 > .div1', ref: { by: 'id', id: 'test12' }, expect: { count: 0 } },
      { closest: 'form > input[required]', ref: { by: 'id', id: 'test9' }, expect: { count: 0 } },
      { closest: 'fieldset > select[required]', ref: { by: 'id', id: 'test12' }, expect: { ids: ['test3'] } },

      { closest: 'input + fieldset', ref: { by: 'id', id: 'test6' }, expect: { count: 0 } },
      { closest: 'form + form', ref: { by: 'id', id: 'test3' }, expect: { ids: ['test5'] } },
      { closest: 'form + form', ref: { by: 'id', id: 'test5' }, expect: { ids: ['test5'] } },

      { closest: ':empty', ref: { by: 'id', id: 'test10' }, expect: { ids: ['test10'] } },
      { closest: ':last-child', ref: { by: 'id', id: 'test11' }, expect: { ids: ['test2'] } },
      { closest: ':first-child', ref: { by: 'id', id: 'test12' }, expect: { ids: ['test3'] } },
      { closest: ':invalid', ref: { by: 'id', id: 'test11' }, expect: { ids: ['test2'] } },

      { closest: ':scope', ref: { by: 'id', id: 'test4' }, expect: { ids: ['test4'] } },
      { closest: 'select > :scope', ref: { by: 'id', id: 'test4' }, expect: { ids: ['test4'] } },
      { closest: 'div > :scope', ref: { by: 'id', id: 'test4' }, expect: { count: 0 } },
      { closest: ':has(> :scope)', ref: { by: 'id', id: 'test4' }, expect: { ids: ['test3'] } },
    ],
  },

  {
    name: 'dom/nodes/selectors',
    htmlMode: 'document',
    html: `
      <!DOCTYPE html>
      <html id="html" lang="en">
      <head id="head">
        <meta id="meta" charset="UTF-8">
        <title id="title">Selectors-API Test Suite: HTML with Selectors Level 2 using TestHarness: Test Document</title>

        <!-- Links for :link and :visited pseudo-class test -->
        <link id="pseudo-link-link1" href="">
        <link id="pseudo-link-link2" href="http://example.org/">
        <link id="pseudo-link-link3">
        <style>
        @namespace ns "http://www.w3.org/1999/xhtml";
        /* Declare the namespace prefix used in tests. This declaration should not be used by the API. */
        </style>
      </head>
      <body id="body">
      <div id="root">
        <div id="target"></div>

        <div id="universal">
          <p id="universal-p1">Universal selector tests inside element with <code id="universal-code1">id="universal"</code>.</p>
          <hr id="universal-hr1">
          <pre id="universal-pre1">Some preformatted text with some <span id="universal-span1">embedded code</span></pre>
          <p id="universal-p2">This is a normal link: <a id="universal-a1" href="http://www.w3.org/">W3C</a></p>
          <address id="universal-address1">Some more nested elements <code id="universal-code2"><a href="#" id="universal-a2">code hyperlink</a></code></address>
        </div>

        <div id="attr-presence">
          <div class="attr-presence-div1" id="attr-presence-div1" align="center"></div>
          <div class="attr-presence-div2" id="attr-presence-div2" align=""></div>
          <div class="attr-presence-div3" id="attr-presence-div3" valign="center"></div>
          <div class="attr-presence-div4" id="attr-presence-div4" alignv="center"></div>
          <p id="attr-presence-p1"><a  id="attr-presence-a1" tItLe=""></a><span id="attr-presence-span1" TITLE="attr-presence-span1"></span><i id="attr-presence-i1"></i></p>
          <pre id="attr-presence-pre1" data-attr-presence="pre1"></pre>
          <blockquote id="attr-presence-blockquote1" data-attr-presence="blockquote1"></blockquote>
          <ul id="attr-presence-ul1" data-中文=""></ul>

          <select id="attr-presence-select1">
            <option id="attr-presence-select1-option1">A</option>
            <option id="attr-presence-select1-option2">B</option>
            <option id="attr-presence-select1-option3">C</option>
            <option id="attr-presence-select1-option4">D</option>
          </select>
          <select id="attr-presence-select2">
            <option id="attr-presence-select2-option1">A</option>
            <option id="attr-presence-select2-option2">B</option>
            <option id="attr-presence-select2-option3">C</option>
            <option id="attr-presence-select2-option4" selected="selected">D</option>
          </select>
          <select id="attr-presence-select3" multiple="multiple">
            <option id="attr-presence-select3-option1">A</option>
            <option id="attr-presence-select3-option2" selected="">B</option>
            <option id="attr-presence-select3-option3" selected="selected">C</option>
            <option id="attr-presence-select3-option4">D</option>
          </select>
        </div>

        <div id="attr-value">
          <div id="attr-value-div1" align="center"></div>
            <div id="attr-value-div2" align=""></div>
            <div id="attr-value-div3" data-attr-value="&#xE9;"></div>
            <div id="attr-value-div4" data-attr-value_foo="&#xE9;"></div>

          <form id="attr-value-form1">
            <input id="attr-value-input1" type="text">
            <input id="attr-value-input2" type="password">
            <input id="attr-value-input3" type="hidden">
            <input id="attr-value-input4" type="radio">
            <input id="attr-value-input5" type="checkbox">
            <input id="attr-value-input6" type="radio">
            <input id="attr-value-input7" type="text">
            <input id="attr-value-input8" type="hidden">
            <input id="attr-value-input9" type="radio">
          </form>

          <div id="attr-value-div5" data-attr-value="中文"></div>
        </div>

        <div id="attr-whitespace">
          <div id="attr-whitespace-div1" class="foo div1 bar"></div>
            <div id="attr-whitespace-div2" class=""></div>
            <div id="attr-whitespace-div3" class="foo div3 bar"></div>

            <div id="attr-whitespace-div4" data-attr-whitespace="foo &#xE9; bar"></div>
            <div id="attr-whitespace-div5" data-attr-whitespace_foo="&#xE9; foo"></div>

          <a id="attr-whitespace-a1" rel="next bookmark"></a>
          <a id="attr-whitespace-a2" rel="tag nofollow"></a>
          <a id="attr-whitespace-a3" rel="tag bookmark"></a>
          <a id="attr-whitespace-a4" rel="book mark"></a> <!-- Intentional space in "book mark" -->
          <a id="attr-whitespace-a5" rel="nofollow"></a>
          <a id="attr-whitespace-a6" rev="bookmark nofollow"></a>
          <a id="attr-whitespace-a7" rel="prev next tag alternate nofollow author help icon noreferrer prefetch search stylesheet tag"></a>

          <p id="attr-whitespace-p1" title="Chinese 中文 characters"></p>
        </div>

        <div id="attr-hyphen">
          <div id="attr-hyphen-div1"></div>
            <div id="attr-hyphen-div2" lang="fr"></div>
            <div id="attr-hyphen-div3" lang="en-AU"></div>
            <div id="attr-hyphen-div4" lang="es"></div>
        </div>

        <div id="attr-begins">
          <a id="attr-begins-a1" href="http://www.example.org"></a>
          <a id="attr-begins-a2" href="http://example.org/"></a>
          <a id="attr-begins-a3" href="http://www.example.com/"></a>

            <div id="attr-begins-div1" lang="fr"></div>
            <div id="attr-begins-div2" lang="en-AU"></div>
            <div id="attr-begins-div3" lang="es"></div>
            <div id="attr-begins-div4" lang="en-US"></div>
            <div id="attr-begins-div5" lang="en"></div>

          <p id="attr-begins-p1" class=" apple"></p> <!-- Intentional space in class value " apple". -->
        </div>

        <div id="attr-ends">
          <a id="attr-ends-a1" href="http://www.example.org"></a>
          <a id="attr-ends-a2" href="http://example.org/"></a>
          <a id="attr-ends-a3" href="http://www.example.org"></a>

            <div id="attr-ends-div1" lang="fr"></div>
            <div id="attr-ends-div2" lang="de-CH"></div>
            <div id="attr-ends-div3" lang="es"></div>
            <div id="attr-ends-div4" lang="fr-CH"></div>

          <p id="attr-ends-p1" class="apple "></p> <!-- Intentional space in class value "apple ". -->
        </div>

        <div id="attr-contains">
          <a id="attr-contains-a1" href="http://www.example.org"></a>
          <a id="attr-contains-a2" href="http://example.org/"></a>
          <a id="attr-contains-a3" href="http://www.example.com/"></a>

            <div id="attr-contains-div1" lang="fr"></div>
            <div id="attr-contains-div2" lang="en-AU"></div>
            <div id="attr-contains-div3" lang="de-CH"></div>
            <div id="attr-contains-div4" lang="es"></div>
            <div id="attr-contains-div5" lang="fr-CH"></div>
            <div id="attr-contains-div6" lang="en-US"></div>

          <p id="attr-contains-p1" class=" apple banana orange "></p>
        </div>

        <div id="pseudo-nth">
          <table id="pseudo-nth-table1">
            <tr id="pseudo-nth-tr1"><td id="pseudo-nth-td1"></td><td id="pseudo-nth-td2"></td><td id="pseudo-nth-td3"></td><td id="pseudo-nth-td4"></td><td id="pseudo-nth--td5"></td><td id="pseudo-nth-td6"></td></tr>
            <tr id="pseudo-nth-tr2"><td id="pseudo-nth-td7"></td><td id="pseudo-nth-td8"></td><td id="pseudo-nth-td9"></td><td id="pseudo-nth-td10"></td><td id="pseudo-nth-td11"></td><td id="pseudo-nth-td12"></td></tr>
            <tr id="pseudo-nth-tr3"><td id="pseudo-nth-td13"></td><td id="pseudo-nth-td14"></td><td id="pseudo-nth-td15"></td><td id="pseudo-nth-td16"></td><td id="pseudo-nth-td17"></td><td id="pseudo-nth-td18"></td></tr>
          </table>

          <ol id="pseudo-nth-ol1">
            <li id="pseudo-nth-li1"></li>
            <li id="pseudo-nth-li2"></li>
            <li id="pseudo-nth-li3"></li>
            <li id="pseudo-nth-li4"></li>
            <li id="pseudo-nth-li5"></li>
            <li id="pseudo-nth-li6"></li>
            <li id="pseudo-nth-li7"></li>
            <li id="pseudo-nth-li8"></li>
            <li id="pseudo-nth-li9"></li>
            <li id="pseudo-nth-li10"></li>
            <li id="pseudo-nth-li11"></li>
            <li id="pseudo-nth-li12"></li>
          </ol>

          <p id="pseudo-nth-p1">
            <span id="pseudo-nth-span1">span1</span>
            <em id="pseudo-nth-em1">em1</em>
            <!-- comment node-->
            <em id="pseudo-nth-em2">em2</em>
            <span id="pseudo-nth-span2">span2</span>
            <strong id="pseudo-nth-strong1">strong1</strong>
            <em id="pseudo-nth-em3">em3</em>
            <span id="pseudo-nth-span3">span3</span>
            <span id="pseudo-nth-span4">span4</span>
            <strong id="pseudo-nth-strong2">strong2</strong>
            <em id="pseudo-nth-em4">em4</em>
          </p>
        </div>

        <div id="pseudo-first-child">
          <div id="pseudo-first-child-div1"></div>
          <div id="pseudo-first-child-div2"></div>
          <div id="pseudo-first-child-div3"></div>

          <p id="pseudo-first-child-p1"><span id="pseudo-first-child-span1"></span><span id="pseudo-first-child-span2"></span></p>
          <p id="pseudo-first-child-p2"><span id="pseudo-first-child-span3"></span><span id="pseudo-first-child-span4"></span></p>
          <p id="pseudo-first-child-p3"><span id="pseudo-first-child-span5"></span><span id="pseudo-first-child-span6"></span></p>
        </div>

        <div id="pseudo-last-child">
          <p id="pseudo-last-child-p1"><span id="pseudo-last-child-span1"></span><span id="pseudo-last-child-span2"></span></p>
          <p id="pseudo-last-child-p2"><span id="pseudo-last-child-span3"></span><span id="pseudo-last-child-span4"></span></p>
          <p id="pseudo-last-child-p3"><span id="pseudo-last-child-span5"></span><span id="pseudo-last-child-span6"></span></p>

          <div id="pseudo-last-child-div1"></div>
          <div id="pseudo-last-child-div2"></div>
          <div id="pseudo-last-child-div3"></div>
        </div>

        <div id="pseudo-only">
          <p id="pseudo-only-p1">
            <span id="pseudo-only-span1"></span>
          </p>
          <p id="pseudo-only-p2">
            <span id="pseudo-only-span2"></span>
            <span id="pseudo-only-span3"></span>
          </p>
          <p id="pseudo-only-p3">
            <span id="pseudo-only-span4"></span>
            <em id="pseudo-only-em1"></em>
            <span id="pseudo-only-span5"></span>
          </p>
        </div>>

        <div id="pseudo-empty">
          <p id="pseudo-empty-p1"></p>
          <p id="pseudo-empty-p2"><!-- comment node --></p>
          <p id="pseudo-empty-p3"> </p>
          <p id="pseudo-empty-p4">Text node</p>
          <p id="pseudo-empty-p5"><span id="pseudo-empty-span1"></span></p>
        </div>

        <div id="pseudo-link">
          <a id="pseudo-link-a1" href="">with href</a>
          <a id="pseudo-link-a2" href="http://example.org/">with href</a>
          <a id="pseudo-link-a3">without href</a>
          <map name="pseudo-link-map1" id="pseudo-link-map1">
            <area id="pseudo-link-area1" href="">
            <area id="pseudo-link-area2">
          </map>
        </div>

        <div id="pseudo-lang">
          <div id="pseudo-lang-div1"></div>
            <div id="pseudo-lang-div2" lang="fr"></div>
            <div id="pseudo-lang-div3" lang="en-AU"></div>
            <div id="pseudo-lang-div4" lang="es"></div>
        </div>

        <div id="pseudo-ui">
          <input id="pseudo-ui-input1" type="text">
          <input id="pseudo-ui-input2" type="password">
          <input id="pseudo-ui-input3" type="radio">
          <input id="pseudo-ui-input4" type="radio" checked="checked">
          <input id="pseudo-ui-input5" type="checkbox">
          <input id="pseudo-ui-input6" type="checkbox" checked="checked">
          <input id="pseudo-ui-input7" type="submit">
          <input id="pseudo-ui-input8" type="button">
          <input id="pseudo-ui-input9" type="hidden">
          <textarea id="pseudo-ui-textarea1"></textarea>
          <button id="pseudo-ui-button1">Enabled</button>

          <input id="pseudo-ui-input10" disabled="disabled" type="text">
          <input id="pseudo-ui-input11" disabled="disabled" type="password">
          <input id="pseudo-ui-input12" disabled="disabled" type="radio">
          <input id="pseudo-ui-input13" disabled="disabled" type="radio" checked="checked">
          <input id="pseudo-ui-input14" disabled="disabled" type="checkbox">
          <input id="pseudo-ui-input15" disabled="disabled" type="checkbox" checked="checked">
          <input id="pseudo-ui-input16" disabled="disabled" type="submit">
          <input id="pseudo-ui-input17" disabled="disabled" type="button">
          <input id="pseudo-ui-input18" disabled="disabled" type="hidden">
          <textarea id="pseudo-ui-textarea2" disabled="disabled"></textarea>
          <button id="pseudo-ui-button2" disabled="disabled">Disabled</button>
        </div>

        <div id="not">
          <div id="not-div1"></div>
          <div id="not-div2"></div>
          <div id="not-div3"></div>

          <p id="not-p1"><span id="not-span1"></span><em id="not-em1"></em></p>
          <p id="not-p2"><span id="not-span2"></span><em id="not-em2"></em></p>
          <p id="not-p3"><span id="not-span3"></span><em id="not-em3"></em></p>
        </div>

        <div id="pseudo-element">All pseudo-element tests</div>

        <div id="class">
          <p id="class-p1" class="foo class-p bar"></p>
          <p id="class-p2" class="class-p foo bar"></p>
          <p id="class-p3" class="foo bar class-p"></p>

          <!-- All permutations of the classes should match -->
          <div id="class-div1" class="apple orange banana"></div>
          <div id="class-div2" class="apple banana orange"></div>
          <p id="class-p4" class="orange apple banana"></p>
          <div id="class-div3" class="orange banana apple"></div>
          <p id="class-p6" class="banana apple orange"></p>
          <div id="class-div4" class="banana orange apple"></div>
          <div id="class-div5" class="apple orange"></div>
          <div id="class-div6" class="apple banana"></div>
          <div id="class-div7" class="orange banana"></div>

          <span id="class-span1" class="台北Táiběi 台北"></span>
          <span id="class-span2" class="台北"></span>

          <span id="class-span3" class="foo:bar"></span>
          <span id="class-span4" class="test.foo[5]bar"></span>
        </div>

        <div id="id">
          <div id="id-div1"></div>
          <div id="id-div2"></div>

          <ul id="id-ul1">
            <li id="id-li-duplicate"></li>
            <li id="id-li-duplicate"></li>
            <li id="id-li-duplicate"></li>
            <li id="id-li-duplicate"></li>
          </ul>

          <span id="台北Táiběi"></span>
          <span id="台北"></span>

          <span id="#foo:bar"></span>
          <span id="test.foo[5]bar"></span>
        </div>

        <div id="descendant">
          <div id="descendant-div1" class="descendant-div1">
            <div id="descendant-div2" class="descendant-div2">
              <div id="descendant-div3" class="descendant-div3">
              </div>
            </div>
          </div>
          <div id="descendant-div4" class="descendant-div4"></div>
        </div>

        <div id="child">
          <div id="child-div1" class="child-div1">
            <div id="child-div2" class="child-div2">
              <div id="child-div3" class="child-div3">
              </div>
            </div>
          </div>
          <div id="child-div4" class="child-div4"></div>
        </div>

        <div id="adjacent">
          <div id="adjacent-div1" class="adjacent-div1"></div>
          <div id="adjacent-div2" class="adjacent-div2">
            <div id="adjacent-div3" class="adjacent-div3"></div>
          </div>
          <div id="adjacent-div4" class="adjacent-div4">
            <p id="adjacent-p1" class="adjacent-p1"></p>
            <div id="adjacent-div5" class="adjacent-div5"></div>
          </div>
          <div id="adjacent-div6" class="adjacent-div6"></div>
          <p id="adjacent-p2" class="adjacent-p2"></p>
          <p id="adjacent-p3" class="adjacent-p3"></p>
        </div>

        <div id="sibling">
          <div id="sibling-div1" class="sibling-div"></div>
          <div id="sibling-div2" class="sibling-div">
            <div id="sibling-div3" class="sibling-div"></div>
          </div>
          <div id="sibling-div4" class="sibling-div">
            <p id="sibling-p1" class="sibling-p"></p>
            <div id="sibling-div5" class="sibling-div"></div>
          </div>
          <div id="sibling-div6" class="sibling-div"></div>
          <p id="sibling-p2" class="sibling-p"></p>
          <p id="sibling-p3" class="sibling-p"></p>
        </div>

        <div id="group">
          <em id="group-em1"></em>
          <strong id="group-strong1"></strong>
        </div>
      </div>
      </body>
      </html>

    `,
    setupPage: async (page) => {
      await page.evaluate(() => {
        function setupSpecialElements(doc: Document, parent: Element) {
          // Setup null and undefined tests
          parent.appendChild(doc.createElement("null"));
          parent.appendChild(doc.createElement("undefined"));

          // Setup namespace tests
          const anyNS = doc.createElement("div");
          const noNS = doc.createElement("div");
          anyNS.id = "any-namespace";
          noNS.id = "no-namespace";

          let div = [doc.createElement("div"),
                doc.createElementNS("http://www.w3.org/1999/xhtml", "div"),
                doc.createElementNS("", "div"),
                doc.createElementNS("http://www.example.org/ns", "div")];

          div[0].id = "any-namespace-div1";
          div[1].id = "any-namespace-div2";
          div[2].setAttribute("id", "any-namespace-div3"); // Non-HTML elements can't use .id property
          div[3].setAttribute("id", "any-namespace-div4");

          for (var i = 0; i < div.length; i++) {
            anyNS.appendChild(div[i])
          }

          div = [doc.createElement("div"),
                doc.createElementNS("http://www.w3.org/1999/xhtml", "div"),
                doc.createElementNS("", "div"),
                doc.createElementNS("http://www.example.org/ns", "div")];

          div[0].id = "no-namespace-div1";
          div[1].id = "no-namespace-div2";
          div[2].setAttribute("id", "no-namespace-div3"); // Non-HTML elements can't use .id property
          div[3].setAttribute("id", "no-namespace-div4");

          for (i = 0; i < div.length; i++) {
            noNS.appendChild(div[i])
          }

          parent.appendChild(anyNS);
          parent.appendChild(noNS);

          const i1 = doc.getElementById("attr-presence-i1")!;
          i1.setAttributeNS("http://www.example.org/ns", "title", "");
        }

        setupSpecialElements(document, document.getElementById("root")!);

        location.hash = '#target';
      });
    },
    cases: [
      // -----------------------------------------------------------------------------
      // Invalid selectors
      // -----------------------------------------------------------------------------

      { select: '', expect: { throws: true } },
      { first: '[', expect: { throws: true } },
      { match: ']', ref: { by: 'id', id: 'root' }, expect: { throws: true } },
      { closest: '(', ref: { by: 'id', id: 'root' }, expect: { throws: true } },

      { select: ')', expect: { throws: true } },
      { first: '{', expect: { throws: true } },
      { match: '}', ref: { by: 'id', id: 'root' }, expect: { throws: true } },
      { closest: '<', ref: { by: 'id', id: 'root' }, expect: { throws: true } },

      { select: '>', expect: { throws: true } },
      { first: '#', expect: { throws: true } },
      { match: 'div,', ref: { by: 'id', id: 'root' }, expect: { throws: true } },
      { closest: '.', ref: { by: 'id', id: 'root' }, expect: { throws: true } },

      { select: '.5cm', expect: { throws: true } },
      { first: '..test', expect: { throws: true } },
      { match: '.foo..quux', ref: { by: 'id', id: 'root' }, expect: { throws: true } },
      { closest: '.bar.', ref: { by: 'id', id: 'root' }, expect: { throws: true } },

      { select: 'div & address, p', expect: { throws: true } },
      { first: 'div ++ address, p', expect: { throws: true } },
      { match: 'div ~~ address, p', ref: { by: 'id', id: 'root' }, expect: { throws: true } },
      { closest: '[*=test]', ref: { by: 'id', id: 'root' }, expect: { throws: true } },

      { select: '[*|*=test]', expect: { throws: true } },
      { first: '[class= space unquoted ]', expect: { throws: true } },
      { match: 'div:example', ref: { by: 'id', id: 'root' }, expect: { throws: true } },
      { closest: ':example', ref: { by: 'id', id: 'root' }, expect: { throws: true } },

      { select: 'div::example', expect: { throws: true } },
      { first: '::example', expect: { throws: true } },
      { match: ':::before', ref: { by: 'id', id: 'root' }, expect: { throws: true } },
      { closest: ':: before', ref: { by: 'id', id: 'root' }, expect: { throws: true } },

      { select: 'ns|div', expect: { throws: true } },
      { first: ':not(ns|div)', expect: { throws: true } },
      { match: '^|div', ref: { by: 'id', id: 'root' }, expect: { throws: true } },
      { closest: '$|div', ref: { by: 'id', id: 'root' }, expect: { throws: true } },

      { select: '>*', expect: { throws: true } },

      // -----------------------------------------------------------------------------
      // Valid selectors: querySelectorAll / querySelector
      // -----------------------------------------------------------------------------

      // Type Selector
      { select: 'html', expect: { ids: ['html'], equivalentCase: { match: 'html', ref: { by: 'id', id: 'html' } } } },
      { select: 'html', ref: { by: 'id', id: 'root' }, expect: { ids: [] } },
      { select: 'body', expect: { ids: ['body'], equivalentCase: { match: 'body', ref: { by: 'id', id: 'body' } } } },
      { select: 'body', ref: { by: 'id', id: 'root' }, expect: { ids: [] } },

      // Universal Selector
      // Testing "*" for entire an entire context node is handled separately.
      { select: '#universal>*', expect: { ids: ['universal-p1', 'universal-hr1', 'universal-pre1', 'universal-p2', 'universal-address1'] } },
      { select: '#universal>*>*', expect: { ids: ['universal-code1', 'universal-span1', 'universal-a1', 'universal-code2'] } },
      { select: '#empty>*', expect: { ids: [] } },
      { select: '#universal *', expect: { ids: ['universal-p1', 'universal-code1', 'universal-hr1', 'universal-pre1', 'universal-span1', 'universal-p2', 'universal-a1', 'universal-address1', 'universal-code2', 'universal-a2'] } },

      // Attribute Selectors
      // - presence                  [att]
      { select: '.attr-presence-div1[align]', expect: { ids: ['attr-presence-div1'] } },
      { select: '.attr-presence-div2[align]', expect: { ids: ['attr-presence-div2'] } },
      { select: '#attr-presence [*|TiTlE]', expect: { ids: ['attr-presence-a1', 'attr-presence-span1', 'attr-presence-i1'] } },
      { select: '[data-attr-presence]', expect: { ids: ['attr-presence-pre1', 'attr-presence-blockquote1'] } },
      { select: '.attr-presence-div3[align], .attr-presence-div4[align]', expect: { ids: [] } },
      { select: 'ul[data-中文]', expect: { ids: ['attr-presence-ul1'] } },
      { select: '#attr-presence-select1 option[selected]', expect: { ids: [] } },
      { select: '#attr-presence-select2 option[selected]', expect: { ids: ['attr-presence-select2-option4'] } },
      { select: '#attr-presence-select3 option[selected]', expect: { ids: ['attr-presence-select3-option2', 'attr-presence-select3-option3'] } },

      // - value                     [att=val]
      { select: '#attr-value [align="center"]', expect: { ids: ['attr-value-div1'] } },
      { select: '#attr-value [align="center"', expect: { ids: ['attr-value-div1'] } },
      { select: '#attr-value [align=""]', expect: { ids: ['attr-value-div2'] } },
      { select: '#attr-value [align="c"]', expect: { ids: [] } },
      { select: '#attr-value [align="centera"]', expect: { ids: [] } },
      { select: '[data-attr-value="\\e9"]', expect: { ids: ['attr-value-div3'] } },
      { select: '[data-attr-value\\_foo="\\e9"]', expect: { ids: ['attr-value-div4'] } },
      { select: "#attr-value input[type='hidden'],#attr-value input[type='radio']", expect: { ids: ['attr-value-input3', 'attr-value-input4', 'attr-value-input6', 'attr-value-input8', 'attr-value-input9'] } },
      { select: "#attr-value input[type=\"hidden\"],#attr-value input[type='radio']", expect: { ids: ['attr-value-input3', 'attr-value-input4', 'attr-value-input6', 'attr-value-input8', 'attr-value-input9'] } },
      { select: '#attr-value input[type=hidden],#attr-value input[type=radio]', expect: { ids: ['attr-value-input3', 'attr-value-input4', 'attr-value-input6', 'attr-value-input8', 'attr-value-input9'] } },
      { select: '[data-attr-value=中文]', expect: { ids: ['attr-value-div5'] } },

      // - whitespace-separated list [att~=val]
      { select: '#attr-whitespace [class~="div1"]', expect: { ids: ['attr-whitespace-div1'] } },
      { select: '#attr-whitespace [class~=""]', expect: { ids: [] } },
      { select: '[data-attr-whitespace~="div"]', expect: { ids: [] } },
      { select: '[data-attr-whitespace~="\\0000e9"]', expect: { ids: ['attr-whitespace-div4'] } },
      { select: '[data-attr-whitespace\\_foo~="\\e9"]', expect: { ids: ['attr-whitespace-div5'] } },
      { select: "#attr-whitespace a[rel~='bookmark'],  #attr-whitespace a[rel~='nofollow']", expect: { ids: ['attr-whitespace-a1', 'attr-whitespace-a2', 'attr-whitespace-a3', 'attr-whitespace-a5', 'attr-whitespace-a7'] } },
      { select: "#attr-whitespace a[rel~=\"bookmark\"],#attr-whitespace a[rel~='nofollow']", expect: { ids: ['attr-whitespace-a1', 'attr-whitespace-a2', 'attr-whitespace-a3', 'attr-whitespace-a5', 'attr-whitespace-a7'] } },
      { select: '#attr-whitespace a[rel~=bookmark],    #attr-whitespace a[rel~=nofollow]', expect: { ids: ['attr-whitespace-a1', 'attr-whitespace-a2', 'attr-whitespace-a3', 'attr-whitespace-a5', 'attr-whitespace-a7'] } },
      { select: '#attr-whitespace a[rel~="book mark"]', expect: { ids: [] }, status: 'fixme' } , // fixme
      { select: '#attr-whitespace [title~=中文]', expect: { ids: ['attr-whitespace-p1'] } },

      // - hyphen-separated list     [att|=val]
      { select: '#attr-hyphen-div1[lang|="en"]', expect: { ids: [] } },
      { select: '#attr-hyphen-div2[lang|="fr"]', expect: { ids: ['attr-hyphen-div2'], equivalentCase: { match: '#attr-hyphen-div2[lang|="fr"]', ref: { by: 'id', id: 'attr-hyphen-div2' } } } },
      { select: '#attr-hyphen-div3[lang|="en"]', expect: { ids: ['attr-hyphen-div3'], equivalentCase: { match: '#attr-hyphen-div3[lang|="en"]', ref: { by: 'id', id: 'attr-hyphen-div3' } } } },
      { select: '#attr-hyphen-div4[lang|="es-AR"]', expect: { ids: [] } },

      // - substring begins-with     [att^=val] (Level 3)
      { select: '#attr-begins a[href^="http://www"]', expect: { ids: ['attr-begins-a1', 'attr-begins-a3'] } },
      { select: '#attr-begins [lang^="en-"]', expect: { ids: ['attr-begins-div2', 'attr-begins-div4'] } },
      { select: '#attr-begins [class^=""]', expect: { ids: [] } },
      { select: '#attr-begins [class^=apple]', expect: { ids: [] } },
      { select: "#attr-begins [class^=' apple']", expect: { ids: ['attr-begins-p1'], equivalentCase: { match: "#attr-begins [class^=' apple']", ref: { by: 'id', id: 'attr-begins-p1' } } } },
      { select: '#attr-begins [class^=" apple"]', expect: { ids: ['attr-begins-p1'], equivalentCase: { match: '#attr-begins [class^=" apple"]', ref: { by: 'id', id: 'attr-begins-p1' } } } },
      { select: '#attr-begins [class^= apple]', expect: { ids: [] } },

      // - substring ends-with       [att$=val] (Level 3)
      { select: '#attr-ends a[href$=".org"]', expect: { ids: ['attr-ends-a1', 'attr-ends-a3'] } },
      { select: '#attr-ends [lang$="-CH"]', expect: { ids: ['attr-ends-div2', 'attr-ends-div4'] } },
      { select: '#attr-ends [class$=""]', expect: { ids: [] } },
      { select: '#attr-ends [class$=apple]', expect: { ids: [] } },
      { select: "#attr-ends [class$='apple ']", expect: { ids: ['attr-ends-p1'], equivalentCase: { match: "#attr-ends [class$='apple ']", ref: { by: 'id', id: 'attr-ends-p1' } } } },
      { select: '#attr-ends [class$="apple "]', expect: { ids: ['attr-ends-p1'], equivalentCase: { match: '#attr-ends [class$="apple "]', ref: { by: 'id', id: 'attr-ends-p1' } } } },
      { select: '#attr-ends [class$=apple ]', expect: { ids: [] } },

      // - substring contains        [att*=val] (Level 3)
      { select: '#attr-contains a[href*="http://www"]', expect: { ids: ['attr-contains-a1', 'attr-contains-a3'] } },
      { select: '#attr-contains a[href*=".org"]', expect: { ids: ['attr-contains-a1', 'attr-contains-a2'] } },
      { select: '#attr-contains a[href*=".example."]', expect: { ids: ['attr-contains-a1', 'attr-contains-a3'] } },
      { select: '#attr-contains [lang*="en-"]', expect: { ids: ['attr-contains-div2', 'attr-contains-div6'] } },
      { select: '#attr-contains [lang*="-CH"]', expect: { ids: ['attr-contains-div3', 'attr-contains-div5'] } },
      { select: '#attr-contains [class*=""]', expect: { ids: [] } },
      { select: "#attr-contains [class*=' apple']", expect: { ids: ['attr-contains-p1'], equivalentCase: { match: "#attr-contains [class*=' apple']", ref: { by: 'id', id: 'attr-contains-p1' } } } },
      { select: "#attr-contains [class*='orange ']", expect: { ids: ['attr-contains-p1'], equivalentCase: { match: "#attr-contains [class*='orange ']", ref: { by: 'id', id: 'attr-contains-p1' } } } },
      { select: "#attr-contains [class*='ple banana ora']", expect: { ids: ['attr-contains-p1'], equivalentCase: { match: "#attr-contains [class*='ple banana ora']", ref: { by: 'id', id: 'attr-contains-p1' } } } },
      { select: '#attr-contains [class*=" apple"]', expect: { ids: ['attr-contains-p1'], equivalentCase: { match: '#attr-contains [class*=" apple"]', ref: { by: 'id', id: 'attr-contains-p1' } } } },
      { select: '#attr-contains [class*="orange "]', expect: { ids: ['attr-contains-p1'], equivalentCase: { match: '#attr-contains [class*="orange "]', ref: { by: 'id', id: 'attr-contains-p1' } } } },
      { select: '#attr-contains [class*="ple banana ora"]', expect: { ids: ['attr-contains-p1'], equivalentCase: { match: '#attr-contains [class*="ple banana ora"]', ref: { by: 'id', id: 'attr-contains-p1' } } } },
      { select: '#attr-contains [class*= apple]', expect: { ids: ['attr-contains-p1'], equivalentCase: { match: '#attr-contains [class*= apple]', ref: { by: 'id', id: 'attr-contains-p1' } } } },
      { select: '#attr-contains [class*=orange ]', expect: { ids: ['attr-contains-p1'], equivalentCase: { match: '#attr-contains [class*=orange ]', ref: { by: 'id', id: 'attr-contains-p1' } } } },
      { select: '#attr-contains [class*= banana ]', expect: { ids: ['attr-contains-p1'], equivalentCase: { match: '#attr-contains [class*= banana ]', ref: { by: 'id', id: 'attr-contains-p1' } } } },

      // Pseudo-classes
      // - :root                 (Level 3)
      { select: ':root', expect: { ids: ['html'], equivalentCase: { match: ':root', ref: { by: 'id', id: 'html' } } } },
      { select: ':root', ref: { by: 'id', id: 'root' }, expect: { ids: [] } },

      // - :nth-child(n)         (Level 3)
      // XXX write descriptions
      { select: '#pseudo-nth-table1 :nth-child(3)', expect: { ids: ['pseudo-nth-td3', 'pseudo-nth-td9', 'pseudo-nth-tr3', 'pseudo-nth-td15'] } },
      { select: '#pseudo-nth li:nth-child(3n)', expect: { ids: ['pseudo-nth-li3', 'pseudo-nth-li6', 'pseudo-nth-li9', 'pseudo-nth-li12'] } },
      { select: '#pseudo-nth li:nth-child(2n+4)', expect: { ids: ['pseudo-nth-li4', 'pseudo-nth-li6', 'pseudo-nth-li8', 'pseudo-nth-li10', 'pseudo-nth-li12'] } },
      { select: '#pseudo-nth-p1 :nth-child(4n-1)', expect: { ids: ['pseudo-nth-em2', 'pseudo-nth-span3'] } },

      // - :nth-last-child       (Level 3)
      { select: '#pseudo-nth-table1 :nth-last-child(3)', expect: { ids: ['pseudo-nth-tr1', 'pseudo-nth-td4', 'pseudo-nth-td10', 'pseudo-nth-td16'] } },
      { select: '#pseudo-nth li:nth-last-child(3n)', expect: { ids: ['pseudo-nth-li1', 'pseudo-nth-li4', 'pseudo-nth-li7', 'pseudo-nth-li10'] } },
      { select: '#pseudo-nth li:nth-last-child(2n+4)', expect: { ids: ['pseudo-nth-li1', 'pseudo-nth-li3', 'pseudo-nth-li5', 'pseudo-nth-li7', 'pseudo-nth-li9'] } },
      { select: '#pseudo-nth-p1 :nth-last-child(4n-1)', expect: { ids: ['pseudo-nth-span2', 'pseudo-nth-span4'] } },

      // - :nth-of-type(n)       (Level 3)
      { select: '#pseudo-nth-p1 em:nth-of-type(3)', expect: { ids: ['pseudo-nth-em3'], equivalentCase: { match: '#pseudo-nth-p1 em:nth-of-type(3)', ref: { by: 'id', id: 'pseudo-nth-em3' } } } },
      { select: '#pseudo-nth-p1 :nth-of-type(2n)', expect: { ids: ['pseudo-nth-em2', 'pseudo-nth-span2', 'pseudo-nth-span4', 'pseudo-nth-strong2', 'pseudo-nth-em4'] } },
      { select: '#pseudo-nth-p1 span:nth-of-type(2n-1)', expect: { ids: ['pseudo-nth-span1', 'pseudo-nth-span3'] } },

      // - :nth-last-of-type(n)  (Level 3)
      { select: '#pseudo-nth-p1 em:nth-last-of-type(3)', expect: { ids: ['pseudo-nth-em2'], equivalentCase: { match: '#pseudo-nth-p1 em:nth-last-of-type(3)', ref: { by: 'id', id: 'pseudo-nth-em2' } } } },
      { select: '#pseudo-nth-p1 :nth-last-of-type(2n)', expect: { ids: ['pseudo-nth-span1', 'pseudo-nth-em1', 'pseudo-nth-strong1', 'pseudo-nth-em3', 'pseudo-nth-span3'] } },
      { select: '#pseudo-nth-p1 span:nth-last-of-type(2n-1)', expect: { ids: ['pseudo-nth-span2', 'pseudo-nth-span4'] } },

      // - :first-of-type        (Level 3)
      { select: '#pseudo-nth-p1 em:first-of-type', expect: { ids: ['pseudo-nth-em1'], equivalentCase: { match: '#pseudo-nth-p1 em:first-of-type', ref: { by: 'id', id: 'pseudo-nth-em1' } } } },
      { select: '#pseudo-nth-p1 :first-of-type', expect: { ids: ['pseudo-nth-span1', 'pseudo-nth-em1', 'pseudo-nth-strong1'] } },
      { select: '#pseudo-nth-table1 tr :first-of-type', expect: { ids: ['pseudo-nth-td1', 'pseudo-nth-td7', 'pseudo-nth-td13'] } },

      // - :last-of-type         (Level 3)
      { select: '#pseudo-nth-p1 em:last-of-type', expect: { ids: ['pseudo-nth-em4'], equivalentCase: { match: '#pseudo-nth-p1 em:last-of-type', ref: { by: 'id', id: 'pseudo-nth-em4' } } } },
      { select: '#pseudo-nth-p1 :last-of-type', expect: { ids: ['pseudo-nth-span4', 'pseudo-nth-strong2', 'pseudo-nth-em4'] } },
      { select: '#pseudo-nth-table1 tr :last-of-type', expect: { ids: ['pseudo-nth-td6', 'pseudo-nth-td12', 'pseudo-nth-td18'] } },

      // - :first-child
      { select: '#pseudo-first-child div:first-child', expect: { ids: ['pseudo-first-child-div1'], equivalentCase: { match: '#pseudo-first-child div:first-child', ref: { by: 'id', id: 'pseudo-first-child-div1' } } } },
      { select: '.pseudo-first-child-div2:first-child, .pseudo-first-child-div3:first-child', expect: { ids: [] } },
      { select: '#pseudo-first-child span:first-child', expect: { ids: ['pseudo-first-child-span1', 'pseudo-first-child-span3', 'pseudo-first-child-span5'] } },

      // - :last-child           (Level 3)
      { select: '#pseudo-last-child div:last-child', expect: { ids: ['pseudo-last-child-div3'], equivalentCase: { match: '#pseudo-last-child div:last-child', ref: { by: 'id', id: 'pseudo-last-child-div3' } } } },
      { select: '.pseudo-last-child-div1:last-child, .pseudo-last-child-div2:first-child', expect: { ids: [] } },
      { select: '#pseudo-last-child span:last-child', expect: { ids: ['pseudo-last-child-span2', 'pseudo-last-child-span4', 'pseudo-last-child-span6'] } },

      // - :only-child           (Level 3)
      { select: '#pseudo-only :only-child', expect: { ids: ['pseudo-only-span1'], equivalentCase: { match: '#pseudo-only :only-child', ref: { by: 'id', id: 'pseudo-only-span1' } } } },
      { select: '#pseudo-only em:only-child', expect: { ids: [] } },

      // - :only-of-type         (Level 3)
      { select: '#pseudo-only :only-of-type', expect: { ids: ['pseudo-only-span1', 'pseudo-only-em1'] } },
      { select: '#pseudo-only em:only-of-type', expect: { ids: ['pseudo-only-em1'], equivalentCase: { match: '#pseudo-only em:only-of-type', ref: { by: 'id', id: 'pseudo-only-em1' } } } },

      // - :empty                (Level 3)
      { select: '#pseudo-empty p:empty', expect: { ids: ['pseudo-empty-p1', 'pseudo-empty-p2'] } },
      { select: '#pseudo-empty :empty', expect: { ids: ['pseudo-empty-p1', 'pseudo-empty-p2', 'pseudo-empty-span1'] } },

      // - :link and :visited
      // Implementations may treat all visited links as unvisited, so these cannot be tested separately.
      // The only guarantee is that ":link,:visited" matches the set of all visited and unvisited links and that they are individually mutually exclusive sets.
      { select: '#pseudo-link :link, #pseudo-link :visited', expect: { ids: ['pseudo-link-a1', 'pseudo-link-a2', 'pseudo-link-area1'] } },
      { select: '#head :link, #head :visited', expect: { ids: ['pseudo-link-link1', 'pseudo-link-link2'] }, status: 'fail' }, // spec issue: `:link` no longer matches `<link>`
      { select: '#head :link, #head :visited', ref: { by: 'id', id: 'root' }, expect: { ids: [] } },
      { select: ':link:visited', ref: { by: 'id', id: 'root' }, expect: { ids: [] } },

      // - :target               (Level 3)
      { select: ':target', ref: { by: 'id', id: 'target', home: 'detached' }, expect: { ids: [] } },
      { select: ':target', expect: { ids: ['target'], equivalentCase: { match: ':target', ref: { by: 'id', id: 'target' } } } },

      // - :lang()
      { select: '#pseudo-lang-div1:lang(en)', expect: { ids: ['pseudo-lang-div1'], equivalentCase: { match: '#pseudo-lang-div1:lang(en)', ref: { by: 'id', id: 'pseudo-lang-div1' } } } },
      { select: '#pseudo-lang-div1:lang(en)', ref: { by: 'id', id: 'root', home: 'fragment' }, expect: { ids: [] } },
      { select: '#pseudo-lang-div2:lang(fr)', expect: { ids: ['pseudo-lang-div2'], equivalentCase: { match: '#pseudo-lang-div2:lang(fr)', ref: { by: 'id', id: 'pseudo-lang-div2' } } } },
      { select: '#pseudo-lang-div3:lang(en)', expect: { ids: ['pseudo-lang-div3'], equivalentCase: { match: '#pseudo-lang-div3:lang(en)', ref: { by: 'id', id: 'pseudo-lang-div3' } } } },
      { select: '#pseudo-lang-div4:lang(es-AR)', expect: { ids: [] } },

      // - :enabled              (Level 3)
      { select: '#pseudo-ui :enabled', expect: { ids: ['pseudo-ui-input1', 'pseudo-ui-input2', 'pseudo-ui-input3', 'pseudo-ui-input4', 'pseudo-ui-input5', 'pseudo-ui-input6', 'pseudo-ui-input7', 'pseudo-ui-input8', 'pseudo-ui-input9', 'pseudo-ui-textarea1', 'pseudo-ui-button1'] } },

      // - :disabled             (Level 3)
      { select: '#pseudo-ui :disabled', expect: { ids: ['pseudo-ui-input10', 'pseudo-ui-input11', 'pseudo-ui-input12', 'pseudo-ui-input13', 'pseudo-ui-input14', 'pseudo-ui-input15', 'pseudo-ui-input16', 'pseudo-ui-input17', 'pseudo-ui-input18', 'pseudo-ui-textarea2', 'pseudo-ui-button2'] } },

      // - :checked              (Level 3)
      { select: '#pseudo-ui :checked', expect: { ids: ['pseudo-ui-input4', 'pseudo-ui-input6', 'pseudo-ui-input13', 'pseudo-ui-input15'] } },

      // - :not(s)               (Level 3)
      { select: '#not>:not(div)', expect: { ids: ['not-p1', 'not-p2', 'not-p3'] } },
      { select: '#not * :not(:first-child)', expect: { ids: ['not-em1', 'not-em2', 'not-em3'] } },
      { select: ':not(*)', expect: { ids: [] } },
      { select: ':not(*|*)', expect: { ids: [] }, status: 'fixme' },

      // Pseudo-elements
      // - ::first-line
      { select: '#pseudo-element:first-line', expect: { ids: [] } },
      { select: '#pseudo-element::first-line', expect: { ids: [] } },

      // - ::first-letter
      { select: '#pseudo-element:first-letter', expect: { ids: [] } },
      { select: '#pseudo-element::first-letter', expect: { ids: [] } },

      // - ::before
      { select: '#pseudo-element:before', expect: { ids: [] } },
      { select: '#pseudo-element::before', expect: { ids: [] } },

      // - ::after
      { select: '#pseudo-element:after', expect: { ids: [] } },
      { select: '#pseudo-element::after', expect: { ids: [] } },

      // Class Selectors
      { select: '.class-p', expect: { ids: ['class-p1', 'class-p2', 'class-p3'] } },
      { select: '#class .apple.orange.banana', expect: { ids: ['class-div1', 'class-div2', 'class-p4', 'class-div3', 'class-p6', 'class-div4'] } },
      { select: 'div.apple.banana.orange', expect: { ids: ['class-div1', 'class-div2', 'class-div3', 'class-div4'] } },
      { select: '.\u53F0\u5317Ta\u0301ibe\u030Ci', expect: { ids: ['class-span1'], equivalentCase: { match: '.\u53F0\u5317Ta\u0301ibe\u030Ci', ref: { by: 'id', id: 'class-span1' } } } },
      { select: '.\u53F0\u5317', expect: { ids: ['class-span1', 'class-span2'] } },
      { select: '.\u53F0\u5317Ta\u0301ibe\u030Ci.\u53F0\u5317', expect: { ids: ['class-span1'], equivalentCase: { match: '.\u53F0\u5317Ta\u0301ibe\u030Ci.\u53F0\u5317', ref: { by: 'id', id: 'class-span1' } } } },
      { select: '.foo\\:bar', expect: { ids: ['class-span3'], equivalentCase: { match: '.foo\\:bar', ref: { by: 'id', id: 'class-span3' } } } },
      { select: '.test\\.foo\\[5\\]bar', expect: { ids: ['class-span4'], equivalentCase: { match: '.test\\.foo\\[5\\]bar', ref: { by: 'id', id: 'class-span4' } } } },

      // ID Selectors
      { select: '#id #id-div1', expect: { ids: ['id-div1'], equivalentCase: { match: '#id #id-div1', ref: { by: 'id', id: 'id-div1' } } } },
      { select: '#id-div1, #id-div1', expect: { ids: ['id-div1'], equivalentCase: { match: '#id-div1, #id-div1', ref: { by: 'id', id: 'id-div1' } } } },
      { select: '#id-div1, #id-div2', expect: { ids: ['id-div1', 'id-div2'] } },
      { select: 'div#id-div1, div#id-div2', expect: { ids: ['id-div1', 'id-div2'] } },
      { select: '#id #none', expect: { ids: [] } },
      { select: '#none #id-div1', expect: { ids: [] } },
      { select: '#id-li-duplicate', expect: { ids: ['id-li-duplicate', 'id-li-duplicate', 'id-li-duplicate', 'id-li-duplicate'] } },

      { select: '#\u53F0\u5317Ta\u0301ibe\u030Ci', expect: { ids: ['\u53F0\u5317Ta\u0301ibe\u030Ci'], equivalentCase: { match: '#\u53F0\u5317Ta\u0301ibe\u030Ci', ref: { by: 'id', id: '\u53F0\u5317Ta\u0301ibe\u030Ci' } } } },
      { select: '#\u53F0\u5317', expect: { ids: ['\u53F0\u5317'], equivalentCase: { match: '#\u53F0\u5317', ref: { by: 'id', id: '\u53F0\u5317' } } } },
      { select: '#\u53F0\u5317Ta\u0301ibe\u030Ci, #\u53F0\u5317', expect: { ids: ['\u53F0\u5317Ta\u0301ibe\u030Ci', '\u53F0\u5317'] } },

      // XXX runMatchesTest() in level2-lib.js can't handle this because obtaining the expected nodes requires escaping characters when generating the selector from 'expect' values
      { select: '#\\#foo\\:bar', expect: { ids: ['#foo:bar'] } },
      { select: '#test\\.foo\\[5\\]bar', expect: { ids: ['test.foo[5]bar'] } },

      // Namespaces
      // XXX runMatchesTest() in level2-lib.js can't handle these because non-HTML elements don't have a recognised id
      { select: '#any-namespace *|div', expect: { ids: ['any-namespace-div1', 'any-namespace-div2', 'any-namespace-div3', 'any-namespace-div4'] }, status: 'fixme' },
      { select: '#no-namespace |div', expect: { ids: ['no-namespace-div3'] }, status: 'fixme' },
      { select: '#no-namespace |*', expect: { ids: ['no-namespace-div3'] }, status: 'fixme' },

      // Combinators
      // - Descendant combinator ' '
      { select: '#descendant div', expect: { ids: ['descendant-div1', 'descendant-div2', 'descendant-div3', 'descendant-div4'] } },
      { select: 'body #descendant-div1', expect: { ids: ['descendant-div1'], equivalentCase: { match: 'body #descendant-div1', ref: { by: 'id', id: 'descendant-div1' } } } },
      { select: 'div #descendant-div1', expect: { ids: ['descendant-div1'], equivalentCase: { match: 'div #descendant-div1', ref: { by: 'id', id: 'descendant-div1' } } } },
      { select: '#descendant #descendant-div2', expect: { ids: ['descendant-div2'], equivalentCase: { match: '#descendant #descendant-div2', ref: { by: 'id', id: 'descendant-div2' } } } },
      { select: '#descendant .descendant-div2', expect: { ids: ['descendant-div2'], equivalentCase: { match: '#descendant .descendant-div2', ref: { by: 'id', id: 'descendant-div2' } } } },
      { select: '.descendant-div1 .descendant-div3', expect: { ids: ['descendant-div3'], equivalentCase: { match: '.descendant-div1 .descendant-div3', ref: { by: 'id', id: 'descendant-div3' } } } },
      { select: '#descendant-div1 #descendant-div4', expect: { ids: [] } },
      { select: '#descendant\t\r\n#descendant-div2', expect: { ids: ['descendant-div2'], equivalentCase: { match: '#descendant\t\r\n#descendant-div2', ref: { by: 'id', id: 'descendant-div2' } } } },

      /* The future of this combinator is uncertain, see
      * https://github.com/w3c/csswg-drafts/issues/641
      * These tests are commented out until a final decision is made on whether to
      * keep the feature in the spec.
      * 
      * Removed from Selectors 4; 4/11/2026
      */

      // - Descendant combinator '>>'
      { select: '#descendant>>div', expect: { ids: ['descendant-div1', 'descendant-div2', 'descendant-div3', 'descendant-div4'] }, status: 'fail' },
      { select: 'body>>#descendant-div1', expect: { ids: ['descendant-div1'] }, status: 'fail' },
      { select: 'div>>#descendant-div1', expect: { ids: ['descendant-div1'] }, status: 'fail' },
      { select: '#descendant>>#descendant-div2', expect: { ids: ['descendant-div2'] }, status: 'fail' },
      { select: '#descendant>>.descendant-div2', expect: { ids: ['descendant-div2'] }, status: 'fail' },
      { select: '.descendant-div1>>.descendant-div3', expect: { ids: ['descendant-div3'] }, status: 'fail' },
      { select: '#descendant-div1>>#descendant-div4', expect: { ids: [] }, status: 'fail' },

      // - Child combinator '>'
      { select: '#child>div', expect: { ids: ['child-div1', 'child-div4'] } },
      { select: 'div>#child-div1', expect: { ids: ['child-div1'], equivalentCase: { match: 'div>#child-div1', ref: { by: 'id', id: 'child-div1' } } } },
      { select: '#child>#child-div1', expect: { ids: ['child-div1'], equivalentCase: { match: '#child>#child-div1', ref: { by: 'id', id: 'child-div1' } } } },
      { select: '#child-div1>.child-div2', expect: { ids: ['child-div2'], equivalentCase: { match: '#child-div1>.child-div2', ref: { by: 'id', id: 'child-div2' } } } },
      { select: '.child-div1>.child-div2', expect: { ids: ['child-div2'], equivalentCase: { match: '.child-div1>.child-div2', ref: { by: 'id', id: 'child-div2' } } } },
      { select: '#child>#child-div3', expect: { ids: [] } },
      { select: '#child-div1>.child-div3', expect: { ids: [] } },
      { select: '.child-div1>.child-div3', expect: { ids: [] } },
      { select: '#child-div1\t\r\n>\t\r\n#child-div2', expect: { ids: ['child-div2'], equivalentCase: { match: '#child-div1\t\r\n>\t\r\n#child-div2', ref: { by: 'id', id: 'child-div2' } } } },
      { select: '#child-div1>\t\r\n#child-div2', expect: { ids: ['child-div2'], equivalentCase: { match: '#child-div1>\t\r\n#child-div2', ref: { by: 'id', id: 'child-div2' } } } },
      { select: '#child-div1\t\r\n>#child-div2', expect: { ids: ['child-div2'], equivalentCase: { match: '#child-div1\t\r\n>#child-div2', ref: { by: 'id', id: 'child-div2' } } } },
      { select: '#child-div1>#child-div2', expect: { ids: ['child-div2'], equivalentCase: { match: '#child-div1>#child-div2', ref: { by: 'id', id: 'child-div2' } } } },

      // - Adjacent sibling combinator '+'
      { select: '#adjacent-div2+div', expect: { ids: ['adjacent-div4'] } },
      { select: 'div+#adjacent-div4', expect: { ids: ['adjacent-div4'], equivalentCase: { match: 'div+#adjacent-div4', ref: { by: 'id', id: 'adjacent-div4' } } } },
      { select: '#adjacent-div2+#adjacent-div4', expect: { ids: ['adjacent-div4'], equivalentCase: { match: '#adjacent-div2+#adjacent-div4', ref: { by: 'id', id: 'adjacent-div4' } } } },
      { select: '#adjacent-div2+.adjacent-div4', expect: { ids: ['adjacent-div4'], equivalentCase: { match: '#adjacent-div2+.adjacent-div4', ref: { by: 'id', id: 'adjacent-div4' } } } },
      { select: '.adjacent-div2+.adjacent-div4', expect: { ids: ['adjacent-div4'], equivalentCase: { match: '.adjacent-div2+.adjacent-div4', ref: { by: 'id', id: 'adjacent-div4' } } } },
      { select: '#adjacent div+p', expect: { ids: ['adjacent-p2'] } },
      { select: '#adjacent-div2+#adjacent-p2, #adjacent-div2+#adjacent-div1', expect: { ids: [] } },
      { select: '#adjacent-p2\t\r\n+\t\r\n#adjacent-p3', expect: { ids: ['adjacent-p3'], equivalentCase: { match: '#adjacent-p2\t\r\n+\t\r\n#adjacent-p3', ref: { by: 'id', id: 'adjacent-p3' } } } },
      { select: '#adjacent-p2+\t\r\n#adjacent-p3', expect: { ids: ['adjacent-p3'], equivalentCase: { match: '#adjacent-p2+\t\r\n#adjacent-p3', ref: { by: 'id', id: 'adjacent-p3' } } } },
      { select: '#adjacent-p2\t\r\n+#adjacent-p3', expect: { ids: ['adjacent-p3'], equivalentCase: { match: '#adjacent-p2\t\r\n+#adjacent-p3', ref: { by: 'id', id: 'adjacent-p3' } } } },
      { select: '#adjacent-p2+#adjacent-p3', expect: { ids: ['adjacent-p3'], equivalentCase: { match: '#adjacent-p2+#adjacent-p3', ref: { by: 'id', id: 'adjacent-p3' } } } },

      // - General sibling combinator ~ (Level 3)
      { select: '#sibling-div2~div', expect: { ids: ['sibling-div4', 'sibling-div6'] } },
      { select: 'div~#sibling-div4', expect: { ids: ['sibling-div4'], equivalentCase: { match: 'div~#sibling-div4', ref: { by: 'id', id: 'sibling-div4' } } } },
      { select: '#sibling-div2~#sibling-div4', expect: { ids: ['sibling-div4'], equivalentCase: { match: '#sibling-div2~#sibling-div4', ref: { by: 'id', id: 'sibling-div4' } } } },
      { select: '#sibling-div2~.sibling-div', expect: { ids: ['sibling-div4', 'sibling-div6'] } },
      { select: '#sibling div~p', expect: { ids: ['sibling-p2', 'sibling-p3'] } },
      { select: '#sibling>p~div', expect: { ids: [] } },
      { select: '#sibling-div2~#sibling-div3, #sibling-div2~#sibling-div1', expect: { ids: [] } },
      { select: '#sibling-p2\t\r\n~\t\r\n#sibling-p3', expect: { ids: ['sibling-p3'], equivalentCase: { match: '#sibling-p2\t\r\n~\t\r\n#sibling-p3', ref: { by: 'id', id: 'sibling-p3' } } } },
      { select: '#sibling-p2~\t\r\n#sibling-p3', expect: { ids: ['sibling-p3'], equivalentCase: { match: '#sibling-p2~\t\r\n#sibling-p3', ref: { by: 'id', id: 'sibling-p3' } } } },
      { select: '#sibling-p2\t\r\n~#sibling-p3', expect: { ids: ['sibling-p3'], equivalentCase: { match: '#sibling-p2\t\r\n~#sibling-p3', ref: { by: 'id', id: 'sibling-p3' } } } },
      { select: '#sibling-p2~#sibling-p3', expect: { ids: ['sibling-p3'], equivalentCase: { match: '#sibling-p2~#sibling-p3', ref: { by: 'id', id: 'sibling-p3' } } } },

      // Group of selectors (comma)
      { select: '#group em\t\r \n,\t\r \n#group strong', expect: { ids: ['group-em1', 'group-strong1'] } },
      { select: '#group em,\t\r\n#group strong', expect: { ids: ['group-em1', 'group-strong1'] } },
      { select: '#group em\t\r\n,#group strong', expect: { ids: ['group-em1', 'group-strong1'] } },
      { select: '#group em,#group strong', expect: { ids: ['group-em1', 'group-strong1'] } },

      // -----------------------------------------------------------------------------
      // Scoped Selectors
      // -----------------------------------------------------------------------------

      /*
      * Scoped selectors -- RIP, 2010–2013.
      *
      * The abandoned Selectors API Level 2 draft included `find()`, `findAll()`,
      * and `matches(selector, refNodes)`.
      *
      * That spec never advanced beyond Working Draft / Working Group Note status
      * and was retired in 2013. Modern DOM standardized the narrower one-argument
      * selector APIs instead: `querySelector(All)`, `matches(selector)`, and
      * `closest(selector)`.
      *
      * Unable to migrate the rest of the legacy tests.
      */
    ],
  },

  {
    name: 'html/semantics/scripting-1/template-end-tag-without-start-one-in-body',
    html: `
      </template>
      <div>The file contains several &lt;/template&gt; tag in HTML body without start one</div>
      </template></template>
    `,
    cases: [
      { select: 'template', expect: { ids: [] } },
      { select: 'div', expect: { count: 1 } },
    ]
  },

  {
    name: 'html/semantics/scripting-1/html-start-tag-in-body',
    html: `
      <template id="tmpl"><html class="htmlClass"></html></template><html id="htmlId" tabindex="5">
    `,
    cases: [
      { select: 'template', expect: { ids: ['tmpl'] } },
      { select: 'html', expect: { count: 1 } },
      { select: '.htmlClass', expect: { ids: [] } },
      { select: 'template > *', expect: { count: 0 } },
    ]
  },

  {
    name: 'html/semantics/scripting-1/template-contents-body',
    html: `
      <template><body></body></template>
    `,
    // BODY tokens inside template contents are ignored
    cases: [
      { select: 'template', expect: { count: 1 } },
      { select: 'template > *', expect: { count: 0 } },
    ]
  },

  {
    name: 'html/semantics/scripting-1/template-contents-div-no-end-tag',
    html: `
      <template>
        <div>Hello, template
      </template>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const template = document.querySelector('template');
        if (!(template instanceof HTMLTemplateElement)) {
          return null;
        }

        return {
          divCount: template.content.querySelectorAll('div').length,
        };
      });

      expect(result).not.toBeNull();
      expect(result!.divCount).toEqual(1);
    },
    cases: [
      { select: 'template', expect: { count: 1 } },
      { select: 'template > div', expect: { count: 1 }, status: 'fail' }, // outside template.content
    ]
  },

  {
    name: 'html/semantics/scripting-1/template-contents-frameset',
    // FRAMESET inside template is ignored; template stays empty.
    html: `
      <template><frameset></frameset></template>
    `,
    cases: [
      { select: 'template', expect: { count: 1 } },
      { select: 'template > *', expect: { count: 0 } },
    ]
  },

  {
    name: 'html/semantics/scripting-1/template-contents-head',
    // HEAD inside template is ignored; template stays empty.
    html: `
      <template><head></head></template>
    `,
    cases: [
      { select: 'template', expect: { count: 1 } },
      { select: 'template > *', expect: { count: 0 } },
    ]
  },

  {
    name: 'html/semantics/scripting-1/template-contents-html',
    // HTML inside template is ignored; template stays empty.
    html: `
      <template><html></html></template>
    `,
    cases: [
      { select: 'template', expect: { count: 1 } },
      { select: 'template > *', expect: { count: 0 } },
    ]
  },

  {
    name: 'html/semantics/scripting-1/template-contents-table-no-end-tag',
    html: `
      <template>
        <table>
          <tr>
            <td>Hello, cell one!
      </template>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const template = document.querySelector('template');
        if (!(template instanceof HTMLTemplateElement)) {
          return null;
        }

        return {
          tableCount: template.content.querySelectorAll('table').length,
          trCount: template.content.querySelectorAll('tr').length,
          tdCount: template.content.querySelectorAll('td').length,
        };
      });

      expect(result).not.toBeNull();
      expect(result!.tableCount).toEqual(1);
      expect(result!.trCount).toEqual(1);
      expect(result!.tdCount).toEqual(1);
    },
    cases: [
      { select: 'template', expect: { count: 1 } },
      { select: 'table', expect: { count: 1 }, status: 'fail' }, // outside template.content
      { select: 'tr', expect: { count: 1 }, status: 'fail' }, // outside template.content
      { select: 'td', expect: { count: 1 }, status: 'fail' }, // outside template.content
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/checked-001-manual',
    html: `
      <p><input checked type="checkbox"> <span>X</span></p>
      <p><input checked type="radio" name="x"> <span>X</span> <input checked type="radio" name="x"> <span>X</span></p>
      <p><select><option selected>X</option></select></p>
      <p><select size="2"><option selected>X</option></select></p>
    `,
    cases: [
      { select: ':checked', expect: { count: 4 } },
      { select: ':checked + span', expect: { count: 2 } },
      { select: ':checked, :checked + span', expect: { count: 6 } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/checked-type-change',
    html: `
      <input id="checked" type="text" checked>
      <span id="sibling">This text should be green.</span>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const input = document.getElementById('checked') as HTMLInputElement;
        const beforeSibling = document.querySelectorAll(':checked + span').length;
        input.type = 'radio';
        const afterSibling = document.querySelectorAll(':checked + span').length;

        return {
          beforeSibling,
          afterSibling,
        };
      });

      expect(result.beforeSibling).toEqual(0);
      expect(result.afterSibling).toEqual(1);
    },
    cases: []
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/checked',
    html: `
      <select id="select1">
        <optgroup label="options" id="optgroup1">
          <option value="option1" id="option1" selected>option1
          <option value="option2" id="option2">option2
          <option value="option2" id="option3" checked>option3
      </select>
      <input type="checkbox" id="checkbox1" checked>
      <input type="checkbox" id="checkbox2">
      <input type="checkbox" id="checkbox3" selected>
      <input type="radio" id="radio1" checked>
      <input type="radio" id="radio2">
      <form>
        <p><input type="submit" contextmenu="formmenu" id="submitbutton"></p>
        <menu type="context" id="formmenu">
          <menuitem type="checkbox" checked default id="menuitem1">
          <menuitem type="checkbox" default id="menuitem2">
          <menuitem type="checkbox" id="menuitem3">
          <menuitem type="radio" checked id="menuitem4">
          <menuitem type="radio" id="menuitem5">
        </menu>
      </form>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const nativeIds = () => [...document.querySelectorAll(':checked')].map(el => el.id);
        const nwIds = () => NW.Dom.select(':checked', document).map(el => el.id);

        const native_initial = nativeIds();
        const nw_initial = nwIds();

        (document.getElementById('checkbox1') as HTMLInputElement).removeAttribute('type');
        (document.getElementById('radio1') as HTMLInputElement).removeAttribute('type');

        const native_afterRemoveType = nativeIds();
        const nw_afterRemoveType = nwIds();

        (document.getElementById('option2') as HTMLOptionElement).selected = true;
        (document.getElementById('checkbox2') as HTMLInputElement).click();
        (document.getElementById('radio2') as HTMLInputElement).click();

        const native_afterClick = nativeIds();
        const nw_afterClick = nwIds();

        return {
          native_initial,
          nw_initial,
          native_afterRemoveType,
          nw_afterRemoveType,
          native_afterClick,
          nw_afterClick,
        };
      });

      expect(result.native_initial).toEqual(['option1', 'checkbox1', 'radio1']);
      expect(result.nw_initial).toEqual(['option1', 'checkbox1', 'radio1']);

      expect(result.native_afterRemoveType).toEqual(['option1']);
      expect(result.nw_afterRemoveType).toEqual(['option1']);

      expect(result.native_afterClick).toEqual(['option2', 'checkbox2', 'radio2']);
      expect(result.nw_afterClick).toEqual(['option2', 'checkbox2', 'radio2']);
    },
    cases: [
      { select: ':checked', expect: { ids: ['option2', 'checkbox2', 'radio2'] } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/default',
    html: `
      <form>
        <button id="button1" type="button">button1</button>
        <button id="button2" type="submit">button2</button>
      </form>
      <form>
        <button id="button3" type="reset">button3</button>
        <button id="button4">button4</button>
      </form>
      <button id="button5" type="submit">button5</button>
      <form id="form1">
        <input type="text" id="input1">
      </form>
      <input type="text" id="input2" form="form1">
      <form>
        <input type="submit" id="input3">
        <input type="submit" id="input4">
      </form>
      <form>
        <input type="image" id="input5">
        <input type="image" id="input6">
      </form>
      <form>
        <input type="submit" id="input7">
      </form>
      <input type="checkbox" id="checkbox1" checked>
      <input type="checkbox" id="checkbox2">
      <input type="checkbox" id="checkbox3" default>
      <input type="radio" name="radios" id="radio1" checked>
      <input type="radio" name="radios" id="radio2">
      <input type="radio" name="radios" id="radio3" default>
      <select id="select1">
        <optgroup label="options" id="optgroup1">
          <option value="option1" id="option1">option1
          <option value="option2" id="option2" selected>option2
      </select>
      <dialog id="dialog">
        <input type="submit" id="input8">
      </dialog>
      <form>
        <button id="button6" type="invalid">button6</button>
        <button id="button7">button7</button>
      </form>
      <form>
        <button id="button8">button8</button>
        <button id="button9">button9</button>
      </form>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const nativeIds = () => [...document.querySelectorAll(':default')].map(el => el.id);
        const nwIds = () => NW.Dom.select(':default', document).map(el => el.id);

        const native_initial = nativeIds();
        const nw_initial = nwIds();

        (document.getElementById('button1') as HTMLButtonElement).type = 'submit';

        return {
          native_initial,
          nw_initial,
        };
      });

      expect(result.native_initial).toEqual(['button2', 'button4', 'input3', 'input5', 'input7', 'checkbox1', 'radio1', 'option2', 'button6', 'button8']);
      expect(result.nw_initial).toEqual(['button2', 'button4', 'input3', 'input5', 'input7', 'checkbox1', 'radio1', 'option2', 'button6', 'button8']);
    },
    cases: [
      { select: ':default', expect: { ids: ['button1', 'button4', 'input3', 'input5', 'input7', 'checkbox1', 'radio1', 'option2', 'button6', 'button8'] } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/dir',
    html: `
      <!DOCTYPE html>
      <html id=html>
        <head id=head>
          <meta charset=utf-8 id=meta>
          <title id=title>Selector: pseudo-classes (:dir(ltr), :dir(rtl))</title>
          <link rel="author" title="Denis Ah-Kang" href="mailto:denis@w3.org" id=link1>
          <link rel=help href="https://html.spec.whatwg.org/multipage/#pseudo-classes" id=link2>
          <script src="/resources/testharness.js" id=script1></script>
          <script src="/resources/testharnessreport.js" id=script2></script>
          <script src="utils.js" id=script3></script>
          <style id=style>
            #span1 {direction: rtl;}
            #span5, #span6 {display: none;}
          </style>
        </head>
        <body id=body>
          <div id="log"></div>
          <bdo dir="rtl" id=bdo1>WERBEH</bdo>
          <bdo dir="ltr" id=bdo2>HEBREW</bdo>
          <bdi id=bdi1>HEBREW</bdi>
          <bdi dir="rtl" id=bdi2>WERBEH</bdi>
          <bdi dir="ltr" id=bdi3>HEBREW</bdi>
          <bdi id=bdi4>إيان</bdi>
          <span id=span1>WERBEH</span>
          <span dir="rtl" id=span2>WERBEH</span>
          <span dir="ltr" id=span3>HEBREW</span>
          &#x202E;<span id=span4>WERBEH</span>&#x202C;
          <span dir="rtl" id=span5>WERBEH</span>
          <span dir="ltr" id=span6>HEBREW</span>
          <bdo dir="auto" id=bdo3>HEBREW</bdo>
          <bdo dir="auto" id=bdo4>إيان</bdo>
          <bdo dir="ltr" id=bdo5>עברית</bdo>

          <script id=script4>
          </script>
        </body>
      </html>
    `,
    htmlMode: 'document',
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const native_ltr = [...document.querySelectorAll(':dir(ltr)')].map(el => el.id);
        const nw_ltr = NW.Dom.select(':dir(ltr)', document).map(el => el.id);

        const bdo = document.createElement('bdo');
        bdo.setAttribute('dir', 'ltr');

        const native_ltr_afterDetached = [...document.querySelectorAll(':dir(ltr)')].map(el => el.id);
        const nw_ltr_afterDetached = NW.Dom.select(':dir(ltr)', document).map(el => el.id);

        return {
          native_ltr,
          nw_ltr,
          native_ltr_afterDetached,
          nw_ltr_afterDetached,
        };
      });

      expect(result.native_ltr).toEqual(result.native_ltr_afterDetached);
      expect(result.nw_ltr).toEqual(result.nw_ltr_afterDetached);
    },
    cases: [
      { select: ':dir(rtl)', expect: { ids: ['bdo1', 'bdi2', 'bdi4', 'span2', 'span5', 'bdo4'] } },
      { select: ':dir(ltr)', expect: { ids: [
        "html", "head", "meta", "title", "link1", "link2", "script1", "script2", "script3", "style", "body",
        "log", "bdo2", "bdi1", "bdi3", "span1", "span3", "span4", "span6", "bdo3", "bdo5", "script4"
      ] } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/dir01',
    html: `
      <div>This text is left to right<div id="div1" style="direction:rtl">this is right to left</div></div>
      <div>This text is left to right<span id="div2" style="direction:rtl">this is left to right</span></div>
    `,
    cases: [
      { select: ':dir(ltr)', expect: { equivalentCase: { select: '*' } } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/disabled',
    html: `
      <style>
        #input4 {display:none;}
      </style>
      <div id="log"></div>
      <button id=button1 type=submit>button1</button>
      <button id=button2 disabled>button2</button>
      <input id=input1>
      <input id=input2 disabled>
      <input id=input3 readonly>
      <input id=input4>
      <select id=select1>
      <optgroup label="options" id=optgroup1>
        <option value="option1" id=option1 selected>option1
      </select>
      <select disabled id=select2>
      <optgroup label="options" disabled id=optgroup2>
        <option value="option2" disabled id=option2>option2
      </select>
      <textarea id=textarea1>textarea1</textarea>
      <textarea disabled id=textarea2>textarea2</textarea>
      <fieldset id=fieldset1></fieldset>
      <fieldset disabled id=fieldset2>
        <legend><input type=checkbox id=club></legend>
        <p><label>Name on card: <input id=clubname required></label></p>
        <p><label>Card number: <input id=clubnum required pattern="[-0-9]+"></label></p>
      </fieldset>
      <label disabled></label>
      <object disabled></object>
      <output disabled></output>
      <img disabled/>
      <meter disabled></meter>
      <progress disabled></progress>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const nativeIds = (sel: string) => [...document.querySelectorAll(sel)].map(el => el.id);
        const nwIds = (sel: string) => NW.Dom.select(sel, document).map(el => el.id);

        const native_initial = nativeIds(':disabled');
        const nw_initial = nwIds(':disabled');

        document.getElementById('button2')!.removeAttribute('disabled');
        const native_afterRemove = nativeIds(':disabled');
        const nw_afterRemove = nwIds(':disabled');

        document.getElementById('button1')!.setAttribute('disabled', 'disabled');
        const native_afterSet = nativeIds(':disabled');
        const nw_afterSet = nwIds(':disabled');

        document.getElementById('button1')!.setAttribute('disabled', 'disabled');
        const native_afterSetTwice = nativeIds(':disabled');
        const nw_afterSetTwice = nwIds(':disabled');

        (document.getElementById('input2') as HTMLInputElement).setAttribute('type', 'submit');
        const native_afterTypeChange = nativeIds(':disabled');
        const nw_afterTypeChange = nwIds(':disabled');

        const input = document.createElement('input');
        input.setAttribute('disabled', 'disabled');
        const native_afterDetached = nativeIds(':disabled');
        const nw_afterDetached = nwIds(':disabled');

        const fieldset = document.createElement('fieldset');
        fieldset.id = 'fieldset_nested';
        fieldset.innerHTML = `
          <input id=input_nested>
          <button id=button_nested>button nested</button>
          <select id=select_nested>
            <optgroup label="options" id=optgroup_nested>
              <option value="options" id=option_nested>option nested</option>
            </optgroup>
          </select>
          <textarea id=textarea_nested>textarea nested</textarea>
          <object id=object_nested></object>
          <output id=output_nested></output>
          <fieldset id=fieldset_nested2>
            <input id=input_nested2>
          </fieldset>
        `;
        document.getElementById('fieldset2')!.appendChild(fieldset);

        return {
          native_initial,
          nw_initial,
          native_afterRemove,
          nw_afterRemove,
          native_afterSet,
          nw_afterSet,
          native_afterSetTwice,
          nw_afterSetTwice,
          native_afterTypeChange,
          nw_afterTypeChange,
          native_afterDetached,
          nw_afterDetached,
        };
      });

      expect(result.native_initial).toEqual(['button2', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);
      expect(result.nw_initial).toEqual(['button2', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);

      expect(result.native_afterRemove).toEqual(['input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);
      expect(result.nw_afterRemove).toEqual(['input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);

      expect(result.native_afterSet).toEqual(['button1', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);
      expect(result.nw_afterSet).toEqual(['button1', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);

      expect(result.native_afterSetTwice).toEqual(['button1', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);
      expect(result.nw_afterSetTwice).toEqual(['button1', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);

      expect(result.native_afterTypeChange).toEqual(['button1', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);
      expect(result.nw_afterTypeChange).toEqual(['button1', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);

      expect(result.native_afterDetached).toEqual(['button1', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);
      expect(result.nw_afterDetached).toEqual(['button1', 'input2', 'select2', 'optgroup2', 'option2', 'textarea2', 'fieldset2', 'clubname', 'clubnum']);
    },
    cases: [
      // { select: '#fieldset2 :disabled', expect: { ids: ['clubname', 'clubnum', 'fieldset_nested', 'input_nested', 'button_nested', 'select_nested', 'textarea_nested', 'fieldset_nested2', 'input_nested2'] } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/enabled',
    html: `
      <a id=link3></a>
      <area id=link4></area>
      <link id=link5></link>
      <a href="http://www.w3.org" id=link6></a>
      <area href="http://www.w3.org" id=link7></area>
      <link href="http://www.w3.org" id=link8></link>
      <button id=button1>button1</button>
      <button id=button2 disabled>button2</button>
      <input id=input1>
      <input id=input2 disabled>
      <select id=select1>
      <optgroup label="options" id=optgroup1>
        <option value="option1" id=option1 selected>option1
      </select>
      <select disabled id=select2>
      <optgroup label="options" disabled id=optgroup2>
        <option value="option2" disabled id=option2>option2
      </select>
      <textarea id=textarea1>textarea1</textarea>
      <textarea disabled id=textarea2>textarea2</textarea>
      <form>
      <p><input type=submit contextmenu=formmenu id=submitbutton></p>
      <menu type=context id=formmenu>
        <!-- historical; these should *not* match -->
        <menuitem command="submitbutton" default id=menuitem1>
        <menuitem command="resetbutton" disabled id=menuitem2>
      </menu>
      </form>
      <fieldset id=fieldset1></fieldset>
      <fieldset disabled id=fieldset2></fieldset>
    `,
    cases: [
      { select: ':enabled', expect: { ids: ['button1', 'input1', 'select1', 'optgroup1', 'option1', 'textarea1', 'submitbutton', 'fieldset1'] } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/autofocus',
    html: `
      <input id="input1" autofocus>
    `,
    setupPage: async (page) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
    cases: [
      { select: ':focus', expect: { ids: ['input1'] } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/focus-none',
    html: `
      <input id="input1">
    `,
    cases: [
      { select: ':focus', expect: { ids: [] }, status: 'fixme'},
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/focus',
    // browsers: ['chromium', 'webkit'], // Firefox doesn't support :focus inside iframe ??
    html: `
    <!DOCTYPE html>
    <title>Selector: pseudo-classes (:focus)</title>
    <link rel="author" title="Denis Ah-Kang" href="mailto:denis@w3.org" id=link1>
    <link rel=help href="https://html.spec.whatwg.org/multipage/#pseudo-classes" id=link2>
      <body id=body tabindex=0>
        <button id=button1 type=submit>button1</button>
        <input id=input1>
        <input id=input2 disabled>
        <textarea id=textarea1>textarea1</textarea>
        <input type=checkbox id=checkbox1 checked>
        <input type=radio id=radio1 checked>
        <div tabindex=0 id=div1>hello</div>
        <div contenteditable id=div2>content</div>
        <iframe id=iframe srcdoc='<input id="inputiframe" type="text" value="foobar">'></iframe>
      </body>
    `,
    htmlMode: 'document',
    setupPage: async (page) => {
      const result = await page.evaluate(async () => {
        const iframe = document.getElementById('iframe') as HTMLIFrameElement;
        const inputiframe = iframe.contentDocument?.getElementById('inputiframe');
        if (!inputiframe) throw new Error('Failed to find input inside iframe');

        const nativeIds = () => [...document.querySelectorAll(':focus')].map(el => el.id);
        const nwIds = () => NW.Dom.select(':focus', document).map(el => el.id);

        (document.getElementById('input1'))?.focus();
        const native_input1 = nativeIds();
        const nw_input1 = nwIds();

        (document.getElementById('div1'))?.focus();
        const native_div1 = nativeIds();
        const nw_div1 = nwIds();

        (document.getElementById('div2'))?.focus();
        const native_div2 = nativeIds();
        const nw_div2 = nwIds();

        (document.getElementById('body'))?.focus();
        const native_body = nativeIds();
        const nw_body = nwIds();

        inputiframe.focus();
        const native_iframe = nativeIds();
        const nw_iframe = nwIds();

        return {
          native_input1, nw_input1,
          native_div1, nw_div1,
          native_div2, nw_div2,
          native_body, nw_body,
          native_iframe, nw_iframe,
        };
      });

      expect(result.native_input1).toEqual(['input1']);
      expect(result.nw_input1).toEqual(['input1']);

      expect(result.native_div1).toEqual(['div1']);
      expect(result.nw_div1).toEqual(['div1']);

      expect(result.native_div2).toEqual(['div2']);
      expect(result.nw_div2).toEqual(['div2']);

      expect(result.native_body).toEqual(['body']);
      expect(result.nw_body).toEqual(['body']);

      // expect(result.native_iframe).toEqual(['inputiframe']);
      // expect(result.nw_iframe).toEqual(['inputiframe']);
    },
    cases: [
      { select: 'input', ref: { by: 'iframe', id: 'iframe' }, expect: { ids: ['inputiframe'] } },
      { select: 'input:focus', ref: { by: 'iframe', id: 'iframe' }, expect: { ids: ['inputiframe'] }, status: 'fail' },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/indeterminate-radio',
    html: `
      <input id="radio1" type="radio" name="radios">
      <div id="test"></div>
      <input type="radio" name="radios" checked>
    `,
    setupPage: async (page) => {
      await page.evaluate(() => {
        (document.getElementById('radio1') as HTMLInputElement).indeterminate = true;
      });
    },
    cases: [
      { select: 'input:indeterminate + #test', expect: { count: 0 } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/indeterminate-type-change',
    html: `
      <input id="indeterminate" type="text">
      <span id="sibling">This text should be green.</span>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const native_before = [...document.querySelectorAll(':indeterminate + span')].map(el => el.id);
        const nw_before = NW.Dom.select(':indeterminate + span', document).map(el => el.id);

        (document.getElementById('indeterminate') as HTMLInputElement).type = 'radio';

        return {
          native_before,
          nw_before,
        };
      });

      expect(result.native_before).toEqual([]);
      expect(result.nw_before).toEqual([]);
    },
    cases: [
      { select: ':indeterminate + span', expect: { ids: ['sibling'] }, status: 'fixme'},
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/indeterminate',
    html: `
      <input type=checkbox id=checkbox1>
      <input type=checkbox id=checkbox2>
      <input type=radio id=radio1 checked>
      <input type=radio name=radiogroup id=radio2>
      <input type=radio name=radiogroup id=radio3>
      <input type=radio name=group2 id=radio4>
      <input type=radio name=group2 id=radio5>
      <progress id="progress1"></progress>
      <progress id="progress2" value=10></progress>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const nativeIds = () => [...document.querySelectorAll(':indeterminate')].map(el => el.id);
        const nwIds = () => NW.Dom.select(':indeterminate', document).map(el => el.id);

        const native_initial = nativeIds();
        const nw_initial = nwIds();

        document.getElementById('radio2')?.setAttribute('checked', 'checked');
        const native_afterCheckedAttr = nativeIds();
        const nw_afterCheckedAttr = nwIds();

        (document.getElementById('radio4') as HTMLInputElement)?.click();
        const native_afterRadio4Click = nativeIds();
        const nw_afterRadio4Click = nwIds();

        document.getElementById('progress1')?.setAttribute('value', '20');
        const native_afterProgress1Value = nativeIds();
        const nw_afterProgress1Value = nwIds();

        document.getElementById('progress2')?.removeAttribute('value');
        const native_afterProgress2Remove = nativeIds();
        const nw_afterProgress2Remove = nwIds();

        (document.getElementById('checkbox1') as HTMLInputElement).indeterminate = true;

        return {
          native_initial,
          nw_initial,
          native_afterCheckedAttr,
          nw_afterCheckedAttr,
          native_afterRadio4Click,
          nw_afterRadio4Click,
          native_afterProgress1Value,
          nw_afterProgress1Value,
          native_afterProgress2Remove,
          nw_afterProgress2Remove,
        };
      });

      expect(result.native_initial).toEqual(['radio2', 'radio3', 'radio4', 'radio5', 'progress1']);
      expect(result.nw_initial).toEqual(['radio2', 'radio3', 'radio4', 'radio5', 'progress1']);

      expect(result.native_afterCheckedAttr).toEqual(['radio4', 'radio5', 'progress1']);
      expect(result.nw_afterCheckedAttr).toEqual(['radio4', 'radio5', 'progress1']);

      expect(result.native_afterRadio4Click).toEqual(['progress1']);
      expect(result.nw_afterRadio4Click).toEqual(['progress1']);

      expect(result.native_afterProgress1Value).toEqual([]);
      expect(result.nw_afterProgress1Value).toEqual([]);

      expect(result.native_afterProgress2Remove).toEqual(['progress2']);
      expect(result.nw_afterProgress2Remove).toEqual(['progress2']);
    },
    cases: [
      { select: ':indeterminate', expect: { ids: ['checkbox1', 'progress2'] } },
    ]
  },

  {
    name: 'html/semantics/selectors/pseudo-classes/inrange-outofrange-type-change',
    html: `
      <input id="t1" type="text" min="0" max="10" value="5">
      <span id="sibling1">This text should be green.</span>
      <input id="t2" type="text" min="0" max="10" value="50">
      <span id="sibling2">This text should be green.</span>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const native_inRange_before = [...document.querySelectorAll('#t1:in-range + span')].map(el => el.id);
        const nw_inRange_before = NW.Dom.select('#t1:in-range + span', document).map(el => el.id);

        const native_outOfRange_before = [...document.querySelectorAll('#t2:out-of-range + span')].map(el => el.id);
        const nw_outOfRange_before = NW.Dom.select('#t2:out-of-range + span', document).map(el => el.id);

        (document.getElementById('t1') as HTMLInputElement).type = 'number';
        (document.getElementById('t2') as HTMLInputElement).type = 'number';

        return {
          native_inRange_before,
          nw_inRange_before,
          native_outOfRange_before,
          nw_outOfRange_before,
        };
      });

      expect(result.native_inRange_before).toEqual([]);
      expect(result.nw_inRange_before).toEqual([]);

      expect(result.native_outOfRange_before).toEqual([]);
      expect(result.nw_outOfRange_before).toEqual([]);
    },
    cases: [
      { select: '#t1:in-range + span', expect: { ids: ['sibling1'] } },
      { select: '#t2:out-of-range + span', expect: { ids: ['sibling2'] } },
    ]
  },















]);









