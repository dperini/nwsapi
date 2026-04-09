import { expect } from "@playwright/test";
import { runScenarios } from "./harness/scenarios";

const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en" dir="ltr" id="html">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <title>jQuery Test Suite</title>
      <link rel="Stylesheet" media="screen" href="qunit/testsuite.css" />
      <style type="text/css" media="screen">
        ol#empty { opacity: 0; filter:Alpha(opacity=0); } /* for testing opacity set in styles in IE */
      </style>
    </head>

    <body id="body">
      <h1 id="header">jQuery Test Suite</h1>
      <h2 id="banner"></h2>
      <h2 id="userAgent"></h2>

      <!-- Test HTML -->
      <div id="nothiddendiv" style="height:1px;background:white;" class="nothiddendiv">
        <div id="nothiddendivchild"></div>
      </div>

      <!-- this iframe is outside the #main so it won't reload constantly wasting time, but it means the tests must be "safe" and clean up after themselves -->
      <iframe id="loadediframe" name="loadediframe" style="display:none;" src="data/iframe.html"></iframe>

      <dl id="dl" style="display:none;">
        <div id="main" style="display: none;">
          <p id="firstp">
            See
            <a id="simon1" href="http://simon.incutio.com/archive/2003/03/25/#getElementsBySelector" rel="bookmark">this blog entry</a>
            for more information.
          </p>
          <p id="ap">
            Here are some links in a normal paragraph:
            <a id="google" href="http://www.google.com/" title="Google!">Google</a>,
            <a id="groups" href="http://groups.google.com/" class="GROUPS">Google Groups (Link)</a>. This link has
            <code><a href="http://smin" id="anchor1">class="blog"</a></code>:
            <a href="http://diveintomark.org/" class="blog" hreflang="en" id="mark">diveintomark</a>
          </p>
          <div id="foo">
            <p id="sndp">
              Everything inside the red border is inside a div with
              <code>id="foo"</code>.
            </p>
            <p lang="en" id="en">
              This is a normal link:
              <a id="yahoo" href="http://www.yahoo.com/" class="blogTest">Yahoo</a>
            </p>
            <p id="sap">
              This link has <code><a href="#2" id="anchor2">class="blog"</a></code>:
              <a href="http://simon.incutio.com/" class="blog link" id="simon">Simon Willison's Weblog</a>
            </p>
          </div>
          <span id="name+value"></span>
          <p id="first">Try them out:</p>
          <ul id="firstUL"></ul>
          <ol id="empty"></ol>
          <form id="form" action="formaction">
            <label for="action" id="label-for">Action:</label>
            <input type="text" name="action" value="Test" id="text1" maxlength="30" />
            <input type="text" name="text2" value="Test" id="text2" disabled="disabled"/>
            <input type="radio" name="radio1" id="radio1" value="on" />

            <input type="radio" name="radio2" id="radio2" checked="checked" />
            <input type="checkbox" name="check" id="check1" checked="checked" />
            <input type="checkbox" id="check2" value="on" />

            <input type="hidden" name="hidden" id="hidden1" />
            <input type="text" style="display:none;" name="foo[bar]" id="hidden2" />

            <input type="text" id="name" name="name" value="name" />
            <input type="search" id="search" name="search" value="search" />

            <button id="button" name="button" type="button">Button</button>

            <textarea id="area1" maxlength="30">foobar</textarea>

            <select name="select1" id="select1">
              <option id="option1a" class="emptyopt" value="">Nothing</option>
              <option id="option1b" value="1">1</option>
              <option id="option1c" value="2">2</option>
              <option id="option1d" value="3">3</option>
            </select>
            <select name="select2" id="select2">
              <option id="option2a" class="emptyopt" value="">Nothing</option>
              <option id="option2b" value="1">1</option>
              <option id="option2c" value="2">2</option>
              <option id="option2d" selected="selected" value="3">3</option>
            </select>
            <select name="select3" id="select3" multiple="multiple">
              <option id="option3a" class="emptyopt" value="">Nothing</option>
              <option id="option3b" selected="selected" value="1">1</option>
              <option id="option3c" selected="selected" value="2">2</option>
              <option id="option3d" value="3">3</option>
              <option id="option3e">no value</option>
            </select>

            <object id="object1" codebase="stupid">
              <param name="p1" value="x1" />
              <param name="p2" value="x2" />
            </object>

            <span id="台北Táiběi"></span>
            <span id="台北" lang="中文"></span>
            <span id="utf8class1" class="台北Táiběi 台北"></span>
            <span id="utf8class2" class="台北"></span>
            <span id="foo:bar" class="foo:bar"></span>
            <span id="test.foo[5]bar" class="test.foo[5]bar"></span>

            <foo_bar id="foobar">test element</foo_bar>
          </form>
          <b id="floatTest">Float test.</b>
          <iframe id="iframe" name="iframe"></iframe>
          <form id="lengthtest">
            <input type="text" id="length" name="test" />
            <input type="text" id="idTest" name="id" />
          </form>
          <table id="table"></table>

          <form id="name-tests">
            <!-- Inputs with a grouped name attribute. -->
            <input name="types[]" id="types_all" type="checkbox" value="all" />
            <input name="types[]" id="types_anime" type="checkbox" value="anime" />
            <input name="types[]" id="types_movie" type="checkbox" value="movie" />
          </form>

          <form id="testForm" action="#" method="get">
            <textarea name="T3" rows="2" cols="15">
  ?
  Z</textarea>
            <input type="hidden" name="H1" value="x" />
            <input type="hidden" name="H2" />
            <input name="PWD" type="password" value="" />
            <input name="T1" type="text" />
            <input name="T2" type="text" value="YES" readonly="readonly" />
            <input type="checkbox" name="C1" value="1" />
            <input type="checkbox" name="C2" />
            <input type="radio" name="R1" value="1" />
            <input type="radio" name="R1" value="2" />
            <input type="text" name="My Name" value="me" />
            <input type="reset" name="reset" value="NO" />
            <select name="S1">
              <option value="abc">ABC</option>
              <option value="abc">ABC</option>
              <option value="abc">ABC</option>
            </select>
            <select name="S2" multiple="multiple" size="3">
              <option value="abc">ABC</option>
              <option value="abc">ABC</option>
              <option value="abc">ABC</option>
            </select>
            <select name="S3">
              <option selected="selected">YES</option>
            </select>
            <select name="S4">
              <option value="" selected="selected">NO</option>
            </select>
            <input type="submit" name="sub1" value="NO" />
            <input type="submit" name="sub2" value="NO" />
            <input type="image" name="sub3" value="NO" />
            <button name="sub4" type="submit" value="NO">NO</button>
            <input name="D1" type="text" value="NO" disabled="disabled" />
            <input type="checkbox" checked="checked" disabled="disabled" name="D2" value="NO" />
            <input type="radio" name="D3" value="NO" checked="checked" disabled="disabled" />
            <select name="D4" disabled="disabled">
              <option selected="selected" value="NO">NO</option>
            </select>
          </form>
          <div id="moretests">
            <form>
              <div id="checkedtest" style="display:none;">
                <input type="radio" name="checkedtestradios" checked="checked" />
                <input type="radio" name="checkedtestradios" value="on" />
                <input type="checkbox" name="checkedtestcheckboxes" checked="checked" />
                <input type="checkbox" name="checkedtestcheckboxes" />
              </div>
            </form>
            <div id="nonnodes">
              <span>hi</span> there
              <!-- mon ami -->
            </div>
            <div id="t2037">
              <div><div class="hidden">hidden</div></div>
            </div>
          </div>

          <div id="tabindex-tests">
            <ol id="listWithTabIndex" tabindex="5">
              <li id="foodWithNegativeTabIndex" tabindex="-1">Rice</li>
              <li id="foodNoTabIndex">Beans</li>
              <li>Blinis</li>
              <li>Tofu</li>
            </ol>

            <div id="divWithNoTabIndex">I'm hungry. I should...</div>
            <span>...</span><a href="#" id="linkWithNoTabIndex">Eat lots of food</a><span>...</span> | <span>...</span><a href="#" id="linkWithTabIndex" tabindex="2">Eat a little food</a><span>...</span> | <span>...</span><a href="#" id="linkWithNegativeTabIndex" tabindex="-1">Eat no food</a><span>...</span> <span>...</span><a id="linkWithNoHrefWithNoTabIndex">Eat a burger</a><span>...</span> <span>...</span><a id="linkWithNoHrefWithTabIndex" tabindex="1">Eat some funyuns</a><span>...</span> <span>...</span><a id="linkWithNoHrefWithNegativeTabIndex" tabindex="-1">Eat some funyuns</a><span>...</span>
          </div>

          <div id="liveHandlerOrder">
            <span id="liveSpan1"><a href="#" id="liveLink1"></a></span>
            <span id="liveSpan2"><a href="#" id="liveLink2"></a></span>
          </div>
        </div>
      </dl>
      <div id="fx-test-group" style="position:absolute;width:1px;height:1px;overflow:hidden;">
        <div id="fx-queue" name="test">
          <div id="fadein" class="chain test" name="div">
            fadeIn
            <div>fadeIn</div>
          </div>
          <div id="fadeout" class="chain test out">
            fadeOut
            <div>fadeOut</div>
          </div>

          <div id="show" class="chain test">
            show
            <div>show</div>
          </div>
          <div id="hide" class="chain test out">
            hide
            <div>hide</div>
          </div>

          <div id="togglein" class="chain test">
            togglein
            <div>togglein</div>
          </div>
          <div id="toggleout" class="chain test out">
            toggleout
            <div>toggleout</div>
          </div>

          <div id="slideup" class="chain test">
            slideUp
            <div>slideUp</div>
          </div>
          <div id="slidedown" class="chain test out">
            slideDown
            <div>slideDown</div>
          </div>

          <div id="slidetogglein" class="chain test">
            slideToggleIn
            <div>slideToggleIn</div>
          </div>
          <div id="slidetoggleout" class="chain test out">
            slideToggleOut
            <div>slideToggleOut</div>
          </div>
        </div>

        <div id="fx-tests"></div>
      </div>

      <ol id="tests"></ol>
    </body>
  </html>
`;

runScenarios('jquery', 'normal', [
  {
    name: 'element',
    html: html,
    htmlMode: 'document',
    cases: [
      // Compare universal selection directly against native behavior.
      { select: '*' },

      { select: 'p', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'body', expect: { ids: ['body'] } },
      { select: 'html', expect: { ids: ['html'] } },
      { select: 'div p', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },

      // scoped selection
      { select: 'param', scope: { by: 'id', id: 'object1' }, expect: { count: 2 } },

      // Consistency checks for multiple selector groups
      { select: 'div p', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'div p', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'div p', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },

      { select: '#length', expect: { count: 1 } },
      { select: '#lengthtest input', expect: { count: 2 } },

      // Duplicate / sort-order checks from the original suite, expressed as counts.
      { select: '*', expect: { count: 187 } },
      { select: '*, *', expect: { count: 187 } },

      { select: 'p', expect: { count: 6 } },
      { select: 'p, div p', expect: { count: 6 } },

      { select: 'h2, h1', expect: { ids: ['header', 'banner', 'userAgent'] } },
      { select: 'p, p a', expect: { ids: ['firstp', 'simon1', 'ap', 'google', 'groups', 'anchor1', 'mark', 'sndp', 'en', 'yahoo', 'sap', 'anchor2', 'simon', 'first'] } },

      // jQuery extension pseudo, not native CSS
      // { selector: 'h2:first, h1:first', expect: { ids: ['header', 'banner'] } },
    ],
  },

  {
    name: 'broken selectors',
    html: html,
    htmlMode: 'document',
    cases: [
      { select: '[', expect: { throws: true } },
      { select: '(', expect: { throws: true } },
      { select: '{', expect: { throws: true } },
      { select: '<', expect: { throws: true } },
      { select: '()', expect: { throws: true } },
      { select: '<>', expect: { throws: true } },

      { select: ':nth-child(2n+-0)', expect: { throws: true } },
      { select: ':nth-child(- 1n)', expect: { throws: true } },
      { select: ':nth-child(-1 n)', expect: { throws: true } },
      { select: ':first-child(n)', expect: { throws: true } },
      { select: ':last-child(n)', expect: { throws: true } },
      { select: ':only-child(n)', expect: { throws: true } },
      { select: ':nth-child(2+0)', expect: { throws: true } },
    ],
  },

  {
    name: 'id selectors',
    html: html,
    htmlMode: 'document',
    cases: [
      { select: '#body', expect: { ids: ['body'] } },
      { select: 'body#body', expect: { ids: ['body'] } },
      { select: 'ul#first', expect: { ids: [] } },

      { select: '#firstp #simon1', expect: { ids: ['simon1'] } },
      { select: '#firstp #foobar', expect: { ids: [] } },

      { select: '#台北Táiběi', expect: { ids: ['台北Táiběi'] } },
      { select: '#台北Táiběi, #台北', expect: { ids: ['台北Táiběi', '台北'] } },
      { select: 'div #台北', expect: { ids: ['台北'] } },
      { select: 'form > #台北', expect: { ids: ['台北'] } },

      { select: '#foo\\:bar', expect: { ids: ['foo:bar'] } },
      { select: '#test\\.foo\\[5\\]bar', expect: { ids: ['test.foo[5]bar'] } },
      { select: 'div #foo\\:bar', expect: { ids: ['foo:bar'] } },
      { select: 'div #test\\.foo\\[5\\]bar', expect: { ids: ['test.foo[5]bar'] } },
      { select: 'form > #foo\\:bar', expect: { ids: ['foo:bar'] } },
      { select: 'form > #test\\.foo\\[5\\]bar', expect: { ids: ['test.foo[5]bar'] } },

      { select: '#form > #radio1', expect: { ids: ['radio1'] } }, // bug #267
      { select: '#form #first', expect: { ids: [] } },
      { select: '#form > #option1a', expect: { ids: [] } },

      { select: '#foo > *', expect: { ids: ['sndp', 'en', 'sap'] } },
      { select: '#firstUL > *', expect: { ids: [] } },

      { select: '#lengthtest', expect: { ids: ['lengthtest'] } },
      { select: '#asdfasdf #foobar', expect: { ids: [] } }, // bug #986

      { select: 'body div#form', expect: { ids: [] } },

      { select: '#types_all', expect: { ids: ['types_all'] } },
      { select: '#fx-queue', expect: { ids: ['fx-queue'] } },
      { select: '#name\\+value', expect: { ids: ['name+value'] } },
    ],
  },
  {
    name: 'id selectors after document fragment append',
    html: html,
    htmlMode: 'document',
    setupPage: async (page) => {
      await page.evaluate(() => {
        const main = document.getElementById('main');
        if (!main) throw new Error('#main not found');

        const orphan = document.createElement('div');
        orphan.innerHTML =
          '<a name="tName1">tName1 A</a>' +
          '<a name="tName2">tName2 A</a>' +
          '<div id="tName1">tName1 Div</div>';

        const fragment = document.createDocumentFragment();
        while (orphan.firstChild) {
          fragment.appendChild(orphan.firstChild);
        }

        main.appendChild(fragment);
      });
    },
    cases: [
      { select: '#tName1', expect: { ids: ['tName1'] } },
      { select: '#tName2', expect: { ids: [] } },
    ],
  },

  {
    name: 'class selectors',
    html: html,
    htmlMode: 'document',
    cases: [
      { select: '.blog', expect: { ids: ['mark', 'simon'] } },
      { select: '.GROUPS', expect: { ids: ['groups'] } },
      { select: '.blog.link', expect: { ids: ['simon'] } },
      { select: 'a.blog', expect: { ids: ['mark', 'simon'] } },
      { select: 'p .blog', expect: { ids: ['mark', 'simon'] } },

      // Repeated as in the original test
      { select: 'p .blog', expect: { ids: ['mark', 'simon'] } },
      { select: 'p .blog', expect: { ids: ['mark', 'simon'] } },
      { select: 'p .blog', expect: { ids: ['mark', 'simon'] } },
      { select: 'p .blog', expect: { ids: ['mark', 'simon'] } },

      { select: '.台北Táiběi', expect: { ids: ['utf8class1'] } },
      { select: '.台北', expect: { ids: ['utf8class1', 'utf8class2'] } },
      { select: '.台北Táiběi.台北', expect: { ids: ['utf8class1'] } },
      { select: '.台北Táiběi, .台北', expect: { ids: ['utf8class1', 'utf8class2'] } },
      { select: 'div .台北Táiběi', expect: { ids: ['utf8class1'] } },
      { select: 'form > .台北Táiběi', expect: { ids: ['utf8class1'] } },

      { select: '.foo\\:bar', expect: { ids: ['foo:bar'] } },
      { select: '.test\\.foo\\[5\\]bar', expect: { ids: ['test.foo[5]bar'] } },
      { select: 'div .foo\\:bar', expect: { ids: ['foo:bar'] } },
      { select: 'div .test\\.foo\\[5\\]bar', expect: { ids: ['test.foo[5]bar'] } },
      { select: 'form > .foo\\:bar', expect: { ids: ['foo:bar'] } },
      { select: 'form > .test\\.foo\\[5\\]bar', expect: { ids: ['test.foo[5]bar'] } },
    ],
  },

  {
    name: 'class selectors in detached subtree',
    html: '',
    cases: [],
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const div = document.createElement('div');
        div.innerHTML = "<div class='test e' id='first'></div><div class='test' id='second'></div>";

        const first = NW.Dom.select('.e', div).map(el => el.getAttribute('id'));
        div.lastChild && ((div.lastChild as Element).className = 'e');
        const second = NW.Dom.select('.e', div).map(el => el.getAttribute('id'));

        return { first, second };
      });

      expect(result.first).toEqual(['first']);
      expect(result.second).toEqual(['first', 'second']);
    },
  },

  {
    name: 'name selectors',
    html: html,
    htmlMode: 'document',
    setupPage: async (page) => {
      await page.evaluate(() => {
        const main = document.getElementById('main');
        if (!main) throw new Error('#main not found');

        const orphan = document.createElement('div');
        orphan.innerHTML =
          '<a id="tName1ID" name="tName1">tName1 A</a>' +
          '<a id="tName2ID" name="tName2">tName2 A</a>' +
          '<div id="tName1">tName1 Div</div>';

        const fragment = document.createDocumentFragment();
        while (orphan.firstChild) {
          fragment.appendChild(orphan.firstChild);
        }

        main.appendChild(fragment);
      });
    },
    cases: [
      { select: 'input[name=action]', expect: { ids: ['text1'] } },
      { select: "input[name='action']", expect: { ids: ['text1'] } },
      { select: 'input[name="action"]', expect: { ids: ['text1'] } },

      { select: '[name=test]', expect: { ids: ['length', 'fx-queue'] } },
      { select: '[name=div]', expect: { ids: ['fadein'] } },
      { select: '*[name=iframe]', expect: { ids: ['iframe'] } },

      { select: "input[name='types[]']", expect: { ids: ['types_all', 'types_anime', 'types_movie'] } },

      { select: '#form input[name=action]', expect: { ids: ['text1'] } },
      { select: "#form input[name='foo[bar]']", expect: { ids: ['hidden2'] } },

      { select: '[name=tName1]', expect: { ids: ['tName1ID'] } },
      { select: '[name=tName2]', expect: { ids: ['tName2ID'] } },
    ],
  },

  {
    name: 'multiple selectors',
    html: html,
    htmlMode: 'document',
    cases: [
      { select: 'h2, p', expect: { ids: ['banner', 'userAgent', 'firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'h2 , p', expect: { ids: ['banner', 'userAgent', 'firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'h2 , p', expect: { ids: ['banner', 'userAgent', 'firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'h2,p', expect: { ids: ['banner', 'userAgent', 'firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
    ],
  },

  {
    name: 'child and adjacent selectors',
    html: html,
    htmlMode: 'document',
    cases: [
      { select: 'p > a', expect: { ids: ['simon1', 'google', 'groups', 'mark', 'yahoo', 'simon'] } },
      { select: 'p> a', expect: { ids: ['simon1', 'google', 'groups', 'mark', 'yahoo', 'simon'] } },
      { select: 'p >a', expect: { ids: ['simon1', 'google', 'groups', 'mark', 'yahoo', 'simon'] } },
      { select: 'p>a', expect: { ids: ['simon1', 'google', 'groups', 'mark', 'yahoo', 'simon'] } },

      { select: 'p > a.blog', expect: { ids: ['mark', 'simon'] } },
      { select: 'code > *', expect: { ids: ['anchor1', 'anchor2'] } },
      { select: 'p > * > *', expect: { ids: ['anchor1', 'anchor2'] } },

      { select: 'a + a', expect: { ids: ['groups'] } },
      { select: 'a +a', expect: { ids: ['groups'] } },
      { select: 'a+ a', expect: { ids: ['groups'] } },
      { select: 'a+a', expect: { ids: ['groups'] } },

      { select: 'p + p', expect: { ids: ['ap', 'en', 'sap'] } },
      { select: 'p#firstp + p', expect: { ids: ['ap'] } },
      { select: 'p[lang=en] + p', expect: { ids: ['sap'] } },
      { select: 'a.GROUPS + code + a', expect: { ids: ['mark'] } },

      { select: 'a + a, code > a', expect: { ids: ['groups', 'anchor1', 'anchor2'] } },

      { select: 'div.blah > p > a', expect: { ids: [] } },
      { select: 'div.foo > span > a', expect: { ids: [] } },
      { select: '.container div:not(.excluded) div', expect: { ids: [] } },

      { select: '* > :first-child', scope: { by: 'id', id: 'nothiddendiv' }, expect: { ids: ['nothiddendivchild'] } },
      { select: '* > :nth-child(1)', scope: { by: 'id', id: 'nothiddendiv' }, expect: { ids: ['nothiddendivchild'] } },
      { select: '* > *:first-child', scope: { by: 'id', id: 'nothiddendiv' }, expect: { ids: ['nothiddendivchild'] } },

      { select: '.fototab > .thumbnails > a', expect: { ids: [] } },

      { select: 'p:first-child', expect: { ids: ['firstp', 'sndp'] } },
      { select: 'p:nth-child(1)', expect: { ids: ['firstp', 'sndp'] } },
      { select: 'p:not(:nth-child(1))', expect: { ids: ['ap', 'en', 'sap', 'first'] } },
    ],
  },

  {
    name: 'first-child cache invalidation',
    html: html,
    htmlMode: 'document',
    setupPage: async (page) => {
      await page.evaluate(() => {
        const div = document.createElement('div');
        let divs = NW.Dom.select('p:first-child', null, null);

        for (let i = 0; i < divs.length; i++) {
          divs[i].parentNode?.insertBefore(div.cloneNode(false), divs[i].nextSibling);
        }

        divs = NW.Dom.select('p:first-child', null, null);

        for (let i = 0; i < divs.length; i++) {
          const inserted = divs[i].parentNode?.insertBefore(div.cloneNode(false), divs[i]);
          const p = inserted?.nextSibling;
          p?.parentNode?.removeChild(p);
        }
      });
    },
    cases: [
      { select: 'p:first-child', expect: { ids: [] } },
    ],
  },

  {
    name: 'last-child and nth-child selectors',
    html: html,
    htmlMode: 'document',
    cases: [
      { select: 'p:last-child', expect: { ids: ['sap'] } },
      { select: 'a:last-child', expect: { ids: ['simon1', 'anchor1', 'mark', 'yahoo', 'anchor2', 'simon', 'liveLink1', 'liveLink2'] } },

      { select: '#main form#form > *:nth-child(2)', expect: { ids: ['text1'] } },
      { select: '#main form#form > :nth-child(2)', expect: { ids: ['text1'] } },

      // changed `select:first` to `select:first-of-type`; `:first` is jQuery-only 
      { select: '#form select:first-of-type option:nth-child(3)', expect: { ids: ['option1c'] } },
      { select: '#form select:first-of-type option:nth-child(0n+3)', expect: { ids: ['option1c'] } },
      { select: '#form select:first-of-type option:nth-child(1n+0)', expect: { ids: ['option1a', 'option1b', 'option1c', 'option1d'] } },
      { select: '#form select:first-of-type option:nth-child(1n)', expect: { ids: ['option1a', 'option1b', 'option1c', 'option1d'] } },
      { select: '#form select:first-of-type option:nth-child(n)', expect: { ids: ['option1a', 'option1b', 'option1c', 'option1d'] } },
      { select: '#form select:first-of-type option:nth-child(even)', expect: { ids: ['option1b', 'option1d'] } },
      { select: '#form select:first-of-type option:nth-child(odd)', expect: { ids: ['option1a', 'option1c'] } },
      { select: '#form select:first-of-type option:nth-child(2n)', expect: { ids: ['option1b', 'option1d'] } },
      { select: '#form select:first-of-type option:nth-child(2n+1)', expect: { ids: ['option1a', 'option1c'] } },
      { select: '#form select:first-of-type option:nth-child(3n)', expect: { ids: ['option1c'] } },
      { select: '#form select:first-of-type option:nth-child(3n+1)', expect: { ids: ['option1a', 'option1d'] } },
      { select: '#form select:first-of-type option:nth-child(3n+2)', expect: { ids: ['option1b'] } },
      { select: '#form select:first-of-type option:nth-child(3n+3)', expect: { ids: ['option1c'] } },
      { select: '#form select:first-of-type option:nth-child(3n-1)', expect: { ids: ['option1b'] } },
      { select: '#form select:first-of-type option:nth-child(3n-2)', expect: { ids: ['option1a', 'option1d'] } },
      { select: '#form select:first-of-type option:nth-child(3n-3)', expect: { ids: ['option1c'] } },
      { select: '#form select:first-of-type option:nth-child(3n+0)', expect: { ids: ['option1c'] } },
      { select: '#form select:first-of-type option:nth-child(-n+3)', expect: { ids: ['option1a', 'option1b', 'option1c'] } },
    ],
  },

  {
    name: 'attribute selectors',
    html: html,
    htmlMode: 'document',
    setupPage: async (page) => {
      await page.evaluate(() => {
        const anchor2 = document.getElementById('anchor2') as HTMLAnchorElement | null;
        if (anchor2) anchor2.href = '#2';

        const inputs = NW.Dom.select('form input');
        if (inputs[0]) (inputs[0] as HTMLInputElement & { test?: number }).test = 0;
        if (inputs[1]) (inputs[1] as HTMLInputElement & { test?: number }).test = 1;
      });
    },
    cases: [
      { select: 'a[title]', expect: { ids: ['google'] } },
      { select: '*[title]', expect: { ids: ['google'] } },
      { select: '[title]', expect: { ids: ['google'] } },
      { select: 'a[ title ]', expect: { ids: ['google'] } },

      { select: "a[rel='bookmark']", expect: { ids: ['simon1'] } },
      { select: 'a[rel="bookmark"]', expect: { ids: ['simon1'] } },
      { select: 'a[rel=bookmark]', expect: { ids: ['simon1'] } },
      { select: "a[href='http://www.google.com/']", expect: { ids: ['google'] } },
      { select: "a[ rel = 'bookmark' ]", expect: { ids: ['simon1'] } },

      { select: "p a[href^='#']", expect: { ids: ['anchor2'] } },
      { select: 'p a[href*="#"]', expect: { ids: ['simon1', 'anchor2'] } },

      { select: 'form label[for]', expect: { ids: ['label-for'] } },
      { select: '#form [for=action]', expect: { ids: ['label-for'] } },

      // Disabled tests - expandos don't work in all browsers
      // { selector: 'form input[test]', expect: { ids: ['text1', 'text2'] } },
      // { selector: 'form input[test=0]', expect: { ids: ['text1'] } },
      // { selector: 'form input[test=1]', expect: { ids: ['text2'] } },

      { select: "input[name^='foo[']", expect: { ids: ['hidden2'] } },
      { select: "input[name^='foo[bar]']", expect: { ids: ['hidden2'] } },
      { select: "input[name*='[bar]']", expect: { ids: ['hidden2'] } },
      { select: "input[name$='bar]']", expect: { ids: ['hidden2'] } },
      { select: "input[name$='[bar]']", expect: { ids: ['hidden2'] } },
      { select: "input[name$='foo[bar]']", expect: { ids: ['hidden2'] } },
      { select: "input[name*='foo[bar]']", expect: { ids: ['hidden2'] } },

      { select: "#form input[type='radio'], #form input[type='hidden']", expect: { ids: ['radio1', 'radio2', 'hidden1'] } },
      { select: '#form input[type=\'radio\'], #form input[type="hidden"]', expect: { ids: ['radio1', 'radio2', 'hidden1'] } },
      { select: "#form input[type='radio'], #form input[type=hidden]", expect: { ids: ['radio1', 'radio2', 'hidden1'] } },

      { select: 'span[lang=中文]', expect: { ids: ['台北'] } },

      { select: "a[href ^= 'http://www']", expect: { ids: ['google', 'yahoo'] } },
      { select: "a[href $= 'org/']", expect: { ids: ['mark'] } },
      { select: "a[href *= 'google']", expect: { ids: ['google', 'groups'] } },
      { select: "#ap a:not([hreflang='en'])", expect: { ids: ['google', 'groups', 'anchor1'] } },

      { select: "#select1 option[value='']", expect: { ids: ['option1a'] } },
      { select: "#select1 option:not([value=''])", expect: { ids: ['option1b', 'option1c', 'option1d'] } },

      { select: '#select1 option:checked', expect: { ids: ['option1a'] } },
      { select: '#select2 option:checked', expect: { ids: ['option2d'] } },
      { select: '#select3 option:checked', expect: { ids: ['option3b', 'option3c'] } },

      { select: "input[name='foo[bar]']", expect: { ids: ['hidden2'] } },

      { select: '#form select:not([multiple])', expect: { ids: ['select1', 'select2'] } },
      { select: '#form select:not([name=select1])', expect: { ids: ['select2', 'select3'] } },
      { select: "#form select:not([name='select1'])", expect: { ids: ['select2', 'select3'] } },
    ],
  },

  {
    name: 'pseudo selectors 1',
    html: html,
    htmlMode: 'document',
    cases: [
      { select: 'p:first-child', expect: { ids: ['firstp', 'sndp'] } },
      { select: 'p:last-child', expect: { ids: ['sap'] } },
      { select: 'a:only-child', expect: { ids: ['simon1', 'anchor1', 'yahoo', 'anchor2', 'liveLink1', 'liveLink2'] } },
      { select: 'ul:empty', expect: { ids: ['firstUL'] } },

      { select: '#form input:not([type=hidden]):enabled', expect: { ids: ['text1', 'radio1', 'radio2', 'check1', 'check2', 'hidden2', 'name', 'search'] } },
      { select: '#form input:disabled', expect: { ids: ['text2'] } },
      { select: '#form input:checked', expect: { ids: ['radio2', 'check1'] } },

      { select: '#form option:checked', expect: { ids: ['option1a', 'option2d', 'option3b', 'option3c'] } },

      // jQuery-only text pseudos; not valid in the native-parity harness
      // { selector: "a:contains('Google')", expect: { ids: ['google', 'groups'] } },
      // { selector: "a:contains('Google Groups')", expect: { ids: ['groups'] } },
      // { selector: "a:contains('Google Groups (Link)')", expect: { ids: ['groups'] } },
      // { selector: "a:contains('(Link)')", expect: { ids: ['groups'] } },

      { select: 'p ~ div', expect: { ids: ['foo', 'moretests', 'tabindex-tests', 'liveHandlerOrder'] } },
      { select: 'a.blog:not(.link)', expect: { ids: ['mark'] } },
      // { selector: "#form option:not(:contains('Nothing'),#option1b,:checked)", expect: { ids: ['option1c', 'option1d', 'option2b', 'option2c', 'option3d', 'option3e'] } },
      { select: "#form option:not([id^='opt']:nth-child(-n+3))", expect: { ids: ['option1d', 'option2d', 'option3d', 'option3e'] } },
      { select: "#form option:not(:not(:checked))[id^='option3']", expect: { ids: ['option3b', 'option3c'] } },
      { select: 'p:not(.foo)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },

      // invalid compound selector inside :not() pseudo-class
      { select: 'p:not(div.foo)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(p.foo)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(div)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(.foo)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(#blargh)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },

      // invalid compound selector inside :not() pseudo-class
      { select: 'p:not(div#blargh)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(p#blargh)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(div)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(#blargh)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },

      { select: 'p:not(a)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(a, b)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(a, b, div)', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      { select: 'p:not(p)', expect: { ids: [] } },
      { select: 'p:not(a,p)', expect: { ids: [] } },
      { select: 'p:not(p,a)', expect: { ids: [] } },
      { select: 'p:not(a,p,b)', expect: { ids: [] } },
      // { selector: ':input:not(:image,:input,:submit)', expect: { ids: [] } },

      // jQuery-only positional pseudos; keep parked for now
      // { selector: 'p:nth(1)', expect: { ids: ['ap'] } },
      // { selector: 'p:first', expect: { ids: ['firstp'] } },
      // { selector: 'p:last', expect: { ids: ['first'] } },
      // { selector: 'p:even', expect: { ids: ['firstp', 'sndp', 'sap'] } },
      // { selector: 'p:odd', expect: { ids: ['ap', 'en', 'first'] } },
      // { selector: 'p:eq(1)', expect: { ids: ['ap'] } },
      // { selector: 'p:gt(0)', expect: { ids: ['ap', 'sndp', 'en', 'sap', 'first'] } },
      // { selector: 'p:lt(3)', expect: { ids: ['firstp', 'ap', 'sndp'] } },
      // { selector: 'p:parent', expect: { ids: ['firstp', 'ap', 'sndp', 'en', 'sap', 'first'] } },
      // { selector: '#form input:visible', expect: { ids: [] } },
      // { selector: 'div:visible:not(.testrunner-toolbar):lt(2)', expect: { ids: ['nothiddendiv', 'nothiddendivchild'] } },
      // { selector: '#form input:hidden', expect: { ids: ['text1', 'text2', 'radio1', 'radio2', 'check1', 'check2', 'hidden1', 'hidden2', 'name', 'search'] } },
      // { selector: '#main:hidden', expect: { ids: ['main'] } },
      // { selector: '#dl:hidden', expect: { ids: ['dl'] } },
    ],
  },

  // Legacy jQuery visibility / position pseudo tests.
  // Preserved from the original suite but not active in the native-parity harness,
  {
    name: 'jquery visibility and position pseudos (legacy)',
    status: 'skip',
    html: html,
    htmlMode: 'document',
    setupPage: async (page) => {
      await page.evaluate(() => {
        const div = NW.Dom.select('#nothiddendivchild')[0] as HTMLElement | undefined;
        if (!div) throw new Error('#nothiddendivchild not found');
      
        div.style.fontSize = '0';
        div.style.lineHeight = '0';
        div.style.width = '0';
        div.style.height = '0';
        expect(NW.Dom.select('#nothiddendivchild:hidden').map(el => el.getAttribute('id'))).toEqual(['nothiddendivchild']);
        expect(NW.Dom.select('#nothiddendivchild:visible').map(el => el.getAttribute('id'))).toEqual([]);
      
        div.style.width = '1px';
        div.style.height = '0';
        expect(NW.Dom.select('#nothiddendivchild:visible').map(el => el.getAttribute('id'))).toEqual(['nothiddendivchild']);
        expect(NW.Dom.select('#nothiddendivchild:hidden').map(el => el.getAttribute('id'))).toEqual([]);
      
        div.style.width = '0';
        div.style.height = '1px';
        expect(NW.Dom.select('#nothiddendivchild:visible').map(el => el.getAttribute('id'))).toEqual(['nothiddendivchild']);
        expect(NW.Dom.select('#nothiddendivchild:hidden').map(el => el.getAttribute('id'))).toEqual([]);
      
        div.style.width = '1px';
        div.style.height = '1px';
        expect(NW.Dom.select('#nothiddendivchild:visible').map(el => el.getAttribute('id'))).toEqual(['nothiddendivchild']);
        expect(NW.Dom.select('#nothiddendivchild:hidden').map(el => el.getAttribute('id'))).toEqual([]);
      
        div.style.width = '';
        div.style.height = '';
        div.style.fontSize = '';
        div.style.lineHeight = '';
      });
    },
    cases: [
      { select: 'div#nothiddendiv:eq(0)', expect: { ids: ['nothiddendiv'] } },
      { select: 'div#nothiddendiv:last', expect: { ids: ['nothiddendiv'] } },
      { select: 'div#nothiddendiv:not(:gt(0))', expect: { ids: ['nothiddendiv'] } },
      { select: '#foo > :not(:first)', expect: { ids: ['en', 'sap'] } },
      { select: 'select > :not(:gt(2))', expect: { ids: ['option1a', 'option1b', 'option1c'] } },
      { select: 'select:lt(2) :not(:first)', expect: { ids: ['option1b', 'option1c', 'option1d', 'option2a', 'option2b', 'option2c', 'option2d'] } },
      { select: 'div.nothiddendiv:eq(0)', expect: { ids: ['nothiddendiv'] } },
      { select: 'div.nothiddendiv:last', expect: { ids: ['nothiddendiv'] } },
      { select: 'div.nothiddendiv:not(:lt(0))', expect: { ids: ['nothiddendiv'] } },

      { select: 'div div:eq(0)', expect: { ids: ['nothiddendivchild'] } },
      { select: 'div div:eq(5)', expect: { ids: ['t2037'] } },
      { select: 'div div:eq(27)', expect: { ids: ['hide'] } },
      { select: 'div div:first', expect: { ids: ['nothiddendivchild'] } },
      { select: 'div > div:first', expect: { ids: ['nothiddendivchild'] } },
      { select: '#dl div:first div:first', expect: { ids: ['foo'] } },
      { select: '#dl div:first > div:first', expect: { ids: ['foo'] } },
      { select: 'div#nothiddendiv:first > div:first', expect: { ids: ['nothiddendivchild'] } },
    ],
  },

  {
    name: 'form and header pseudo selectors',
    status: 'skip', // form pseudo selectors are jQuery-only;
    html: html,
    htmlMode: 'document',
    cases: [
      { select: '#form :input', expect: { ids: ['text1', 'text2', 'radio1', 'radio2', 'check1', 'check2', 'hidden1', 'hidden2', 'name', 'search', 'button', 'area1', 'select1', 'select2', 'select3'] } },
      { select: '#form :radio', expect: { ids: ['radio1', 'radio2'] } },
      { select: '#form :checkbox', expect: { ids: ['check1', 'check2'] } },
      { select: '#form :text:not(#search)', expect: { ids: ['text1', 'text2', 'hidden2', 'name'] } },
      { select: '#form :radio:checked', expect: { ids: ['radio2'] } },
      { select: '#form :checkbox:checked', expect: { ids: ['check1'] } },
      { select: '#form :radio:checked, #form :checkbox:checked', expect: { ids: ['radio2', 'check1'] } },

      { select: ':header', expect: { ids: ['header', 'banner', 'userAgent'] } },
    ],
  },

  {
    name: ':has() selector',
    html: html,
    htmlMode: 'document',
    cases: [
      { select: 'p:has(a)', expect: { ids: ['firstp', 'ap', 'en', 'sap'] } },
    ],
  },

]);
