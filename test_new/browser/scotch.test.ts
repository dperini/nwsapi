import { Page } from "playwright/test";
import { runScenarios } from "./harness/scenarios";

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
      { select: '*' },

      // E — Type selector
      { select: 'li' },
      { select: 'strong', ref: { by: 'id', id: 'fixtures' }, expect: { ids: ['strong'] } },
      { select: 'nonexistent', expect: { count: 0 } },

      // #id — ID selector
      { select: '#fixtures', expect: { ids: ['fixtures'] } },
      { select: 'nonexistent', expect: { count: 0 } },
      { select: '#troubleForm', expect: { ids: ['troubleForm'] } },

      // .class — Class selector
      { select: '.first', expect: { ids: ['p', 'link_1', 'item_1'] } },
      { select: '.second', expect: { count: 0 } },

      // E#id
      { select: 'strong#strong', expect: { ids: ['strong'] } },
      { select: 'p#strong', expect: { count: 0 } },

      // E.class
      { select: 'a.internal', expect: { ids: ['link_1', 'link_2'] } },
      { select: 'a.internal.highlight', expect: { ids: ['link_2'] } },
      { select: 'a.highlight.internal', expect: { ids: ['link_2'] } },
      { select: 'a.highlight.internal.nonexistent', expect: { count: 0 } },

      // #id.class
      { select: '#link_2.internal', expect: { ids: ['link_2'] } },
      { select: '.internal#link_2', expect: { ids: ['link_2'] } },
      { select: '#link_2.internal.highlight', expect: { ids: ['link_2'] } },
      { select: '#link_2.internal.nonexistent', expect: { count: 0 } },

      // E#id.class
      { select: 'a#link_2.internal', expect: { ids: ['link_2'] } },
      { select: 'a.internal#link_2', expect: { ids: ['link_2'] } },
      { select: 'li#item_1.first', expect: { ids: ['item_1'] } },
      { select: 'li#item_1.nonexistent', expect: { count: 0 } },
      { select: 'li#item_1.first.nonexistent', expect: { count: 0 } },
    ],
  },
  {
    name: 'Attribute Selectors',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      // [foo]
      { select: '[href]', ref: { by: 'first', selector: 'body' }, expect: { equivalentCase: { select: 'a[href]', ref: { by: 'first', selector: 'body' } } } },
      { select: '[class~=internal]', expect: { equivalentCase: { select: 'a[class~="internal"]' } } },
      { select: '[id]', expect: { equivalentCase: { select: '*[id]' } } },
      { select: '[type=radio]', expect: { ids: ['checked_radio', 'unchecked_radio'] } },
      { select: '[type=checkbox]', expect: { equivalentCase: { select: '*[type=checkbox]' } } },
      { select: '[title]', expect: { ids: ['with_title', 'commaParent'] } },
      { select: '#troubleForm [type=radio]', expect: { equivalentCase: { select: '#troubleForm *[type=radio]' } } },
      { select: '#troubleForm [type]', expect: { equivalentCase: { select: '#troubleForm *[type]' } } },

      // E[foo]
      { select: 'h1[class]', expect: { equivalentCase: { select: '#fixtures h1' } } },
      { select: 'h1[CLASS]', expect: { equivalentCase: { select: '#fixtures h1' } } },
      { select: 'li#item_3[class]', expect: { ids: ['item_3'] } },
      { select: '#troubleForm2 input[name="brackets[5][]"]', expect: { ids: ['chk_1', 'chk_2'] } },
      { select: '#troubleForm2 input[name="brackets[5][]"]:checked', expect: { ids: ['chk_1'] } },
      { select: 'cite[title="hello world!"]', expect: { ids: ['with_title'] } },
      { select: '[xml:lang]', expect: { allowMismatch: true, count: 2, includesIds: ['item_3'], equivalentCase: { select: '*[xml:lang]' } } },
      { select: '*[xml:lang]', expect: { allowMismatch: true, count: 2, includesIds: ['item_3'] } },

      // E[foo="bar"]
      { select: 'a[href="#"]', expect: { ids: ['link_1', 'link_2', 'link_3'] } },
      { select: 'a[href=#]', expect: { throws: true } },
      { select: '#troubleForm2 input[name="brackets[5][]"][value="2"]', expect: { ids: ['chk_2'] } },

      // E[foo~="bar"]
      { select: 'a[class~="internal"]', expect: { ids: ['link_1', 'link_2'] } },
      { select: 'a[class~=internal]', expect: { ids: ['link_1', 'link_2'] } },
      { select: 'a[class~=external][href="#"]', expect: { ids: ['link_3'] } },

      // E[foo|="en"]
      { select: '*[xml:lang|="es"]', expect: { ids: ['item_3'] } },
      { select: '*[xml:lang|="ES"]', expect: { ids: ['item_3'] } },

      // E[foo^="bar"]
      { select: 'div[class^=bro]', expect: { ids: ['father', 'uncle'] } },
      { select: '#level1 *[id^="level2_"]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },
      { select: '#level1 *[id^=level2_]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },

      // benchmark(function(){ select('#level1 *[id^=level2_]'); }, 1000)
      { select: '#level1 *[id^=level2_]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },

      // E[foo$="bar"]
      { select: 'div[class$=men]', expect: { ids: ['father', 'uncle'] } },
      { select: '#level1 *[id$="_1"]', expect: { ids: ['level2_1', 'level3_1'] } },
      { select: '#level1 *[id$=_1]', expect: { ids: ['level2_1', 'level3_1'] } },

      // benchmark(function(){ select('#level1 *[id$=_1]'); }, 1000)
      { select: '#level1 *[id$=_1]', expect: { ids: ['level2_1', 'level3_1'] } },

      // E[foo*="bar"]
      { select: 'div[class*="ers m"]', expect: { ids: ['father', 'uncle'] } },
      { select: '#level1 *[id*="2"]', expect: { ids: ['level2_1', 'level3_2', 'level2_2', 'level2_3'] } },
      { select: '#level1 *[id*=2]', expect: { throws: true } },
      // benchmark(function(){ select('#level1 *[id*=2]'); }, 1000)
      { select: '#level1 *[id*=2]', expect: { throws: true } },

      // E[id=-1] — should throw SYNTAX_ERR
      // { selector: '#level1 *[id=-1]', expect: { throws: true }, },
      { select: '#level1 *[id=9]', expect: { throws: true } },

      // E[class=-45deg] — should throw SYNTAX_ERR
      // { selector: '#level1 *[class=-45deg]', expect: { throws: true } },

      // E[class=8mm] — should throw SYNTAX_ERR
      { select: '#level1 *[class=8mm]', expect: { throws: true } },
    ],
  },

  {
    name: 'Attribute Selectors — invalid unquoted values',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    status: 'fixme',
    cases: [
      // should throw SYNTAX_ERR
      { select: '#level1 *[id=-1]', expect: { throws: true } },
      { select: '#level1 *[id=9]', expect: { throws: true } },
      { select: '#level1 *[class=-45deg]', expect: { throws: true } },
      { select: '#level1 *[class=8mm]', expect: { throws: true } },
    ],
  },

  {
    name: 'Structural pseudo-classes',
    html,
    setupPage: setupNw,
    cases: [
      // E:first-child
      { select: '#level1>*:first-child', expect: { ids: ['level2_1'] } },
      { select: '#level1 *:first-child', expect: { ids: ['level2_1', 'level3_1', 'level_only_child'] } },
      { select: '#level1>div:first-child', expect: { count: 0 } },
      { select: '#level1 span:first-child', expect: { ids: ['level2_1', 'level3_1'] } },
      { select: '#level1:first-child', expect: { count: 0 } },

      // benchmark(function(){ select('#level1 *:first-child'); }, 1000)
      { select: '#level1 *:first-child', expect: { ids: ['level2_1', 'level3_1', 'level_only_child'] } },

      // E:last-child
      { select: '#level1>*:last-child', expect: { ids: ['level2_3'] } },
      { select: '#level1 *:last-child', expect: { ids: ['level3_2', 'level_only_child', 'level2_3'] } },
      { select: '#level1>div:last-child', expect: { ids: ['level2_3'] } },
      { select: '#level1 div:last-child', expect: { ids: ['level2_3'] } },
      { select: '#level1>span:last-child', expect: { count: 0 } },

      // benchmark(function(){ select('#level1 *:last-child'); }, 1000)
      { select: '#level1 *:last-child', expect: { ids: ['level3_2', 'level_only_child', 'level2_3'] } },

      // E:nth-child(n)
      { select: '#p *:nth-child(3)', expect: { ids: ['link_2'] } },
      { select: '#p a:nth-child(3)', expect: { ids: ['link_2'] } },
      { select: '#list > li:nth-child(n+2)', expect: { ids: ['item_2', 'item_3'] } },
      { select: '#list > li:nth-child(-n+2)', expect: { ids: ['item_1', 'item_2'] } },

      // E:nth-of-type(n)
      { select: '#p a:nth-of-type(2)', expect: { ids: ['link_2'] } },
      { select: '#p a:nth-of-type(1)', expect: { ids: ['link_1'] } },

      // E:nth-last-of-type(n)
      { select: '#p a:nth-last-of-type(1)', expect: { ids: ['link_2'] } },

      // E:first-of-type
      { select: '#p a:first-of-type', expect: { ids: ['link_1'] } },

      // E:last-of-type
      { select: '#p a:last-of-type', expect: { ids: ['link_2'] } },

      // E:only-child
      { select: '#level1 *:only-child', expect: { ids: ['level_only_child'] } },
      { select: '#level1>*:only-child', expect: { count: 0 } },
      { select: '#level1:only-child', expect: { count: 0 } },
      { select: '#level2_2 :only-child:not(:last-child)', expect: { count: 0 } },
      { select: '#level2_2 :only-child:not(:first-child)', expect: { count: 0 } },

      // benchmark(function(){ select('#level1 *:only-child'); }, 1000)
      { select: '#level1 *:only-child', expect: { ids: ['level_only_child'] } },
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
      { select: '#level1 *:empty', expect: { ids: ['level3_1', 'level3_2', 'level2_3'] } },
      { select: '#level_only_child:empty', expect: { count: 0 } },
      { select: 'span:empty > *', expect: { count: 0 } },
    ],
  },

  {
    name: 'E:not(s)',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      { select: 'a:not([href="#"])', expect: { count: 0 } },
      { select: 'div.brothers:not(.brothers)', expect: { count: 0 } },
      { select: 'a[class~=external]:not([href="#"])', expect: { count: 0 } },
      { select: '#p a:not(:first-of-type)', expect: { ids: ['link_2'] } },
      { select: '#p a:not(:last-of-type)', expect: { ids: ['link_1'] } },
      { select: '#p a:not(:nth-of-type(1))', expect: { ids: ['link_2'] } },
      { select: '#p a:not(:nth-last-of-type(1))', expect: { ids: ['link_1'] } },
      { select: '#p a:not([rel~=nofollow])', expect: { ids: ['link_2'] } },
      { select: '#p a:not([rel^=external])', expect: { ids: ['link_2'] } },
      { select: '#p a:not([rel$=nofollow])', expect: { ids: ['link_2'] } },
      { select: '#p a:not([rel$="nofollow"]) > em', expect: { ids: ['em'] } },
      { select: '#list li:not(#item_1):not(#item_3)', expect: { ids: ['item_2'] } },
      { select: '#grandfather > div:not(#uncle) #son', expect: { ids: ['son'] } },
      { select: '#p a:not([rel$="nofollow"]) em', expect: { ids: ['em'] } },
      { select: '#p a:not([rel$="nofollow"])>em', expect: { ids: ['em'] } },
    ],
  },

  {
    name: 'UI element states pseudo-classes',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      // E:disabled
      { select: '#troubleForm > p > *:disabled', expect: { ids: ['disabled_text_field'] } },

      // E:checked
      { select: '#troubleForm *:checked', expect: { ids: ['checked_box', 'checked_radio'] } },
    ],
  },

  {
    name: 'Combinators',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      // E F — Descendant
      { select: '#fixtures a *', expect: { ids: ['em2', 'em', 'span'] } },
      { select: 'div#fixtures p', expect: { includesIds: ['p'] } },

      // E + F — Adjacent sibling
      { select: 'div.brothers + div.brothers', expect: { includesIds: ['uncle'] } },
      { select: 'div.brothers + div', expect: { includesIds: ['uncle'] } },
      { select: '#level2_1+span', expect: { includesIds: ['level2_2'] } },
      { select: '#level2_1 + span', expect: { includesIds: ['level2_2'] } },
      { select: '#level2_1 + *', expect: { includesIds: ['level2_2'] } },
      { select: '#level2_2 + span', expect: { count: 0 } },
      { select: '#level3_1 + span', expect: { includesIds: ['level3_2'] } },
      { select: '#level3_1 + *', expect: { includesIds: ['level3_2'] } },
      { select: '#level3_2 + *', expect: { count: 0 } },
      { select: '#level3_1 + em', expect: { count: 0 } },

      // benchmark(function(){ select('#level3_1 + span'); }, 1000)
      { select: '#level3_1 + span', expect: { includesIds: ['level3_2'] } },

      // E > F — Child
      { select: 'p.first > a', expect: { ids: ['link_1', 'link_2'] } },
      { select: 'div#grandfather > div', expect: { ids: ['father', 'uncle'] } },
      { select: '#level1>span', expect: { ids: ['level2_1', 'level2_2'] } },
      { select: '#level1 > span', expect: { ids: ['level2_1', 'level2_2'] } },
      { select: '#level2_1 > *', expect: { ids: ['level3_1', 'level3_2'] } },
      { select: 'div > #nonexistent', expect: { count: 0 } },

      // benchmark(function(){ select('#level1 > span'); }, 1000)
      { select: '#level1 > span', expect: { ids: ['level2_1', 'level2_2'] } },

      // E ~ F — General sibling
      { select: 'h1 ~ ul', expect: { includesIds: ['list'] } },
      { select: '#level2_2 ~ span', expect: { count: 0 } },
      { select: '#level3_2 ~ *', expect: { count: 0 } },
      { select: '#level3_1 ~ em', expect: { count: 0 } },
      { select: 'div ~ #level3_2', expect: { count: 0 } },
      { select: 'div ~ #level2_3', expect: { count: 0 } },
      { select: '#level2_1 ~ span', expect: { includesIds: ['level2_2'] } },
      { select: '#level2_1 ~ *', expect: { ids: ['level2_2', 'level2_3'] } },
      { select: '#level3_1 ~ #level3_2', expect: { includesIds: ['level3_2'] } },
      { select: 'span ~ #level3_2', expect: { includesIds: ['level3_2'] } },

      // benchmark(function(){ select('#level2_1 ~ span'); }, 1000)
      { select: '#level2_1 ~ span', expect: { includesIds: ['level2_2'] } },
    ],
  },

  {
    name: 'NW.Dom.match',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      { select: 'span', expect: { includesIds: ['dupL1'] } },
      { select: 'span#dupL1', expect: { includesIds: ['dupL1'] } },
      { select: 'div > span', expect: { includesIds: ['dupL1'] } },         // child combinator
      { select: '#dupContainer span', expect: { includesIds: ['dupL1'] } }, // descendant combinator
      { select: '#dupL1', expect: { includesIds: ['dupL1'] } },             // ID only
      { select: 'span.span_foo', expect: { includesIds: ['dupL1'] } },      // class name 1
      { select: 'span.span_bar', expect: { includesIds: ['dupL1'] } },      // class name 2
      { select: 'span:first-child', expect: { includesIds: ['dupL1'] } },   // first-child pseudoclass

      { select: 'span.span_wtf', expect: { excludesIds: ['dupL1'] } },      // bogus class name
      { select: '#dupL2', expect: { excludesIds: ['dupL1'] } },             // different ID
      { select: 'div', expect: { excludesIds: ['dupL1'] } },                // different tag name
      { select: 'span span', expect: { excludesIds: ['dupL1'] } },          // different ancestry
      { select: 'span > span', expect: { excludesIds: ['dupL1'] } },        // different parent
      { select: 'span:nth-child(5)', expect: { excludesIds: ['dupL1'] } },  // different pseudoclass

      { select: 'a[rel^=external]', expect: { includesIds: ['link_1'], excludesIds: ['link_2'] } },
      { select: 'a[rel^="external"]', expect: { includesIds: ['link_1'] } },
      { select: "a[rel^='external']", expect: { includesIds: ['link_1'] } },
    ],
  },

  {
    name: 'Equivalent Selectors',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      { select: 'div.brothers', expect: { equivalentCase: { select: 'div[class~=brothers]' } } },
      { select: 'div.brothers', expect: { equivalentCase: { select: 'div[class~=brothers].brothers' } } },
      { select: 'div:not(.brothers)', expect: { equivalentCase: { select: 'div:not([class~=brothers])' } } },
      { select: 'li ~ li', expect: { equivalentCase: { select: 'li:not(:first-child)' } } },
      { select: 'ul > li', expect: { equivalentCase: { select: 'ul > li:nth-child(n)' } } },
      { select: 'ul > li:nth-child(even)', expect: { equivalentCase: { select: 'ul > li:nth-child(2n)' } } },
      { select: 'ul > li:nth-child(odd)', expect: { equivalentCase: { select: 'ul > li:nth-child(2n+1)' } } },
      { select: 'ul > li:first-child', expect: { equivalentCase: { select: 'ul > li:nth-child(1)' } } },
      { select: 'ul > li:last-child', expect: { equivalentCase: { select: 'ul > li:nth-last-child(1)' } } },
      { select: 'ul > li:nth-child(n-128)', expect: { equivalentCase: { select: 'ul > li' } } },
      { select: 'ul>li', expect: { equivalentCase: { select: 'ul > li' } } },
      { select: '#p a:not([rel$="nofollow"])>em', expect: { equivalentCase: { select: '#p a:not([rel$="nofollow"]) > em' } } },
    ],
  },

  {
    name: 'Multiple Selectors',
    html,
    htmlMode: 'document',
    setupPage: setupNw,
    cases: [
      { select: '#list, .first,*[xml:lang="es-us"] , #troubleForm', expect: { ids: ['p', 'link_1', 'list', 'item_1', 'item_3', 'troubleForm'] } },
      { select: '#list, .first, *[xml:lang="es-us"], #troubleForm', expect: { ids: ['p', 'link_1', 'list', 'item_1', 'item_3', 'troubleForm'] } },
      { select: 'form[title*="commas,"], input[value="#commaOne,#commaTwo"]', expect: { ids: ['commaParent', 'commaChild'] } },
      { select: 'form[title*="commas,"], input[value="#commaOne,#commaTwo"]', expect: { ids: ['commaParent', 'commaChild'] } },
    ],
  },
]);
