import { runScenarios } from "./harness";

runScenarios('css3 compat', 'normal',  [
  {
    name: 'test 0 basic selectors',
    html: `
      <div class="header">
        <h3>CSS 3 Selectors tests</h3>
        <p><small><a href="http://www.disruptive-innovations.com/zoo/css3tests/selectorTest.html">Original</a> CSS work by Daniel Glazman (c) <a href="http://www.disruptive-innovations.com">Disruptive Innovations</a> 2008</small></p>
        <p>Testing code written by <a href="http://javascript.nwbox.com">Diego Perini</a>. It should help improve the consistency with <code>querySelectorAll</code> results and match browsers internal CSS selectors behavior. Selection method calls are wrapped in a try/catch block for all libs to avoid possible errors preventing the tests to complete. Moving the mouse over the red/lime blocks will show the tooltips with info on the tests.</p>
      </div>

      <div class="test target">
        <div class="unitTest" id="target"></div>
      </div>

      <div class="test">
        <div class="blox1 unitTest"></div>
      </div>

      <div class="footer">
        <h4>NOTE:</h4>
        <ul>
          <li>- the native querySelectorAll and querySelector methods are overwritten to force frameworks to use fall back</li>
          <li>- the :root pseudo-class in the original test have been removed since it has no wide support across frameworks</li>
          <li>- the dynamic part of the original test have been removed since this test only apply static style to elements</li>
          <li>- frameworks bugs fixing abilities can be evaluated by running this test in FF 3, Safari 3, Opera 9 or IE6/7/8</li>
        </ul>
      </div>`,
    setupPage: async (page) => { await page.evaluate(() => { location.hash = 'target'; });},
    cases: [
      /* element type selector */
      { selector: 'body', expect: { count: 1 } },
      { selector: 'div', expect: { count: 6 } },
      { selector: 'div.header', expect: { count: 1 } },
      { selector: 'div.footer', expect: { count: 1 } },
      { selector: 'h3, h4, p, ul', expect: { count: 5 } },

      /* class selector */
      { selector: '.unitTest', expect: { count: 2 } },
      { selector: '.test', expect: { count: 2 } },

      /* group of selectors */
      { selector: '.unitTest, .test', expect: { count: 4 } },

      /* :target selector */
      { selector: '.target :target', expect: { count: 1 } },
    ],
  },
  {
    name: 'test 1 childhood selector',
    htmlMode: 'document',
    html: `
      <!doctype html>
      <html>
        <body>
          <div class="test">
            <div class="blox1 unitTest"></div>
          </div>
        </body>
      </html>
    `,
    cases: [
      /* test 1 : childhood selector */
      { selector: 'html > body', expect: { count: 1 } },
      { selector: '.test > .blox1', expect: { count: 1 } },
    ],
  },
  {
    name: 'test 2 attribute existence selector',
    html: `
      <div class="test attributeExistence">
        <div class="blox2 unitTest" align="center"></div>
        <div class="blox3 unitTest" align=""></div>
        <div class="blox4 unitTest" valign="center"></div>
        <div class="blox5 unitTest" alignv="center"></div>
      </div>
    `,
    cases: [
      /* attribute with a value */
      { selector: '.blox2[align]', expect: { count: 1 } },

      /* attribute with empty value */
      { selector: '.blox3[align]', expect: { count: 1 } },

      /* attribute with almost similar name */
      { selector: '.blox4, .blox5', expect: { count: 2 } },
      { selector: '.blox4[align], .blox5[align]', expect: { count: 0 } },
    ],
  },
  {
    name: 'test 3 attribute value selector',
    html: `
      <div class="test attributeValue">
        <div class="blox6 unitTest" align="center"></div>
        <div class="blox6 unitTest" foo="é"></div>
        <div class="blox6 unitTest" _foo="é"></div>
      </div>
    `,
    cases: [
      /* test 3 : attribute value selector */
      { selector: '.blox6[align="center"]', expect: { count: 1 } },
      { selector: '.blox6[align="c"]', expect: { count: 0 } },
      { selector: '.blox6[align="centera"]', expect: { count: 0 } },
      { selector: '.blox6[foo="\\e9"]', expect: { count: 1 } },
      { selector: '.blox6[\\_foo="\\e9"]', expect: { count: 1 } },
    ],
  },
  {
    name: 'test 4 space-separated attribute selector',
    html: `
      <div class="test attributeSpaceSeparatedValues">
        <div class="blox7 foo unitTest"></div>
        <div class="blox8 unitTest"></div>
        <div class="blox9 unitTest" foo=""></div>
        <div class="blox10 unitTest" foo="foobar"></div>
      </div>
    `,
    cases: [
      /* test 4 : [~=] */
      { selector: '.blox7[class~="foo"]', expect: { count: 1 } },
      { selector: '.blox8, .blox9, .blox10', expect: { count: 3 } },
      { selector: '.blox8[class~=""]', expect: { count: 0 } },
      { selector: '.blox9[foo~=""]', expect: { count: 0 } },
      { selector: '.blox10[foo~="foo"]', expect: { count: 0 } },
    ],
  },
  {
    name: 'test 5 attribute starts-with selector',
    html: `
      <div class="test attrStart">
        <div class="unitTest t1"></div>
        <div class="unitTest t2"></div>
        <div class="unitTest t3" align="center"></div>
        <div class="unitTest t4" foo="&eacute;tagada"></div>
      </div>
    `,
    cases: [
      /* test5 [^=] */
      { selector: '.attrStart > .t3', expect: { count: 1 } },
      { selector: '.attrStart > .t1[class^="unit"]', expect: { count: 1 } },
      { selector: '.attrStart > .t2', expect: { count: 1 } },
      { selector: '.attrStart > .t2[class^="nit"]', expect: { count: 0 } },
      { selector: '.attrStart > .t3[align^=""]', expect: { count: 0 } },
      { selector: '.attrStart > .t4[foo^="\\e9"]', expect: { count: 1 } },
    ],
  },
  {
    name: 'test 6 attribute ends-with selector',
    html: `
      <div class="test attrEnd">
        <div class="unitTest t1"></div>
        <div class="unitTest t2"></div>
        <div class="unitTest t3" align="center"></div>
        <div class="unitTest t4" foo="tagadaé"></div>
      </div>
    `,
    cases: [
      /* test6 [$=] */
      { selector: '.attrEnd > .t3', expect: { count: 1 } },
      { selector: '.attrEnd > .t1[class$="t1"]', expect: { count: 1 } },
      { selector: '.attrEnd > .t2', expect: { count: 1 } },
      { selector: '.attrEnd > .t2[class$="unit"]', expect: { count: 0 } },
      { selector: '.attrEnd > .t3[align$=""]', expect: { count: 0 } },
      { selector: '.attrEnd > .t4[foo$="\\e9"]', expect: { count: 1 } },
    ],
  },
  {
    name: 'test 7 attribute contains selector',
    html: `
      <div class="test attrMiddle">
        <div class="unitTest t1"></div>
        <div class="unitTest t2"></div>
        <div class="unitTest t3" align="center"></div>
        <div class="unitTest t4" foo="tagadaéfoo"></div>
      </div>
    `,
    cases: [
      /* test7 [*=] */
      { selector: '.attrMiddle > .t3', expect: { count: 1 } },
      { selector: '.attrMiddle > .t1[class*="t t"]', expect: { count: 1 } },
      { selector: '.attrMiddle > .t2', expect: { count: 1 } },
      { selector: '.attrMiddle > .t2[class*="a"]', expect: { count: 0 } },
      { selector: '.attrMiddle > .t3[align*=""]', expect: { count: 0 } },
      { selector: '.attrMiddle > .t4[foo*="\\e9"]', expect: { count: 1 } },
    ],
  },
  {
    name: 'first-child selector',
    html: `
      <div class="test firstChild">
        <div class="unitTest"></div>
        <div class="blox12 unitTest"></div>
        <div class="blox13 unitTest"></div>
      </div>
    `,
    cases: [
      /* :first-child tests */
      { selector: '.firstChild .unitTest:first-child', expect: { count: 1 } },
      { selector: '.blox12:first-child', expect: { count: 0 } },
      { selector: '.blox13:first-child', expect: { count: 0 } },
      { selector: '.blox12, .blox13', expect: { count: 2 } },
    ],
  },
  {
    name: ':nth-child(n) and :nth-of-type tests',
    html: `
      <div class="test nthchild1">
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
      </div>
      <div class="test nthchild2">
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
      </div>
      <div class="test nthchild3">
        <div class="unitTest no"></div>
        <div class="unitTest"></div>
        <div class="unitTest no"></div>
        <div class="unitTest no"></div>
        <div class="unitTest"></div>
        <div class="unitTest no"></div>
      </div>

      <div class="test nthoftype1">
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
      </div>
      <div class="test nthoftype2">
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
      </div>
      <div class="test nthoftype3">
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
      </div>
    `,
    cases: [
      /* :nth-child(n) tests */
      { selector: '.nthchild1 > :nth-last-child(odd)', expect: { count: 3 } },
      { selector: '.nthchild1 > :nth-child(odd)', expect: { count: 3 } },

      { selector: '.nthchild2 > :nth-last-child(even)', expect: { count: 3 } },
      { selector: '.nthchild2 > :nth-child(even)', expect: { count: 3 } },

      { selector: '.nthchild3 > :nth-child(3n+2)', expect: { count: 2 } },
      { selector: '.nthchild3 > :nth-last-child(3n+1)', expect: { count: 2 } },
      { selector: '.nthchild3 > :nth-last-child(3n+3)', expect: { count: 2 } },

      { selector: '.nthoftype1 > div:nth-of-type(odd)', expect: { count: 2 } },
      { selector: '.nthoftype1 > div:nth-last-of-type(odd)', expect: { count: 2 } },
      { selector: '.nthoftype1 > p', expect: { count: 3 } },

      { selector: '.nthoftype2 > div:nth-of-type(even)', expect: { count: 2 } },
      { selector: '.nthoftype2 > div:nth-last-of-type(even)', expect: { count: 2 } },
      { selector: '.nthoftype2 > p', expect: { count: 3 } },

      { selector: '.nthoftype3 > div:nth-of-type(3n+1)', expect: { count: 2 } },
      { selector: '.nthoftype3 > div:nth-last-of-type(3n+1)', expect: { count: 2 } },
      { selector: '.nthoftype3 > div:nth-last-of-type(3n+2)', expect: { count: 2 } },
      { selector: '.nthoftype3 > p', expect: { count: 4 } },
    ],
  },
  {
    name: 'not pseudo-class selector',
    html: `
      <div class="test not">
        <div class="blox14 unitTest"></div>
        <div class="blox15 unitTest" foo="blox15"></div>
        <div class="blox16 unitTest" foo="blox15"></div>
      </div>
    `,
    cases: [
      /* :not() tests */
      { selector: '.blox14:not(span)', expect: { count: 1 } },
      { selector: '.blox15:not([foo="blox14"])', expect: { count: 1 } },
      { selector: '.blox16', expect: { count: 1 } },
      { selector: '.blox16:not(.blox15)', expect: { count: 1 } },
    ],
  },
  {
    name: ':only-of-type tests',
    html: `
      <div class="test onlyOfType">
        <div class="blox17 unitTest"></div>
        <p class="blox18 unitTest"></p>
        <p class="blox18 unitTest"></p>
      </div>
    `,
    cases: [
      /* :only-of-type tests */
      { selector: '.blox17', expect: { count: 1 } },
      { selector: '.blox17:only-of-type', expect: { count: 1 } },
      { selector: '.blox18:only-of-type', expect: { count: 0 } },
      { selector: '.blox18:not(:only-of-type)', expect: { count: 2 } },
    ],
  },
  {
    name: ':last-child tests',
    html: `
      <div class="test lastChild">
        <p class="unitTest"></p>
        <div class="unitTest"></div>&nbsp;
      </div>
    `,
    cases: [
      /* :last-child tests */
      { selector: '.lastChild > p', expect: { count: 1 } },
      { selector: '.lastChild > :last-child', expect: { count: 1 } },
      { selector: '.lastChild > :not(:last-child)', expect: { count: 1 } },
    ],
  },
  {
    name: ':first-of-type tests',
    html: `
      <div class="test firstOfType">
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
      </div>
    `,
    cases: [
      /* :first-of-type tests */
      { selector: '.firstOfType > p', expect: { count: 2 } },
      { selector: '.firstOfType > *:first-of-type', expect: { count: 2 } },
      { selector: '*.firstOfType > :not(:first-of-type)', expect: { count: 2 } },
    ],
  },


  {
    name: ':last-of-type tests',
    html: `
      <div class="test lastOfType">
        <p class="unitTest"></p>
        <div class="unitTest"></div>
        <p class="unitTest"></p>
        <div class="unitTest"></div>
      </div>
    `,
    cases: [
      /* :last-of-type tests */
      { selector: '.lastOfType > p', expect: { count: 2 } },
      { selector: '.lastOfType > *:last-of-type', expect: { count: 2 } },
      { selector: '*.lastOfType > :not(:last-of-type)', expect: { count: 2 } },
    ],
  },
  {
    name: ':only-child tests',
    html: `
      <div class="test onlyChild">
        <div class="unitTest"></div>
        <div class="unitTest">
          <div class="unitTest"></div>
        </div>
      </div>
    `,
    cases: [
      /* :only-child tests */
      { selector: '.onlyChild > *:not(:only-child)', expect: { count: 2 } },
      { selector: '.onlyChild > .unitTest > *:only-child', expect: { count: 1 } },
    ],
  },
  {
    name: ':only-of-type tests 2',
    html: `
      <div class="test onlyOfType">
        <p class="unitTest"></p>
        <div class="unitTest">
          <div class="unitTest"></div>
        </div>
        <div class="unitTest"></div>
      </div>
    `,
    cases: [
      /* :only-of-type tests */
      { selector: '.onlyOfType *:only-of-type', expect: { count: 2 } },
      { selector: '.onlyOfType *:not(:only-of-type)', expect: { count: 2 } },
    ],
  },

  {
    name: ':empty tests',
    html: `
      <div class="test empty">
        <div class="unitTest isEmpty"></div>
        <div class="unitTest isNotEmpty"> </div>
        <div class="unitTest isEmpty"><!-- foo --></div>
        <div class="unitTest isNotEmpty"><span></span></div>
        <div class="unitTest isNotEmpty">&nbsp;</div>
      </div>
    `,
    cases: [
      /* :empty tests */
      { selector: '.empty > .isEmpty', expect: { count: 2 } },
      { selector: '.empty > *.isEmpty:empty', expect: { count: 2 } },
      { selector: '.empty > .isNotEmpty', expect: { count: 3 } },
      { selector: '.empty > .isNotEmpty:empty', expect: { count: 0 } },
      { selector: '.empty > .isNotEmpty:not(:empty)', expect: { count: 3 } },
    ],
  },
  {
    name: ':lang() tests',
    html: `
      <div class="test lang">
        <div class="unitTest"></div>
        <div class="unitTest" lang="fr"></div>
        <div class="unitTest" lang="en-US"></div>
        <div class="unitTest t1" lang="es"></div>
      </div>
    `,
    setupPage: async (page) => {
      await page.evaluate(() => {
        document.documentElement.lang = 'en';
      });
    },
    cases: [
      /* :lang() tests */
      { selector: '.lang :lang(en)', expect: { count: 2 } },
      { selector: '.lang :lang(fr)', expect: { count: 1 } },
      { selector: '.lang .t1', expect: { count: 1 } },
      { selector: '.lang .t1:lang(es)', expect: { count: 1 } },
      { selector: '.lang :lang(es-AR)', expect: { count: 0 } },
    ],
  },
  {
    name: '[|=] tests',
    html: `
      <div class="test attrLang">
        <div class="unitTest t1"></div>
        <div class="unitTest" lang="fr"></div>
        <div class="unitTest t2" lang="en-US"></div>
        <div class="unitTest t3" lang="es"></div>
      </div>
    `,
    setupPage: async (page) => {
      await page.evaluate(() => {
        document.documentElement.lang = 'en';
      });
    },
    cases: [
      /* [|=] tests */
      { selector: '.attrLang .t1', expect: { count: 1 } },
      { selector: '.attrLang .t1[lang|="en"]', expect: { count: 0 } },
      { selector: '.attrLang [lang|="fr"]', expect: { count: 1 } },
      { selector: '.attrLang .t2[lang|="en"]', expect: { count: 1 } },
      { selector: '.attrLang .t3', expect: { count: 1 } },
      { selector: '.attrLang .t3[lang|="es"]', expect: { count: 1 } },
      { selector: '.attrLang [lang|="es-AR"]', expect: { count: 0 } },
    ],
  },

  {
    name: 'UI tests',
    html: `
      <div class="test UI">
        <button name="submit" type="submit" value="submit" class="t1">
          <div class="unitTest"></div>
        </button>
        <button name="submit" type="submit" value="submit" class="t2" disabled="true">
          <div class="unitTest"></div>
        </button>
      </div>
      <div class="test UI">
        <input class="t3" type="checkbox" checked="true"><div class="unitTest"></div>
        the previous square should be green when the checkbox is checked and become red when you uncheck it
      </div>
      <div class="test UI">
        <input class="t4" type="checkbox"><div class="unitTest"></div>
        the previous square should be green when the checkbox is NOT checked and become red when you check it
      </div>
    `,
    cases: [
      /* UI tests */
      { selector: '.UI .t1:enabled > .unitTest', expect: { count: 1 } },
      { selector: '.UI .t2:disabled > .unitTest', expect: { count: 1 } },
      { selector: '.UI .t3:checked + div', expect: { count: 1 } },
      { selector: '.UI .t4:not(:checked) + div', expect: { count: 1 } },
    ],
  },
  {
    name: '~ combinator tests',
    html: `
      <div class="test tilda">
        <div class="unitTest t1"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <span style="float:left">the three last squares should be green and become red when the pointer hovers over the white square</span>
      </div>
    `,
    cases: [
      /* ~ combinator tests */
      { selector: '.tilda .t1', expect: { count: 1 } },
      { selector: '.tilda .t1 ~ .unitTest', expect: { count: 3 } },
    ],
  },
  {
    name: '+ combinator tests',
    html: `
      <div class="test plus">
        <div class="unitTest t1"></div>
        <div class="unitTest t2"></div>
        <div class="unitTest"></div>
        <span style="float:left">the last square should be green and become red when the pointer hovers over the FIRST white square</span>
      </div>
    `,
    cases: [
      /* + combinator tests */
      { selector: '.plus .t1, .plus .t2', expect: { count: 2 } },
      { selector: '.plus .t1 + .unitTest + .unitTest', expect: { count: 1 } },
    ],
  },
  {
    name: 'attribute case sensitivity identifier tests',
    html: `
      <div class="test attrCaseInsensitive">
        <div class="blox23s1 unitTest" foo="blox"></div>
        <div class="blox23s2 unitTest" foo="blox"></div>
        <div class="blox23s3 unitTest" foo="blox"></div>
        <div class="blox23s4 unitTest" foo="blox"></div>
        <div class="blox23s5 unitTest" foo="blox"></div>
        <div class="blox23s6 unitTest" foo="blox"></div>
        <div class="blox19 unitTest"></div>
        <div class="blox20 unitTest"></div>
        <div class="blox21 unitTest"></div>
        <div class="blox22 unitTest"></div>
        <div class="blox24 unitTest"></div>
        <div class="blox25 unitTest"></div>
        <div class="blox26 unitTest"></div>
        <div class="blox27 unitTest"></div>
        <div class="blox28 unitTest foobar"></div>
      </div>
    `,
    cases: [
      { selector: '.blox23s1[foo="blox" i]', expect: { count: 1 } },
      { selector: '.blox23s2[foo="blox" i]', expect: { count: 1 } },
      { selector: '.blox23s3[foo="blox" i]', expect: { count: 1 } },
      { selector: '.blox23s4[foo="blox" i]', expect: { count: 1 } },
      { selector: '.blox23s5[foo="blox" i]', expect: { count: 1 } },
      { selector: '.blox23s6[foo="blox" i]', expect: { count: 1 } },
      { selector: '.blox23s1[foo="blox" erroneous]', expect: { throws: true } },
      { selector: '.blox19[class="BLOX19 UNITTEST" i]', expect: { count: 1 } },
      { selector: '.blox20[class="BLOX20 UNITTEST" i]', expect: { count: 1 } },
      { selector: '.blox20[class="blox20 unitTest" s]', expect: { throws: true } },
      { selector: '.blox21[class*="21 UN" i]', expect: { count: 1 } },
      { selector: '.blox22[class*="22 unitt" s]', expect: { throws: true } },
      { selector: '.blox22[class*="22 unitT" s]', expect: { throws: true } },
      { selector: '.blox24[class^="BLOX" i]', expect: { count: 1 } },
      { selector: '.blox25[class^="BLOX"]', expect: { count: 0 } },
      { selector: '.blox25[class^="blox" s]', expect: { throws: true } },
      { selector: '.blox26[class$="tEST" i]', expect: { count: 1 } },
      { selector: '.blox27[class$="TEst" s]', expect: { throws: true } },
      { selector: '.blox27[class$="Test" s]', expect: { throws: true } },
      { selector: '.blox28[class~="unitTEST" i]', expect: { count: 1 } },
    ],
  },
  {
    name: 'attribute s-flag divergence',
    modifier: 'fail',
    html: `
      <div class="test attrCaseInsensitive">
        <div class="blox20 unitTest"></div>
        <div class="blox22 unitTest"></div>
        <div class="blox25 unitTest"></div>
        <div class="blox27 unitTest"></div>
      </div>
    `,
    cases: [
      { selector: '.blox20[class="blox20 unitTest" s]' },
      { selector: '.blox22[class*="22 unitt" s]' },
      { selector: '.blox22[class*="22 unitT" s]' },
      { selector: '.blox25[class^="blox" s]' },
      { selector: '.blox27[class$="TEst" s]' },
      { selector: '.blox27[class$="Test" s]' },
    ],
  },
]);
