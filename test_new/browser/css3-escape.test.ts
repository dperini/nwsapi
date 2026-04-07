import { type Page } from "@playwright/test";
import { runScenarios } from "./harness";

const setupNw = async (page: Page) => {
  await page.evaluate(() => {
    NW.Dom.configure({
      SELECTOR3: true,
      NON_ASCII: true,
      UNICODE16: true,
      ESCAPECHR: true,
      VERBOSITY: false,
    });
  });
}

runScenarios('css3 escaped identifiers', 'normal',  [
  {
    name: 'non-escaped identifier',
    html: `<div><span id="nonescaped" class="nonescaped"></span></div>`,
    setupPage: setupNw,
    cases: [
      // 4.3.7 from https://www.w3.org/TR/css-syntax-3/#consume-an-escaped-code-point
      { selector: '#nonescaped', expect: { count: 1 } },
      { selector: '.nonescaped', expect: { count: 1 } },
    ],
  },
  {
    name: 'escape hex digit identifier',
    html: `
      <div>
        <span id="0nextIsWhiteSpace" class="0nextIsWhiteSpace"></span>
        <span id="0nextIsNotHexLetters" class="0nextIsNotHexLetters"></span>
        <span id="0connectHexMoreThan6Hex" class="0connectHexMoreThan6Hex"></span>
        <span id="0spaceMoreThan6Hex" class="0spaceMoreThan6Hex"></span>
      </div>`,
    setupPage: setupNw,
    cases: [
      // - escape hex digit
      { selector: '#\\30 nextIsWhiteSpace', expect: { count: 1 } },
      { selector: '.\\30 nextIsWhiteSpace', expect: { count: 1 } },

      { selector: '#\\30nextIsNotHexLetters', expect: { count: 1 } },
      { selector: '.\\30nextIsNotHexLetters', expect: { count: 1 } },

      { selector: '#\\000030connectHexMoreThan6Hex', expect: { count: 1 } },
      { selector: '.\\000030connectHexMoreThan6Hex', expect: { count: 1 } },

      { selector: '#\\000030 spaceMoreThan6Hex', expect: { count: 1 } },
      { selector: '.\\000030 spaceMoreThan6Hex', expect: { count: 1 } },
    ],
  },
  // {
  //   // - hex digit special replacement
  // }
  {
    name: 'zero points',
    html: '', // set up page in setupPage callback to avoid issues with unrepresentable characters in HTML source
    // html: `
    //   <div>
    //     <span id="one\u{fffd}" class="one\u{fffd}"></span>
    //     <span id="two\u{0}" class="two\u{0}"></span>
    //     <span id="three\u{fffd}" class="three\u{fffd}"></span>
    //     <span id="four\u{0}" class="four\u{0}"></span>
    //   </div>`,
    setupPage: async (page) => {
      setupNw(page);
      await page.evaluate(() => {
        document.body.innerHTML = '';
        const root = document.createElement('div');

        const one = document.createElement('span');
        one.id = one.className = 'one\uFFFD';

        const two = document.createElement('span');
        two.id = two.className = 'two\u0000';

        const three = document.createElement('span');
        three.id =three.className = 'three\uFFFD';

        const four = document.createElement('span');
        four.id = four.className = 'four\u0000';

        root.append(one, two, three, four);
        document.body.appendChild(root);
      });
    },
    cases: [
      // 1. zero points
      { selector: '#one\\0', expect: { count: 1 } },
      { selector: '.one\\0', expect: { count: 1 } },

      { selector: '#two\\0', expect: { count: 0 } },
      { selector: '.two\\0', expect: { count: 0 } },

      { selector: '#three\\000000', expect: { count: 1 } },
      { selector: '.three\\000000', expect: { count: 1 } },

      { selector: '#four\\000000', expect: { count: 0 } },
      { selector: '.four\\000000', expect: { count: 0 } },
    ],
  },
  {
    name: 'surrogate points',
    html: `
      <div>
        <span id="\u{fffd}surrogateFirstA" class="\u{fffd}surrogateFirstA"></span>
        <span id="\ud83dsurrogateFirstB" class="\ud83dsurrogateFirstB"></span>

        <span id="surrogateSecondC\u{fffd}" class="surrogateSecondC\u{fffd}"></span>
        <span id="surrogateSecondD\udd11" class="surrogateSecondD\udd11"></span>

        <span id="surrogatePairE\u{fffd}\u{fffd}" class="surrogatePairE\u{fffd}\u{fffd}"></span>
        <span id="surrogatePairF\u{1f511}" class="surrogatePairF\u{1f511}"></span>
      </div>`,
    setupPage: setupNw,
    cases: [
      // 2. surrogate points
      { selector: '#\\d83d surrogateFirstA', expect: { count: 1, ids: ['\u{fffd}surrogateFirstA'] } },
      { selector: '.\\d83d surrogateFirstA', expect: { count: 1, ids: ['\u{fffd}surrogateFirstA'] } },
      { selector: '#\\d83d surrogateFirstB', expect: { count: 0 } },
      { selector: '.\\d83d surrogateFirstB', expect: { count: 0 } },

      { selector: '#surrogateSecondC\\dd11', expect: { count: 1, ids: ['surrogateSecondC\u{fffd}'] } },
      { selector: '.surrogateSecondC\\dd11', expect: { count: 1, ids: ['surrogateSecondC\u{fffd}'] } },
      { selector: '#surrogateSecondD\\dd11', expect: { count: 0 } },
      { selector: '.surrogateSecondD\\dd11', expect: { count: 0 } },

      { selector: '#surrogatePairE\\d83d\\dd11', expect: { count: 1, ids: ['surrogatePairE\u{fffd}\u{fffd}'] } },
      { selector: '.surrogatePairE\\d83d\\dd11', expect: { count: 1, ids: ['surrogatePairE\u{fffd}\u{fffd}'] } },
      { selector: '#surrogatePairF\\d83d\\dd11', expect: { count: 0 } },
      { selector: '.surrogatePairF\\d83d\\dd11', expect: { count: 0 } },
    ],
  },
  {
    name: 'out of range points',
    html: `
      <div>
        <span id="outOfRangeA\u{fffd}" class="outOfRangeA\u{fffd}"></span>
        <span id="outOfRangeB\u{30}" class="outOfRangeB\u{30}"></span>
      </div>`,
    setupPage: setupNw,
    cases: [
      // 3. out of range points
      { selector: '#outOfRangeA\\110000', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
      { selector: '.outOfRangeA\\110000', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },

      { selector: '#outOfRangeA\\110030', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
      { selector: '.outOfRangeA\\110030', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },

      { selector: '#outOfRangeB\\110030', expect: { count: 0 } },
      { selector: '.outOfRangeB\\110030', expect: { count: 0 } },

      { selector: '#outOfRangeA\\555555', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
      { selector: '.outOfRangeA\\555555', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },

      { selector: '#outOfRangeA\\ffffff', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
      { selector: '.outOfRangeA\\ffffff', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
    ],
  },
  {
    name: 'escape eof',
    html: `
      <div>
        <span id="eofA\u{fffd}" class="eofA\u{fffd}"></span>
        <span id="eofB\\" class="eofB\\"></span>
      </div>`,
    setupPage: setupNw,
    cases: [
      // trailing backslash escapes EOF -> U+FFFD
      { selector: '#eofA\\', expect: { count: 1, ids: ['eofA\u{fffd}'] } },
      { selector: '.eofA\\', expect: { count: 1, ids: ['eofA\u{fffd}'] } },

      { selector: '#eofB\\', expect: { count: 0 } },
      { selector: '.eofB\\', expect: { count: 0 } },
    ],
  },
  {
    name: 'escape anything else',
    html: `
      <div>
        <span id=".comma" class=".comma"></span>
        <span id="-minus" class="-minus"></span>
        <span id="g" class="g"></span>
      </div>`,
    setupPage: setupNw,
    cases: [
      { selector: '#\\.comma', expect: { count: 1, ids: ['.comma'] } },
      { selector: '.\\.comma', expect: { count: 1, ids: ['.comma'] } },

      { selector: '#\\-minus', expect: { count: 1, ids: ['-minus'] } },
      { selector: '.\\-minus', expect: { count: 1, ids: ['-minus'] } },

      { selector: '#\\g', expect: { count: 1, ids: ['g'] } },
      { selector: '.\\g', expect: { count: 1, ids: ['g'] } },
    ],
  },
  {
    name: 'non edge cases',
    html: `
      <div>
        <span id="aBMPRegular" class="aBMPRegular"></span>
        <span id="\u{1f511}nonBMP" class="\u{1f511}nonBMP"></span>

        <span id="00continueEscapesA" class="00continueEscapesA"></span>
        <span id="00continueEscapesB" class="00continueEscapesB"></span>

        <span id="continueEscapesC00" class="continueEscapesC00"></span>
        <span id="continueEscapesD00" class="continueEscapesD00"></span>
        <span id="continueEscapesE00" class="continueEscapesE00"></span>
        <span id="continueEscapesF00" class="continueEscapesF00"></span>
      </div>`,
    setupPage: setupNw,
    cases: [
      { selector: '#\\61 BMPRegular', expect: { count: 1, ids: ['aBMPRegular'] } },
      { selector: '.\\61 BMPRegular', expect: { count: 1, ids: ['aBMPRegular'] } },

      { selector: '#\\1f511 nonBMP', expect: { count: 1, ids: ['\u{1f511}nonBMP'] } },
      { selector: '.\\1f511 nonBMP', expect: { count: 1, ids: ['\u{1f511}nonBMP'] } },

      { selector: '#\\30\\30 continueEscapesA', expect: { count: 1, ids: ['00continueEscapesA'] } },
      { selector: '.\\30\\30 continueEscapesA', expect: { count: 1, ids: ['00continueEscapesA'] } },

      { selector: '#\\30 \\30 continueEscapesB', expect: { count: 1, ids: ['00continueEscapesB'] } },
      { selector: '.\\30 \\30 continueEscapesB', expect: { count: 1, ids: ['00continueEscapesB'] } },

      { selector: '#continueEscapesC\\30 \\30 ', expect: { count: 1, ids: ['continueEscapesC00'] } },
      { selector: '.continueEscapesC\\30 \\30 ', expect: { count: 1, ids: ['continueEscapesC00'] } },

      { selector: '#continueEscapesD\\30 \\30', expect: { count: 1, ids: ['continueEscapesD00'] } },
      { selector: '.continueEscapesD\\30 \\30', expect: { count: 1, ids: ['continueEscapesD00'] } },

      { selector: '#continueEscapesE\\30\\30 ', expect: { count: 1, ids: ['continueEscapesE00'] } },
      { selector: '.continueEscapesE\\30\\30 ', expect: { count: 1, ids: ['continueEscapesE00'] } },

      { selector: '#continueEscapesF\\30\\30', expect: { count: 1, ids: ['continueEscapesF00'] } },
      { selector: '.continueEscapesF\\30\\30', expect: { count: 1, ids: ['continueEscapesF00'] } },
    ],
  },

  {
    name: 'chromium ident cases 1',
    html: `
      <div>
        <span id="helloA" class="helloA"></span>
        <span id="helloB" class="helloB"></span>
        <span id="&B" class="&B"></span>
        <span id="spacesA" class="spacesA"></span>
        <span id="spacesB" class="spacesB"></span>
        <span id="spaces in\tident" class="spaces in\tident"></span>
        <span id="\u{E000}" class="\u{E000}"></span>
        <span id="testA\u{D799}" class="testA\u{D799}"></span>
        <span id="testB" class="testB"></span>
        <span id=".,:!" class=".,:!"></span>
        <span id="nullA\u{fffd}" class="nullA\u{fffd}"></span>
        <span id="nullB\u{fffd}" class="nullB\u{fffd}"></span>
        <span id="largeA\u{fffd}" class="largeA\u{fffd}"></span>
        <span id="largeB\u{fffd}" class="largeB\u{fffd}"></span>
        <span id="surrogateA\u{fffd}" class="surrogateA\u{fffd}"></span>
        <span id="surrogateB\u{fffd}" class="surrogateB\u{fffd}"></span>
        <span id="\u{fffd}surrogateC" class="\u{fffd}surrogateC"></span>
        <span id="\u{10ffff}" class="\u{10ffff}"></span>
        <span id="\u{10ffff}0" class="\u{10ffff}0"></span>
        <span id="\u{100000}00" class="\u{100000}00"></span>
      </div>`,
    setupPage: setupNw,
    cases: [
      // ident tests case from CSS tests of chromium source: https://goo.gl/3Cxdov
      { selector: '#hel\\6CoA', expect: { count: 1, ids: ['helloA'] } },
      { selector: '.hel\\6CoA', expect: { count: 1, ids: ['helloA'] } },

      { selector: '#hel\\6C oB', expect: { count: 1, ids: ['helloB'] } },
      { selector: '.hel\\6C oB', expect: { count: 1, ids: ['helloB'] } },

      { selector: '#\\26 B', expect: { count: 1, ids: ['&B'] } },
      { selector: '.\\26 B', expect: { count: 1, ids: ['&B'] } },

      { selector: '#spac\\65\r\nsA', expect: { count: 1, ids: ['spacesA'] } },
      { selector: '.spac\\65\r\nsA', expect: { count: 1, ids: ['spacesA'] } },

      { selector: '#sp\\61\tc\\65\fsB', expect: { count: 1, ids: ['spacesB'] } },
      { selector: '.sp\\61\tc\\65\fsB', expect: { count: 1, ids: ['spacesB'] } },

      { selector: '#\\E000', expect: { count: 1, ids: ['\u{E000}'] } },
      { selector: '.\\E000', expect: { count: 1, ids: ['\u{E000}'] } },

      { selector: '#testA\\D799', expect: { count: 1, ids: ['testA\u{D799}'] } },
      { selector: '.testA\\D799', expect: { count: 1, ids: ['testA\u{D799}'] } },

      { selector: '#te\\s\\tB', expect: { count: 1, ids: ['testB'] } },
      { selector: '.te\\s\\tB', expect: { count: 1, ids: ['testB'] } },

      { selector: '#\\.\\,\\:\\!', expect: { count: 1, ids: ['.,:!'] } },
      { selector: '.\\.\\,\\:\\!', expect: { count: 1, ids: ['.,:!'] } },

      { selector: '#nullA\\0', expect: { count: 1, ids: ['nullA\u{fffd}'] } },
      { selector: '.nullA\\0', expect: { count: 1, ids: ['nullA\u{fffd}'] } },

      { selector: '#nullB\\0000', expect: { count: 1, ids: ['nullB\u{fffd}'] } },
      { selector: '.nullB\\0000', expect: { count: 1, ids: ['nullB\u{fffd}'] } },

      { selector: '#largeA\\110000', expect: { count: 1, ids: ['largeA\u{fffd}'] } },
      { selector: '.largeA\\110000', expect: { count: 1, ids: ['largeA\u{fffd}'] } },

      { selector: '#largeB\\23456a', expect: { count: 1, ids: ['largeB\u{fffd}'] } },
      { selector: '.largeB\\23456a', expect: { count: 1, ids: ['largeB\u{fffd}'] } },

      { selector: '#surrogateA\\D800', expect: { count: 1, ids: ['surrogateA\u{fffd}'] } },
      { selector: '.surrogateA\\D800', expect: { count: 1, ids: ['surrogateA\u{fffd}'] } },

      { selector: '#surrogateB\\0DBAC', expect: { count: 1, ids: ['surrogateB\u{fffd}'] } },
      { selector: '.surrogateB\\0DBAC', expect: { count: 1, ids: ['surrogateB\u{fffd}'] } },

      { selector: '#\\00DFFFsurrogateC', expect: { count: 1, ids: ['\u{fffd}surrogateC'] } },
      { selector: '.\\00DFFFsurrogateC', expect: { count: 1, ids: ['\u{fffd}surrogateC'] } },

      { selector: '#\\10fFfF', expect: { count: 1, ids: ['\u{10ffff}'] } },
      { selector: '.\\10fFfF', expect: { count: 1, ids: ['\u{10ffff}'] } },

      { selector: '#\\10fFfF0', expect: { count: 1, ids: ['\u{10ffff}0'] } },
      { selector: '.\\10fFfF0', expect: { count: 1, ids: ['\u{10ffff}0'] } },

      { selector: '#\\10000000', expect: { count: 1, ids: ['\u{100000}00'] } },
      { selector: '.\\10000000', expect: { count: 1, ids: ['\u{100000}00'] } },
    ],
  },
  {
    name: 'chromium ident cases 2',
    html: `
      <div>
        <span id="simple-ident" class="simple-ident"></span>
        <span id="testing123" class="testing123"></span>
        <span id="_underscore" class="_underscore"></span>
        <span id="-text" class="-text"></span>
        <span id="-m" class="-m"></span>
        <span id="--abc" class="--abc"></span>
        <span id="--" class="--"></span>
        <span id="--11" class="--11"></span>
        <span id="---" class="---"></span>
        <span id="\u{2003}" class="\u{2003}"></span>
        <span id="\u{A0}" class="\u{A0}"></span>
        <span id="\u{1234}" class="\u{1234}"></span>
        <span id="\u{12345}" class="\u{12345}"></span>
        <span id="\u{fffd}" class="\u{fffd}"></span>
        <span id="ab\u{fffd}c" class="ab\u{fffd}c"></span>
      </div>`,
    setupPage: setupNw,
    cases: [
      // ident tests case from CSS tests of chromium source: https://goo.gl/3Cxdov
      { selector: '#simple-ident', expect: { count: 1, ids: ['simple-ident'] } },
      { selector: '.simple-ident', expect: { count: 1, ids: ['simple-ident'] } },

      { selector: '#testing123', expect: { count: 1, ids: ['testing123'] } },
      { selector: '.testing123', expect: { count: 1, ids: ['testing123'] } },

      { selector: '#_underscore', expect: { count: 1, ids: ['_underscore'] } },
      { selector: '._underscore', expect: { count: 1, ids: ['_underscore'] } },

      { selector: '#-text', expect: { count: 1, ids: ['-text'] } },
      { selector: '.-text', expect: { count: 1, ids: ['-text'] } },

      { selector: '#-\\6d', expect: { count: 1, ids: ['-m'] } },
      { selector: '.-\\6d', expect: { count: 1, ids: ['-m'] } },

      { selector: '#--abc', expect: { count: 1, ids: ['--abc'] } },
      { selector: '.--abc', expect: { count: 1, ids: ['--abc'] } },

      { selector: '#--', expect: { count: 1, ids: ['--'] } },
      { selector: '.--', expect: { count: 1, ids: ['--'] } },

      { selector: '#--11', expect: { count: 1, ids: ['--11'] } },
      { selector: '.--11', expect: { count: 1, ids: ['--11'] } },

      { selector: '#---', expect: { count: 1, ids: ['---'] } },
      { selector: '.---', expect: { count: 1, ids: ['---'] } },

      { selector: '#\u{2003}', expect: { count: 1, ids: ['\u{2003}'] } },
      { selector: '.\u{2003}', expect: { count: 1, ids: ['\u{2003}'] } },

      { selector: '#\u{A0}', expect: { count: 1, ids: ['\u{A0}'] } },
      { selector: '.\u{A0}', expect: { count: 1, ids: ['\u{A0}'] } },

      { selector: '#\u{1234}', expect: { count: 1, ids: ['\u{1234}'] } },
      { selector: '.\u{1234}', expect: { count: 1, ids: ['\u{1234}'] } },

      { selector: '#\u{12345}', expect: { count: 1, ids: ['\u{12345}'] } },
      { selector: '.\u{12345}', expect: { count: 1, ids: ['\u{12345}'] } },

      { selector: '#\u{0}', expect: { count: 1, ids: ['\u{fffd}'] } },
      { selector: '.\u{0}', expect: { count: 1, ids: ['\u{fffd}'] } },

      { selector: '#ab\u{0}c', expect: { count: 1, ids: ['ab\u{fffd}c'] } },
      { selector: '.ab\u{0}c', expect: { count: 1, ids: ['ab\u{fffd}c'] } },
    ],
  },
  {
    name: 'spaces in ident id selector',
    html: `<div><span id="spaces in\tident" class="spaces in\tident"></span></div>`,
    setupPage: setupNw,
    cases: [
      { selector: '#spaces\\ in\\\tident', expect: { count: 1, ids: ['spaces in\tident'] } },
    ],
  },
  {
    name: 'spaces in ident class selector mismatch',
    modifier: 'fail',
    html: `<div><span id="spaces in\tident" class="spaces in\tident"></span></div>`,
    setupPage: setupNw,
    cases: [
      { selector: '.spaces\\ in\\\tident', expect: { count: 1, ids: ['spaces in\tident'] } },
    ],
  },
]);