import { runScenarios } from "./harness/scenarios";
import { expect } from "@playwright/test";

runScenarios('prototype 1', 'normal', [
  {
    name: 'selector engine basics',
    markup: `
      <div id="test_div_parent" class="test_class">
        <div id="test_div_child" class="test_class">
        </div>
      </div>`,
    cases: [
      { select: '.test_class', expect: { count: 2, ids: ['test_div_parent', 'test_div_child'] } },
      { 
        select: '.test_class',
        ref: { by: 'id', id: 'test_div_parent' },
        expect: { count: 1, ids: ['test_div_child'] }
      },
      { select: '.non_existent', expect: { count: 0, ids: [] } },
    ],
  },
]);

const nwsapiProtoTestHtml = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
          "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
  <head>
    <title>Unit test file | Selector | default template | 2010-03-04 16:13</title>
    <meta http-equiv="content-type" content="text/html; charset=utf-8" />
    <script type="text/javascript" charset="utf-8">
      var eventResults = {};
      var originalElement = window.Element;
    </script>
    <script src="assets/prototype.js?1267715612" type="text/javascript" charset="utf-8"></script>
    <script src="lib_assets/unittest.js?1267715612" type="text/javascript" charset="utf-8"></script>
    <link rel="stylesheet" href="lib_assets/unittest.css?1267715612" type="text/css" />
    <script src="../../src/nwsapi.js" type="text/javascript" charset="utf-8"></script>
    <script src="tests/nwsapi-test.js" type="text/javascript" charset="utf-8"></script>
    <script src="tests/selector_test.js?1267715612" type="text/javascript" charset="utf-8"></script>
  </head>
  <body>

  <div id="testlog"></div>

  <div id="fixtures" style="display: none">
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

    <!-- this form has a field with the name 'id',
      therefore its ID property won't be 'troubleForm': -->
    <form id="troubleForm">
      <input type="hidden" name="id" id="hidden" />
      <input type="text" name="disabled_text_field" id="disabled_text_field" disabled="disabled" />
      <input type="text" name="enabled_text_field" id="enabled_text_field" />
      <input type="checkbox" name="checkboxes" id="checked_box" checked="checked" value="Checked" />
      <input type="checkbox" name="checkboxes" id="unchecked_box" value="Unchecked"/>
      <input type="radio" name="radiobuttons" id="checked_radio" checked="checked" value="Checked" />
      <input type="radio" name="radiobuttons" id="unchecked_radio" value="Unchecked" />
    </form>
    
    <form id="troubleForm2">
      <input type="checkbox" name="brackets[5][]" id="chk_1" checked="checked" value="1" />
      <input type="checkbox" name="brackets[5][]" id="chk_2" value="2" />    
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
    <div id="dupContainer.withdot:active">
      <span id="dupL1_dotcolon" class="span_foo span_bar">
        <span id="dupL2_dotcolon">
          <span id="dupL3_dotcolon">
            <span id="dupL4_dotcolon">
              <span id="dupL5_dotcolon"></span>
            </span>
          </span>
        </span>
      </span>
    </div> <!-- #dupContainer.withdot:active -->

    <div id="grandfather"> grandfather    
      <div id="father" class="brothers men"> father      
        <div id="son"> son </div>
      </div>
      <div id="uncle" class="brothers men"> uncle </div>
    </div>  

    <form id="commaParent" title="commas,are,good">
      <input type="hidden" id="commaChild" name="foo" value="#commaOne,#commaTwo" />
      <input type="hidden" id="commaTwo" name="foo2" value="oops" />
    </form>
    <div id="counted_container"><div class="is_counted"></div></div>
    
    <div foo-bar="baz" id="attr_with_dash">blah</div>
    
    <div id="container_1" class="container">
      <div id="container_2" class="container">
        <span id="target_1"></span>
      </div>
    </div>
  </div>

  </body>
  </html>
  <script type="text/javascript" charset="utf-8">
    eventResults.endOfDocument = true;
  </script>
`;

runScenarios('prototype 2', 'normal', [
  {
    name: 'standard prototype selectors',
    markup: nwsapiProtoTestHtml,
    markupMode: 'html-document',
    cases: [
      // testSelectorWithTagName
      { select: 'li' },
      { select: 'strong', expect: { ids: ['strong'] } },
      { select: 'nonexistent', expect: { count: 0, ids: [] } },
      { select: '*' },

      // testSelectorWithId
      { select: '#fixtures', expect: { ids: ['fixtures'] } },
      { select: '#nonexistent', expect: { count: 0, ids: [] } },
      { select: '#troubleForm', expect: { ids: ['troubleForm'] } },

      // testSelectorWithClassName
      { select: '.first', expect: { ids: ['p', 'link_1', 'item_1'] } },
      { select: '.second', expect: { count: 0, ids: [] } },

      // testSelectorWithTagNameAndId
      { select: 'strong#strong', expect: { ids: ['strong'] } },
      { select: 'p#strong', expect: { count: 0, ids: [] } },

      // testSelectorWithTagNameAndClassName
      { select: 'a.internal', expect: { ids: ['link_1', 'link_2'] } },
      { select: 'a.internal.highlight', expect: { ids: ['link_2'] } },
      { select: 'a.highlight.internal', expect: { ids: ['link_2'] } },
      { select: 'a.highlight.internal.nonexistent', expect: { count: 0, ids: [] } },

      // testSelectorWithIdAndClassName
      { select: '#link_2.internal', expect: { ids: ['link_2'] } },
      { select: '.internal#link_2', expect: { ids: ['link_2'] } },
      { select: '#link_2.internal.highlight', expect: { ids: ['link_2'] } },
      { select: '#link_2.internal.nonexistent', expect: { count: 0, ids: [] } },

      // testSelectorWithTagNameAndIdAndClassName
      { select: 'a#link_2.internal', expect: { ids: ['link_2'] } },
      { select: 'a.internal#link_2', expect: { ids: ['link_2'] } },
      { select: 'li#item_1.first', expect: { ids: ['item_1'] } },
      { select: 'li#item_1.nonexistent', expect: { count: 0, ids: [] } },
      { select: 'li#item_1.first.nonexistent', expect: { count: 0, ids: [] } },

      // test$$MatchesAncestryWithTokensSeparatedByWhitespace
      { select: '#fixtures a *', expect: { ids: ['em2', 'em', 'span'] } },
      { select: 'div#fixtures p', expect: { ids: ['p'] } },

      // test$$CombinesResultsWhenMultipleExpressionsArePassed
      { select: '#p a, ul#list li', expect: { ids: ['link_1', 'link_2', 'item_1', 'item_2', 'item_3'] } },

      // testSelectorWithTagNameAndAttributeExistence
      { select: 'h1[class]', expect: { equivalentCase: { select: '#fixtures h1' } } },
      { select: 'h1[CLASS]', expect: { equivalentCase: { select: '#fixtures h1' } } },
      { select: 'li#item_3[class]', expect: { ids: ['item_3'] } },

      // testSelectorWithTagNameAndSpecificAttributeValue
      { select: 'a[href="#"]', expect: { ids: ['link_1', 'link_2', 'link_3'] } },
      { select: "a[href='#']", expect: { ids: ['link_1', 'link_2', 'link_3'] } },

      // testSelectorWithTagNameAndWhitespaceTokenizedAttributeValue
      { select: 'a[class~="internal"]', expect: { ids: ['link_1', 'link_2'] } },
      { select: 'a[class~=internal]', expect: { ids: ['link_1', 'link_2'] } },

      // testSelectorWithAttributeAndNoTagName
      { select: '[href]', ref: { by: 'first', selector: 'body' }, expect: { equivalentCase: { select: 'a[href]' } } },
      { select: '[class~=internal]', expect: { equivalentCase: { select: 'a[class~="internal"]' } } },
      { select: '[id]', expect: { equivalentCase: { select: '*[id]' } } },
      { select: '[type=radio]', expect: { ids: ['checked_radio', 'unchecked_radio'] } },
      { select: '[type=checkbox]', expect: { equivalentCase: { select: '*[type=checkbox]' } } },
      { select: '[title]', expect: { ids: ['with_title', 'commaParent'] } },
      { select: '#troubleForm [type=radio]', expect: { equivalentCase: { select: '#troubleForm *[type=radio]' } } },
      { select: '#troubleForm [type]', expect: { equivalentCase: { select: '#troubleForm *[type]' } } },

      // testSelectorWithAttributeContainingDash
      { select: '[foo-bar]', expect: { ids: ['attr_with_dash'] } }, // attribute with hyphen

      // testSelectorWithUniversalAndHyphenTokenizedAttributeValue
      { select: '*[xml:lang|="es"]', expect: { ids: ['item_3'] }, status: 'fixme' },
      { select: '*[xml:lang|="ES"]', expect: { ids: ['item_3'] }, status: 'fixme' },

      // testSelectorWithTagNameAndNegatedAttributeValue
      { select: 'a:not([href="#"])', expect: { count: 0, ids: [] } },

      // testSelectorWithBracketAttributeValue
      { select: '#troubleForm2 input[name="brackets[5][]"]', expect: { ids: ['chk_1', 'chk_2'] } },
      { select: '#troubleForm2 input[name="brackets[5][]"]:checked', expect: { ids: ['chk_1'] } },
      { select: '#troubleForm2 input[name="brackets[5][]"][value="2"]', expect: { ids: ['chk_2'] } },
      { select: '#troubleForm2 input[name=brackets\\[5\\]\\[\\]]', expect: { equivalentCase: { select: '#troubleForm2 input[name="brackets[5][]"]' }, count: 2 } },

      // test$$WithNestedAttributeSelectors
      { select: 'div[style] p[id] strong', expect: { ids: ['strong'] } },

      // testSelectorWithMultipleConditions
      { select: 'a[class~=external][href="#"]', expect: { ids: ['link_3'] } },
      { select: 'a[class~=external]:not([href="#"])', expect: { count: 0, ids: [] } },

      // derived from testSelectorMatchElements
      { select: '#list li', expect: { ids: ['item_1', 'item_2', 'item_3'] } },
      { select: '#fixtures a.internal', expect: { ids: ['link_1', 'link_2'] } },
      { select: '#fixtures p.last', expect: { count: 0, ids: [] } },
      { select: '#fixtures .inexistant, #fixtures a.internal', expect: { ids: ['link_1', 'link_2'] } },

      // derived from testSelectorFindElement
      { select: '#list li', expect: { ids: ['item_1', 'item_2', 'item_3'] } },
      { select: '#list li#item_3', expect: { ids: ['item_3'] } },
      { select: '#list em', expect: { count: 0, ids: [] } },

      // derived from testElementMatch
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


      // testElementMatch
      { match: 'span', ref: { by: 'id', id: 'dupL1' }, expect: { ids: ['dupL1'] } },
      { match: 'span#dupL1', ref: { by: 'id', id: 'dupL1' }, expect: { ids: ['dupL1'] } },
      { match: 'div > span', ref: { by: 'id', id: 'dupL1' }, expect: { ids: ['dupL1'] } },         // child combinator
      { match: '#dupContainer span', ref: { by: 'id', id: 'dupL1' }, expect: { ids: ['dupL1'] } }, // descendant combinator
      { match: '#dupL1', ref: { by: 'id', id: 'dupL1' }, expect: { ids: ['dupL1'] } },              // ID only
      { match: 'span.span_foo', ref: { by: 'id', id: 'dupL1' }, expect: { ids: ['dupL1'] } },       // class name 1
      { match: 'span.span_bar', ref: { by: 'id', id: 'dupL1' }, expect: { ids: ['dupL1'] } },       // class name 2
      { match: 'span:first-child', ref: { by: 'id', id: 'dupL1' }, expect: { ids: ['dupL1'] } },    // first-child pseudoclass

      { match: 'span.span_wtf', ref: { by: 'id', id: 'dupL1' }, expect: { ids: [] } },              // bogus class name
      { match: '#dupL2', ref: { by: 'id', id: 'dupL1' }, expect: { ids: [] } },                      // different ID
      { match: 'div', ref: { by: 'id', id: 'dupL1' }, expect: { ids: [] } },                         // different tag name
      { match: 'span span', ref: { by: 'id', id: 'dupL1' }, expect: { ids: [] } },                   // different ancestry
      { match: 'span > span', ref: { by: 'id', id: 'dupL1' }, expect: { ids: [] } },                 // different parent
      { match: 'span:nth-child(5)', ref: { by: 'id', id: 'dupL1' }, expect: { ids: [] } },           // different pseudoclass

      { match: 'a[rel^=external]', ref: { by: 'id', id: 'link_2' }, expect: { ids: [] } },
      { match: 'a[rel^=external]', ref: { by: 'id', id: 'link_1' }, expect: { ids: ['link_1'] } },
      { match: 'a[rel^="external"]', ref: { by: 'id', id: 'link_1' }, expect: { ids: ['link_1'] } },
      { match: "a[rel^='external']", ref: { by: 'id', id: 'link_1' }, expect: { ids: ['link_1'] } },

      // testSelectorWithSpaceInAttributeValue
      { select: 'cite[title="hello world!"]', expect: { ids: ['with_title'] } },

      // testSelectorWithNamespacedAttributes
      { 
        select: '[xml:lang]',
        status: 'fixme',
        expect: {
          count: 2,
          includesIds: ['item_3'],
          equivalentCase: { select: '*[xml:lang]' }
        }
      },

      // testSelectorWithChild
      { select: 'p.first > a', expect: { ids: ['link_1', 'link_2'] } },
      { select: 'div#grandfather > div', expect: { ids: ['father', 'uncle'] } },
      { select: '#level1>span', expect: { ids: ['level2_1', 'level2_2'] } },
      { select: '#level1 > span', expect: { ids: ['level2_1', 'level2_2'] } },
      { select: '#level2_1 > *', expect: { ids: ['level3_1', 'level3_2'] } },
      { select: 'div > #nonexistent', expect: { count: 0, ids: [] } },
      { select: '#level1 > span' },

      // testSelectorWithAdjacence
      { select: 'div.brothers + div.brothers', expect: { ids: ['uncle'] } },
      { select: 'div.brothers + div', expect: { ids: ['uncle'] } },
      { select: '#level2_1+span', expect: { ids: ['level2_2'] } },
      { select: '#level2_1 + span', expect: { ids: ['level2_2'] } },
      { select: '#level2_1 + *', expect: { ids: ['level2_2'] } },
      { select: '#level2_2 + span', expect: { count: 0, ids: [] } },
      { select: '#level3_1 + span', expect: { ids: ['level3_2'] } },
      { select: '#level3_1 + *', expect: { ids: ['level3_2'] } },
      { select: '#level3_2 + *', expect: { count: 0, ids: [] } },
      { select: '#level3_1 + em', expect: { count: 0, ids: [] } },

      // testSelectorWithLaterSibling
      { select: 'h1 ~ ul', expect: { ids: ['list'] } },
      { select: '#level2_1 ~ span', expect: { ids: ['level2_2'] } },
      { select: '#level2_1 ~ *', expect: { ids: ['level2_2', 'level2_3'] } },
      { select: '#level2_2 ~ span', expect: { count: 0, ids: [] } },
      { select: '#level3_2 ~ *', expect: { count: 0, ids: [] } },
      { select: '#level3_1 ~ em', expect: { count: 0, ids: [] } },
      { select: '#level3_1 ~ #level3_2', expect: { ids: ['level3_2'] } },
      { select: 'span ~ #level3_2', expect: { ids: ['level3_2'] } },
      { select: 'div ~ #level3_2', expect: { count: 0, ids: [] } },
      { select: 'div ~ #level2_3', expect: { count: 0, ids: [] } },

      // testSelectorWithNewAttributeOperators
      { select: 'div[class^=bro]', expect: { ids: ['father', 'uncle'] } },              // matching beginning of string
      { select: 'div[class$=men]', expect: { ids: ['father', 'uncle'] } },              // matching end of string
      { select: 'div[class*="ers m"]', expect: { ids: ['father', 'uncle'] } },          // matching substring
      { select: '#level1 *[id^="level2_"]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },
      { select: '#level1 *[id^=level2_]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },
      { select: '#level1 *[id$="_1"]', expect: { ids: ['level2_1', 'level3_1'] } },
      { select: '#level1 *[id$=_1]', expect: { ids: ['level2_1', 'level3_1'] } },
      { select: '#level1 *[id*="2"]', expect: { ids: ['level2_1', 'level3_2', 'level2_2', 'level2_3'] } },
      { select: "#level1 *[id*='2']", expect: { ids: ['level2_1', 'level3_2', 'level2_2', 'level2_3'] } },

      // benchmark(function() { $$('#level1 *[id^=level2_]') }, 1000, '[^=]')
      { select: '#level1 *[id^=level2_]', expect: { ids: ['level2_1', 'level2_2', 'level2_3'] } },
      // benchmark(function() { $$('#level1 *[id$=_1]') }, 1000, '[$=]')
      { select: '#level1 *[id$=_1]', expect: { ids: ['level2_1', 'level3_1'] } },
      // benchmark(function() { $$('#level1 *[id*=_2]') }, 1000, '[*=]')
      { select: '#level1 *[id*=_2]', expect: { ids: ['level3_2', 'level2_2'] } },

      // testSelectorWithDuplicates
      { select: 'div div' },
      { select: '#dupContainer span span', expect: { ids: ['dupL2', 'dupL3', 'dupL4', 'dupL5'] } },

      // benchmark(function() { $$('#dupContainer span span') }, 1000)
      { select: '#dupContainer span span', expect: { ids: ['dupL2', 'dupL3', 'dupL4', 'dupL5'] } },

      // testSelectorWithFirstLastOnlyNthNthLastChild
      { select: '#level1>*:first-child', expect: { ids: ['level2_1'] } },
      { select: '#level1 *:first-child', expect: { ids: ['level2_1', 'level3_1', 'level_only_child'] } },
      { select: '#level1>*:last-child', expect: { ids: ['level2_3'] } },
      { select: '#level1 *:last-child', expect: { ids: ['level3_2', 'level_only_child', 'level2_3'] } },
      { select: '#level1>div:last-child', expect: { ids: ['level2_3'] } },
      { select: '#level1 div:last-child', expect: { ids: ['level2_3'] } },
      { select: '#level1>div:first-child', expect: { count: 0, ids: [] } },
      { select: '#level1>span:last-child', expect: { count: 0, ids: [] } },
      { select: '#level1 span:first-child', expect: { ids: ['level2_1', 'level3_1'] } },
      { select: '#level1:first-child', expect: { count: 0, ids: [] } },
      { select: '#level1>*:only-child', expect: { count: 0, ids: [] } },
      { select: '#level1 *:only-child', expect: { ids: ['level_only_child'] } },
      { select: '#level1:only-child', expect: { count: 0, ids: [] } },
      { select: '#p *:nth-last-child(2)', expect: { ids: ['link_2'] } },                // nth-last-child
      { select: '#p *:nth-child(3)', expect: { ids: ['link_2'] } },                     // nth-child
      { select: '#p a:nth-child(3)', expect: { ids: ['link_2'] } },                     // nth-child
      { select: '#list > li:nth-child(n+2)', expect: { ids: ['item_2', 'item_3'] } },
      { select: '#list > li:nth-child(-n+2)', expect: { ids: ['item_1', 'item_2'] } },

      // benchmark(function() { $$('#level1 *:first-child') }, 1000, ':first-child')
      { select: '#level1 *:first-child', expect: { ids: ['level2_1', 'level3_1', 'level_only_child'] } },
      // benchmark(function() { $$('#level1 *:last-child') }, 1000, ':last-child')
      { select: '#level1 *:last-child', expect: { ids: ['level3_2', 'level_only_child', 'level2_3'] } },
      // benchmark(function() { $$('#level1 *:only-child') }, 1000, ':only-child')
      { select: '#level1 *:only-child', expect: { ids: ['level_only_child'] } },

      // testSelectorWithFirstLastNthNthLastOfType
      { select: '#p a:nth-of-type(2)', expect: { ids: ['link_2'] } },       // nth-of-type
      { select: '#p a:nth-of-type(1)', expect: { ids: ['link_1'] } },       // nth-of-type
      { select: '#p a:nth-last-of-type(1)', expect: { ids: ['link_2'] } },  // nth-last-of-type
      { select: '#p a:first-of-type', expect: { ids: ['link_1'] } },        // first-of-type
      { select: '#p a:last-of-type', expect: { ids: ['link_2'] } },         // last-of-type

      // testSelectorWithNot
      { select: '#p a:not(:first-of-type)', expect: { ids: ['link_2'] } },         // first-of-type
      { select: '#p a:not(:last-of-type)', expect: { ids: ['link_1'] } },          // last-of-type
      { select: '#p a:not(:nth-of-type(1))', expect: { ids: ['link_2'] } },        // nth-of-type
      { select: '#p a:not(:nth-last-of-type(1))', expect: { ids: ['link_1'] } },   // nth-last-of-type
      { select: '#p a:not([rel~=nofollow])', expect: { ids: ['link_2'] } },        // attribute 1
      { select: '#p a:not([rel^=external])', expect: { ids: ['link_2'] } },        // attribute 2
      { select: '#p a:not([rel$=nofollow])', expect: { ids: ['link_2'] } },        // attribute 3
      { select: '#p a:not([rel$="nofollow"]) > em', expect: { ids: ['em'] } },     // attribute 4
      { select: '#list li:not(#item_1):not(#item_3)', expect: { ids: ['item_2'] } }, // adjacent :not clauses
      { select: '#grandfather > div:not(#uncle) #son', expect: { ids: ['son'] } },
      { select: '#p a:not([rel$="nofollow"]) em', expect: { ids: ['em'] } },       // attribute 4 + all descendants
      { select: '#p a:not([rel$="nofollow"])>em', expect: { ids: ['em'] } },       // attribute 4 (without whitespace)

      // testSelectorWithEnabledDisabledChecked
      { select: '#troubleForm > *:disabled', expect: { ids: ['disabled_text_field'] } },
      { select: '#troubleForm > *:enabled', expect: { ids: ['hidden', 'enabled_text_field', 'checked_box', 'unchecked_box', 'checked_radio', 'unchecked_radio'] } },
      { select: '#troubleForm *:checked', expect: { ids: ['checked_box', 'checked_radio'] } },

      // testIdenticalResultsFromEquivalentSelectors
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
      { select: 'ul > li:nth-child(n-999)', expect: { equivalentCase: { select: 'ul > li' } } },
      { select: 'ul>li', expect: { equivalentCase: { select: 'ul > li' } } },
      { select: '#p a:not([rel$="nofollow"])>em', expect: { equivalentCase: { select: '#p a:not([rel$="nofollow"]) > em' } } },

      // testSelectorsThatShouldReturnNothing
      { select: 'span:empty > *', expect: { count: 0, ids: [] } },
      { select: 'div.brothers:not(.brothers)', expect: { count: 0, ids: [] } },
      { select: '#level2_2 :only-child:not(:last-child)', expect: { count: 0, ids: [] } },
      { select: '#level2_2 :only-child:not(:first-child)', expect: { count: 0, ids: [] } },

      // testCommasFor$$
      { select: '#list, .first, *[xml:lang="es-us"], #troubleForm', expect: { ids: ['p', 'link_1', 'list', 'item_1', 'item_3', 'troubleForm'] }, status: 'fixme' },
      { select: 'form[title*="commas,"], input[value="#commaOne,#commaTwo"]', expect: { ids: ['commaParent', 'commaChild'] } },

      // testElementDownWithDotAndColon
      { select: '#dupContainer\\.withdot\\:active #dupL4_dotcolon', expect: { ids: ['dupL4_dotcolon'] } }
    ],
  },

  {
    name: 'empty pseudo after mutation',
    markupMode: 'html-document',
    markup: nwsapiProtoTestHtml,
    setupPage: async (page) => {
      await page.evaluate(() => {
        const el = document.getElementById('level3_1');
        if (el) el.innerHTML = '';
      });
    },
    cases: [
      // testSelectorWithEmpty
      { select: '#level1 *:empty', expect: { ids: ['level3_1', 'level3_2', 'level2_3'] } },
      { select: '#level_only_child:empty', expect: { count: 0, ids: [] } }, // newlines count as content
    ],
  },

  {
    name: 'selectors on detached nodes',
    markup: '',
    cases: [],
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = "<table><tr><td id='myTD'></td></tr></table>";

        return {
          byAttr: NW.Dom.select('[id=myTD]', wrapper).map(el => el.getAttribute('id')),
          byTag: NW.Dom.select('td', wrapper).map(el => el.getAttribute('id')),
          byId: NW.Dom.select('#myTD', wrapper).map(el => el.getAttribute('id')),
        };
      });

      expect(result.byAttr).toEqual(['myTD']);
      expect(result.byTag).toEqual(['myTD']);
      expect(result.byId).toEqual(['myTD']);
    },
  },

  {
    name: 'descendant selector on dynamic subtree',
    markup: '',
    cases: [],
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const el = document.createElement('div');
        el.innerHTML = '<ul><li></li></ul><div><ul><li></li></ul></div>';
        document.body.appendChild(el);

        const nativeCount = el.querySelectorAll('ul li').length;
        const nwCount = NW.Dom.select('ul li', el).length;

        document.body.removeChild(el);
        return { nativeCount, nwCount };
      });

      expect(result.nativeCount).toBe(2);
      expect(result.nwCount).toBe(2);
    },
  },
]);