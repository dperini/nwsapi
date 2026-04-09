import type { Page } from '@playwright/test';
import type { ScopeRef, Expectation } from './scenarios';
import type { EngineQueries, EvalResult } from './browser';

export type SelectCase = {
  select: string;
  scope?: ScopeRef;
  expect?: SelectExpectation;
};

type SelectExpectation = Expectation;

export async function evalSelectCase(page: Page, selCase: SelectCase): Promise<EvalResult> {
  return await page.evaluate((c) => {
    const pw = window.__pwHelpers;
    const info = c.select;

    const engines: EngineQueries = {
      native: (search, scope) => () => [...scope.querySelectorAll(search)],
      nw: (search, scope) => () => NW.Dom.select(search, scope),
    };

    const res = pw.getResults(engines, c.select, c.scope, c.expect?.equivalentTo);

    const mismatchMsg = pw.compareQueryResults(
      { name: 'native', result: res.native.queryResult },
      { name: 'nw', result: res.nw.queryResult },
    );

    return {
      info, mismatchMsg,
      native: res.native.engineResult,
      nw: res.nw.engineResult
    };
  }, selCase);
}
