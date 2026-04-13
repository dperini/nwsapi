import { test, chromium, expect, firefox, webkit } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { assertNever, type DistributiveOmit } from '../../utils/type';
import { installBrowserHelpers } from './browser';
import type { EngineResult, EvalResult, EngineQuery } from './browser';

type HarnessMode = 'normal' | 'fixme';
const rawHarnessMode = process.env.HARNESS_MODE;
if (rawHarnessMode !== undefined && rawHarnessMode !== 'normal' && rawHarnessMode !== 'fixme') {
  throw new Error(`Invalid HARNESS_MODE: ${rawHarnessMode}`);
}
const HARNESS_MODE: HarnessMode = rawHarnessMode ?? 'normal';

type CaseBase = { expect?: Expectation; status?: CaseStatus; browsers?: BrowserName[]; };
export type SelectCase =  { select: string;  ref?: ContextRef; } & CaseBase;
export type ByIdCase =    { byId: string;    ref?: ContextRef; } & CaseBase;
export type ByTagCase =   { byTag: string;   ref?: ContextRef; } & CaseBase;
export type ByClassCase = { byClass: string; ref?: ContextRef; } & CaseBase;
export type FirstCase =   { first: string;   ref?: ContextRef; } & CaseBase;
export type MatchCase =   { match: string;   ref:  ContextRef; } & CaseBase;
export type ClosestCase = { closest: string; ref:  ContextRef; } & CaseBase;

export type TestCase = SelectCase | ByIdCase | ByTagCase | ByClassCase | MatchCase | FirstCase | ClosestCase;

export type Scenario = {
  name: string;
  status?: ScenarioStatus;
  html: string;
  htmlMode?: 'body' | 'document';
  browsers?: BrowserName[];
  steps?: ScenarioStep[];

  // ergonomic sugar for simple scenarios that don't require multiple steps
  setupPage?: (page: Page) => void | Promise<void>;
  cases?: TestCase[];
};

type ScenarioStep = {
  setupPage?: (page: Page) => void | Promise<void>;
  cases: TestCase[];
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

export type EquivalentCase = DistributiveOmit<TestCase, 'expect' | 'status' | 'browsers'>;
// const foo: EquivalentCase = { select: 'div' }; // just to verify the type

const BROWSER_NAMES = ['chromium', 'firefox', 'webkit'] as const;
type BrowserName = typeof BROWSER_NAMES[number];

type ScenariosStatus = 'normal' | 'skip' | 'only'; // | 'fixme';
type ScenarioStatus = 'normal' | 'skip' | 'only' | 'fixme' | 'fail';
type CaseStatus = 'normal' | 'skip' | 'fixme' | 'fail' | 'only';

export const ENGINES = ['native', 'nw'] as const;
export type Engine = typeof ENGINES[number];

export type ContextRef =
  | { by: 'document' }
  | { by: 'id'; id: string; home?: ContextHome; within?: ContextRef }
  | { by: 'first'; selector: string; home?: ContextHome; within?: ContextRef }
  | { by: 'iframe'; id: string; within?: ContextRef }
  | { by: 'template'; id: string; within?: ContextRef }

export type ContextHome = 'document' | 'detached' | 'fragment';
export type NwsapiId = 'nwsapi-bootstrap';

type Misfail = { passedEverywhere: boolean; resultInfo: string; stepIndex: number; caseIndex: number; };
type CaseInfo = {
  browser: BrowserName;
  scenario: Scenario;
  case: TestCase;
  stepIndex: number;
  caseIndex: number;
  stepCaseIndex: number;
  misfails: Record<number, Misfail>;
};

export function runScenarios(label: string, status: ScenariosStatus, scenarios: Scenario[]): void {
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

    const scenarioHas = (s: Scenario, status: 'only' | 'fixme'): boolean =>
      s.status === status ||
        !!s.cases?.some(c => c.status === status) ||
        !!s.steps?.some(step => step.cases.some(c => c.status === status));

    const hasScenariosOnly = scenarios.some(s => scenarioHas(s, 'only'));

    for (const s of scenarios) {
      const hasFixme = scenarioHas(s, 'fixme');
      if (HARNESS_MODE === 'fixme' && !hasFixme) continue;

      const hasOnly = scenarioHas(s, 'only');
      if (hasScenariosOnly && !hasOnly) continue;

      const testFn = getTestFn(s.status);
      testFn(s.name, async () => {
        await runScenario(s, pages);
      });
    }
  });
}

async function runScenario(s: Scenario, pages: Record<BrowserName, Page>): Promise<void> {
  const scenarioBrowsers = s.browsers ?? BROWSER_NAMES;

  // cases marked 'fail' and whether they passed in every applicable browser so far
  const misfails: Record<number, Misfail> = {};

  const steps: ScenarioStep[] = [
    ...(s.steps ?? []),
    ...(s.cases?.length ? [{ cases: s.cases }] : []),
  ];

  const hasOnlyCases = steps.some(step => step.cases.some(c => c.status === 'only'));

  for (const browserName of scenarioBrowsers) {
    const page = pages[browserName];
    await initPage(page, s);

    let stepCaseIndex = 0;
    for (let stepIndex = 0; stepIndex < steps.length; ++stepIndex) {
      const step = steps[stepIndex];
      if (step.setupPage) await step.setupPage(page);
      for (let caseIndex = 0; caseIndex < step.cases.length; ++caseIndex) {
        const c = step.cases[caseIndex];
        if (hasOnlyCases && c.status !== 'only') continue;
        await runCase(
          page,
          {
            browser: browserName, scenario: s, case: c,
            stepIndex, caseIndex, stepCaseIndex, misfails
          }
        );
        stepCaseIndex++;
      }
    }
  }

  // At the end of the scenario, check if any 'fail' cases passed unexpectedly in all browsers
  for (const [_scIndex, misFail] of Object.entries(misfails)) {
    if (misFail.passedEverywhere) {
      const { stepIndex, caseIndex } = misFail;
      throw new Error(
        `Step #${stepIndex + 1}, Case #${caseIndex + 1} was marked 'fail' but unexpectedly passed in every applicable browser.\n` +
        `${s.name} :: ${misFail.resultInfo}\n`
      );
    }
  }
}

async function runCase(page: Page, caseInfo: CaseInfo): Promise<void> {
  const { scenario: s, case: c } = caseInfo;

  if (c.status === 'skip') return;
  if (s.status !== 'fixme' && HARNESS_MODE === 'fixme' && c.status !== 'fixme') {
    return;
  }
  if (c.browsers && !c.browsers.includes(caseInfo.browser)) return;

  const result = await evalCase(page, c);
  const expectation = c.expect ?? {};

  let thrown: unknown = undefined;
  try {
    checkResult(result, expectation, caseInfo);
  } catch (err) {
    thrown = err;
  }

  const status = c.status ?? 'normal';

  if (status === 'normal' || status === 'only') {
    if (thrown) throw thrown;
    return;
  }

  if (status === 'fail') {
    const curPassed = !thrown;
    const prevPassed = caseInfo.misfails[caseInfo.stepCaseIndex]?.passedEverywhere ?? true;
    const passedEverywhere = curPassed && prevPassed;
    const resultInfo = caseInfo.misfails[caseInfo.stepCaseIndex]?.resultInfo ?? result.info;
    const { stepIndex, caseIndex } = caseInfo;
    caseInfo.misfails[caseInfo.stepCaseIndex] = { passedEverywhere, resultInfo, stepIndex, caseIndex };
    return;
  }

  if (status === 'fixme') {
    if (thrown && HARNESS_MODE === 'fixme') {
      throw thrown;
    }
    return;
  }

  assertNever(status);
}

async function evalCase(page: Page, testCase: TestCase): Promise<EvalResult> {
  return await page.evaluate((c) => {
    const pw = window.__pwHelpers;
    const query = pw.getCaseQuery(c);
    const equivCase = c.expect?.equivalentCase;

    const nwFn: EngineQuery = pw.getEngineQuery(c, 'nw');
    const nativeFn: EngineQuery = pw.getEngineQuery(c, 'native');

    const ctx = pw.resolveContext(c.ref);
    const ctxErrorMsg = ctx ? undefined : `Could not resolve context from ref: ${pw.stringify(c.ref)}`;

    const nwRes = pw.getResults(nwFn, query, ctx, ctxErrorMsg);
    const nativeRes = pw.getResults(nativeFn, query, ctx, ctxErrorMsg);

    const mismatchMsg = pw.compareQueryResults(
      { name: `native:${pw.getCaseLabel(c, 'native')}`, result: nativeRes.queryResult },
      { name: `nw:${pw.getCaseLabel(c, 'nw')}`, result: nwRes.queryResult },
    );

    let equivMismatchMsg: string | undefined;
    if (equivCase) {
      const nwEquivFn = pw.getEngineQuery(equivCase, 'nw');
      const nwEquivQuery = pw.getCaseQuery(equivCase);

      const equivCtx = pw.resolveContext(equivCase.ref);
      const equivCtxErrorMsg = !equivCtx
        ? `Could not resolve equivalent context from ref: ${pw.stringify(equivCase.ref)}`
        : undefined;
      const nwEquivRes = pw.getResults(nwEquivFn, nwEquivQuery, equivCtx, equivCtxErrorMsg);

      if (pw.isRehomed(c.ref) || pw.isRehomed(equivCase.ref)) {
        equivMismatchMsg =
          `Equivalent-case assertion unsupported because one or more contexts were rehomed.\n` +
          `Identity-based equivalence is only supported for document-backed contexts.\n` +
          `  case context: ${pw.stringify(c.ref)}${pw.isRehomed(c.ref) ? ' (rehomed)' : ''}\n` +
          `  equivalent case context: ${pw.stringify(equivCase.ref)}${pw.isRehomed(equivCase.ref) ? ' (rehomed)' : ''}`
      } else {
        equivMismatchMsg = pw.compareQueryResults(
          { name: `nw:${pw.getCaseLabel(c, 'nw')}`, result: nwRes.queryResult },
          { name: `nwEquiv:${pw.getCaseLabel(equivCase, 'nw')}`, result: nwEquivRes.queryResult },
        );
      }
    }

    return {
      info: query, mismatchMsg, equivMismatchMsg,
      native: nativeRes.engineResult,
      nw: nwRes.engineResult
    };
  }, testCase);
}

function getDescribeFn(mode?: ScenariosStatus) {
  if (mode === 'skip') return test.describe.skip;
  if (mode === 'only') return test.describe.only;
  // if (mode === 'fixme') return test.describe.fixme;
  return test.describe;
}

function getTestFn(mode?: ScenarioStatus) {
  if (mode === 'skip') return test.skip;
  if (mode === 'only') return test.only;
  if (mode === 'fixme') {
    if (HARNESS_MODE === 'fixme') return test;
    return test.fixme;
  }
  if (mode === 'fail') return test.fail;
  return test;
}

async function initPage(page: Page, scenario: Scenario): Promise<void> {
  if (scenario.htmlMode === 'document') {
    await page.setContent(scenario.html);
    const script = await page.addScriptTag({ path: 'src/nwsapi.js' });
    await script.evaluate((el) => {
      const id: NwsapiId = 'nwsapi-bootstrap';
      (el as HTMLScriptElement).id = id;
    });
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

    let label = ` · engines=${enginesWithSameOutcome.join('+')}${baseMsg}`;
    check(r, label);
  }
}

function checkResult(result: EvalResult, expectation: Expectation, caseInfo: CaseInfo): void {
  const allowMismatch = expectation.allowMismatch ?? false;
  const { stepIndex, caseIndex, browser, scenario: s } = caseInfo;
  const header = `${s.name}\nStep #${stepIndex + 1}, Case #${caseIndex + 1} · browser=${browser}`;
  const msg = 
    `\nQuery: ${result.info}` +
    `${result.mismatchMsg && !allowMismatch ? `\n${result.mismatchMsg}` : ''}`;

  if (expectation.throws) {
    expect(result.nw.threw, `${header}${msg}`).toBe(true);
    return;
  }

  expect(result.nw.threw, `${header}${msg}`).toBe(false);

  if (expectation.count !== undefined) {
    runEngineChecks(result, msg, 'count', (r, label) => {
      expect(r.count, `${header}${label}`).toEqual(expectation.count);
    });
  }

  if (expectation.ids) {
    runEngineChecks(result, msg, 'ids', (r, label) => {
      expect(r.ids, `${header}${label}`).toEqual(expectation.ids);
    });
  }

  if (expectation.includesIds) {
    for (const id of expectation.includesIds) {
      runEngineChecks(result, msg, 'ids', (r, label) => {
        expect(r.ids, `${header}${label}`).toContain(id);
      });
    }
  }

  if (expectation.excludesIds) {
    for (const id of expectation.excludesIds) {
      runEngineChecks(result, msg, 'ids', (r, label) => {
        expect(r.ids, `${header}${label}`).not.toContain(id);
      });
    }
  }

  if (expectation.classes) {
    runEngineChecks(result, msg, 'classes', (r, label) => {
      expect(r.classes, `${header}${label}`).toEqual(expectation.classes);
    });
  }

  if (expectation.includesClasses) {
    for (const cls of expectation.includesClasses) {
      runEngineChecks(result, msg, 'classes', (r, label) => {
        const classTokens = r.classes.flatMap(s => s.trim() ? s.trim().split(/\s+/) : []);
        expect(classTokens, `${header}${label}`).toContain(cls);
      });
    }
  }

  if (expectation.excludesClasses) {
    for (const cls of expectation.excludesClasses) {
      runEngineChecks(result, msg, 'classes', (r, label) => {
        const classTokens = r.classes.flatMap(s => s.trim() ? s.trim().split(/\s+/) : []);
        expect(classTokens, `${header}${label}`).not.toContain(cls);
      });
    }
  }

  if (!allowMismatch && !result.native.threw) {
    const mismatch = !!result.mismatchMsg;
    expect(mismatch, `${header}${msg}`).toBe(false);
  }

  if (expectation.equivalentCase) {
    const equivMismatch = !!result.equivMismatchMsg;
    expect(equivMismatch, `${header}${msg}\n${result.equivMismatchMsg}`).toBe(false);
  }
}
