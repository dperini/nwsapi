import test, { chromium, expect, firefox, webkit } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { assertNever, type DistributiveOmit } from '../../utils/type';
import { installBrowserHelpers, type EngineResult, type EvalResult, type EngineQuery } from './browser';

export type SelectCase = { select: string; ref?: ContextRef; expect?: Expectation };
export type ByIdCase = { byId: string; ref?: ContextRef; expect?: Expectation };
export type ByTagCase = { byTag: string; ref?: ContextRef; expect?: Expectation };
export type ByClassCase = { byClass: string; ref?: ContextRef; expect?: Expectation };
export type MatchCase = { match: string; ref: ContextRef; expect?: Expectation };
export type FirstCase = { first: string; ref?: ContextRef; expect?: Expectation };
export type ClosestCase = { closest: string; ref: ContextRef; expect?: Expectation };

export type TestCase = SelectCase | ByIdCase | ByTagCase | ByClassCase | MatchCase | FirstCase | ClosestCase;

export type Scenario = {
  name: string;
  html: string;
  htmlMode?: 'body' | 'document';
  browsers?: BrowserName[];
  cases: TestCase[];
  setupPage?: (page: Page) => void | Promise<void>;
  status?: TestStatus;
};

export type Expectation = {
  allowMismatch?: boolean;
  count?: number;
  ids?: string[];
  includesIds?: string[];
  excludesIds?: string[];
  classes?: string[];
  includesClasses?: string[];
  excludesClasses?: string[];
  throws?: boolean;
  equivalentCase?: EquivalentCase;
};

export type EquivalentCase = DistributiveOmit<TestCase, 'expect'>;
// const foo: EquivalentCase = { select: 'div' }; // just to verify the type

const BROWSER_NAMES = ['chromium', 'firefox', 'webkit'] as const;
type BrowserName = typeof BROWSER_NAMES[number];

type DescribeStatus = 'normal' | 'skip' | 'only' | 'fixme';
type TestStatus = 'normal' | 'skip' | 'only' | 'fixme' | 'fail';

export const ENGINES = ['native', 'nw'] as const;
export type Engine = typeof ENGINES[number];

export type ContextRef =
  | { by: 'document' }
  | { by: 'id'; id: string }
  | { by: 'first'; selector: string };

export function runScenarios(label: string, status: DescribeStatus, scenarios: Scenario[]): void {
  const describeFn = getDescribeFn(status);
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
        await page.evaluate(installBrowserHelpers);
        await page.addScriptTag({ path: 'src/nwsapi.js' });
      }
    });

    test.afterAll(async () => {
      await Promise.all(BROWSER_NAMES.map((name) => browsers[name].close()));
    });

    for (const s of scenarios) {
      const testFn = getTestFn(s.status);
      testFn(s.name, async () => {
        await runScenario(s, pages);
      });
    }
  });
}

async function runScenario(s: Scenario, pages: Record<BrowserName, Page>): Promise<void> {
  const scenarioBrowsers = s.browsers ?? BROWSER_NAMES;

  for (const browserName of scenarioBrowsers) {
    const page = pages[browserName];
    await setupPage(page, s);
    for (const c of s.cases) {
      const result = await evalCase(page, c);
      const expectation = c.expect ?? {};
      checkResult(result, expectation, browserName, s.name);
    }
  }
}

async function evalCase(page: Page, testCase: TestCase): Promise<EvalResult> {
  return await page.evaluate((c) => {
    const pw = window.__pwHelpers;
    const query = pw.getCaseQuery(c);
    // const info = pw.getCaseLabel(c);
    const equivCase = c.expect?.equivalentCase;

    const nwFn: EngineQuery = pw.getEngineQuery(c, 'nw');
    const nativeFn: EngineQuery = pw.getEngineQuery(c, 'native');

    const nwRes = pw.getResults(nwFn, query, c.ref);
    const nativeRes = pw.getResults(nativeFn, query, c.ref);

    const mismatchMsg = pw.compareQueryResults(
      { name: `native:${pw.getCaseLabel(c, 'native')}`, result: nativeRes.queryResult },
      { name: `nw:${pw.getCaseLabel(c, 'nw')}`, result: nwRes.queryResult },
    );

    let equivMismatchMsg: string | undefined;
    if (equivCase) {
      const nwEquivFn = pw.getEngineQuery(equivCase, 'nw');
      const nwEquivQuery = pw.getCaseQuery(equivCase);
      const nwEquivRes = pw.getResults(nwEquivFn, nwEquivQuery, equivCase.ref);

      equivMismatchMsg = pw.compareQueryResults(
        { name: `nw:${pw.getCaseLabel(c, 'nw')}`, result: nwRes.queryResult },
        { name: `nwEquiv:${pw.getCaseLabel(equivCase, 'nw')}`, result: nwEquivRes.queryResult },
      );
    }

    return {
      info: query, mismatchMsg, equivMismatchMsg,
      native: nativeRes.engineResult,
      nw: nwRes.engineResult
    };
  }, testCase);
}

function getDescribeFn(mode?: DescribeStatus) {
  if (mode === 'skip') return test.describe.skip;
  if (mode === 'only') return test.describe.only;
  if (mode === 'fixme') return test.describe.fixme;
  return test.describe;
}

function getTestFn(mode?: TestStatus) {
  if (mode === 'skip') return test.skip;
  if (mode === 'only') return test.only;
  if (mode === 'fixme') return test.fixme;
  if (mode === 'fail') return test.fail;
  return test;
}

async function setupPage(page: Page, scenario: Scenario): Promise<void> {
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

function runEngineChecks(
  result: EvalResult,
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
        default: assertNever(key);
      }
    });

    let label = `[engine=${enginesWithSameOutcome.join('+')}] ${baseMsg}`;
    check(r, label);
  }
}

function checkResult(result: EvalResult, expectation: Expectation, browserName: BrowserName, scenarioName: string): void {
  const allowMismatch = expectation.allowMismatch ?? false;
  const msg = `[${browserName}] :: ${scenarioName} :: ${result.info}${result.mismatchMsg && !allowMismatch ? `\n${result.mismatchMsg}` : ''}`;

  if (expectation.throws) {
    expect(result.nw.threw, msg).toBe(true);
    return;
  }

  expect(result.nw.threw, msg).toBe(false);

  if (expectation.count !== undefined) {
    runEngineChecks(result, msg, 'count', (r, label) => {
      expect(r.count, label).toEqual(expectation.count);
    });
  }

  if (expectation.ids) {
    runEngineChecks(result, msg, 'ids', (r, label) => {
      expect(r.ids, label).toEqual(expectation.ids);
    });
  }

  if (expectation.includesIds) {
    for (const id of expectation.includesIds) {
      runEngineChecks(result, msg, 'ids', (r, label) => {
        expect(r.ids, label).toContain(id);
      });
    }
  }

  if (expectation.excludesIds) {
    for (const id of expectation.excludesIds) {
      runEngineChecks(result, msg, 'ids', (r, label) => {
        expect(r.ids, label).not.toContain(id);
      });
    }
  }

  if (expectation.classes) {
    runEngineChecks(result, msg, 'classes', (r, label) => {
      expect(r.classes, label).toEqual(expectation.classes);
    });
  }

  if (expectation.includesClasses) {
    for (const cls of expectation.includesClasses) {
      runEngineChecks(result, msg, 'classes', (r, label) => {
        const classTokens = r.classes.flatMap(s => s.trim() ? s.trim().split(/\s+/) : []);
        expect(classTokens, label).toContain(cls);
      });
    }
  }

  if (expectation.excludesClasses) {
    for (const cls of expectation.excludesClasses) {
      runEngineChecks(result, msg, 'classes', (r, label) => {
        const classTokens = r.classes.flatMap(s => s.trim() ? s.trim().split(/\s+/) : []);
        expect(classTokens, label).not.toContain(cls);
      });
    }
  }

  if (!allowMismatch && !result.native.threw) {
    const mismatch = !!result.mismatchMsg;
    expect(mismatch, `${msg}\n${result.mismatchMsg}`).toBe(false);
  }

  if (expectation.equivalentCase) {
    const equivMismatch = !!result.equivMismatchMsg;
    expect(equivMismatch, `${msg}\n${result.equivMismatchMsg}`).toBe(false);
  }
}
