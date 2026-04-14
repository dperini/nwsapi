import { type Page } from "@playwright/test";
import { runScenarios } from "./harness/scenarios";

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
      { select: '#nonescaped', expect: { count: 1 } },
      { select: '.nonescaped', expect: { count: 1 } },
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
      { select: '#\\30 nextIsWhiteSpace', expect: { count: 1 } },
      { select: '.\\30 nextIsWhiteSpace', expect: { count: 1 } },

      { select: '#\\30nextIsNotHexLetters', expect: { count: 1 } },
      { select: '.\\30nextIsNotHexLetters', expect: { count: 1 } },

      { select: '#\\000030connectHexMoreThan6Hex', expect: { count: 1 } },
      { select: '.\\000030connectHexMoreThan6Hex', expect: { count: 1 } },

      { select: '#\\000030 spaceMoreThan6Hex', expect: { count: 1 } },
      { select: '.\\000030 spaceMoreThan6Hex', expect: { count: 1 } },
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
      { select: '#one\\0', expect: { count: 1 } },
      { select: '.one\\0', expect: { count: 1 } },

      { select: '#two\\0', expect: { count: 0 } },
      { select: '.two\\0', expect: { count: 0 } },

      { select: '#three\\000000', expect: { count: 1 } },
      { select: '.three\\000000', expect: { count: 1 } },

      { select: '#four\\000000', expect: { count: 0 } },
      { select: '.four\\000000', expect: { count: 0 } },
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
      { select: '#\\d83d surrogateFirstA', expect: { count: 1, ids: ['\u{fffd}surrogateFirstA'] } },
      { select: '.\\d83d surrogateFirstA', expect: { count: 1, ids: ['\u{fffd}surrogateFirstA'] } },
      { select: '#\\d83d surrogateFirstB', expect: { count: 0 } },
      { select: '.\\d83d surrogateFirstB', expect: { count: 0 } },

      { select: '#surrogateSecondC\\dd11', expect: { count: 1, ids: ['surrogateSecondC\u{fffd}'] } },
      { select: '.surrogateSecondC\\dd11', expect: { count: 1, ids: ['surrogateSecondC\u{fffd}'] } },
      { select: '#surrogateSecondD\\dd11', expect: { count: 0 } },
      { select: '.surrogateSecondD\\dd11', expect: { count: 0 } },

      { select: '#surrogatePairE\\d83d\\dd11', expect: { count: 1, ids: ['surrogatePairE\u{fffd}\u{fffd}'] } },
      { select: '.surrogatePairE\\d83d\\dd11', expect: { count: 1, ids: ['surrogatePairE\u{fffd}\u{fffd}'] } },
      { select: '#surrogatePairF\\d83d\\dd11', expect: { count: 0 } },
      { select: '.surrogatePairF\\d83d\\dd11', expect: { count: 0 } },
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
      { select: '#outOfRangeA\\110000', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
      { select: '.outOfRangeA\\110000', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },

      { select: '#outOfRangeA\\110030', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
      { select: '.outOfRangeA\\110030', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },

      { select: '#outOfRangeB\\110030', expect: { count: 0 } },
      { select: '.outOfRangeB\\110030', expect: { count: 0 } },

      { select: '#outOfRangeA\\555555', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
      { select: '.outOfRangeA\\555555', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },

      { select: '#outOfRangeA\\ffffff', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
      { select: '.outOfRangeA\\ffffff', expect: { count: 1, ids: ['outOfRangeA\u{fffd}'] } },
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
      { select: '#eofA\\', expect: { count: 1, ids: ['eofA\u{fffd}'] } },
      { select: '.eofA\\', expect: { count: 1, ids: ['eofA\u{fffd}'] } },

      { select: '#eofB\\', expect: { count: 0 } },
      { select: '.eofB\\', expect: { count: 0 } },
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
      { select: '#\\.comma', expect: { count: 1, ids: ['.comma'] } },
      { select: '.\\.comma', expect: { count: 1, ids: ['.comma'] } },

      { select: '#\\-minus', expect: { count: 1, ids: ['-minus'] } },
      { select: '.\\-minus', expect: { count: 1, ids: ['-minus'] } },

      { select: '#\\g', expect: { count: 1, ids: ['g'] } },
      { select: '.\\g', expect: { count: 1, ids: ['g'] } },
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
      { select: '#\\61 BMPRegular', expect: { count: 1, ids: ['aBMPRegular'] } },
      { select: '.\\61 BMPRegular', expect: { count: 1, ids: ['aBMPRegular'] } },

      { select: '#\\1f511 nonBMP', expect: { count: 1, ids: ['\u{1f511}nonBMP'] } },
      { select: '.\\1f511 nonBMP', expect: { count: 1, ids: ['\u{1f511}nonBMP'] } },

      { select: '#\\30\\30 continueEscapesA', expect: { count: 1, ids: ['00continueEscapesA'] } },
      { select: '.\\30\\30 continueEscapesA', expect: { count: 1, ids: ['00continueEscapesA'] } },

      { select: '#\\30 \\30 continueEscapesB', expect: { count: 1, ids: ['00continueEscapesB'] } },
      { select: '.\\30 \\30 continueEscapesB', expect: { count: 1, ids: ['00continueEscapesB'] } },

      { select: '#continueEscapesC\\30 \\30 ', expect: { count: 1, ids: ['continueEscapesC00'] } },
      { select: '.continueEscapesC\\30 \\30 ', expect: { count: 1, ids: ['continueEscapesC00'] } },

      { select: '#continueEscapesD\\30 \\30', expect: { count: 1, ids: ['continueEscapesD00'] } },
      { select: '.continueEscapesD\\30 \\30', expect: { count: 1, ids: ['continueEscapesD00'] } },

      { select: '#continueEscapesE\\30\\30 ', expect: { count: 1, ids: ['continueEscapesE00'] } },
      { select: '.continueEscapesE\\30\\30 ', expect: { count: 1, ids: ['continueEscapesE00'] } },

      { select: '#continueEscapesF\\30\\30', expect: { count: 1, ids: ['continueEscapesF00'] } },
      { select: '.continueEscapesF\\30\\30', expect: { count: 1, ids: ['continueEscapesF00'] } },
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
      { select: '#hel\\6CoA', expect: { count: 1, ids: ['helloA'] } },
      { select: '.hel\\6CoA', expect: { count: 1, ids: ['helloA'] } },

      { select: '#hel\\6C oB', expect: { count: 1, ids: ['helloB'] } },
      { select: '.hel\\6C oB', expect: { count: 1, ids: ['helloB'] } },

      { select: '#\\26 B', expect: { count: 1, ids: ['&B'] } },
      { select: '.\\26 B', expect: { count: 1, ids: ['&B'] } },

      { select: '#spac\\65\r\nsA', expect: { count: 1, ids: ['spacesA'] } },
      { select: '.spac\\65\r\nsA', expect: { count: 1, ids: ['spacesA'] } },

      { select: '#sp\\61\tc\\65\fsB', expect: { count: 1, ids: ['spacesB'] } },
      { select: '.sp\\61\tc\\65\fsB', expect: { count: 1, ids: ['spacesB'] } },

      { select: '#\\E000', expect: { count: 1, ids: ['\u{E000}'] } },
      { select: '.\\E000', expect: { count: 1, ids: ['\u{E000}'] } },

      { select: '#testA\\D799', expect: { count: 1, ids: ['testA\u{D799}'] } },
      { select: '.testA\\D799', expect: { count: 1, ids: ['testA\u{D799}'] } },

      { select: '#te\\s\\tB', expect: { count: 1, ids: ['testB'] } },
      { select: '.te\\s\\tB', expect: { count: 1, ids: ['testB'] } },

      { select: '#\\.\\,\\:\\!', expect: { count: 1, ids: ['.,:!'] } },
      { select: '.\\.\\,\\:\\!', expect: { count: 1, ids: ['.,:!'] } },

      { select: '#nullA\\0', expect: { count: 1, ids: ['nullA\u{fffd}'] } },
      { select: '.nullA\\0', expect: { count: 1, ids: ['nullA\u{fffd}'] } },

      { select: '#nullB\\0000', expect: { count: 1, ids: ['nullB\u{fffd}'] } },
      { select: '.nullB\\0000', expect: { count: 1, ids: ['nullB\u{fffd}'] } },

      { select: '#largeA\\110000', expect: { count: 1, ids: ['largeA\u{fffd}'] } },
      { select: '.largeA\\110000', expect: { count: 1, ids: ['largeA\u{fffd}'] } },

      { select: '#largeB\\23456a', expect: { count: 1, ids: ['largeB\u{fffd}'] } },
      { select: '.largeB\\23456a', expect: { count: 1, ids: ['largeB\u{fffd}'] } },

      { select: '#surrogateA\\D800', expect: { count: 1, ids: ['surrogateA\u{fffd}'] } },
      { select: '.surrogateA\\D800', expect: { count: 1, ids: ['surrogateA\u{fffd}'] } },

      { select: '#surrogateB\\0DBAC', expect: { count: 1, ids: ['surrogateB\u{fffd}'] } },
      { select: '.surrogateB\\0DBAC', expect: { count: 1, ids: ['surrogateB\u{fffd}'] } },

      { select: '#\\00DFFFsurrogateC', expect: { count: 1, ids: ['\u{fffd}surrogateC'] } },
      { select: '.\\00DFFFsurrogateC', expect: { count: 1, ids: ['\u{fffd}surrogateC'] } },

      { select: '#\\10fFfF', expect: { count: 1, ids: ['\u{10ffff}'] } },
      { select: '.\\10fFfF', expect: { count: 1, ids: ['\u{10ffff}'] } },

      { select: '#\\10fFfF0', expect: { count: 1, ids: ['\u{10ffff}0'] } },
      { select: '.\\10fFfF0', expect: { count: 1, ids: ['\u{10ffff}0'] } },

      { select: '#\\10000000', expect: { count: 1, ids: ['\u{100000}00'] } },
      { select: '.\\10000000', expect: { count: 1, ids: ['\u{100000}00'] } },
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
      { select: '#simple-ident', expect: { count: 1, ids: ['simple-ident'] } },
      { select: '.simple-ident', expect: { count: 1, ids: ['simple-ident'] } },

      { select: '#testing123', expect: { count: 1, ids: ['testing123'] } },
      { select: '.testing123', expect: { count: 1, ids: ['testing123'] } },

      { select: '#_underscore', expect: { count: 1, ids: ['_underscore'] } },
      { select: '._underscore', expect: { count: 1, ids: ['_underscore'] } },

      { select: '#-text', expect: { count: 1, ids: ['-text'] } },
      { select: '.-text', expect: { count: 1, ids: ['-text'] } },

      { select: '#-\\6d', expect: { count: 1, ids: ['-m'] } },
      { select: '.-\\6d', expect: { count: 1, ids: ['-m'] } },

      { select: '#--abc', expect: { count: 1, ids: ['--abc'] } },
      { select: '.--abc', expect: { count: 1, ids: ['--abc'] } },

      { select: '#--', expect: { count: 1, ids: ['--'] } },
      { select: '.--', expect: { count: 1, ids: ['--'] } },

      { select: '#--11', expect: { count: 1, ids: ['--11'] } },
      { select: '.--11', expect: { count: 1, ids: ['--11'] } },

      { select: '#---', expect: { count: 1, ids: ['---'] } },
      { select: '.---', expect: { count: 1, ids: ['---'] } },

      { select: '#\u{2003}', expect: { count: 1, ids: ['\u{2003}'] } },
      { select: '.\u{2003}', expect: { count: 1, ids: ['\u{2003}'] } },

      { select: '#\u{A0}', expect: { count: 1, ids: ['\u{A0}'] } },
      { select: '.\u{A0}', expect: { count: 1, ids: ['\u{A0}'] } },

      { select: '#\u{1234}', expect: { count: 1, ids: ['\u{1234}'] } },
      { select: '.\u{1234}', expect: { count: 1, ids: ['\u{1234}'] } },

      { select: '#\u{12345}', expect: { count: 1, ids: ['\u{12345}'] } },
      { select: '.\u{12345}', expect: { count: 1, ids: ['\u{12345}'] } },

      { select: '#\u{0}', expect: { count: 1, ids: ['\u{fffd}'] }, status: 'fixme' },
      { select: '.\u{0}', expect: { count: 1, ids: ['\u{fffd}'] } },

      { select: '#ab\u{0}c', expect: { count: 1, ids: ['ab\u{fffd}c'] } },
      { select: '.ab\u{0}c', expect: { count: 1, ids: ['ab\u{fffd}c'] } },
    ],
  },
  {
    name: 'spaces in ident id selector',
    html: `<div><span id="spaces in\tident" class="spaces in\tident"></span></div>`,
    setupPage: setupNw,
    cases: [
      { select: '#spaces\\ in\\\tident', expect: { count: 1, ids: ['spaces in\tident'] } },
    ],
  },
  {
    name: 'spaces in ident class selector mismatch',
    status: 'fail',
    html: `<div><span id="spaces in\tident" class="spaces in\tident"></span></div>`,
    setupPage: setupNw,
    cases: [
      { select: '.spaces\\ in\\\tident', expect: { count: 1, ids: ['spaces in\tident'] } },
    ],
  },
]);