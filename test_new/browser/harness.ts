import test, { chromium, expect, firefox, webkit } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

export type SelectorScenario = {
  name: string;
  html: string;
  htmlMode?: 'body' | 'document';
  browsers?: BrowserName[];
  cases: SelectorCase[];
  setupPage?: (page: Page) => void | Promise<void>;
  modifier?: TestModifier;
};

const BROWSER_NAMES = ['chromium', 'firefox', 'webkit'] as const;
type BrowserName = typeof BROWSER_NAMES[number];

type SelectorCase = {
  selector: string;
  root?: SelectorRoot;
  expect?: SelectorExpectation;
};

type DescribeModifier = 'normal' | 'skip' | 'only' | 'fixme';
type TestModifier = 'normal' | 'skip' | 'only' | 'fixme' | 'fail';

type SelectorExpectation = {
  allowMismatch?: boolean;
  count?: number;
  ids?: string[];
  includesIds?: string[];
  excludesIds?: string[];
  classes?: string[];
  includesClasses?: string[];
  excludesClasses?: string[];
  throws?: boolean;
  equivalentTo?: { selector: string; root?: SelectorRoot };
};

type SelectorResult = {
  mismatchMsg?: string;
} & Record<Engine, EngineResult>;

const ENGINES = ['native', 'nw'] as const;
type Engine = typeof ENGINES[number];

type EngineResult = {
  count: number;
  ids: string[];
  classes: string[];
  threw: boolean;
  equivalentToFailMsg?: string;
};

type SelectorRoot =
  | { kind: 'document' }
  | { kind: 'id'; value: string }
  | { kind: 'selector'; value: string };

export function runScenarios(
  label: string,
  modifier: DescribeModifier,
  scenarios: SelectorScenario[],
): void {
  const describeFn = getDescribeFn(modifier);
  describeFn(label, () => {
    let browsers: Record<BrowserName, Browser>;
    let pages: Record<BrowserName, Page>;

    test.beforeAll(async () => {
      browsers = {
        chromium: await chromium.launch(),
        firefox: await firefox.launch(),
        webkit: await webkit.launch(),
      };

      pages = {
        chromium: await browsers.chromium.newPage(),
        firefox: await browsers.firefox.newPage(),
        webkit: await browsers.webkit.newPage(),
      };

      for (const page of Object.values(pages)) {
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ path: 'src/nwsapi.js' });
      }
    });

    test.afterAll(async () => {
      await Promise.all(BROWSER_NAMES.map((name) => browsers[name].close()));
    });

    for (const s of scenarios) {
      const testFn = getTestFn(s.modifier);
      testFn(s.name, async () => {
        await runScenario(s, pages);
      });
    }
  });
}

async function runScenario(s: SelectorScenario, pages: Record<BrowserName, Page>): Promise<void> {
  const scenarioBrowsers = s.browsers ?? BROWSER_NAMES;

  for (const browserName of scenarioBrowsers) {
    const page = pages[browserName];
    await setupPage(page, s);

    for (const c of s.cases) {
      const result = await evalSelector(page, c);

      const expectation = c.expect ?? {};
      const allowMismatch = expectation.allowMismatch ?? false;
      const msg = `[${browserName}] ${s.name} :: ${c.selector}${result.mismatchMsg && !allowMismatch ? `\n${result.mismatchMsg}` : ''}`;

      if (expectation.throws) {
        expect(result.nw.threw, msg).toBe(true);
        continue;
      }

      expect(result.nw.threw, msg).toBe(false);

      const nativeThrew = result.native.threw;

      if (expectation.count !== undefined) {
        expectEngines(result, msg, 'count', (r, label) => {
          expect(r.count, label).toEqual(expectation.count);
        });
      }

      if (expectation.ids) {
        expectEngines(result, msg, 'ids', (r, label) => {
          expect(r.ids, label).toEqual(expectation.ids);
        });
      }

      if (expectation.includesIds) {
        for (const id of expectation.includesIds) {
          expectEngines(result, msg, 'ids', (r, label) => {
            expect(r.ids, label).toContain(id);
          });
        }
      }

      if (expectation.excludesIds) {
        for (const id of expectation.excludesIds) {
          expectEngines(result, msg, 'ids', (r, label) => {
            expect(r.ids, label).not.toContain(id);
          });
        }
      }

      if (expectation.classes) {
        expectEngines(result, msg, 'classes', (r, label) => {
          expect(r.classes, label).toEqual(expectation.classes);
        });
      }

      if (expectation.includesClasses) {
        for (const cls of expectation.includesClasses) {
          expectEngines(result, msg, 'classes', (r, label) => {
            const classTokens = r.classes.flatMap(s => s.trim() ? s.trim().split(/\s+/) : []);
            expect(classTokens, label).toContain(cls);
          });
        }
      }

      if (expectation.excludesClasses) {
        for (const cls of expectation.excludesClasses) {
          expectEngines(result, msg, 'classes', (r, label) => {
            const classTokens = r.classes.flatMap(s => s.trim() ? s.trim().split(/\s+/) : []);
            expect(classTokens, label).not.toContain(cls);
          });
        }
      }

      if (expectation.equivalentTo) {
        expectEngines(result, msg, 'equivalentToFailMsg', (r, label) => {
          expect(r.equivalentToFailMsg, label).toBeUndefined();
        });
      }

      if (!allowMismatch && !nativeThrew) {
        expect(result.mismatchMsg, msg).toBeUndefined();
      }
    }
  }
}

function expectEngines(
  result: SelectorResult,
  baseMsg: string,
  key: keyof EngineResult,
  check: (r: EngineResult, label: string) => void
): void {
  for (const engine of ENGINES) {
    const r = result[engine];
    if (r.threw) continue;

    const sameIds = (a: string[], b: string[]): boolean  => 
      a.length === b.length && a.every((x, i) => x === b[i]);

    const enginesWithSameOutcome = ENGINES.filter((e) => {
      if (result[e].threw) return false;
      switch (key) {
        case 'count': return r.count === result[e].count;
        case 'ids': return sameIds(r.ids, result[e].ids);
        case 'classes': return sameIds(r.classes, result[e].classes);
        case 'threw': return r.threw === result[e].threw;
        case 'equivalentToFailMsg': return e === engine;
        default: assertNever(key);
      }
    });

    let label = `[engine=${enginesWithSameOutcome.join('+')}] ${baseMsg}`;
    if (r.equivalentToFailMsg && key === 'equivalentToFailMsg') label += `\n${r.equivalentToFailMsg}`;
    check(r, label);
  }
}

function getDescribeFn(mode?: DescribeModifier) {
  if (mode === 'skip') return test.describe.skip;
  if (mode === 'only') return test.describe.only;
  if (mode === 'fixme') return test.describe.fixme;
  return test.describe;
}

function getTestFn(mode?: TestModifier) {
  if (mode === 'skip') return test.skip;
  if (mode === 'only') return test.only;
  if (mode === 'fixme') return test.fixme;
  if (mode === 'fail') return test.fail;
  return test;
}

async function setupPage(page: Page, scenario: SelectorScenario): Promise<void> {
  if (scenario.htmlMode === 'document') {
    await page.setContent(scenario.html);
    await page.addScriptTag({ path: 'src/nwsapi.js' });
    if (scenario.setupPage) await scenario.setupPage(page);
    return;
  }

  await page.evaluate((bodyHtml) => {
    document.body.innerHTML = bodyHtml;
  }, scenario.html);
  if (scenario.setupPage) await scenario.setupPage(page);
}

async function evalSelector(page: Page, selCase: SelectorCase): Promise<SelectorResult> {
  return await page.evaluate((c) => {
    const native: EngineResult = { count: 0, ids: [], classes: [], threw: false };
    const nw: EngineResult = { count: 0, ids: [], classes: [], threw: false };

    type QueryResult = { elements: Element[]; error: string };
    const runQuery = (query: () => Element[]): QueryResult => {
      try {
        return { elements: query(), error: '' };
      } catch (e) {
        return { elements: [], error: e instanceof Error ? e.message : String(e) };
      }
    };

    const describe = (el: Element | undefined) => {
      if (!el) return '(missing)';
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || '',
        html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 120),
      };
    };

    type NamedQueryResult = { name: string; result: QueryResult };
    const compareQueryResults = (a: NamedQueryResult, b: NamedQueryResult): string | undefined => {
      if (a.result.error || b.result.error) {
        if (a.result.error && b.result.error) return `Both threw:\n  ${a.name} error: ${a.result.error}\n  ${b.name} error: ${b.result.error}`;
        return a.result.error
          ? `${a.name} threw while ${b.name} did not: ${a.result.error}`
          : `${b.name} threw while ${a.name} did not: ${b.result.error}`;
      }

      const aElems = a.result.elements;
      const bElems = b.result.elements;

      let mismatchMsg: string | undefined;
      if (aElems.length !== bElems.length) {
        mismatchMsg = `Count mismatch: ${a.name}=${aElems.length}, ${b.name}=${bElems.length}`;
      }

      const maxLen = Math.max(aElems.length, bElems.length);
      for (let i = 0; i < maxLen; ++i) {
        if (aElems[i] !== bElems[i]) {
          mismatchMsg = mismatchMsg ? mismatchMsg + '\n' : '';
          mismatchMsg += `Element mismatch at index ${i}:\n` +
            `${a.name}[${i}] = ${JSON.stringify(describe(aElems[i]))}\n` +
            `${b.name}[${i}] = ${JSON.stringify(describe(bElems[i]))}`;
          break;
        }
      }

      return mismatchMsg;
    };

    const getRoot = (root: SelectorRoot | undefined): ParentNode | null => {
      return !root || root.kind === 'document' ? document
        : root.kind === 'id' ? document.getElementById(root.value)
        : root.kind === 'selector' ? document.querySelector(root.value)
        : null; // impossible case
    }

    const root = getRoot(c.root);
    
    if (!root) {
      return {
        native, nw,
        mismatchMsg: `Root element not found for selector: ${JSON.stringify(c.root)}`,
      };
    }

    const nativeRes = runQuery(() => [...root.querySelectorAll(c.selector)]);
    const nwRes = runQuery(() => NW.Dom.select(c.selector, root));
    [{ engine: native, res: nativeRes }, { engine: nw, res: nwRes }]
      .forEach(({ engine, res }) => {
        engine.count = res.elements.length;
        engine.ids = res.elements.map((el) => el.getAttribute('id') ?? '');
        engine.classes = res.elements.map((el) => el.getAttribute('class') ?? '');
        engine.threw = !!res.error;
      });

    const mismatchMsg = compareQueryResults(
      { name: 'native', result: nativeRes },
      { name: 'nw', result: nwRes },
    );

    if (c.expect?.equivalentTo) {
      const eqSelector = c.expect.equivalentTo.selector;
      const eqRoot = getRoot(c.expect.equivalentTo.root);

      let eqNativeRes: QueryResult;
      let eqNwRes: QueryResult;
      if (!eqRoot) {
        const error = `Equivalent selector root not found: ${JSON.stringify(c.expect.equivalentTo.root)}`;
        eqNativeRes = { elements: [], error };
        eqNwRes = { elements: [], error };
      } else {
        eqNativeRes = runQuery(() => [...eqRoot.querySelectorAll(eqSelector)]);
        eqNwRes = runQuery(() => NW.Dom.select(eqSelector, eqRoot));
      }

      native.equivalentToFailMsg = compareQueryResults(
        { name: `native(${c.selector})`, result: nativeRes },
        { name: `native(${eqSelector})`, result: eqNativeRes },
      );

      nw.equivalentToFailMsg = compareQueryResults(
        { name: `nw(${c.selector})`, result: nwRes },
        { name: `nw(${eqSelector})`, result: eqNwRes },
      );
    }

    return { mismatchMsg, native, nw };
  }, selCase);
}

function assertNever(x: never): never {
  throw new Error(`Unexpected key: ${x}`);
}
