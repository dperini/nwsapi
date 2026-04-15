import { test, chromium, expect, firefox, webkit } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { assertNever, type Permutations, type DistributiveOmit } from '../../utils/type';
import { installBrowserHelpers } from './browser';
import type { EngineResult, EvalResult, EngineAndQueryResult, NamedQueryResult } from './browser';

type HarnessMode = 'normal' | 'fixme';
const rawHarnessMode = process.env.HARNESS_MODE;
if (rawHarnessMode !== undefined && rawHarnessMode !== 'normal' && rawHarnessMode !== 'fixme') {
  throw new Error(`Invalid HARNESS_MODE: ${rawHarnessMode}`);
}
const HARNESS_MODE: HarnessMode = rawHarnessMode ?? 'normal';

export type SelectCase =  { select: string;  ref?: ContextRef; } & CaseBase;
export type ByIdCase =    { byId: string;    ref?: ContextRef; } & CaseBase;
export type ByTagCase =   { byTag: string;   ref?: ContextRef; } & CaseBase;
export type ByClassCase = { byClass: string; ref?: ContextRef; } & CaseBase;
export type FirstCase =   { first: string;   ref?: ContextRef; } & CaseBase;
export type MatchCase =   { match: string;   ref:  ContextRef; } & CaseBase;
export type ClosestCase = { closest: string; ref:  ContextRef; } & CaseBase;

type CaseBase = {
  expect?: Expectation;
  status?: CaseStatus;
  browsers?: BrowserName[];
  engines?: Engine[];
};

export type TestCase = SelectCase | ByIdCase | ByTagCase | ByClassCase | MatchCase | FirstCase | ClosestCase;

export type Scenario = {
  name: string;
  status?: ScenarioStatus;
  html: string;
  htmlMode?: 'body' | 'document';
  browsers?: BrowserName[];
  engines?: Engine[];
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

export type EquivalentCase = DistributiveOmit<TestCase, 'expect' | 'status' | 'browsers' | 'engines'>;
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
  | { by: 'documentElement'; home?: ContextHome; }
  | { by: 'iframe'; id: string; within?: ContextRef }
  | { by: 'template'; id: string; within?: ContextRef }

export type ContextHome = 'document' | 'detached' | 'fragment';
export type NwsapiId = 'nwsapi-bootstrap';

type PassTracker = { passedEverywhere: boolean; resultInfo: string; stepIndex: number; caseIndex: number; };

type CaseInfo = {
  browser: BrowserName;
  scenario: Scenario;
  case: TestCase;
  stepIndex: number;
  caseIndex: number;
  stepCaseIndex: number;
  misfails: Record<number, PassTracker>;
  misfixes: Record<number, PassTracker>;
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

  // cases marked fail/fixme and whether they passed in every applicable browser so far
  const misfails: Record<number, PassTracker> = {};
  const misfixes: Record<number, PassTracker> = {};

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
            stepIndex, caseIndex, stepCaseIndex, misfails, misfixes,
          }
        );
        stepCaseIndex++;
      }
    }
  }

  // At the end of the scenario, check if any 'fail' or 'fixme' cases passed unexpectedly
  const throwOnUnexpectedPass = (kind: 'fail' | 'fixme', trackers: Record<number, PassTracker>) => {
    for (const tracker of Object.values(trackers)) {
      if (!tracker.passedEverywhere) continue;
      throw new Error(
        `${s.name}\n` +
        `Step #${tracker.stepIndex + 1}, Case #${tracker.caseIndex + 1} · Marked '${kind}' but passed unexpectedly.\n` +
        `Query: ${tracker.resultInfo}`
      );
    }
  };

  throwOnUnexpectedPass('fail', misfails);
  throwOnUnexpectedPass('fixme', misfixes);
}

async function runCase(page: Page, caseInfo: CaseInfo): Promise<void> {
  const { scenario: s, case: c, stepIndex, caseIndex, stepCaseIndex } = caseInfo;

  if (c.status === 'skip') return;
  if (s.status !== 'fixme' && HARNESS_MODE === 'fixme' && c.status !== 'fixme') {
    return;
  }
  if (c.browsers && !c.browsers.includes(caseInfo.browser)) return;
  c.engines = c.engines ?? s.engines;

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

  const updatePassTracker = (trackers: Record<number, PassTracker>) => {
    const prevPassed = trackers[stepCaseIndex]?.passedEverywhere ?? true;
    trackers[stepCaseIndex] = {
      passedEverywhere: !thrown && prevPassed,
      resultInfo: trackers[stepCaseIndex]?.resultInfo ?? result.info,
      stepIndex,
      caseIndex,
    };
  };

  if (status === 'fail') {
    updatePassTracker(caseInfo.misfails);
    return;
  }

  if (status === 'fixme') {
    updatePassTracker(caseInfo.misfixes);
    if (thrown && HARNESS_MODE === 'fixme') throw thrown;
    return;
  }

  assertNever(status);
}

async function evalCase(page: Page, testCase: TestCase): Promise<EvalResult> {
  return await page.evaluate((c) => {
    const pw = window.__pwHelpers;

    const query = pw.getCaseQuery(c);
    const ctx = pw.resolveContext(c.ref);
    const ctxErrorMsg = ctx ? undefined : `Could not resolve context from ref: ${pw.stringify(c.ref)}`;

    const equivCase = c.expect?.equivalentCase;
    const equivQuery = equivCase ? pw.getCaseQuery(equivCase) : undefined;
    const equivCtx = equivCase ? pw.resolveContext(equivCase?.ref) : null;
    const equivCtxErrorMsg = equivCase && !equivCtx
      ? `Could not resolve equivalent context from ref: ${pw.stringify(equivCase.ref)}`
      : undefined;
    let equivMismatchMsg = equivCase && (pw.isRehomed(c.ref) || pw.isRehomed(equivCase.ref))
      ? `Equivalent-case assertion unsupported because one or more contexts were rehomed.\n` +
        `Identity-based equivalence is only supported for document-backed contexts.\n` +
        `  case context: ${pw.stringify(c.ref)}${pw.isRehomed(c.ref) ? ' (rehomed)' : ''}\n` +
        `  equivalent case context: ${pw.stringify(equivCase.ref)}${pw.isRehomed(equivCase.ref) ? ' (rehomed)' : ''}`
      : undefined;

    const allEngines: Permutations<Engine> = ['native', 'nw'];
    const engines = c.engines ?? allEngines;
    const engineResults: Partial<Record<Engine, EngineAndQueryResult>> = {};
    const makeNamedQr = (tc: TestCase, ng: Engine, res: EngineAndQueryResult, suffix = ''): NamedQueryResult =>
      ({ name: `${ng}${suffix}:${pw.getCaseLabel(tc, ng)}`, result: res.queryResult });

    let mismatchMsg: string | undefined;
    let firstNamedQr: NamedQueryResult | undefined;

    for (const engine of engines) {
      const fn = pw.getEngineQuery(c, engine);
      const res = pw.getResults(fn, query, ctx, ctxErrorMsg);
      engineResults[engine] = res;

      const namedQr = makeNamedQr(c, engine, res);
      if (!mismatchMsg && firstNamedQr) {
        mismatchMsg = pw.compareQueryResults(firstNamedQr, namedQr);
      }
      firstNamedQr ??= namedQr;

      if (!equivMismatchMsg && equivCase && equivQuery) {
        const equivFn = pw.getEngineQuery(equivCase, engine);
        const equivRes = pw.getResults(equivFn, equivQuery, equivCtx, equivCtxErrorMsg);
        equivMismatchMsg ??= pw.compareQueryResults(
          namedQr,
          makeNamedQr(equivCase, engine, equivRes, 'Equiv')
        );
      }
    }

    return {
      info: query, mismatchMsg, equivMismatchMsg,
      engineResults: Object.fromEntries(
        engines.map((engine) => [engine, engineResults[engine]!.engineResult])
      ),
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
  const entries = Object.entries(result.engineResults) as [Engine, EngineResult][];

  const sameIds = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((x, i) => x === b[i]);

  for (const [, r] of entries) {
    const enginesWithSameOutcome = entries
      .filter(([, other]) => {
        switch (key) {
          case 'count':   return r.count === other.count;
          case 'ids':     return sameIds(r.ids, other.ids);
          case 'classes': return sameIds(r.classes, other.classes);
          case 'threw':   return r.threw === other.threw;
          default:        return assertNever(key);
        }
      })
      .map(([engine]) => engine);

    const engineLabel = ` · Engines=${enginesWithSameOutcome.join('+')}${baseMsg}`;
    check(r, engineLabel);
  }
}

function checkResult(result: EvalResult, expectation: Expectation, caseInfo: CaseInfo): void {
  const { stepIndex, caseIndex, browser, scenario: s } = caseInfo;
  const header = `${s.name}\nStep #${stepIndex + 1}, Case #${caseIndex + 1} · Browser=${browser}`;
  const msg =
    `\nQuery: ${result.info}` +
    `\nContext: ${formatContextRef(caseInfo.case.ref)}` +
    `${result.mismatchMsg ? `\n\n${result.mismatchMsg}` : ''}`;

  runEngineChecks(result, msg, 'threw', (r, nglabel) => {
    const errLabel = `Expected ${expectation.throws ? 'a throw' : 'no throw'}, got ${r.threw ? 'a throw' : 'no throw'}.`;
    expect(r.threw, `${errLabel}\n\n${header}${nglabel}`).toBe(expectation.throws ?? false);
  });
  if (expectation.throws) return;

  if (expectation.count !== undefined) {
    runEngineChecks(result, msg, 'count', (r, ngLabel) => {
      const errLabel = `Expected count ${expectation.count}, got ${r.count}.`;
      expect(r.count, `${errLabel}\n\n${header}${ngLabel}`).toEqual(expectation.count);
    });
  }

  if (expectation.ids) {
    runEngineChecks(result, msg, 'ids', (r, ngLabel) => {
      const errLabel = `Expected ids ${JSON.stringify(expectation.ids)}, got ${JSON.stringify(r.ids)}.`;
      expect(r.ids, `${errLabel}\n\n${header}${ngLabel}`).toEqual(expectation.ids);
    });
  }

  if (expectation.includesIds) {
    for (const id of expectation.includesIds) {
      runEngineChecks(result, msg, 'ids', (r, ngLabel) => {
        const errLabel = `Expected ids to include ${JSON.stringify(id)}, got ${JSON.stringify(r.ids)}.`;
        expect(r.ids, `${errLabel}\n\n${header}${ngLabel}`).toContain(id);
      });
    }
  }

  if (expectation.excludesIds) {
    for (const id of expectation.excludesIds) {
      runEngineChecks(result, msg, 'ids', (r, ngLabel) => {
        const errLabel = `Expected ids not to include ${JSON.stringify(id)}, got ${JSON.stringify(r.ids)}.`;
        expect(r.ids, `${errLabel}\n\n${header}${ngLabel}`).not.toContain(id);
      });
    }
  }

  if (expectation.classes) {
    runEngineChecks(result, msg, 'classes', (r, ngLabel) => {
      const errLabel = `Expected classes ${JSON.stringify(expectation.classes)}, got ${JSON.stringify(r.classes)}.`;
      expect(r.classes, `${errLabel}\n\n${header}${ngLabel}`).toEqual(expectation.classes);
    });
  }

  if (expectation.includesClasses) {
    for (const cls of expectation.includesClasses) {
      runEngineChecks(result, msg, 'classes', (r, ngLabel) => {
        const errLabel = `Expected classes to include ${JSON.stringify(cls)}, got ${JSON.stringify(r.classes)}.`;
        const classTokens = r.classes.flatMap(s => s.trim() ? s.trim().split(/\s+/) : []);
        expect(classTokens, `${errLabel}\n\n${header}${ngLabel}`).toContain(cls);
      });
    }
  }

  if (expectation.excludesClasses) {
    for (const cls of expectation.excludesClasses) {
      runEngineChecks(result, msg, 'classes', (r, ngLabel) => {
        const errLabel = `Expected classes not to include ${JSON.stringify(cls)}, got ${JSON.stringify(r.classes)}.`;
        const classTokens = r.classes.flatMap(s => s.trim() ? s.trim().split(/\s+/) : []);
        expect(classTokens, `${errLabel}\n\n${header}${ngLabel}`).not.toContain(cls);
      });
    }
  }

  expect(!!result.mismatchMsg, `Expected engine agreement, but they differed.\n\n${header}${msg}`).toBe(false);

  if (expectation.equivalentCase) {
    const errLabel = `Expected this case to match its equivalent case, but it did not.`;
    const equivMismatch = !!result.equivMismatchMsg;
    expect(equivMismatch, `${errLabel}\n\n${header}${msg}\n${result.equivMismatchMsg}`).toBe(false);
  }
}

function formatContextRef(ref?: ContextRef): string {
  if (!ref) return 'document';
  let base: string;
  switch (ref.by) {
    case 'document': base = 'document'; break;
    case 'id': base = `id(${ref.id})`; break;
    case 'first': base = `first(${ref.selector})`; break;
    case 'documentElement': base = 'documentElement'; break;
    case 'iframe': base = `iframe(${ref.id})`; break;
    case 'template': base = `template(${ref.id})`; break;
    default: assertNever(ref);
  }
  if ('home' in ref && ref.home) base += `:${ref.home}`;
  if ('within' in ref && ref.within) base = `${formatContextRef(ref.within)} > ${base}`;
  return base;
}
