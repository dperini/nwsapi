import { Page } from "playwright/test";
import { runScenarios } from "./harness";

const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"
    "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>NWSAPI Tests</title>
    <link rel="stylesheet" type="text/css" href="assets/style.css" media="screen" />
    <script type="text/javascript" src="../../src/nwsapi.js"></script>
    <script type="text/javascript" src="scotch.js"></script>
    <script type="text/javascript" src="test.js"></script>
  </head>
  <body>
    <div id="container">
      <div id="testlog" class="log"></div>
      <!-- Test elements -->
      <div id="fixtures" style="display: none;">
        <h1 class="title">Some title <span>here</span></h1>
        <p id="p" class="first summary">
          <strong id="strong">This</strong> is a short blurb
          <a id="link_1" class="first internal" rel="external nofollow" href="#">with a <em id="em2">link</em></a> or
          <a id="link_2" class="internal highlight" href="#"><em id="em">two</em></a>.
          Or <cite id="with_title" title="hello world!">a citation</cite>.
        </p>
        <ul id="list">
          <li id="item_1" class="first"><a id="link_3" href="#" class="external"><span id="span">Another link</span></a></li>
          <li id="item_2">Some text</li>
          <li id="item_3" xml:lang="es-us" class="">Otra cosa</li>
        </ul>

        <!-- This form has a field with the name "id"; its "ID" property won't be "troubleForm" -->
        <form id="troubleForm" action="">
          <p>
            <input type="hidden" name="id" id="hidden" />
            <input type="text" name="disabled_text_field" id="disabled_text_field" disabled="disabled" />
            <input type="text" name="enabled_text_field" id="enabled_text_field" />
            <input type="checkbox" name="checkboxes" id="checked_box" checked="checked" value="Checked" />
            <input type="checkbox" name="checkboxes" id="unchecked_box" value="Unchecked"/>
            <input type="radio" name="radiobuttons" id="checked_radio" checked="checked" value="Checked" />
            <input type="radio" name="radiobuttons" id="unchecked_radio" value="Unchecked" />
          </p>
        </form>

        <form id="troubleForm2" action="">
          <p>
            <input type="checkbox" name="brackets[5][]" id="chk_1" checked="checked" value="1" />
            <input type="checkbox" name="brackets[5][]" id="chk_2" value="2" />
          </p>
        </form>

        <div id="level1">
          <span id="level2_1">
            <span id="level3_1"></span>
            <!-- This comment should be ignored by the adjacent selector -->
            <span id="level3_2"></span>
          </span>
          <span id="level2_2">
            <em id="level_only_child">
            </em>
          </span>
          <div id="level2_3"></div>
        </div> <!-- #level1 -->

        <div id="dupContainer">
          <span id="dupL1" class="span_foo span_bar">
            <span id="dupL2">
              <span id="dupL3">
                <span id="dupL4">
                  <span id="dupL5"></span>
                </span>
              </span>
            </span>
          </span>
        </div> <!-- #dupContainer -->

        <div id="grandfather"> grandfather
          <div id="father" class="brothers men"> father
            <div id="son"> son </div>
          </div>
          <div id="uncle" class="brothers men"> uncle </div>
        </div>

        <form id="commaParent" title="commas,are,good" action="">
          <p>
            <input type="hidden" id="commaChild" name="foo" value="#commaOne,#commaTwo" />
            <input type="hidden" id="commaTwo" name="foo2" value="oops" />
          </p>
        </form>
        <div id="counted_container"><div class="is_counted"></div></div>
      </div>
    </div>
  </body>
  </html>`;

const setupNw = async (page: Page) => {
  await page.evaluate(() => {
    NW.Dom.configure({
      'SIMPLENOT': true,
      'VERBOSITY': true
    });
  });
}

runScenarios('scotch', 'normal', [
  {
    name: 'Basic Selectors',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      // * — Universal selector
      { selector: '*' },

      // E — Type selector
      { selector: 'li' },
      { selector: 'strong', root: { kind: 'id', value: 'fixtures' }, expect: { ids: ['strong'] } },
      { selector: 'nonexistent', expect: { count: 0 } },

      // #id — ID selector
      { selector: '#fixtures', expect: { ids: ['fixtures'] } },
      { selector: 'nonexistent', expect: { count: 0 } },
      { selector: '#troubleForm', expect: { ids: ['troubleForm'] } },

      // .class — Class selector
      { selector: '.first', expect: { ids: ['p', 'link_1', 'item_1'] } },
      { selector: '.second', expect: { count: 0 } },

      // E#id
      { selector: 'strong#strong', expect: { ids: ['strong'] } },
      { selector: 'p#strong', expect: { count: 0 } },

      // E.class
      { selector: 'a.internal', expect: { ids: ['link_1', 'link_2'] } },
      { selector: 'a.internal.highlight', expect: { ids: ['link_2'] } },
      { selector: 'a.highlight.internal', expect: { ids: ['link_2'] } },
      { selector: 'a.highlight.internal.nonexistent', expect: { count: 0 } },

      // #id.class
      { selector: '#link_2.internal', expect: { ids: ['link_2'] } },
      { selector: '.internal#link_2', expect: { ids: ['link_2'] } },
      { selector: '#link_2.internal.highlight', expect: { ids: ['link_2'] } },
      { selector: '#link_2.internal.nonexistent', expect: { count: 0 } },

      // E#id.class
      { selector: 'a#link_2.internal', expect: { ids: ['link_2'] } },
      { selector: 'a.internal#link_2', expect: { ids: ['link_2'] } },
      { selector: 'li#item_1.first', expect: { ids: ['item_1'] } },
      { selector: 'li#item_1.nonexistent', expect: { count: 0 } },
      { selector: 'li#item_1.first.nonexistent', expect: { count: 0 } },
    ],
  },
  {
    name: 'Attribute Selectors',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      // [foo]
      { selector: '[href]', root: { kind: 'selector', value: 'body' }, expect: { equivalentTo: { selector: 'a[href]', root: { kind: 'selector', value: 'body' } } } },
      { selector: '[class~=internal]', expect: { equivalentTo: { selector: 'a[class~="internal"]' } } },
      { selector: '[id]', expect: { equivalentTo: { selector: '*[id]' } } },
      { selector: '[type=radio]', expect: { ids: ['checked_radio', 'unchecked_radio'] } },
      { selector: '[type=checkbox]', expect: { equivalentTo: { selector: '*[type=checkbox]' } } },
      { selector: '[title]', expect: { ids: ['with_title', 'commaParent'] } },
      { selector: '#troubleForm [type=radio]', expect: { equivalentTo: { selector: '#troubleForm *[type=radio]' } } },
      { selector: '#troubleForm [type]', expect: { equivalentTo: { selector: '#troubleForm *[type]' } } },

      // E[foo]
      { selector: 'h1[class]', expect: { equivalentTo: { selector: '#fixtures h1' } } },
      { selector: 'h1[CLASS]', expect: { equivalentTo: { selector: '#fixtures h1' } } },
      { selector: 'li#item_3[class]', expect: { ids: ['item_3'] } },
      { selector: '#troubleForm2 input[name="brackets[5][]"]', expect: { ids: ['chk_1', 'chk_2'] } },
      { selector: '#troubleForm2 input[name="brackets[5][]"]:checked', expect: { ids: ['chk_1'] } },
      { selector: 'cite[title="hello world!"]', expect: { ids: ['with_title'] } },
      { selector: '[xml:lang]', expect: { allowMismatch: true, count: 2, includesIds: ['item_3'], equivalentTo: { selector: '*[xml:lang]' } } },
      { selector: '*[xml:lang]', expect: { allowMismatch: true, count: 2, includesIds: ['item_3'] } },

      // E[foo="bar"]
      { selector: 'a[href="#"]', expect: { ids: ['link_1', 'link_2', 'link_3'] } },
      { selector: 'a[href=#]', expect: { throws: true } },
      { selector: '#troubleForm2 input[name="brackets[5][]"][value="2"]', expect: { ids: ['chk_2'] } },

      // E[foo~="bar"]
      { selector: 'a[class~="internal"]', expect: { ids: ['link_1', 'link_2'] } },
      { selector: 'a[class~=internal]', expect: { ids: ['link_1', 'link_2'] } },
      { selector: 'a[class~=external][href="#"]', expect: { ids: ['link_3'] } },

      // E[foo|="en"]
      { selector: '*[xml:lang|="es"]', expect: { ids: ['item_3'] } },
      { selector: '*[xml:lang|="ES"]', expect: { ids: ['item_3'] } },

      // E[foo^="bar"]
      { selector: 'div[class^=bro]', expect: { ids: ['father', 'uncle'] } },
      { selector: '#level1 *[id^="level2_"]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },
      { selector: '#level1 *[id^=level2_]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },

      // benchmark(function(){ select('#level1 *[id^=level2_]'); }, 1000)
      { selector: '#level1 *[id^=level2_]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },

      // E[foo$="bar"]
      { selector: 'div[class$=men]', expect: { ids: ['father', 'uncle'] } },
      { selector: '#level1 *[id$="_1"]', expect: { ids: ['level2_1', 'level3_1'] } },
      { selector: '#level1 *[id$=_1]', expect: { ids: ['level2_1', 'level3_1'] } },

      // benchmark(function(){ select('#level1 *[id$=_1]'); }, 1000)
      { selector: '#level1 *[id$=_1]', expect: { ids: ['level2_1', 'level3_1'] } },

      // E[foo*="bar"]
      { selector: 'div[class*="ers m"]', expect: { ids: ['father', 'uncle'] } },
      { selector: '#level1 *[id*="2"]', expect: { ids: ['level2_1', 'level3_2', 'level2_2', 'level2_3'] } },
      { selector: '#level1 *[id*=2]', expect: { throws: true } },
      // benchmark(function(){ select('#level1 *[id*=2]'); }, 1000)
      { selector: '#level1 *[id*=2]', expect: { throws: true } },

      // E[id=-1] — should throw SYNTAX_ERR
      // { selector: '#level1 *[id=-1]', expect: { throws: true }, },
      { selector: '#level1 *[id=9]', expect: { throws: true } },

      // E[class=-45deg] — should throw SYNTAX_ERR
      // { selector: '#level1 *[class=-45deg]', expect: { throws: true } },

      // E[class=8mm] — should throw SYNTAX_ERR
      { selector: '#level1 *[class=8mm]', expect: { throws: true } },
    ],
  },

  {
    name: 'Attribute Selectors — invalid unquoted values',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    modifier: 'fixme',
    cases: [
      // should throw SYNTAX_ERR
      { selector: '#level1 *[id=-1]', expect: { throws: true } },
      { selector: '#level1 *[id=9]', expect: { throws: true } },
      { selector: '#level1 *[class=-45deg]', expect: { throws: true } },
      { selector: '#level1 *[class=8mm]', expect: { throws: true } },
    ],
  },

  {
    name: 'Structural pseudo-classes',
    html,
    setupPage: setupNw,
    cases: [
      // E:first-child
      { selector: '#level1>*:first-child', expect: { ids: ['level2_1'] } },
      { selector: '#level1 *:first-child', expect: { ids: ['level2_1', 'level3_1', 'level_only_child'] } },
      { selector: '#level1>div:first-child', expect: { count: 0 } },
      { selector: '#level1 span:first-child', expect: { ids: ['level2_1', 'level3_1'] } },
      { selector: '#level1:first-child', expect: { count: 0 } },

      // benchmark(function(){ select('#level1 *:first-child'); }, 1000)
      { selector: '#level1 *:first-child', expect: { ids: ['level2_1', 'level3_1', 'level_only_child'] } },

      // E:last-child
      { selector: '#level1>*:last-child', expect: { ids: ['level2_3'] } },
      { selector: '#level1 *:last-child', expect: { ids: ['level3_2', 'level_only_child', 'level2_3'] } },
      { selector: '#level1>div:last-child', expect: { ids: ['level2_3'] } },
      { selector: '#level1 div:last-child', expect: { ids: ['level2_3'] } },
      { selector: '#level1>span:last-child', expect: { count: 0 } },

      // benchmark(function(){ select('#level1 *:last-child'); }, 1000)
      { selector: '#level1 *:last-child', expect: { ids: ['level3_2', 'level_only_child', 'level2_3'] } },

      // E:nth-child(n)
      { selector: '#p *:nth-child(3)', expect: { ids: ['link_2'] } },
      { selector: '#p a:nth-child(3)', expect: { ids: ['link_2'] } },
      { selector: '#list > li:nth-child(n+2)', expect: { ids: ['item_2', 'item_3'] } },
      { selector: '#list > li:nth-child(-n+2)', expect: { ids: ['item_1', 'item_2'] } },

      // E:nth-of-type(n)
      { selector: '#p a:nth-of-type(2)', expect: { ids: ['link_2'] } },
      { selector: '#p a:nth-of-type(1)', expect: { ids: ['link_1'] } },

      // E:nth-last-of-type(n)
      { selector: '#p a:nth-last-of-type(1)', expect: { ids: ['link_2'] } },

      // E:first-of-type
      { selector: '#p a:first-of-type', expect: { ids: ['link_1'] } },

      // E:last-of-type
      { selector: '#p a:last-of-type', expect: { ids: ['link_2'] } },

      // E:only-child
      { selector: '#level1 *:only-child', expect: { ids: ['level_only_child'] } },
      { selector: '#level1>*:only-child', expect: { count: 0 } },
      { selector: '#level1:only-child', expect: { count: 0 } },
      { selector: '#level2_2 :only-child:not(:last-child)', expect: { count: 0 } },
      { selector: '#level2_2 :only-child:not(:first-child)', expect: { count: 0 } },

      // benchmark(function(){ select('#level1 *:only-child'); }, 1000)
      { selector: '#level1 *:only-child', expect: { ids: ['level_only_child'] } },
    ],
  },

  {
    name: 'Structural pseudo-classes — E:empty',
    html,
    htmlMode: 'document',
    setupPage: async (page) => {
      await setupNw(page);
      await page.evaluate(() => {
        const el = document.getElementById('level3_1');
        if (el) el.innerHTML = '';
      });
    },
    cases: [
      // E:empty
      { selector: '#level1 *:empty', expect: { ids: ['level3_1', 'level3_2', 'level2_3'] } },
      { selector: '#level_only_child:empty', expect: { count: 0 } },
      { selector: 'span:empty > *', expect: { count: 0 } },
    ],
  },

  {
    name: 'E:not(s)',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      { selector: 'a:not([href="#"])', expect: { count: 0 } },
      { selector: 'div.brothers:not(.brothers)', expect: { count: 0 } },
      { selector: 'a[class~=external]:not([href="#"])', expect: { count: 0 } },
      { selector: '#p a:not(:first-of-type)', expect: { ids: ['link_2'] } },
      { selector: '#p a:not(:last-of-type)', expect: { ids: ['link_1'] } },
      { selector: '#p a:not(:nth-of-type(1))', expect: { ids: ['link_2'] } },
      { selector: '#p a:not(:nth-last-of-type(1))', expect: { ids: ['link_1'] } },
      { selector: '#p a:not([rel~=nofollow])', expect: { ids: ['link_2'] } },
      { selector: '#p a:not([rel^=external])', expect: { ids: ['link_2'] } },
      { selector: '#p a:not([rel$=nofollow])', expect: { ids: ['link_2'] } },
      { selector: '#p a:not([rel$="nofollow"]) > em', expect: { ids: ['em'] } },
      { selector: '#list li:not(#item_1):not(#item_3)', expect: { ids: ['item_2'] } },
      { selector: '#grandfather > div:not(#uncle) #son', expect: { ids: ['son'] } },
      { selector: '#p a:not([rel$="nofollow"]) em', expect: { ids: ['em'] } },
      { selector: '#p a:not([rel$="nofollow"])>em', expect: { ids: ['em'] } },
    ],
  },

  {
    name: 'UI element states pseudo-classes',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      // E:disabled
      { selector: '#troubleForm > p > *:disabled', expect: { ids: ['disabled_text_field'] } },

      // E:checked
      { selector: '#troubleForm *:checked', expect: { ids: ['checked_box', 'checked_radio'] } },
    ],
  },

  {
    name: 'Combinators',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      // E F — Descendant
      { selector: '#fixtures a *', expect: { ids: ['em2', 'em', 'span'] } },
      { selector: 'div#fixtures p', expect: { includesIds: ['p'] } },

      // E + F — Adjacent sibling
      { selector: 'div.brothers + div.brothers', expect: { includesIds: ['uncle'] } },
      { selector: 'div.brothers + div', expect: { includesIds: ['uncle'] } },
      { selector: '#level2_1+span', expect: { includesIds: ['level2_2'] } },
      { selector: '#level2_1 + span', expect: { includesIds: ['level2_2'] } },
      { selector: '#level2_1 + *', expect: { includesIds: ['level2_2'] } },
      { selector: '#level2_2 + span', expect: { count: 0 } },
      { selector: '#level3_1 + span', expect: { includesIds: ['level3_2'] } },
      { selector: '#level3_1 + *', expect: { includesIds: ['level3_2'] } },
      { selector: '#level3_2 + *', expect: { count: 0 } },
      { selector: '#level3_1 + em', expect: { count: 0 } },

      // benchmark(function(){ select('#level3_1 + span'); }, 1000)
      { selector: '#level3_1 + span', expect: { includesIds: ['level3_2'] } },

      // E > F — Child
      { selector: 'p.first > a', expect: { ids: ['link_1', 'link_2'] } },
      { selector: 'div#grandfather > div', expect: { ids: ['father', 'uncle'] } },
      { selector: '#level1>span', expect: { ids: ['level2_1', 'level2_2'] } },
      { selector: '#level1 > span', expect: { ids: ['level2_1', 'level2_2'] } },
      { selector: '#level2_1 > *', expect: { ids: ['level3_1', 'level3_2'] } },
      { selector: 'div > #nonexistent', expect: { count: 0 } },

      // benchmark(function(){ select('#level1 > span'); }, 1000)
      { selector: '#level1 > span', expect: { ids: ['level2_1', 'level2_2'] } },

      // E ~ F — General sibling
      { selector: 'h1 ~ ul', expect: { includesIds: ['list'] } },
      { selector: '#level2_2 ~ span', expect: { count: 0 } },
      { selector: '#level3_2 ~ *', expect: { count: 0 } },
      { selector: '#level3_1 ~ em', expect: { count: 0 } },
      { selector: 'div ~ #level3_2', expect: { count: 0 } },
      { selector: 'div ~ #level2_3', expect: { count: 0 } },
      { selector: '#level2_1 ~ span', expect: { includesIds: ['level2_2'] } },
      { selector: '#level2_1 ~ *', expect: { ids: ['level2_2', 'level2_3'] } },
      { selector: '#level3_1 ~ #level3_2', expect: { includesIds: ['level3_2'] } },
      { selector: 'span ~ #level3_2', expect: { includesIds: ['level3_2'] } },

      // benchmark(function(){ select('#level2_1 ~ span'); }, 1000)
      { selector: '#level2_1 ~ span', expect: { includesIds: ['level2_2'] } },
    ],
  },

  {
    name: 'NW.Dom.match',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      { selector: 'span', expect: { includesIds: ['dupL1'] } },
      { selector: 'span#dupL1', expect: { includesIds: ['dupL1'] } },
      { selector: 'div > span', expect: { includesIds: ['dupL1'] } },         // child combinator
      { selector: '#dupContainer span', expect: { includesIds: ['dupL1'] } }, // descendant combinator
      { selector: '#dupL1', expect: { includesIds: ['dupL1'] } },             // ID only
      { selector: 'span.span_foo', expect: { includesIds: ['dupL1'] } },      // class name 1
      { selector: 'span.span_bar', expect: { includesIds: ['dupL1'] } },      // class name 2
      { selector: 'span:first-child', expect: { includesIds: ['dupL1'] } },   // first-child pseudoclass

      { selector: 'span.span_wtf', expect: { excludesIds: ['dupL1'] } },      // bogus class name
      { selector: '#dupL2', expect: { excludesIds: ['dupL1'] } },             // different ID
      { selector: 'div', expect: { excludesIds: ['dupL1'] } },                // different tag name
      { selector: 'span span', expect: { excludesIds: ['dupL1'] } },          // different ancestry
      { selector: 'span > span', expect: { excludesIds: ['dupL1'] } },        // different parent
      { selector: 'span:nth-child(5)', expect: { excludesIds: ['dupL1'] } },  // different pseudoclass

      { selector: 'a[rel^=external]', expect: { includesIds: ['link_1'], excludesIds: ['link_2'] } },
      { selector: 'a[rel^="external"]', expect: { includesIds: ['link_1'] } },
      { selector: "a[rel^='external']", expect: { includesIds: ['link_1'] } },
    ],
  },

  {
    name: 'Equivalent Selectors',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      { selector: 'div.brothers', expect: { equivalentTo: { selector: 'div[class~=brothers]' } } },
      { selector: 'div.brothers', expect: { equivalentTo: { selector: 'div[class~=brothers].brothers' } } },
      { selector: 'div:not(.brothers)', expect: { equivalentTo: { selector: 'div:not([class~=brothers])' } } },
      { selector: 'li ~ li', expect: { equivalentTo: { selector: 'li:not(:first-child)' } } },
      { selector: 'ul > li', expect: { equivalentTo: { selector: 'ul > li:nth-child(n)' } } },
      { selector: 'ul > li:nth-child(even)', expect: { equivalentTo: { selector: 'ul > li:nth-child(2n)' } } },
      { selector: 'ul > li:nth-child(odd)', expect: { equivalentTo: { selector: 'ul > li:nth-child(2n+1)' } } },
      { selector: 'ul > li:first-child', expect: { equivalentTo: { selector: 'ul > li:nth-child(1)' } } },
      { selector: 'ul > li:last-child', expect: { equivalentTo: { selector: 'ul > li:nth-last-child(1)' } } },
      { selector: 'ul > li:nth-child(n-128)', expect: { equivalentTo: { selector: 'ul > li' } } },
      { selector: 'ul>li', expect: { equivalentTo: { selector: 'ul > li' } } },
      { selector: '#p a:not([rel$="nofollow"])>em', expect: { equivalentTo: { selector: '#p a:not([rel$="nofollow"]) > em' } } },
    ],
  },

  {
    name: 'Multiple Selectors',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      { selector: '#list, .first,*[xml:lang="es-us"] , #troubleForm', expect: { ids: ['p', 'link_1', 'list', 'item_1', 'item_3', 'troubleForm'] } },
      { selector: '#list, .first, *[xml:lang="es-us"], #troubleForm', expect: { ids: ['p', 'link_1', 'list', 'item_1', 'item_3', 'troubleForm'] } },
      { selector: 'form[title*="commas,"], input[value="#commaOne,#commaTwo"]', expect: { ids: ['commaParent', 'commaChild'] } },
      { selector: 'form[title*="commas,"], input[value="#commaOne,#commaTwo"]', expect: { ids: ['commaParent', 'commaChild'] } },
    ],
  },
]);
