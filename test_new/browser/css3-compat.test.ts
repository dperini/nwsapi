import { runScenarios } from "./harness/scenarios";

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
      { select: 'body', expect: { count: 1 } },
      { select: 'div', expect: { count: 6 } },
      { select: 'div.header', expect: { count: 1 } },
      { select: 'div.footer', expect: { count: 1 } },
      { select: 'h3, h4, p, ul', expect: { count: 5 } },

      /* class selector */
      { select: '.unitTest', expect: { count: 2 } },
      { select: '.test', expect: { count: 2 } },

      /* group of selectors */
      { select: '.unitTest, .test', expect: { count: 4 } },

      /* :target selector */
      { select: '.target :target', expect: { count: 1 } },
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
      { select: 'html > body', expect: { count: 1 } },
      { select: '.test > .blox1', expect: { count: 1 } },
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
      { select: '.blox2[align]', expect: { count: 1 } },

      /* attribute with empty value */
      { select: '.blox3[align]', expect: { count: 1 } },

      /* attribute with almost similar name */
      { select: '.blox4, .blox5', expect: { count: 2 } },
      { select: '.blox4[align], .blox5[align]', expect: { count: 0 } },
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
      { select: '.blox6[align="center"]', expect: { count: 1 } },
      { select: '.blox6[align="c"]', expect: { count: 0 } },
      { select: '.blox6[align="centera"]', expect: { count: 0 } },
      { select: '.blox6[foo="\\e9"]', expect: { count: 1 } },
      { select: '.blox6[\\_foo="\\e9"]', expect: { count: 1 } },
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
      { select: '.blox7[class~="foo"]', expect: { count: 1 } },
      { select: '.blox8, .blox9, .blox10', expect: { count: 3 } },
      { select: '.blox8[class~=""]', expect: { count: 0 } },
      { select: '.blox9[foo~=""]', expect: { count: 0 } },
      { select: '.blox10[foo~="foo"]', expect: { count: 0 } },
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
      { select: '.attrStart > .t3', expect: { count: 1 } },
      { select: '.attrStart > .t1[class^="unit"]', expect: { count: 1 } },
      { select: '.attrStart > .t2', expect: { count: 1 } },
      { select: '.attrStart > .t2[class^="nit"]', expect: { count: 0 } },
      { select: '.attrStart > .t3[align^=""]', expect: { count: 0 } },
      { select: '.attrStart > .t4[foo^="\\e9"]', expect: { count: 1 } },
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
      { select: '.attrEnd > .t3', expect: { count: 1 } },
      { select: '.attrEnd > .t1[class$="t1"]', expect: { count: 1 } },
      { select: '.attrEnd > .t2', expect: { count: 1 } },
      { select: '.attrEnd > .t2[class$="unit"]', expect: { count: 0 } },
      { select: '.attrEnd > .t3[align$=""]', expect: { count: 0 } },
      { select: '.attrEnd > .t4[foo$="\\e9"]', expect: { count: 1 } },
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
      { select: '.attrMiddle > .t3', expect: { count: 1 } },
      { select: '.attrMiddle > .t1[class*="t t"]', expect: { count: 1 } },
      { select: '.attrMiddle > .t2', expect: { count: 1 } },
      { select: '.attrMiddle > .t2[class*="a"]', expect: { count: 0 } },
      { select: '.attrMiddle > .t3[align*=""]', expect: { count: 0 } },
      { select: '.attrMiddle > .t4[foo*="\\e9"]', expect: { count: 1 } },
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
      { select: '.firstChild .unitTest:first-child', expect: { count: 1 } },
      { select: '.blox12:first-child', expect: { count: 0 } },
      { select: '.blox13:first-child', expect: { count: 0 } },
      { select: '.blox12, .blox13', expect: { count: 2 } },
    ],
  },
  {
    name: 'root selector',
    html: '',
    cases: [
      /* :root tests */
      { select: 'html', expect: { equivalentCase: { select: ':root' } } },
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
      { select: '.nthchild1 > :nth-last-child(odd)', expect: { count: 3 } },
      { select: '.nthchild1 > :nth-child(odd)', expect: { count: 3 } },

      { select: '.nthchild2 > :nth-last-child(even)', expect: { count: 3 } },
      { select: '.nthchild2 > :nth-child(even)', expect: { count: 3 } },

      { select: '.nthchild3 > :nth-child(3n+2)', expect: { count: 2 } },
      { select: '.nthchild3 > :nth-last-child(3n+1)', expect: { count: 2 } },
      { select: '.nthchild3 > :nth-last-child(3n+3)', expect: { count: 2 } },

      { select: '.nthoftype1 > div:nth-of-type(odd)', expect: { count: 2 } },
      { select: '.nthoftype1 > div:nth-last-of-type(odd)', expect: { count: 2 } },
      { select: '.nthoftype1 > p', expect: { count: 3 } },

      { select: '.nthoftype2 > div:nth-of-type(even)', expect: { count: 2 } },
      { select: '.nthoftype2 > div:nth-last-of-type(even)', expect: { count: 2 } },
      { select: '.nthoftype2 > p', expect: { count: 3 } },

      { select: '.nthoftype3 > div:nth-of-type(3n+1)', expect: { count: 2 } },
      { select: '.nthoftype3 > div:nth-last-of-type(3n+1)', expect: { count: 2 } },
      { select: '.nthoftype3 > div:nth-last-of-type(3n+2)', expect: { count: 2 } },
      { select: '.nthoftype3 > p', expect: { count: 4 } },
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
      { select: '.blox14:not(span)', expect: { count: 1 } },
      { select: '.blox15:not([foo="blox14"])', expect: { count: 1 } },
      { select: '.blox16', expect: { count: 1 } },
      { select: '.blox16:not(.blox15)', expect: { count: 1 } },
      { select: '.blox16:not(.blox15[foo="blox14"])', expect: { count: 1 } },
      { select: '.unitTest:not(.blox15[foo="blox15"])', expect: { count: 2 } },
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
      { select: '.blox17', expect: { count: 1 } },
      { select: '.blox17:only-of-type', expect: { count: 1 } },
      { select: '.blox18:only-of-type', expect: { count: 0 } },
      { select: '.blox18:not(:only-of-type)', expect: { count: 2 } },
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
      { select: '.lastChild > p', expect: { count: 1 } },
      { select: '.lastChild > :last-child', expect: { count: 1 } },
      { select: '.lastChild > :not(:last-child)', expect: { count: 1 } },
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
      { select: '.firstOfType > p', expect: { count: 2 } },
      { select: '.firstOfType > *:first-of-type', expect: { count: 2 } },
      { select: '*.firstOfType > :not(:first-of-type)', expect: { count: 2 } },
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
      { select: '.lastOfType > p', expect: { count: 2 } },
      { select: '.lastOfType > *:last-of-type', expect: { count: 2 } },
      { select: '*.lastOfType > :not(:last-of-type)', expect: { count: 2 } },
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
      { select: '.onlyChild > *:not(:only-child)', expect: { count: 2 } },
      { select: '.onlyChild > .unitTest > *:only-child', expect: { count: 1 } },
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
      { select: '.onlyOfType *:only-of-type', expect: { count: 2 } },
      { select: '.onlyOfType *:not(:only-of-type)', expect: { count: 2 } },
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
      { select: '.empty > .isEmpty', expect: { count: 2 } },
      { select: '.empty > *.isEmpty:empty', expect: { count: 2 } },
      { select: '.empty > .isNotEmpty', expect: { count: 3 } },
      { select: '.empty > .isNotEmpty:empty', expect: { count: 0 } },
      { select: '.empty > .isNotEmpty:not(:empty)', expect: { count: 3 } },
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
      { select: '.lang :lang(en)', expect: { count: 2 } },
      { select: '.lang :lang(fr)', expect: { count: 1 } },
      { select: '.lang .t1', expect: { count: 1 } },
      { select: '.lang .t1:lang(es)', expect: { count: 1 } },
      { select: '.lang :lang(es-AR)', expect: { count: 0 } },
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
      { select: '.attrLang .t1', expect: { count: 1 } },
      { select: '.attrLang .t1[lang|="en"]', expect: { count: 0 } },
      { select: '.attrLang [lang|="fr"]', expect: { count: 1 } },
      { select: '.attrLang .t2[lang|="en"]', expect: { count: 1 } },
      { select: '.attrLang .t3', expect: { count: 1 } },
      { select: '.attrLang .t3[lang|="es"]', expect: { count: 1 } },
      { select: '.attrLang [lang|="es-AR"]', expect: { count: 0 } },
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
      { select: '.UI', expect: { count: 3 } },
      { select: '.UI > *', expect: { count: 6 } },
      { select: '.UI .t1:enabled > .unitTest', expect: { count: 1 } },
      { select: '.UI .t2:disabled > .unitTest', expect: { count: 1 } },
      { select: '.UI .t3:checked + div', expect: { count: 1 } },
      { select: '.UI .t4:not(:checked) + div', expect: { count: 1 } },
    ],
  },
  {
    name: '~ combinator tests',
    html: `
      <div class="test tilda">
        <div class="unitTest t1" style="width:20px;height:20px;"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <div class="unitTest"></div>
        <span style="float:left">the three last squares should be green and become red when the pointer hovers over the white square</span>
      </div>
    `,
    steps: [
      {
        // ensure baseline starts non-hovered; native :hover may already match if the pointer begins over the target
        setupPage: async (page) => { await page.mouse.move(200, 200); },
        cases: [
          /* ~ combinator tests */
          { select: '.tilda', expect: { count: 1 } },
          { select: '.tilda .t1', expect: { count: 1 } },
          { select: '.tilda .t1 ~ .unitTest', expect: { count: 3 } },
          { select: '.tilda .t1:hover ~ .unitTest', expect: { count: 0 } },
        ],
      },
      {
        setupPage: async (page) => { await page.locator('.tilda .t1').hover(); },
        cases: [
          { select: '.tilda .t1:hover', expect: { count: 1 } },
          { select: '.tilda .t1:hover ~ .unitTest', expect: { count: 3 } },
        ],
      },
    ],
  },
  {
    name: '+ combinator tests',
    html: `
      <div class="test plus">
        <div class="unitTest t1" style="width:20px;height:20px;"></div>
        <div class="unitTest t2"></div>
        <div class="unitTest"></div>
        <span style="float:left">the last square should be green and become red when the pointer hovers over the FIRST white square</span>
      </div>
    `,
    steps: [
      {
        // ensure baseline starts non-hovered;
        setupPage: async (page) => { await page.mouse.move(200, 200); },
        cases: [
          /* + combinator tests */
          { select: '.plus', expect: { count: 1 } },
          { select: '.plus .t1, .plus .t2', expect: { count: 2 } },
          { select: '.plus .t1 + .unitTest + .unitTest', expect: { count: 1 } },
          { select: '.plus .t1:hover + .unitTest + .unitTest', expect: { count: 0 } },
        ],
      },
      {
        setupPage: async (page) => { await page.locator('.plus .t1').hover(); },
        cases: [
          { select: '.plus .t1:hover + .unitTest + .unitTest', expect: { count: 1 } },
        ],
      },
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
      { select: '.blox23s1[foo="blox" i]', expect: { count: 1 } },
      { select: '.blox23s2[foo="blox" i]', expect: { count: 1 } },
      { select: '.blox23s3[foo="blox" i]', expect: { count: 1 } },
      { select: '.blox23s4[foo="blox" i]', expect: { count: 1 } },
      { select: '.blox23s5[foo="blox" i]', expect: { count: 1 } },
      { select: '.blox23s6[foo="blox" i]', expect: { count: 1 } },
      { select: '.blox23s1[foo="blox" erroneous]', expect: { throws: true } },
      { select: '.blox19[class="BLOX19 UNITTEST" i]', expect: { count: 1 } },
      { select: '.blox20[class="BLOX20 UNITTEST" i]', expect: { count: 1 } },
      { select: '.blox20[class="blox20 unitTest" s]', status: 'fixme' },
      { select: '.blox21[class*="21 UN" i]', expect: { count: 1 } },
      { select: '.blox22[class*="22 unitt" s]', status: 'fixme' },
      { select: '.blox22[class*="22 unitT" s]', status: 'fixme' },
      { select: '.blox24[class^="BLOX" i]', expect: { count: 1 } },
      { select: '.blox25[class^="BLOX"]', expect: { count: 0 } },
      { select: '.blox25[class^="blox" s]', status: 'fixme' },
      { select: '.blox26[class$="tEST" i]', expect: { count: 1 } },
      { select: '.blox27[class$="TEst" s]', status: 'fixme' },
      { select: '.blox27[class$="Test" s]', status: 'fixme' },
      { select: '.blox28[class~="unitTEST" i]', expect: { count: 1 } },
    ],
  },
  {
    name: 'attribute s-flag divergence',
    status: 'fail',
    html: `
      <div class="test attrCaseInsensitive">
        <div class="blox20 unitTest"></div>
        <div class="blox22 unitTest"></div>
        <div class="blox25 unitTest"></div>
        <div class="blox27 unitTest"></div>
      </div>
    `,
    cases: [
      { select: '.blox20[class="blox20 unitTest" s]' },
      { select: '.blox22[class*="22 unitt" s]' },
      { select: '.blox22[class*="22 unitT" s]' },
      { select: '.blox25[class^="blox" s]' },
      { select: '.blox27[class$="TEst" s]' },
      { select: '.blox27[class$="Test" s]' },
    ],
  },
  {
    name: 'double-negation not selector',
    html: `<div id="a"></div><span id="b"></span>`,
    cases: [
      { select: 'div:not(:not(div))', expect: { ids: ['a'] } },
    ],
  },
]);
