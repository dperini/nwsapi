import test, { chromium, expect, firefox, webkit } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { evalSelectCase, type SelectCase } from './select';
import { assertNever } from '../../utils/type';
import { installBrowserHelpers, type EngineResult, type EvalResult } from './browser';

type Case = SelectCase;
const isSelectCase = (c: Case): c is SelectCase => 'select' in c;

export type Scenario = {
  name: string;
  html: string;
  htmlMode?: 'body' | 'document';
  browsers?: BrowserName[];
  cases: Case[];
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
  equivalentTo?: EquivalentTo;
};

export type EquivalentTo = { search: string; scope?: ScopeRef };

const BROWSER_NAMES = ['chromium', 'firefox', 'webkit'] as const;
export type BrowserName = typeof BROWSER_NAMES[number];

type DescribeStatus = 'normal' | 'skip' | 'only' | 'fixme';
type TestStatus = 'normal' | 'skip' | 'only' | 'fixme' | 'fail';

export const ENGINES = ['native', 'nw'] as const;
export type Engine = typeof ENGINES[number];

export type ScopeRef =
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

export async function runScenario(s: Scenario, pages: Record<BrowserName, Page>): Promise<void> {
  const scenarioBrowsers = s.browsers ?? BROWSER_NAMES;

  for (const browserName of scenarioBrowsers) {
    const page = pages[browserName];
    await setupPage(page, s);
    for (const c of s.cases) {
      let result: EvalResult | undefined;
      if (isSelectCase(c)) result = await evalSelectCase(page, c);
      else throw new Error(`Unsupported case type in scenario "${s.name}" for browser "${browserName}"`);

      const expectation = c.expect ?? {};
      checkResult(result, expectation, browserName, s.name);
    }
  }
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

export function expectEngines(
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
        case 'equivalentToFailMsg': return e === engine;
        default: assertNever(key);
      }
    });

    let label = `[engine=${enginesWithSameOutcome.join('+')}] ${baseMsg}`;
    if (r.equivalentToFailMsg && key === 'equivalentToFailMsg') label += `\n${r.equivalentToFailMsg}`;
    check(r, label);
  }
}

function checkResult(result: EvalResult, expectation: Expectation, browserName: BrowserName, scenarioName: string): void {
  const allowMismatch = expectation.allowMismatch ?? false;
  const msg = `[${browserName}] ${scenarioName} :: ${result.info}${result.mismatchMsg && !allowMismatch ? `\n${result.mismatchMsg}` : ''}`;

  if (expectation.throws) {
    expect(result.nw.threw, msg).toBe(true);
    return;
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
