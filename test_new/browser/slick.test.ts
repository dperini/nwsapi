import { expect, type Page } from "@playwright/test";
import { readFileSync } from 'node:fs';
import { runScenarios, type Scenario, type TestCase } from "./harness/scenarios";

const fixtures = {
  htmlTransitional: readFileSync('test_new/browser/fixtures/slick/template-transitional.html', 'utf8'),
  htmlStandard: readFileSync('test_new/browser/fixtures/slick/template-standard.html', 'utf8'),
  htmlAlmost: readFileSync('test_new/browser/fixtures/slick/template-almost.html', 'utf8'),
  htmlQuirks: readFileSync('test_new/browser/fixtures/slick/template-quirks.html', 'utf8'),
  xhtml: readFileSync('test_new/browser/fixtures/slick/template.xhtml', 'utf8'),
  xml: readFileSync('test_new/browser/fixtures/slick/template.xml', 'utf8'),
  svg: readFileSync('test_new/browser/fixtures/slick/MooTools_Logo.svg', 'utf8'),
} as const;

type TemplateKey = 'html-standard' | 'html-almost' | 'html-quirks' | 'xhtml' | 'html-transitional' | 'xml' | 'svg';
type TemplateTuple = readonly [TemplateKey, string];

const allTemplates: TemplateTuple[] = [
  ['html-transitional', fixtures.htmlTransitional],
  ['html-standard', fixtures.htmlStandard],
  ['html-almost', fixtures.htmlAlmost],
  ['html-quirks', fixtures.htmlQuirks],
  ['xhtml', fixtures.xhtml],
  ['xml', fixtures.xml],
  ['svg', fixtures.svg],
] as const;

const xmlTemplates: TemplateTuple[] = [
  ['xhtml', fixtures.xhtml],
  ['xml', fixtures.xml],
  ['svg', fixtures.svg],
] as const;

const htmlTemplates: TemplateTuple[] = [
  ['html-transitional', fixtures.htmlTransitional],
  ['html-standard', fixtures.htmlStandard],
  ['html-almost', fixtures.htmlAlmost],
  ['html-quirks', fixtures.htmlQuirks],
] as const;

const browserBugTemplates: TemplateTuple[] = [
  ['html-standard', fixtures.htmlStandard],
  ['html-almost', fixtures.htmlAlmost],
  ['html-quirks', fixtures.htmlQuirks],
  ['xhtml', fixtures.xhtml],
] as const;

type BugWin = Window & typeof globalThis & {
  __slick: {
    getHost(): HTMLElement;
    resetHost(): HTMLElement;
    setHostHTML(html: string): HTMLElement;
    add(tag: string, attrs?: Record<string, string>, parent?: Element): HTMLElement;
  };
};

runScenarios('slick', 'normal', [
  {
    name: 'bootstrap/isxml-legacy-xml',
    markupMode: 'xml-document',
    markup: `<root><child /></root>`,
    setupPage: async (page) => {
      const isXml = await page.evaluate(() => {
        const legacyIsXML = (element: Document | Element) => {
          const ownerDocument = element.ownerDocument || element;
          return !('body' in ownerDocument) ||
            !('innerHTML' in ownerDocument.documentElement) ||
            ownerDocument.createElement('DiV').nodeName === 'DiV';
        };

        return legacyIsXML(document);
      });

      expect(isXml).toBe(true);
    },
    cases: [],
  },

  {
    name: 'bootstrap/isxml-legacy-html',
    markupMode: 'html-document',
    markup: `<!doctype html><html><body><div></div></body></html>`,
    setupPage: async (page) => {
      const isXml = await page.evaluate(() => {
        const legacyIsXML = (element: Document | Element) => {
          const ownerDocument = element.ownerDocument || element;
          return !('body' in ownerDocument) ||
            !('innerHTML' in ownerDocument.documentElement) ||
            ownerDocument.createElement('DiV').nodeName === 'DiV';
        };

        return legacyIsXML(document);
      });

      expect(isXml).toBe(false);
    },
    cases: [],
  },

  {
    name: 'api/context-basics',
    markup: `
      <div id="outer">
        <section id="scope">
          <span class="x"></span>
          <em></em>
        </section>
        <span class="x"></span>
      </div>`,
    cases: [
      { select: '.x', ref: { by: 'id', id: 'scope' }, expect: { count: 1 } },
      { select: '*', ref: { by: 'documentElement' }, expect: { count: 7 } },
      { byTag: '*', ref: { by: 'id', id: 'scope' }, expect: { count: 2 } },
    ],
  },

  ...browserBugTemplates.map(([name, markup]) => (
  {
    name: `browser-bugs/${name}`,
    markup,
    markupMode: 'html-document',
    setupPage: async (page) => {
      await initPage(page, name);
    },
    steps: [
      {
        // getElementsByName Should match name attribute
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'getelementsbyname', type: 'password', class: 'tmpNode2' });
            win.__slick.add('input', { name: 'getelementsbyname', type: 'text', class: 'tmpNode1' });
          });
        },
        cases: [
          // Not migrated as a real case because byName is not supported by NW and
          // { byName: 'getelementsbyname', expect: { count: 1, classes: ['tmpNode1'] }, engines: ['native'] },
        ],
      },
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementsbyname', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementsbyname', type: 'password', class: 'tmpNode2' });
          });
        },
        cases: [
          // Not migrated as a real case because byName is not supported by NW and
          // { byName: 'getelementsbyname', expect: { count: 1, classes: ['tmpNode1'] }, engines: ['native'] },
        ],
      },

      {
        // getElementsByName Should NOT match id attribute
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'getelementsbyname', type: 'password', class: 'tmpNode2' });
            win.__slick.add('input', { name: 'getelementsbyname', type: 'text', class: 'tmpNode1' });
          });
        },
        cases: [
          // Not migrated as a real case because byName is not supported by NW and
          // { byName: 'getelementsbyname', expect: { count: 1, classes: ['tmpNode1'] }, engines: ['native'] },
        ],
      },
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementsbyname', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementsbyname', type: 'password', class: 'tmpNode2' });
          });
        },
        cases: [
          // Not migrated as a real case because byName is not supported by NW and
          // { byName: 'getelementsbyname', expect: { count: 1, classes: ['tmpNode1'] }, engines: ['native'] },
        ],
      },

      {
        // getElementsByName Should match name attribute, using innerHTML
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.innerHTML =
              '<input id="getelementsbyname" type="password" class="tmpNode2" />' +
              '<input name="getelementsbyname" type="text" class="tmpNode1" />';
          });
        },
        cases: [
          // Not migrated as a real case because byName is not supported by NW and
          // { byName: 'getelementsbyname', expect: { count: 1, classes: ['tmpNode1'] }, engines: ['native'] },
        ],
      },
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.innerHTML =
              '<input name="getelementsbyname" type="password" class="tmpNode1" />' +
              '<input id="getelementsbyname" type="text" class="tmpNode2" />';
          });
        },
        cases: [
          // Not migrated as a real case because byName is not supported by NW and
          // { byName: 'getelementsbyname', expect: { count: 1, classes: ['tmpNode1'] }, engines: ['native'] },
        ],
      },

      {
        // getElementById Should NOT match name attribute
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementbyid', type: 'password', class: 'tmpNode2' });
          });
        },
        cases: [
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
        ],
      },
      {
        // getElementById Should match id attribute
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementbyid', type: 'password', class: 'tmpNode2' });
          });
        },
        cases: [
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
        ],
      },
      {
        // getElementsById Should match id attribute, using innerHTML
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.innerHTML =
              '<input name="getelementbyid" type="password" class="tmpNode1" />' +
              '<input id="getelementbyid" type="text" class="tmpNode2" />';
          });
        },
        cases: [
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
        ],
      },

      {
        // getElementsByClassName Should match second class name
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { class: 'getelementsbyclassname secondclass', type: 'text' });
          });
        },
        cases: [
          { byClass: 'secondclass', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
        ],
      },
      {
        // getElementsByClassName Should match second class name, using innerHTML
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.innerHTML = '<a class="getelementsbyclassname secondclass"></a>';
          });
        },
        cases: [
          { byClass: 'secondclass', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
        ],
      },
      {
        // getElementsByClassName Should not cache results
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.innerHTML = '<a class="f"></a><a class="b"></a>';
            host.getElementsByClassName('b').length; // force initial access, matching original intent
            (host.firstChild as Element).className = 'b';
          });
        },
        cases: [
          { byClass: 'b', ref: { by: 'id', id: 'host' }, expect: { count: 2 } },
        ],
      },

      {
        // getElementsByTagName Should not return comment nodes with * selector
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.appendChild(document.createComment(''));
          });
        },
        cases: [
          { byTag: '*', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
        ],
      },
      {
        // getElementsByTagName Should not return closed nodes
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.innerHTML = 'foo</foo>';
          });
        },
        cases: [
          { byTag: '*', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
        ],
      },

      {
        // querySelector Should start finding nodes from the passed context
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'queryselectorall', type: 'text' });
          });
        },
        cases: [
          { first: 'div #queryselectorall', ref: { by: 'id', id: 'host' }, expect: { count: 0 }, status: 'fixme' }, // probably legacy behavior
        ],
      },
      {
        // querySelector Should not return a comment node with * selector
        setupPage: async (page) => {
          await page.evaluate(() => {
            const host = (window as BugWin).__slick.resetHost();
            host.appendChild(document.createComment(''));
          });
        },
        cases: [
          { first: '*', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
        ],
      },
      {
        // querySelector Should not return closed nodes
        setupPage: async (page) => {
          await page.evaluate(() => {
            const host = (window as BugWin).__slick.resetHost();
            host.innerHTML = 'foo</foo>';
          });
        },
        cases: [
          { first: '*', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
        ],
      },

      {
        // querySelectorAll Should start finding nodes from the passed context
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'queryselectorall', type: 'text' });
          });
        },
        cases: [
          { select: 'div #queryselectorall', ref: { by: 'id', id: 'host' }, expect: { count: 0 }, status: 'fixme' }, // probably legacy behavior
        ],
      },
      {
        // querySelectorAll Should not return comment nodes with * selector
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.appendChild(document.createComment(''));
          });
        },
        cases: [
          { select: '*', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
        ],
      },
      {
        // querySelectorAll Should not return closed nodes
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.innerHTML = 'foo</foo>';
          });
        },
        cases: [
          { select: '*', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
        ],
      },

      // Omitted from migration: XPath
      // Reason: harness models CSS selectors, not legacy XPath DOM APIs.

    ],
  } satisfies Scenario)),

  {
    name: 'dojo/basic-selectors',
    markup: `
      <html>
        <head>
          <title>testing dojo.query()</title>
          <style type="text/css">
            /* @import "../../resources/dojo.css";*/
          </style>
          <script type="text/javascript">
          </script>
        </head>
        <body>
          <h1>testing dojo.query()</h1>
          <div id="t">
            <h3>h3 <span>span</span> endh3 </h3>
            <!-- comment to throw things off -->
            <div class="foo bar" id="_foo">
              <h3>h3</h3>
              <span id="foo"></span>
              <span></span>
            </div>
            <h3>h3</h3>
            <h3 class="baz foobar" title="thud">h3</h3>
            <span class="fooBar baz foo"></span>
            <span foo="bar"></span>
            <span foo="baz bar thud"></span>
            <!-- FIXME: should foo="bar-baz-thud" match? [foo$=thud] ??? -->
            <span foo="bar-baz-thudish" id="silly:id::with:colons"></span>
            <div id="container">
              <div id="child1" qux="true"></div>
              <div id="child2"></div>
              <div id="child3" qux="true"></div>
            </div>
            <div qux="true"></div>
            <input id="notbug" name="bug" type="hidden" value="failed"> 
            <input id="bug" type="hidden" value="passed"> 
          </div>
          <div id="t2">
            <input type="checkbox" name="checkbox1" id="checkbox1" value="foo">
            <input type="checkbox" name="checkbox2" id="checkbox2" value="bar" checked>

            <input type="radio" name="radio" id="radio1" value="thinger">
            <input type="radio" name="radio" id="radio2" value="stuff" checked>
            <input type="radio" name="radio" id="radio3" value="blah">
          </div>
          <select id="t2select" multiple="multiple">
            <option>0</option>
            <option selected="selected">1</option>
            <option selected="selected">2</option>
          </select>
          
          <iframe id="t3" name="t3" src="blank.html"></iframe>
          <div id="t4">
            <div id="one" class="subDiv">
              <p class="one subP"><a class="subA">one</a></p>
              <div id="two" class="subDiv">
                <p class="two subP"><a class="subA">two</a></p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    markupMode: 'html-document',
    cases: [
      // basic sanity checks
      { select: 'h3', expect: { count: 4 } },
      { select: 'h1:first-child', expect: { count: 1 } },
      { select: 'h3:first-child', expect: { count: 2 } },
      { select: '#t', expect: { count: 1 } },
      { select: '#bug', expect: { count: 1 } },
      { select: '#t h3', expect: { count: 4 } },
      { select: 'div#t', expect: { count: 1 } },
      { select: 'div#t h3', expect: { count: 4 } },
      { select: 'span#t', expect: { count: 0 } },
      { select: '.bogus', expect: { count: 0 } },
      { select: '.bogus', ref: { by: 'id', id: 'container' }, expect: { count: 0 } },
      { select: '#bogus', expect: { count: 0 } },
      { select: '#bogus', ref: { by: 'id', id: 'container' }, expect: { count: 0 } },
      { select: '#t div > h3', expect: { count: 1 } },
      { select: '.foo', expect: { count: 2 } },
      { select: '.foo.bar', expect: { count: 1 } },
      { select: '.baz', expect: { count: 2 } },
      { select: '#t > h3', expect: { count: 3 } },

      { select: '#baz,#foo,#t', expect: { count: 2 } },

      // classnames aren't case sensitive, only attribute selectors and xml tagnames, this spec is invalid
			// modified from `1` to `2` because the element classname property is case insensitive (dperini)
      { select: '.fooBar', expect: { count: 2 } },

      // modified from `1` to `2` because classes from the class attribute of HTML elements in documents
			// that are in quirks mode must be treated as ASCII case-insensitive. (jddalton)
			// document is not in quirks mode, tested compatMode to be CSS1Compat (dperini)
			// http://www.whatwg.org/specs/web-apps/current-work/#selectors
      { select: '[class~=foobar]', expect: { count: 1 } },
      { select: '[class~=fooBar]', expect: { count: 1 } },

      // syntactic equivalents
      { select: '#t > *', expect: { count: 12 } },
      { select: '.foo > *', expect: { count: 3 } },
      // { select: '#t >', expect: { count: 12 } },
      // { select: '.foo >', expect: { count: 3 } },

      // with a root, by ID
      { select: ':scope > *', ref: { by: 'id', id: 'container' }, expect: { count: 3 } },
      { select: ':scope > h3', ref: { by: 'id', id: 't' }, expect: { count: 3 } },

      // compound queries
      { select: '.foo, .bar', expect: { count: 2 } },
      { select: '.foo,.bar', expect: { count: 2 } },

      // multiple class attribute
      { select: '.foo.bar', expect: { count: 1 } },
      { select: '.foo', expect: { count: 2 } },
      { select: '.baz', expect: { count: 2 } },

      // case sensitivity
      { select: 'span.baz', expect: { count: 1 } },
      { select: 'sPaN.baz', expect: { count: 1 }, status: 'fixme' },
      { select: 'SPAN.baz', expect: { count: 1 }, status: 'fixme' },
      { select: '[class = "foo bar"]', expect: { count: 1 } },
      { select: '[foo~="bar"]', expect: { count: 2 } },
      { select: '[ foo ~= "bar" ]', expect: { count: 2 } },

      { select: `[ foo ~= "'bar'" ]`, expect: { count: 0 } },
      { select: '[foo]', expect: { count: 3 } },
      { select: '[foo$="thud"]', expect: { count: 1 } },
      { select: '[foo$=thud]', expect: { count: 1 } },
      { select: '[foo$="thudish"]', expect: { count: 1 } },
      { select: '#t [foo$=thud]', expect: { count: 1 } },
      { select: '#t [ title $= thud ]', expect: { count: 1 } },
      { select: '#t span[ title $= thud ]', expect: { count: 0 } },

      // Original expected 1, but this mock has two matching elements.
      { select: '[foo|="bar"]', expect: { count: 2 } },

      { select: '[foo|="bar-baz"]', expect: { count: 1 } },
      { select: '[foo|="baz"]', expect: { count: 0 } },

      { select: '.foo:nth-child(2)', expect: { ids: ['_foo'] } },
      { first: ':nth-child(2)', expect: { equivalentCase: { first: 'style' } } },

      // descendant selectors
      // { select: ':scope >', ref: { by: 'id', id: 'container' }, expect: { count: 3 } },
      { select: ':scope > *', ref: { by: 'id', id: 'container' }, expect: { count: 3 } },
      { select: ':scope > [qux]', ref: { by: 'id', id: 'container' }, expect: { count: 2, ids: ['child1', 'child3'] } },

      { select: '#bug', expect: { ids: ['bug'] } },

      // bug 9071
      { select: 'a', ref: { by: 'id', id: 't4' }, expect: { count: 2 } },
      { select: 'p a', ref: { by: 'id', id: 't4' }, expect: { count: 2 } },
      { select: 'div p', ref: { by: 'id', id: 't4' }, expect: { count: 2 } },
      { select: 'div p a', ref: { by: 'id', id: 't4' }, expect: { count: 2 } },
      { select: '.subA', ref: { by: 'id', id: 't4' }, expect: { count: 2 } },
      { select: '.subP .subA', ref: { by: 'id', id: 't4' }, expect: { count: 2 } },
      { select: '.subDiv .subP', ref: { by: 'id', id: 't4' }, expect: { count: 2 } },
      { select: '.subDiv .subP .subA', ref: { by: 'id', id: 't4' }, expect: { count: 2 } },

      // failed scope arg
      { select: 'div#foo', expect: { count: 0 } },

      // Removed as this is specific to Dojo API (jddalton)
      // { select: '*', ref: { by: 'id', id: 'thinger' }, expect: { count: 0 } },

      // sibling selectors
      // { select: ':scope + *', ref: { by: 'id', id: 'container' }, expect: { count: 1 } },
      // { select: ':scope ~ *', ref: { by: 'id', id: 'container' }, expect: { count: 3 } },
      { select: '.foo + span', expect: { count: 1 } },
      { select: '.foo ~ span', expect: { count: 4 } },
      { select: '#foo ~ *', expect: { count: 1 } },
      // { select: '#foo ~', expect: { count: 1 } },

      // sub-selector parsing
      { select: '#t span.foo:not(span:first-child)', expect: { count: 1 } },
      { select: '#t span.foo:not(:first-child)', expect: { count: 1 } },

      // nth-child tests
      { select: '#t > h3:nth-child(odd)', expect: { count: 2 } },
      { select: '#t h3:nth-child(odd)', expect: { count: 3 } },
      { select: '#t h3:nth-child(2n+1)', expect: { count: 3 } },
      { select: '#t h3:nth-child(even)', expect: { count: 1 } },
      { select: '#t h3:nth-child(2n)', expect: { count: 1 } },
      { select: '#t h3:nth-child(2n+3)', expect: { count: 1 } },
      { select: '#t h3:nth-child(1)', expect: { count: 2 } },
      { select: '#t > h3:nth-child(1)', expect: { count: 1 } },
      { select: '#t :nth-child(3)', expect: { count: 3 } },
      { select: '#t > div:nth-child(1)', expect: { count: 0 } },
      { select: '#t span', expect: { count: 7 } },
      { select: '#t > *:nth-child(n+10)', expect: { count: 3 } },
      { select: '#t > *:nth-child(n+12)', expect: { count: 1 } },
      { select: '#t > *:nth-child(-n+10)', expect: { count: 10 } },
      { select: '#t > *:nth-child(-2n+10)', expect: { count: 5 } },
      { select: '#t > *:nth-child(2n+2)', expect: { count: 6 } },
      { select: '#t > *:nth-child(2n+4)', expect: { count: 5 } },
      { select: '#t > *:nth-child(2n+4)', expect: { count: 5 } },
      { select: '#t > *:nth-child(n-5)', expect: { count: 12 } },
      { select: '#t > *:nth-child(2n-5)', expect: { count: 6 } },

      // :checked pseudo-selector
      { select: '#t2 > :checked', expect: { count: 2 } },
      { first: '#t2 > input[type=checkbox]:checked', expect: { ids: ['checkbox2'] } },
      { first: '#t2 > input[type=radio]:checked', expect: { ids: ['radio2'] } },
      { select: '#t2select option:checked', expect: { count: 2 } },

      // :empty pseudo-selector
      { select: '#t > span:empty', expect: { count: 4 } },
      { select: '#t span:empty', expect: { count: 6 } },
      { select: 'h3 span:empty', expect: { count: 0 } },
      { select: 'h3 :not(:empty)', expect: { count: 1 } },

      // escaping of ":" chars inside an ID
      { byId: 'silly:id::with:colons', expect: { count: 1 } },
      { select: '#silly\\:id\\:\\:with\\:colons', expect: { count: 1 } },
    ],
  },

  {
    name: 'dojo/cross-document-query',
    markupMode: 'html-document',
    markup: `
      <iframe id="t3" srcdoc="
        <html>
          <head><title>inner document</title></head>
          <body>
            <div id='st1'>
              <h3>h3 <span>span <span> inner <span>inner-inner</span></span></span> endh3 </h3>
            </div>
          </body>
        </html>">
      </iframe>
    `,
    cases: [
      { select: 'h3', ref: { by: 'id', id: 'st1', within: { by: 'iframe', id: 't3' } }, expect: { count: 1 } },

      // use a long query to force a test of the XPath system on FF. see bug #7075
      { select: 'h3 > span > span > span', ref: { by: 'id', id: 'st1', within: { by: 'iframe', id: 't3' } }, expect: { count: 1 } },

      { select: 'h3 > span > span > span', ref: { by: 'first', selector: 'body > *', within: { by: 'iframe', id: 't3' } }, expect: { count: 1 } },
    ],
  },

  {
    name: 'dojo/xml-case-sensitivity',
    markupMode: 'xml-document',
    markup: `
      <ResultSet>
        <Result>One</Result>
        <RESULT>Two</RESULT>
        <result>Three</result>
        <result>Four</result>
      </ResultSet>
    `,
    cases: [
      { select: 'result', expect: { count: 2 } },
      { select: 'Result', expect: { count: 1 } },
      { select: 'RESULT', expect: { count: 1 } },
      { select: 'resulT', expect: { count: 0 } },
      { select: 'rEsulT', expect: { count: 0 } },
    ],
  },

  {
    name: 'dojo/xml-attrs',
    markupMode: 'xml-document',
    markup: `
      <ResultSet>
        <RESULT thinger='blah'>Two</RESULT>
        <RESULT thinger='gadzooks'>Two</RESULT>
      </ResultSet>
    `,
    cases: [
      { select: 'RESULT', expect: { count: 2 } },
      { select: 'RESULT[THINGER]', expect: { count: 0 } },
      { select: 'RESULT[thinger]', expect: { count: 2 } },
      { select: 'RESULT[thinger=blah]', expect: { count: 1 } },
    ],
  },

  ...allTemplates.map(([name, markup]) => (
  {
    name: `engine-bugs/${name}`,
    markup,
    markupMode: name === 'xml' || name === 'svg' ? 'xml-document' : 'html-document',
    setupPage: async (page) => {
      await initPage(page, name);
    },
    steps: [
      {
        // 1) document should have a documentElement / should have nodes
        cases: [
          { select: '*', ref: { by: 'documentElement' } },
          { byTag: '*' },
          { select: '*' },
        ],
      },
      {
        // 2) Malformed closing markup should not produce divergent * results
        setupPage: async (page) => {
          await page.evaluate((n) => {
            const win = window as BugWin;
            const isXmlLike = n === 'xml' || n === 'svg';

            win.__slick.resetHost();

            // can't set innerHTML to malformed markup in XML documents, so can only test html-like docs
            if (!isXmlLike) {
              win.__slick.setHostHTML('foo</foo>');
            }
          }, name);
        },
        cases: [
          { select: '*', ref: { by: 'id', id: 'host' } },
          { byTag: '*', ref: { by: 'id', id: 'host' } },
        ],
      },
      {
        // 3) Broad traversal should stay equivalent
        // * should not surface comment nodes as selected elements
        cases: [
          { select: '*' },
          { byTag: '*' },
        ],
      },

      {
        // 4) Selecting by the second class should still match
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('span', { class: 'class1 class2', className: 'class1 class2' });
          });
        },
        cases: [
          { select: '.class2', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
          { byClass: 'class2', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
        ],
      },

      // Class matching should track attribute removal and re-assignment
      {
        // 5) Initial state: two .b nodes
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('span', { id: 'tmpNode1', class: 'b', className: 'b' });
            win.__slick.add('span', { id: 'tmpNode2', class: 'b', className: 'b' });
          });
        },
        cases: [
          { select: '.b', ref: { by: 'id', id: 'host' }, expect: { count: 2 } },
          { byClass: 'b', ref: { by: 'id', id: 'host' }, expect: { count: 2 } },
          { select: '.f', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
          { byClass: 'f', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
          { select: '[class|=b]', ref: { by: 'id', id: 'host' }, expect: { count: 2 } },
          { select: '[class=b]', ref: { by: 'id', id: 'host' }, expect: { count: 2 } },
        ],
      },
      {
        // 6) After changing tmpNode1 from .b to .f
        setupPage: async (page) => {
          await page.evaluate(() => {
            const node = document.getElementById('tmpNode1');
            if (!node) throw new Error('tmpNode1 not found');
            node.removeAttribute('class');
            node.removeAttribute('className');
            node.setAttribute('class', 'f');
            node.setAttribute('className', 'f');
          });
        },
        cases: [
          { select: '.b', ref: { by: 'id', id: 'tmpNode1' }, expect: { count: 0 } },
          { byClass: 'b', ref: { by: 'id', id: 'tmpNode1' }, expect: { count: 0 } },
          { select: '.b', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
          { byClass: 'b', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
          { select: '.f', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
          { byClass: 'f', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
        ],
      },
      {
        // 7) After changing tmpNode1 back from .f to .b
        setupPage: async (page) => {
          await page.evaluate(() => {
            const node = document.getElementById('tmpNode1');
            if (!node) throw new Error('tmpNode1 not found');
            node.removeAttribute('class');
            node.removeAttribute('className');
            node.setAttribute('class', 'b');
            node.setAttribute('className', 'b');
          });
        },
        cases: [
          { select: '.b', ref: { by: 'id', id: 'host' }, expect: { count: 2 } },
          { byClass: 'b', ref: { by: 'id', id: 'host' }, expect: { count: 2 } },
          { select: '.f', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
          { byClass: 'f', ref: { by: 'id', id: 'host' }, expect: { count: 0 } },
        ],
      },

      {
        // 8) Detached context subtree should still support id selection within itself
        setupPage: async (page) => {
          const mismatch = await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'someuniqueid', type: 'text' });

            const host = win.__slick.getHost();
            host.remove();

            const native = [...host.querySelectorAll('#someuniqueid')];
            const nw = NW.Dom.select('#someuniqueid', host);

            const same = native.length === nw.length && native.every((el, i) => el === nw[i]);
            if (!same) return `Detached query mismatch: native=${native.length}, nw=${nw.length}`;
            return undefined;
          });

          expect(mismatch).toBeUndefined();
        },
        cases: [],
      },


      // [name=...] should match the name attribute, not a sibling id with the same value
      {
        // id-first, then name
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'getelementsbyname', type: 'password' });
            win.__slick.add('input', { id: 'tmpNode1', name: 'getelementsbyname', type: 'text' });
          });
        },
        cases: [
          { select: '[name=getelementsbyname]', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
        ],
      },
      {
        // name-first, then id
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'tmpNode1', name: 'getelementsbyname', type: 'text' });
            win.__slick.add('input', { id: 'getelementsbyname', type: 'password' });
          });
        },
        cases: [
          { select: '[name=getelementsbyname]', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
        ],
      },

      // [name=...] should not match a sibling id with the same value
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'getelementsbyname', type: 'password', class: 'tmpNode2' });
            win.__slick.add('input', { name: 'getelementsbyname', type: 'text', class: 'tmpNode1' });
          });
        },
        cases: [
          { select: '[name=getelementsbyname]', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode1'] } },
        ],
      },
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementsbyname', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementsbyname', type: 'password', class: 'tmpNode2' });
          });
        },
        cases: [
          { select: '[name=getelementsbyname]', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode1'] } },
        ],
      },

      // Should NOT match name attribute
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementbyid', type: 'password', class: 'tmpNode2' });
          });
        },
        cases: [
          { select: '#getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
        ],
      },

      // Should NOT match name attribute, using innerHTML
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            const host = win.__slick.resetHost();
            host.innerHTML = '<input name="getelementbyid" type="text" class="tmpNode1" /><input id="getelementbyid" type="password" class="tmpNode2" />';
          });
        },
        cases: [
          { select: '#getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
        ],
      },

      // Should match id attribute, even when another element has that [name]
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementbyid', type: 'password', class: 'tmpNode2' });
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode3' });
          });
        },
        cases: [
          { select: '#getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
        ],
      },


      // Should match id attribute, even when another element has that [name], using innerHTML
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementbyid', type: 'password', class: 'tmpNode2' });
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode3' });
          });
        },
        cases: [
          { select: '#getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'] } },
        ],
      },

      // Should get just the first matched element with passed id, using innerHTML
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode1' });
            win.__slick.add('input', { id: 'getelementbyid', type: 'password', class: 'tmpNode2' });
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode3' });
            win.__slick.add('input', { id: 'getelementbyid', type: 'text', class: 'tmpNode4' });
          });
        },
        cases: [
          { select: '#getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2', 'tmpNode4'], count: 2 } },
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2', 'tmpNode4'], count: 2 }, status: 'fixme' },
        ],
      },

      // Should get just the first matched element with passed id, using innerHTML, changing nodes orders
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            win.__slick.add('input', { id: 'getelementbyid', type: 'password', class: 'tmpNode1' });
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode2' });
            win.__slick.add('input', { name: 'getelementbyid', type: 'text', class: 'tmpNode3' });
            win.__slick.add('input', { id: 'getelementbyid', type: 'text', class: 'tmpNode4' });
          });
        },
        cases: [
          { select: '#getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode1'], count: 1 }, status: 'fail' }, // legacy is wrong..
          { byId: 'getelementbyid', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode1'], count: 1 }, status: 'fixme' }, // mismatch
        ],
      },

      // Should match the selected option
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            const sel = win.__slick.add('select');
            win.__slick.add('option', { value: '1', class: 'tmpNode2' }, sel).textContent = 'opt1';
            win.__slick.add('option', { value: '2', class: 'tmpNode3' }, sel).textContent = 'opt2';
          });
        },
        cases: [
          { select: ':selected', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode2'], count: 1 }, status: 'skip' }, // unsupported
        ],
      },

      // Should not match the first element from a multiple select
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const win = window as BugWin;
            win.__slick.resetHost();
            const sel = win.__slick.add('select', { multiple: 'multiple' });
            win.__slick.add('option', { value: '1', class: 'tmpNode2' }, sel).textContent = 'opt1';
            win.__slick.add('option', { value: '2', selected: 'selected', class: 'tmpNode3' }, sel).textContent = 'opt2';
          });
        },
        cases: [
          { select: ':selected', ref: { by: 'id', id: 'host' }, expect: { classes: ['tmpNode3'], count: 1 }, status: 'skip' }, // unsupported
        ],
      },
    ],

  } satisfies Scenario)),

  {
    name: 'google_closure',
    markupMode: 'html-document',
    markup: `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Closure Unit Tests - goog.dom</title>
      </head>
      <body>
        <h1>testing goog.dom.query()</h1>
        <div id="t">
          <h3>h3 <span>span</span> endh3 </h3>
          <!-- comment to throw things off -->
          <div class="foo bar" id="_foo">
            <h3>h3</h3>
            <span id="foo"></span>
            <span></span>
          </div>
          <h3>h3</h3>
          <h3 class="baz" title="thud">h3</h3>
          <span class="foobar baz foo"></span>
          <span foo="bar"></span>
          <span foo="baz bar thud"></span>
          <!-- FIXME: should foo="bar-baz-thud" match? [foo$=thud] ??? -->
          <span foo="bar-baz-thudish" id="silly:id::with:colons"></span>
          <div id="container">
            <div id="child1" qux="true"></div>
            <div id="child2"></div>
            <div id="child3" qux="true"></div>
          </div>
          <div qux="true"></div>
          <input id="notbug" name="bug" type="hidden" value="failed">
          <input id="bug" type="hidden" value="passed">
        </div>

        <div class="myupperclass">
          <span class="myclass">
            <input id="myid1">
          </span>
          <span class="myclass">
            <input id="myid2">
          </span>
        </div>

        <iframe name=ifr id=ifrid></iframe>
        <div id=iframe-test>
          <div id=if1>
            <div class=if2>
              <div id=if3></div>
            </div>
          </div>
        </div>

      </body>
      </html>
    `,
    cases: [
      // testBasicSelectors
      { select: 'h3', expect: { count: 4 } },
      { select: 'h1:first-child', expect: { count: 1 } },
      { select: 'h3:first-child', expect: { count: 2 } },
      { select: '#t', expect: { count: 1 } },
      { select: '#bug', expect: { count: 1 } },
      { select: '#t h3', expect: { count: 4 } },
      { select: 'div#t', expect: { count: 1 } },
      { select: 'div#t h3', expect: { count: 4 } },
      { select: 'span#t', expect: { count: 0 } },
      { select: '#t div > h3', expect: { count: 1 } },
      { select: '.foo', expect: { count: 2 } },
      { select: '.foo.bar', expect: { count: 1 } },
      { select: '.baz', expect: { count: 2 } },
      { select: '#t > h3', expect: { count: 3 } },

      // testSyntacticEquivalents
      { select: '#t > *', expect: { count: 12 } },
      { select: '#t >', expect: { throws: true } },
      { select: '.foo > *', expect: { count: 3 } },
      { select: '.foo >', expect: { throws: true } },

      // testWithARootById
      { select: ':scope > *', ref: { by: 'id', id: 'container' }, expect: { count: 3 } },
      { select: ':scope > h3', ref: { by: 'id', id: 't' }, expect: { count: 3 } },

      // testCompoundQueries
      { select: '.foo, .bar', expect: { count: 2 } },
      { select: '.foo,.bar', expect: { count: 2 } },

      // testMultipleClassAttributes
      { select: '.foo.bar', expect: { count: 1 } },
      { select: '.foo', expect: { count: 2 } },
      { select: '.baz', expect: { count: 2 } },

      // testCaseSensitivity
      { select: 'span.baz', expect: { count: 1 } },
      { select: 'sPaN.baz', expect: { count: 1 }, status: 'fixme' },
      { select: 'SPAN.baz', expect: { count: 1 }, status: 'fixme' },
      { select: '[class = "foo bar"]', expect: { count: 1 } },
      { select: '[foo~="bar"]', expect: { count: 2 } },
      { select: '[ foo ~= "bar" ]', expect: { count: 2 } },

      // testAttributes
      { select: '[foo]', expect: { count: 3 } },
      { select: '[foo$="thud"]', expect: { count: 1 } },
      { select: '[foo$=thud]', expect: { count: 1 } },
      { select: '[foo$="thudish"]', expect: { count: 1 } },
      { select: '#t [foo$=thud]', expect: { count: 1 } },
      { select: '#t [ title $= thud ]', expect: { count: 1 } },
      { select: '#t span[ title $= thud ]', expect: { count: 0 } },
      { select: '[foo|="bar"]', expect: { count: 2 } },
      { select: '[foo|="bar-baz"]', expect: { count: 1 } },
      { select: '[foo|="baz"]', expect: { count: 0 } },

      // testDescendantSelectors
      { select: '>', ref: { by: 'id', id: 'container' }, expect: { throws: true } },
      { select: ':scope > *', ref: { by: 'id', id: 'container' }, expect: { count: 3 } },
      { select: ':scope > [qux]', ref: { by: 'id', id: 'container' }, expect: { count: 2, ids: ['child1', 'child3'] } },

      // testSiblingSelectors
      { select: '+', expect: { throws: true } },
      { select: '~', expect: { throws: true } },
      { select: '.foo + span', expect: { count: 1 } },
      { select: '.foo ~ span', expect: { count: 4 } },
      { select: '#foo ~ *', expect: { count: 1 } },
      { select: '#foo ~', expect: { throws: true } },

      // testSubSelectors
      { select: '#t span.foo:not(span:first-child)', expect: { count: 1 } },
      { select: '#t span.foo:not(:first-child)', expect: { count: 1 } },

      // testNthChild
      { select: '.foo:nth-child(2)', expect: { ids: ['_foo'] } },
      { select: '#t > h3:nth-child(odd)', expect: { count: 2 } },
      { select: '#t h3:nth-child(odd)', expect: { count: 3 } },
      { select: '#t h3:nth-child(2n+1)', expect: { count: 3 } },
      { select: '#t h3:nth-child(even)', expect: { count: 1 } },
      { select: '#t h3:nth-child(2n)', expect: { count: 1 } },
      { select: '#t h3:nth-child(2n+3)', expect: { count: 1 } },
      { select: '#t h3:nth-child(1)', expect: { count: 2 } },
      { select: '#t > h3:nth-child(1)', expect: { count: 1 } },
      { select: '#t :nth-child(3)', expect: { count: 3 } },
      { select: '#t > div:nth-child(1)', expect: { count: 0 } },
      { select: '#t span', expect: { count: 7 } },
      { select: '#t > *:nth-child(n+10)', expect: { count: 3 } },
      { select: '#t > *:nth-child(n+12)', expect: { count: 1 } },
      { select: '#t > *:nth-child(-n+10)', expect: { count: 10 } },
      { select: '#t > *:nth-child(-2n+10)', expect: { count: 5 } },
      { select: '#t > *:nth-child(2n+2)', expect: { count: 6 } },
      { select: '#t > *:nth-child(2n+4)', expect: { count: 5 } },
      { select: '#t > *:nth-child(2n+4)', expect: { count: 5 } },
      { select: '#t > *:nth-child(n-5)', expect: { count: 12 } },
      { select: '#t > *:nth-child(2n-5)', expect: { count: 6 } },

      // testEmptyPseudoSelector
      { select: '#t > span:empty', expect: { count: 4 } },
      { select: '#t span:empty', expect: { count: 6 } },
      { select: 'h3 span:empty', expect: { count: 0 } },
      { select: 'h3 :not(:empty)', expect: { count: 1 } },

      // testIdsWithColons
      { select: "[id = 'silly:id::with:colons']", expect: { count: 1 } },
      { select: '#silly\\:id\\:\\:with\\:colons', expect: { count: 1 } },

      // testOrder
      { select: '.myupperclass .myclass input', expect: { ids: ['myid1', 'myid2'], count: 2 } },
    ],
    steps: [
      // testCorrectDocumentInFrame
      {
        setupPage: async (page) => {
          await page.evaluate(() => {
            const frameDocument = (window.frames as any)['ifr'].document;
            if (!frameDocument) throw new Error('frame document not found');
            const src = document.getElementById('iframe-test');
            if (!src) throw new Error('#iframe-test not found');
            frameDocument.body.innerHTML = src.innerHTML;
          });
        },
        cases: [
          { select: '#if1 .if2 div', ref: { by: 'iframe', id: 'ifrid' }, expect: { ids: ['if3'], count: 1 } },
          { select: '#if1 .if2 div', ref: { by: 'id', id: 'iframe-test' }, expect: { ids: ['if3'], count: 1 } },
          {
            select: '#if1 .if2 div', ref: { by: 'id', id: 'iframe-test' },
            expect: { equivalentCase: { select: '#if1 .if2 div', ref: { by: 'iframe', id: 'ifrid' } } },
            status: 'fail',
          },
        ],
      },
    ],
  },

  {
    name: 'slick_html',
    markupMode: 'html-document',
    markup: `
      <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
      <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en" dir="ltr" id="html">
        <head>
          <meta http-equiv="Content-type" content="text/html; charset=utf-8" />
          <title>Mootools Query Test</title>
        </head>
        <body>
          <a id="atabindex0" title="some" tabindex="0" href="#">some</a>
          <a id="atabindex1" title="some" tabindex="1" href="#">some</a>
          <a id="atabindexnull" title="some" href="#">some</a>
          <div id="divtabindex0" tabindex="0">some</div>
          <div id="divtabindex1" tabindex="1">some</div>
          <div id="divtabindexnull">some</div>

          <div id="one"><i>text</i></div>
          <div id="two"></div>
        </body>
      </html>
    `,
    cases: [
      // Slick
      { select: 'body a[tabindex="0"]', expect: { ids: ['atabindex0'], count: 1 } },
      { first: 'body a[tabindex="0"]', expect: { ids: ['atabindex0'], count: 1 } },
      { match: 'body a[tabindex="0"]', ref: { by: 'id', id: 'atabindex0' }, expect: { ids: ['atabindex0'], count: 1 } },

      { select: 'body a[tabindex="1"]', expect: { ids: ['atabindex1'], count: 1 } },
      { first: 'body a[tabindex="1"]', expect: { ids: ['atabindex1'], count: 1 } },
      { match: 'body a[tabindex="1"]', ref: { by: 'id', id: 'atabindex1' }, expect: { ids: ['atabindex1'], count: 1 } },

      { select: 'body a[tabindex]', expect: { ids: ['atabindex0', 'atabindex1'], count: 2 } },
      { first: 'body a[tabindex]', expect: { ids: ['atabindex0'], count: 1 } },
      { match: 'body a[tabindex]', ref: { by: 'id', id: 'atabindex0' }, expect: { ids: ['atabindex0'], count: 1 } },

      { select: 'body [tabindex="0"]', expect: { ids: ['atabindex0', 'divtabindex0'], count: 2 } },
      { first: 'body [tabindex="0"]', expect: { ids: ['atabindex0'], count: 1 } },
      { match: 'body [tabindex="0"]', ref: { by: 'id', id: 'atabindex0' }, expect: { ids: ['atabindex0'], count: 1 } },

      { select: 'body [tabindex="1"]', expect: { ids: ['atabindex1', 'divtabindex1'], count: 2 } },
      { first: 'body [tabindex="1"]', expect: { ids: ['atabindex1'], count: 1 } },
      { match: 'body [tabindex="1"]', ref: { by: 'id', id: 'atabindex1' }, expect: { ids: ['atabindex1'], count: 1 } },

      { select: 'body [tabindex]', expect: { ids: ['atabindex0', 'atabindex1', 'divtabindex0', 'divtabindex1'], count: 4 } },
      { first: 'body [tabindex]', expect: { ids: ['atabindex0'], count: 1 } },
      { match: 'body [tabindex]', ref: { by: 'id', id: 'atabindex0' }, expect: { ids: ['atabindex0'], count: 1 } },

      // Combinators
      { select: '#one ~ *', expect: { count: 1 } },
      { select: '#one ~ div', expect: { count: 1 } },
      { select: '#one > i', expect: { count: 1 } },
      { select: '#one + *', expect: { count: 1 } },
      { select: '#one + div', expect: { count: 1 } },

      { select: ':scope ~ *', ref: { by: 'id', id: 'one' }, expect: { count: 0 } },
      { select: ':scope ~ div', ref: { by: 'id', id: 'one' }, expect: { count: 0 } },
      { select: ':scope > i', ref: { by: 'id', id: 'one' }, expect: { count: 1 } },
      { select: ':scope + *', ref: { by: 'id', id: 'one' }, expect: { count: 0 } },
      { select: ':scope + div', ref: { by: 'id', id: 'one' }, expect: { count: 0 } },
    ],
  },


  {
    name: 'html5',
    markupMode: 'html-document',
    markup: `
      <!DOCTYPE html>
      <html lang="en-AU"><head>
        <meta charset="UTF-8">
        <title>HTML 5 Reference</title>
      </head>
      <body>

      <div id="page">
          <header role="banner">
              <h1><a href="#x">Hi</a></h1>
              <nav>
                  <a href="#x">1</a>
                  <a href="#x">2</a>
              </nav>
          </header>
      </div>

      <input type="search">

      <section>
        <h2 class="no-num no-toc" id="abstract">Abstract</h2>

        <p>This document illustrates how to write HTML 5 documents, focussing on
          simplicity and practical applications for beginners while also providing
          in depth information for more advanced web developers.</p>
      </section>

      <!-- Status -->
      <section>
        <h2 class="no-num no-toc" id="status">Status of this document</h2>
        <p><em>This section describes the status of this document at the time of its
          publication. Other documents may supersede this document. A list of
          current W3C publications and the latest revision of this technical report
          can be found in the <a href="http://www.w3.org/TR/">W3C technical reports
          index</a> at http://www.w3.org/TR/.</em></p>

        <p>This document is an Editors Draft of the “HTML 5 Reference”
          produced by the <a href="http://www.w3.org/html/wg/">HTML Working Group</a>,
          part of the <a href="http://www.w3.org/MarkUp/Activity">HTML Activity</a>.
          The working group is working on HTML 5 (see the
          <a href="http://www.w3.org/html/wg/html5/">HTML 5 Editor's draft</a>).
          The appropriate forum for comments on this document is
          <a href="mailto:public-html-comments@w3.org">public-html-comments@w3.org</a>
          (<a href="http://lists.w3.org/Archives/Public/public-html-comments/" title="Archive for HTML comments mailing-list">public archive</a>)
          or <a href="mailto:public-html@w3.org">public-html@w3.org</a>

          (<a href="http://lists.w3.org/Archives/Public/public-html/" title="Archive for HTML mailing-list">public archive</a>).</p>

        <p>Publication as a Working Group Note does not imply endorsement by the W3C
          Membership. This is a draft document and may be updated, replaced or
          obsoleted by other documents at any time. It is inappropriate to cite
          this document as other than work in progress.</p>

        <p>This document was produced by a group operating under the
          <a href="http://www.w3.org/Consortium/Patent-Policy-20040205/">5 February 2004 W3C Patent Policy</a>.
          W3C maintains a <a href="http://www.w3.org/2004/01/pp-impl/40318/status" rel="disclosure">public list of any patent disclosures</a>
          made in connection with the deliverables of the group; that page also
          includes instructions for disclosing a patent. An individual who has
          actual knowledge of a patent which the individual believes contains
          <a href="http://www.w3.org/Consortium/Patent-Policy-20040205/#def-essential">Essential Claim(s)</a>

          must disclose the information in accordance with
          <a href="http://www.w3.org/Consortium/Patent-Policy-20040205/#sec-Disclosure">section 6 of the W3C Patent Policy</a>.</p>
      </section>

      </body>
      </html>
    `,
    cases: [
      // HTML5 new tags

      { select: 'section', expect: { count: 2 } },
      { first: 'section' },
      { match: 'section', ref: { by: 'id', id: 'abstract' } },

      { select: '#page header nav', expect: { count: 1 } },
      { first: '#page header nav', expect: { count: 1 } },
      { match: '#page header nav', ref: { by: 'first', selector: '#page header nav' }, expect: { count: 1 } },

      { select: 'header[role="banner"]', expect: { count: 1 } },
      { first: 'header[role="banner"]', expect: { count: 1 } },
      { match: 'header[role="banner"]', ref: { by: 'first', selector: 'header[role="banner"]' }, expect: { count: 1 } },

      { select: 'input[type="search"]', expect: { count: 1 } },
      { first: 'input[type="search"]', expect: { count: 1 } },
      { match: 'input[type="search"]', ref: { by: 'first', selector: 'input[type="search"]' }, expect: { count: 1 } },
    ],
  },

  ...xmlTemplates.map(([name, markup]) => ({
    name: `isXml/${name}`,
    markup,
    markupMode: 'xml-document',
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const legacyIsXML = (element: Document | Element) => {
          const ownerDocument = element.ownerDocument || element;
          return !('body' in ownerDocument) ||
            !('innerHTML' in ownerDocument.documentElement) ||
            ownerDocument.createElement('DiV').nodeName === 'DiV';
        };

        return {
          nodeType: document.nodeType,
          // isGlobalDoc: document === window.document,
          isXml: legacyIsXML(document),
        };
      });

      expect(result.nodeType).toBe(9);
      // expect(result.isGlobalDoc).toBe(false);
      expect(result.isXml).toBe(true);
    },
  } satisfies Scenario)),

  ...htmlTemplates.map(([name, markup]) => ({
    name: `isNotXml/${name}`,
    markup,
    markupMode: 'html-document',
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const legacyIsXML = (element: Document | Element) => {
          const ownerDocument = element.ownerDocument || element;
          return !('body' in ownerDocument) ||
            !('innerHTML' in ownerDocument.documentElement) ||
            ownerDocument.createElement('DiV').nodeName === 'DiV';
        };

        return {
          nodeType: document.nodeType,
          // isGlobalDoc: document === window.document,
          isXml: legacyIsXML(document),
        };
      });

      expect(result.nodeType).toBe(9);
      // expect(result.isGlobalDoc).toBe(false);
      expect(result.isXml).toBe(false);
    },
  } satisfies Scenario)),

  {
    name: 'match/basic-empty-string',
    markupMode: 'html-body',
    markup: `<div id="testNode"></div>`,
    cases: [
      { match: '', ref: { by: 'id', id: 'testNode' }, expect: { throws: true } },
    ],
  },

  {
    name: 'match/attributes',
    markupMode: 'html-body',
    markup: `
      <div id="test1" attr="test you!"></div>
      <div id="test2" attr="test"></div>
      <div id="test3" attr="you!"></div>
    `,
    cases: [
      { select: `[attr='test you!']`, expect: { ids: ['test1'] } },
      { select: `[attr='test me!']`, expect: { ids: [] } },

      { select: `[attr^='test']`, expect: { ids: ['test1', 'test2'] } },
      { select: `[attr^=' test']`, expect: { ids: [] } },

      { select: `[attr$='you!']`, expect: { ids: ['test1', 'test3'] } },
      { select: `[attr$='you! ']`, expect: { ids: [] } },

      { match: `[attr='test you!']`, ref: { by: 'id', id: 'test1' }, expect: { ids: ['test1'] } },
      { match: `[attr='test me!']`, ref: { by: 'id', id: 'test1' }, expect: { ids: [] } },

      { match: `[attr^='test']`, ref: { by: 'id', id: 'test2' }, expect: { ids: ['test2'] } },
      { match: `[attr^=' test']`, ref: { by: 'id', id: 'test2' }, expect: { ids: [] } },

      { match: `[attr$='you!']`, ref: { by: 'id', id: 'test3' }, expect: { ids: ['test3'] } },
      { match: `[attr$='you! ']`, ref: { by: 'id', id: 'test3' }, expect: { ids: [] } },
    ],
  },

  {
    name: 'match/deep',
    markupMode: 'html-body',
    markup: `
      <div>
        <b class="b b1" id="b1">
          <a class="a"> lorem </a>
        </b>
        <b class="b b2" id="b2">
          <a id="a_tag1" class="a">
            lorem
          </a>
        </b>
      </div>
    `,
    cases: [
      { match: '*',               ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: 'a',               ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: ':not(a)',         ref: { by: 'id', id: 'a_tag1' }, expect: { ids: [] } },
      { match: 'del',             ref: { by: 'id', id: 'a_tag1' }, expect: { ids: [] } },
      { match: ':not(del)',       ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: '[id]',            ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: ':not([id])',      ref: { by: 'id', id: 'a_tag1' }, expect: { ids: [] } },
      { match: '[class]',         ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: ':not([class])',   ref: { by: 'id', id: 'a_tag1' }, expect: { ids: [] } },
      { match: '.a',              ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: ':not(.a)',        ref: { by: 'id', id: 'a_tag1' }, expect: { ids: [] } },

      { match: '* *',             ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: '* > *',           ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: '* ~ *',           ref: { by: 'id', id: 'a_tag1' }, expect: { ids: [] } },
      { match: '* + *',           ref: { by: 'id', id: 'a_tag1' }, expect: { ids: [] } },
      { match: 'b a',             ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: 'b > a',           ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: 'div > b > a',     ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: 'div > b + b > a', ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: 'div > b ~ b > a', ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
      { match: 'div a',           ref: { by: 'id', id: 'a_tag1' }, expect: { ids: ['a_tag1'] } },
    ],
  },


  ...htmlTemplates.map(([name, markup]) => ({
    name: `mockTemplates/${name}`,
    markup,
    markupMode: 'html-document',
    cases: [
      ...triFind(1, 'html'),
      ...triFind(1, 'body'),

      // removes 'tel:' 'a' tags that are just grabbed by iphone
      ...triFind(1814, 'body *:not([href^="tel:"])'),

      ...triFind(1, 'html'),
      ...triFind(1, 'body'),
      ...triFind(1, 'head'),
      ...triFind(59, 'div'),

      ...triFind(43, '.example'),
      ...triFind(14, '.note'),
      ...triFind(5, '.fn'),

      ...triFind(4, '.a1'),
      ...triFind(2, '.a1 .a1'),
      ...triFind(2, '.a1   .a1'),
      ...triFind(2, '.a1 > .a1'),
      ...triFind(0, '.a1 + .a1'),

      ...triFind(12, '.a1   *'),
      ...triFind(3, '.a1 > *'),
      ...triFind(2, '.a1 + *'),
      ...triFind(6, '.a1 ~ *'),

      // Remove custom selectors (jddalton)
      // .a1 !  * / !> / !+ / !~ are old Slick custom combinators; skipped here.

      ...triFind(4, '.a4'),
      ...triFind(2, '.a4   .a4'),
      ...triFind(2, '.a4 > .a4'),
      ...triFind(0, '.a4 + .a4'),

      ...triFind(324, 'body [class]:not([href^="tel:"])'),
      ...triFind(13, 'body [title]:not([href^="tel:"])'),
      ...triFind(1490, 'body :not([class]):not([href^="tel:"])'),
      ...triFind(1801, 'body :not([title]):not([href^="tel:"])'),

      ...triFind(59, 'body div'),

      ...triFind(140, 'div p'),
      ...triFind(140, 'div  p'),

      ...triFind(134, 'div > p'),
      ...triFind(22, 'div + p'),
      ...triFind(183, 'div ~ p'),

      // subContext = third div, i.e. first `div.example`
      { select: 'p', ref: { by: 'first', selector: 'div.example' }, expect: { count: 3 } },
      { select: ':scope > *', ref: { by: 'first', selector: 'div.example' }, expect: { count: 5 } },
      { select: ':scope > p', ref: { by: 'first', selector: 'div.example' }, expect: { count: 3 } },
      // { select: '+ *', expect: { count: 1 } },
      // { select: '+ p', expect: { count: 2 } },
      // { select: '~ *', expect: { count: 281 } },
      // { select: '~ p', expect: { count: 152 } },

      ...triFind(43, 'div[class^=exa][class$=mple]'),
      ...triFind(12, 'div p a:not([href^="tel:"])'),
      ...triFind(683, 'div,p,a:not([href^="tel:"])'),

      ...triFind(43, 'DIV.example', 'fixme'),
      ...triFind(43, 'DiV.example', 'fixme'),
      ...triFind(12, 'ul .tocline2'),
      ...triFind(44, 'div.example,div.note'),

      ...triFind(1, '#title'),
      ...triFind(0, '#theres_no_such_id'),
      ...triFind(1, 'h1#title'),
      ...triFind(1, 'body #title'),

      ...triFind(12, 'ul.toc li.tocline2'),
      ...triFind(12, 'ul.toc > li.tocline2'),
      ...triFind(0, 'h1#title + div > p'),

      // pseudos
      ...triFind(16, 'div:not(.example)'),
      ...triFind(158, 'p:nth-child(even)'),
      ...triFind(158, 'p:nth-child(2n)'),
      ...triFind(166, 'p:nth-child(odd)'),
      ...triFind(166, 'p:nth-child(2n+1)'),
      ...triFind(324, 'p:nth-child(n)'),
      ...triFind(3, 'p:only-child'),
      ...triFind(19, 'p:last-child'),
      ...triFind(54, 'p:first-child'),

      ...triFind(1, ':root'),
      ...triFind(1, 'html:root > head:first-child'),
      ...triFind(0, 'body:root'),

      // Remove custom selector (jddalton)
      // `a ! :root` is an old Slick custom selector/combinator; skipped here.

      ...triFind(12, ':root ul .tocline2'),
      ...triFind(0, 'body :root'),

      // `:contains(...)` is a nonstandard/custom selector; skipped here.

      ...triFind(1, '[href][lang][class]'),
      ...triFind(324, '[class]'),

      ...triFind(43, '[class=example]'),
      ...triFind(43, '[class^=exa]'),
      ...triFind(44, '[class$=mple]'),

      // Remove invalid selectors (jddalton)
      // `[class^=]`, `[class$=]`, `[class*=]` are invalid; skipped here.

      ...triFind(0, '[class^=""]'),
      ...triFind(0, '[class$=""]'),
      ...triFind(0, '[class*=""]'),

      ...triFind(1, '[lang|=tr]'),
      ...triFind(324, '[class][class!=made_up]', 'skip'), // `!=` isn't supported
      ...triFind(43, '[class~=example]'),
    ],

  } satisfies Scenario)),


  ...allTemplates.map(([name, markup]) => ({
    name: `selectExhaustive/${name}`,
    status: name === 'html-quirks' ? 'fixme' : 'normal',
    markup,
    markupMode: name === 'xhtml' || name === 'xml' || name === 'svg' ? 'xml-document' : 'html-document',
    setupPage: async (page) => {
      await initPage(page, name);
      await page.evaluate((n) => {
        const win = window as BugWin;

        const CLASSES = [
          'normal',
          'escaped,character',
          'ǝpoɔıun',
          '瀡',
          'with-dash',
          'with_underscore',
          'number123',
          'MiXeDcAsE',
        ];

        win.__slick.resetHost();
        win.__slick.add('div', { id: 'all-classes', class: CLASSES.join(' ') });
        CLASSES.forEach((cls, i) => {
          win.__slick.add('div', { id: `single-${i}`, class: cls });
          win.__slick.add('div', { id: `second-${i}`, class: `dummy ${cls}` });
        });
      }, name);
    },
    cases: [
      ...triScope(1, '.normal.escaped\\,character.ǝpoɔıun.瀡.with-dash.with_underscore.number123.MiXeDcAsE'),
      
      ...triScope(3, '.normal'),
      ...triScope(1, '.dummy.normal'),

      ...triScope(3, '.escaped\\,character'),
      ...triScope(1, '.dummy.escaped\\,character'),

      ...triScope(3, '.ǝpoɔıun'),
      ...triScope(1, '.dummy.ǝpoɔıun'),

      ...triScope(3, '.瀡'),
      ...triScope(1, '.dummy.瀡'),

      ...triScope(3, '.with-dash'),
      ...triScope(1, '.dummy.with-dash'),

      ...triScope(3, '.with_underscore'),
      ...triScope(1, '.dummy.with_underscore'),

      ...triScope(3, '.number123'),
      ...triScope(1, '.dummy.number123'),

      ...triScope(3, '.MiXeDcAsE'),
      ...triScope(1, '.dummy.MiXeDcAsE'),
    ],
  } satisfies Scenario)),

  ...allTemplates.map(([name, markup]) => ({
    name: `selectNthChild/${name}`,
    markup,
    markupMode: getMarkupMode(name),
    setupPage: async (page) => {
      await initPage(page, name);
      await page.evaluate((n) => {
        const win = window as BugWin;
        const host = win.__slick.resetHost();
        for (let i = 1; i <= 10; i++) {
          win.__slick.add('div', { id: `${i}` }, host);
        }
      }, name);
    },
    cases: [
      { select: ':nth-child(0)', ref: { by: 'id', id: 'host' }, expect: { ids: [] } },
      { select: ':nth-child(1)', ref: { by: 'id', id: 'host' }, expect: { ids: ['1'] } },
      { select: ':nth-child(10)', ref: { by: 'id', id: 'host' }, expect: { ids: ['10'] } },
      { select: ':nth-child(11)', ref: { by: 'id', id: 'host' }, expect: { ids: [] } },

      { select: ':nth-child(-1)', ref: { by: 'id', id: 'host' }, expect: { ids: [] } },

      { select: ':nth-child(even)', ref: { by: 'id', id: 'host' }, expect: { ids: ['2', '4', '6', '8', '10'] } },
      { select: ':nth-child(odd)', ref: { by: 'id', id: 'host' }, expect: { ids: ['1', '3', '5', '7', '9'] } },

      { select: ':nth-child(-n)', ref: { by: 'id', id: 'host' }, expect: { ids: [] } },
      { select: ':nth-child(4n+100)', ref: { by: 'id', id: 'host' }, expect: { ids: [] } },

      { select: ':nth-child(n)', ref: { by: 'id', id: 'host' }, expect: { ids: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] } },
      { select: ':nth-child(-n+100)', ref: { by: 'id', id: 'host' }, expect: { ids: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] } },

      { select: ':nth-child(2n+5)', ref: { by: 'id', id: 'host' }, expect: { ids: ['5', '7', '9'] } },
      { select: ':nth-child(n+8)', ref: { by: 'id', id: 'host' }, expect: { ids: ['8', '9', '10'] } },

      { select: ':nth-child(-2n+5)', ref: { by: 'id', id: 'host' }, expect: { ids: ['1', '3', '5'] } },
      { select: ':nth-child(-4n+2)', ref: { by: 'id', id: 'host' }, expect: { ids: ['2'] } },
      { select: ':nth-child(-n+2)', ref: { by: 'id', id: 'host' }, expect: { ids: ['1', '2'] } },

      { select: ':nth-child(2n):nth-child(3n+1)', ref: { by: 'id', id: 'host' }, expect: { ids: ['4', '10'] } },
      { select: ':nth-child(n+3):nth-child(-n+5)', ref: { by: 'id', id: 'host' }, expect: { ids: ['3', '4', '5'] } },

      { select: ':nth-child(odd):nth-last-child(odd)', ref: { by: 'id', id: 'host' }, expect: { ids: [] } },
    ],
  } satisfies Scenario)),

  {
    name: 'xml',
    markupMode: 'xml-document',
    markup: `<?xml version="1.0" encoding="UTF-8" ?>
      <HTML>
        <datael>tes</datael>
        <datael>
          <test>html</test>
        </datael>
        <idnode id="id_idnode"></idnode>
        <datael>tes</datael>
        <classnode class="class_classNode"></classnode>
        <classnode id="node" style="border" class="class_classNode"></classnode>
        <classnode href="http://url.com" class="class_classNode"></classnode>
        <camelCasedTag></camelCasedTag>
        <camelCasedTag></camelCasedTag>
        <camelCasedTag>text</camelCasedTag>
        <!-- a xml comment -->
        <empty-attr attr=""></empty-attr>
        <empty-attr attr="some"></empty-attr>
        <el tabindex="0"></el>
        <el tabindex="0"></el>
        <el tabindex="1"></el>
      </HTML>
    `,
    cases: [
      { select: '*', expect: { count: 17 } },

      { select: 'HTML', expect: { count: 1 } },
      { select: '#id_idnode', expect: { count: 1 } },
      { select: '[id=id_idnode]', expect: { count: 1 } },
      { select: '.class_classNode', expect: { count: 3 } },
      { select: '[class=class_classNode]', expect: { count: 3 } },
      { select: '[className=class_classNode]', expect: { count: 0 } },
      { select: 'camelCasedTag', expect: { count: 3 } },
      { select: '#node[style=border]', expect: { count: 1 } },
      { select: '[href^="http://"]', expect: { count: 1 } },

      { select: ':root', expect: { count: 1 } },
      { select: 'html:root', expect: { count: 0 } },
      { select: 'HTML:root', expect: { count: 1 } },

      // Remove custom selectors (jddalton)
      // 'camelCasedTag ! :root'
      // ':root !>'

      { select: ':root camelCasedTag', expect: { count: 3 } },

      { select: '[tabindex]', expect: { count: 3 } },
      { select: 'el[tabindex="0"]', expect: { count: 2 } },
      { select: 'el[tabindex="1"]', expect: { count: 1 } },
    ],
  },

  {
    name: 'yui',
    markupMode: 'html-document',
    markup: `
      <!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
      <html>
        <head>
          <title>YUI Selector Test Suite</title>
          <meta http-equiv="Content-type" content="text/html; charset=utf-8" />
        </head>
        <body class="yui-skin-sam">
          <div id="demo" class="foo" title="this is a demo">
            <p class="para first" id="demo-first-child"><em>lorem ipsum</em></p>
            <p class="para">lorem ipsum</p>
            <p class="para last">lorem ipsum</p>
            <div><p>div lorem</p></div>
            <div id="demo-last-child"><p>last child</p></div>
          </div>

          <div id="demo2">
            <div>child of demo2</div>
          </div>

          <div id="empty"></div>

          <select id="test-select" name="test-select"> 
            <option value="0">foo</option> 
            <option value="1">bar</option> 
            <option>baz</option> 
          </select> 
          <div id="root-test">
            <ol id="nth-test">
              <li class="odd three-1 four-1">foo</li>
              <li class="even four-2 last-four-1">foo</li>
              <li class="odd four-3">foo</li>
              <li class="even three-1 four-4">foo</li>
              <li class="odd four-1">foo</li>
              <li class="even four-2 last-four-1">foo</li>
              <li class="odd three-1 four-3">foo</li>
              <li class="even four-4" id="test-lang-none">foo</li>
              <li class="odd four-1" lang="en-US" id="test-lang-en-us">foo</li>
              <li class="even three-1 four-2 last-four-1" lang="en" id="test-lang-en">foo</li>
            </ol>
          </div>
          <div id="nth-type-test">
            <span>span</span>
            <div>first div</div>
            <span>span</span>
            <div class="even">second div</div>
            <div>third div</div>
            <div class="even">fourth div</div> 
            <span>span</span>
          </div>
          <a id="href-test" href="foo.html">foo</a>
          <form id="test-inputs">
            <label for="checkbox-unchecked" id="label-checkbox-unchecked">label</label>
            <input type="checkbox" id="checkbox-unchecked" class="not-button">
            <input type="checkbox" checked id="checkbox-checked-noval" class="not-button">
            <input type="checkbox" checked="true" id="checkbox-checked" class="not-button">
            <input type="radio" id="radio-unchecked" class="not-button">
            <input type="radio" checked="true" id="radio-checked" class="not-button">
            <input type="button" value="foo">
            <input id="foo-bar" name="foo.bar" class="not-button">
          </form>

          <form id="form-root">
            <input type="button" value="foo">
            <input name="foo" class="text-input">
          </form>

          <div id="mod1">
            <div><h3>H3 - Title</h3></div>
            <div><p>lorem ipsum dolor sit <a href="#"><span>link</span></a></p></div>
          </div>

          <div class="Bar" id="class-bar"></div>
          <div id="contains-special">contains "' & ]</div>
          <div id="test-rel-div" rel="foo2"></div>
          <iframe src="test-frame.html" id="test-frame"></iframe>

          <dl id="test-dl">
            <dt>Window size</dt>
            <dd class="test-dd1">dd1</dd>
            <dt>Document size</dt>
            <dd class="test-dd2">dd2</dd>

          </dl>
          <div id="test-custom-attr" foo="bar">custom attribute</div>

        </body>
      </html>
    `,
    cases: [
      // testTest
      { select: '[type=checkbox]' },
      { match: '[type=checkbox], button', ref: { by: 'id', id: 'checkbox-unchecked' }, expect: { ids: ['checkbox-unchecked'] } },
      { match: 'button, [type=checkbox]', ref: { by: 'id', id: 'checkbox-unchecked' }, expect: { ids: ['checkbox-unchecked'] } },
      { match: 'foo, button', ref: { by: 'id', id: 'checkbox-unchecked' }, expect: { ids: [] } },
      { match: '[lang|=en]', ref: { by: 'id', id: 'test-lang-en-us' }, expect: { ids: ['test-lang-en-us'] } },
      { match: '[lang|=en]', ref: { by: 'id', id: 'test-lang-en' }, expect: { ids: ['test-lang-en'] } },
      { match: '[lang|=en]', ref: { by: 'id', id: 'test-lang-none' }, expect: { ids: [] } },
      { match: 'for [type=checkbox]', ref: { by: 'id', id: 'checkbox-unchecked' }, expect: { ids: [] } },
      { match: 'form [type=checkbox]', ref: { by: 'id', id: 'checkbox-unchecked' }, expect: { ids: ['checkbox-unchecked'] } },

      { match: '[type=checkbox]:checked', ref: { by: 'id', id: 'checkbox-checked' }, expect: { ids: ['checkbox-checked'] } },
      { match: ':checked', ref: { by: 'id', id: 'radio-checked' }, expect: { ids: ['radio-checked'] } },
      { match: ':checked', ref: { by: 'id', id: 'radio-unchecked' }, expect: { ids: [] } },
      { match: '[type=checkbox]:checked', ref: { by: 'id', id: 'checkbox-unchecked' }, expect: { ids: [] } },
      { match: '[type=checkbox]:not(:checked)', ref: { by: 'id', id: 'checkbox-unchecked' }, expect: { ids: ['checkbox-unchecked'] } },

      { match: 'dd', ref: { by: 'first', selector: 'dd.test-dd1' }, expect: { count: 1 } }, // dd (dd1)
      { match: 'dd', ref: { by: 'first', selector: 'dd.test-dd2' }, expect: { count: 1 } }, // dd (dd2)

      { match: '.test-dd2', ref: { by: 'first', selector: 'dd.test-dd1' }, expect: { count: 0 } }, // .test-dd2 (dd1)
      { match: '.test-dd1', ref: { by: 'first', selector: 'dd.test-dd2' }, expect: { count: 0 } }, // .test-dd1 (dd2)

      { match: '.test-dd1', ref: { by: 'first', selector: 'dd.test-dd1' }, expect: { count: 1 } }, // .test-dd1
      { match: '.test-dd2', ref: { by: 'first', selector: 'dd.test-dd2' }, expect: { count: 1 } }, // .test-dd2

      { match: 'dd', ref: { by: 'first', selector: 'dd.test-dd1' }, expect: { count: 1 } }, // dd (dd1)
      { match: 'dd', ref: { by: 'first', selector: 'dd.test-dd2' }, expect: { count: 1 } }, // dd (dd2)

      // testRootQuery
      { select: 'li', expect: { count: 10 } },
      { select: '#root-test li', expect: { count: 10 } },
      { select: '#root-tes li', ref: { by: 'id', id: 'demo' }, expect: { count: 0 } },

      { first: 'a span', ref: { by: 'id', id: 'mod1' }, expect: { count: 1 } },
      { first: 'a', ref: { by: 'id', id: 'mod1' }, expect: { count: 1 } },
      { select: 'a span, a', ref: { by: 'id', id: 'mod1' }, expect: { count: 2 } },
      { select: 'a, a span', ref: { by: 'id', id: 'mod1' }, expect: { count: 2 } },

      { select: 'body p', ref: { by: 'first', selector: 'body' }, expect: { count: 6 } },
      { select: '#root-test li', ref: { by: 'id', id: 'nth-test' }, expect: { count: 10 } },

      // testNthLastChild
      { select: 'li:nth-last-child(odd)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.even', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-last-child(2n)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.odd', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-last-child(even)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.odd', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-last-child(2n+0)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.odd', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-last-child(2n+1)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.even', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-last-child(4n+1)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.last-four-1', ref: { by: 'id', id: 'nth-test' } } } },

      // testNthType
      { select: 'li:nth-of-type(odd)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.odd', ref: { by: 'id', id: 'nth-test' } } } },
      { select: '#nth-type-test div:nth-of-type(even)', expect: { equivalentCase: { select: '#nth-type-test div.even' } } },
      { select: '#nth-type-test div:nth-of-type(2n)', expect: { equivalentCase: { select: '#nth-type-test div.even' } } },
      { select: '#nth-type-test div:nth-of-type(3)' },

      // testNthChild
      { select: 'li:nth-child(2)', ref: { by: 'id', id: 'nth-test' } },
      { select: 'li:nth-child(0n+2)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li:nth-child(2)', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(3n+1)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.three-1', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(n+1)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(2n+1)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.odd', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(odd)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.odd', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(2n+0)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.even', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(2n)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.even', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(even)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.even', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(4n+1)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.four-1', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(4n+2)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.four-2', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(4n+3)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.four-3', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(4n+4)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li.four-4', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(0n+1)', ref: { by: 'id', id: 'nth-test' } },
      { select: 'li:nth-child(1)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li:nth-child(0n+1)', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(1n+0)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li', ref: { by: 'id', id: 'nth-test' } } } },
      { select: 'li:nth-child(n+0)', ref: { by: 'id', id: 'nth-test' }, expect: { equivalentCase: { select: 'li', ref: { by: 'id', id: 'nth-test' } } } },

      // testQuery
      { select: 'p, p', expect: { equivalentCase: { select: 'p' } } },
      { first: 'p', expect: { count: 1 } },
      { select: '.Foo', expect: { count: 0 } },
      { select: '#root-test', expect: { count: 1, ids: ['root-test'] } },
      { select: '#demo.bar p', expect: { count: 0 } },
      { select: '#demo.foo p', expect: { equivalentCase: { select: '#demo p' } } },
      { select: '.foo p', expect: { equivalentCase: { select: '#demo p' } } },
      { select: '#demo p', expect: { count: 5 } },
      { select: 'p > em', expect: { count: 1, equivalentCase: { first: '#demo-first-child > *' } } },
      { select: '[class~=para]', expect: { count: 3 } },
      { select: '[class~="para"]', expect: { equivalentCase: { select: '[class~=para]' } } },
      { select: 'body div p', expect: { count: 6 } },
      { select: '#demo .madeup', expect: { count: 0 } },
      { select: 'div .para', expect: { count: 3 } },
      { select: '#demo .first', expect: { count: 1, ids: ['demo-first-child'] } },
      { select: 'div', expect: { count: 19 } },
      { select: 'body div', expect: { count: 19 } },
      { select: '.Bar', expect: { count: 1, ids: ['class-bar'] } },
      { select: '#fake-id-not-in-doc', expect: { count: 0 } },
      { first: 'label[for=checkbox-unchecked]', expect: { count: 1, ids: ['label-checkbox-unchecked'] } },
      { select: '.not-button', ref: { by: 'id', id: 'test-inputs' }, expect: { equivalentCase: { select: 'input:not([type=button])', ref: { by: 'id', id: 'test-inputs' } } } },
      { first: '#test-select', expect: { count: 1, ids: ['test-select'] } },
      { first: '[rel^=style]' },
      { first: 'div[rel^=foo2]', expect: { count: 1, ids: ['test-rel-div'] } },
      { first: "div[rel^='foo2']", expect: { equivalentCase: { first: 'div[rel^=foo2]' } } },
      { first: "input[name='foo.bar']", expect: { count: 1, ids: ['foo-bar'] } },
      { select: '#demo > p:not(.last)', expect: { count: 2, includesIds: ['demo-first-child'] } },
      { first: "[id^='foo-']", expect: { count: 1, ids: ['foo-bar'] } },
      { first: '#test-custom-attr[foo=bar]', expect: { count: 1, ids: ['test-custom-attr'] } },
      { first: 'div[foo=bar]', expect: { equivalentCase: { first: '#test-custom-attr[foo=bar]' } } },
      { first: 'div#test-custom-attr[foo=bar]', expect: { equivalentCase: { first: '#test-custom-attr[foo=bar]' } } },
      { first: 'div[foo]', expect: { count: 1, ids: ['test-custom-attr'] } },
      { select: '[foo]', expect: { count: 1, ids: ['test-custom-attr'] } },

      // testPseudo
      { match: ':last-child', ref: { by: 'id', id: 'demo-last-child' }, expect: { count: 1 } },
      { match: 'p:first-child', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 1, ids: ['demo-first-child'] } },
      { match: ':first-child', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 1, ids: ['demo-first-child'] } },
      { match: ':first-child.last', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 0 } },
      { match: ':first-child.first', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 1, ids: ['demo-first-child'] } },
      { match: ':only-child', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 0 } },
      { match: ':not(p)', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: ':not(.last)', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 1, ids: ['demo-first-child'] } },
      { match: ':first-of-type', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 1, ids: ['demo-first-child'] } },
      { match: ':last-of-type', ref: { by: 'id', id: 'demo-last-child' }, expect: { count: 1, ids: ['demo-last-child'] } },
      { match: ':only-of-type', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 0 } },
      { match: ':empty', ref: { by: 'id', id: 'demo2' }, expect: { count: 0 } },
      { match: ':empty', ref: { by: 'id', id: 'empty' }, expect: { count: 1, ids: ['empty'] } },
      { match: ':not(.foo)', ref: { by: 'id', id: 'demo' }, expect: { count: 0 } },

      // testAttr
      { match: '[title]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: '[title]', ref: { by: 'id', id: 'demo-first-child' }, expect: { count: 0 } },
      { match: '[id=demo]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: '[id|=me]', ref: { by: 'id', id: 'demo' }, expect: { count: 0 } },
      { match: '[id~=demo]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: '[title~=demo]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: '[id^=de]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: '[id$=mo]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: '[id$=m]', ref: { by: 'id', id: 'demo' }, expect: { count: 0 } },
      { match: '[id*=em]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: '[id*=ex]', ref: { by: 'id', id: 'demo' }, expect: { count: 0 } },
      { match: '[id=demo][title~=demo]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: 'div[id=demo][title~=demo]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: 'div[title="this is a demo"]', ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: "div[title='this is a demo']", ref: { by: 'id', id: 'demo' }, expect: { count: 1, ids: ['demo'] } },
      { match: '[href="foo.html"]', ref: { by: 'id', id: 'href-test' }, expect: { count: 1, ids: ['href-test'] } },
      { match: '[id=demo][title=demo]', ref: { by: 'id', id: 'demo' }, expect: { count: 0 } },

      // testClass
      { match: '.foo', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo'] } },
      { match: 'div.foo', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo'] } },
      { match: 'span.foo', ref: { by: 'id', id: 'demo' }, expect: { ids: [] } },
      { match: '#demo.foo', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo'] } },
      { match: '.baz', ref: { by: 'id', id: 'demo' }, expect: { ids: [] } },
      { match: '.first.para', ref: { by: 'id', id: 'demo-first-child' }, expect: { ids: ['demo-first-child'] } },
      { match: 'p.first.para', ref: { by: 'id', id: 'demo-first-child' }, expect: { ids: ['demo-first-child'] } },
      { match: '.foo.bar', ref: { by: 'id', id: 'demo' }, expect: { ids: [] } },

      // testId
      { match: '#demo', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo'] } },
      { match: 'div#demo', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo'] } },
      { match: 'div#dmo', ref: { by: 'id', id: 'demo' }, expect: { ids: [] } },
      { match: 'span#demo', ref: { by: 'id', id: 'demo' }, expect: { ids: [] } },

      // testTag
      { match: 'div', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo'] } },
      { match: 'body div', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo'] } },
      { match: 'span', ref: { by: 'id', id: 'demo' }, expect: { ids: [] } },
      { match: '*', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo'] } },

      // testScoped
      { select: '#demo > p' },
      { select: 'foo, > p', ref: { by: 'id', id: 'demo' }, expect: { equivalentCase: { select: '#demo > p' } }, status: 'fixme' },

      // // Old rooted bare-combinator queries like `+ div` / `~ p` do not map to modern element-scoped selectors
      // { select: '+ div', ref: { by: 'id', id: 'demo' }, expect: { ids: ['demo2'] } },
      // { select: '#demo-first-child ~ p', expect: { equivalentCase: { select: '~ p', ref: { by: 'id', id: 'demo-first-child' } } } },
    ],
  },

  {
    name: 'pseudos/focus',
    markup: `
    	<div id="div" tabindex="1">Should become green onclick</div>
      <div id="div2">Shouldn't become green onclick</div>
      <a id="anchor" title="anchor" href="#">Should become green onclick</a>
      <button id="button" class="btn" type="submit">Should become green onclick</button>
    `,
    steps: [
      {
        setupPage: async (page) => { await page.locator('#div').focus(); },
        cases: [
          { select: 'div, input, a, button', expect: { count: 4 } },
          { select: ':focus', expect: { count: 1, ids: ['div'] } },
          { match: ':focus', ref: { by: 'id', id: 'div' }, expect: { count: 1 } },
          { match: ':focus', ref: { by: 'id', id: 'div2' }, expect: { count: 0 } },
        ],
      },
      {
        setupPage: async (page) => { await page.locator('#anchor').focus(); },
        cases: [
          { select: ':focus', expect: { count: 1, ids: ['anchor'] } },
        ],
      },
      {
        setupPage: async (page) => { await page.locator('#button').focus(); },
        cases: [
          { select: ':focus', expect: { count: 1, ids: ['button'] } },
        ],
      },
    ],
  },

  // srcdoc is a valid iframe pattern, but it does not reproduce the quirks-mode case needed here.
  {
    name: 'quirks/iframe-srcdoc-markup',
    // status: 'only',
    status: 'skip',
    markupMode: 'html-document',
    markup: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Parent window</title></head>
      <body>
        <iframe id="ifr" srcdoc="
          <html lang='en'>
            <head><meta charset='utf-8'><title>quirks test</title></head>
            <body>
              <div>
                <div class='fooBar'></div>
                <div class='foobar'></div>
              </div>
            </body>
          </html>">
        </iframe>
      </body>
      </html>
    `,
    setupPage: async (page) => {
      const mode = await page.locator('#ifr').evaluate((iframe) => {
        return (iframe as any).contentDocument?.compatMode;
      });
      if (mode !== 'BackCompat') throw new Error(`expected quirks iframe, got ${mode}`);
    },
    cases: [
      { select: '[class~=fooBar]', ref: { by: 'iframe', id: 'ifr' }, expect: { count: 2 } },
    ],
  },

  {
    name: 'quirks/iframe-route-grounded-parent',
    // status: 'only',
    markupMode: 'html-document',
    markup: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Parent window</title></head>
      <body>
        <iframe id="ifr"></iframe>
      </body>
      </html>
    `,
    url: 'https://test.local/host.html',
    setupPage: async (page) => {
      const rootUrl = 'https://test.local';
      const frameUrl = `${rootUrl}/frame.html`;

      await page.route(`${rootUrl}/**`, async route => {
        if (route.request().url() === frameUrl) {
          await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `
              <html lang='en'>
                <head><meta charset='utf-8'><title>quirks test</title></head>
                <body>
                  <div>
                    <div class='fooBar'></div>
                    <div class='foobar'></div>
                  </div>
                </body>
              </html>
            `,
          });
          return;
        }
        await route.fulfill({ status: 404, body: 'not found' });
      });

      const frame = page.frame('ifr');
      if (!frame) throw new Error('iframe frame not found');

      await page.locator('#ifr').evaluate((iframe, src) => {
        (iframe as HTMLIFrameElement).src = src;
      }, frameUrl);

      await frame.waitForURL(frameUrl);

      const compatMode = await frame.evaluate(() => document.compatMode);
      if (compatMode !== 'BackCompat') {
        throw new Error(`expected quirks iframe, got ${compatMode}`);
      }

      // throw new Error(`
      //   mode=${await frame.evaluate(() => document.compatMode)}
      //   attr=${await frame.locator('[class~=fooBar]').count()}
      //   class=${await frame.locator('.fooBar').count()}
      //   html=${await frame.content()}
      // `);
    },
    cases: [
      { select: '.fooBar', ref: { by: 'iframe', id: 'ifr' }, expect: { count: 2 } },
      { select: '[class~=fooBar]', ref: { by: 'iframe', id: 'ifr' }, expect: { count: 1 } },

      // Historical expectation was 2 here, but I cannot reproduce that with a real routed quirks iframe.
      { select: '[class~=fooBar]', ref: { by: 'iframe', id: 'ifr' }, expect: { count: 2 }, status: 'fail' },
    ],
  },

]);

function triFind(count: number, selector: string, status?: TestCase['status']): TestCase[] {
  const cases: TestCase[] = [
    { select: selector, expect: { count } },
    { first: selector, expect: { count: count ? 1 : 0 } },
  ];

  if (count) {
    cases.push({ match: selector, ref: { by: 'first', selector }, expect: { count: 1 } });
  } 

  if (status) {
    for (const c of cases) c.status = status;
  }

  return cases;
}

function triScope(count: number, selector: string, status?: TestCase['status']): TestCase[] {
  const cases: TestCase[] = [
    { select: selector, expect: { count } },
    { select: selector, ref: { by: 'id', id: 'host' }, expect: { count } },
    { select: selector, ref: { by: 'id', id: 'host', home: 'detached' }, expect: { count } },
  ];
  if (status) {
    for (const c of cases) c.status = status;
  }
  return cases;
}

async function initPage(page: Page, template: TemplateKey): Promise<void> {
  await page.evaluate((n) => {
    const win = window as BugWin;

    function isXmlLike(name: string) {
      return name === 'xhtml' || name === 'xml' || name === 'svg';
    }

    function createNode(doc: Document) {
      if (n === 'svg') return doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      if (isXmlLike(n)) return doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      return doc.createElement('div');
    }

    function getRoot(): Element {
      return document.body ?? document.documentElement;
    }

    function getHost(): HTMLElement {
      let host = document.getElementById('host') as HTMLElement | null;
      if (!host) {
        host = createNode(document) as HTMLElement;
        host.id = 'host';
        getRoot().appendChild(host);
      }
      return host;
    }

    win.__slick = {
      getHost,
      resetHost() {
        const host = getHost();
        host.replaceChildren();
        return host;
      },
      add(tag, attrs = {}, parent) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        (parent ?? getHost()).appendChild(el);
        return el;
      },
      setHostHTML(html) {
        const host = getHost();
        host.innerHTML = html;
        return host;
      },
    };
  }, template);
}

function getMarkupMode(template: TemplateKey): Scenario['markupMode'] {
  if (template === 'xhtml' || template === 'xml') return 'xml-document';
  return 'html-document';
}
