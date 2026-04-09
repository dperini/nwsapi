import type { Engine, EquivalentTo, ScopeRef } from "./scenarios";

export interface PwHelpers {
  resolveScope(ref: ScopeRef | undefined): ParentNode | null;
  runQuery(query: () => Element[]): QueryResult;
  compareQueryResults(
    a: NamedQueryResult,
    b: NamedQueryResult
  ): string | undefined;
  toEngineResult(res: QueryResult): EngineResult;
  getResults(
    engines: EngineQueries,
    query: string,
    ref?: ScopeRef,
    equivTo?: EquivalentTo
  ): EngineQueryResults;
}

export type EvalResult = {
  info: string;
  mismatchMsg?: string;
} & Record<Engine, EngineResult>;

export type EngineResult = {
  count: number;
  ids: string[];
  classes: string[];
  threw: boolean;
  equivalentToFailMsg?: string;
};

export type EngineQueries = Record<Engine, EngineQuery>;
export type EngineQuery = (query: string, scope: ParentNode) => () => Element[];
export type EngineQueryResults = Record<Engine, { queryResult: QueryResult; engineResult: EngineResult; }>;
export type NamedQueryResult = { name: string; result: QueryResult; };
export type QueryResult = { elements: Element[]; error: string };

export function installBrowserHelpers(): void {
  function runQuery(query: () => Element[]) {
    try {
      return { elements: query(), error: '' };
    } catch (e) {
      return { elements: [], error: e instanceof Error ? e.message : String(e) };
    }
  }

  function describe(el: Element | undefined) {
    if (!el) return '(missing)';
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: el.className || '',
      html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 120),
    };
  }

  function compareQueryResults(a: NamedQueryResult, b: NamedQueryResult): string | undefined {
    if (a.result.error || b.result.error) {
      if (a.result.error && b.result.error) {
        return `Both threw:\n  ${a.name} error: ${a.result.error}\n  ${b.name} error: ${b.result.error}`;
      }
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
  }

  function resolveScope(ref?: ScopeRef): ParentNode | null {
    return !ref || ref.by === 'document' ? document
      : ref.by === 'id' ? document.getElementById(ref.id)
      : ref.by === 'first' ? document.querySelector(ref.selector)
      : null;
  }

  function toEngineResult(res: QueryResult): EngineResult {
    return {
      count: res.elements.length,
      ids: res.elements.map((el) => el.getAttribute('id') ?? ''),
      classes: res.elements.map((el) => el.getAttribute('class') ?? ''),
      threw: !!res.error,
    };
  }

  function getResults(engines: EngineQueries, query: string, ref?: ScopeRef, equivTo?: EquivalentTo): EngineQueryResults{
    const scope = resolveScope(ref);
    const equivScope = resolveScope(equivTo?.scope);

    const build = (name: Engine, queryFn: EngineQuery) => {
      const queryResult: QueryResult = scope
        ? runQuery(queryFn(query, scope))
        : { elements: [], error: `Scope target not found for ref: ${JSON.stringify(ref)}` };

      const engineResult = toEngineResult(queryResult);

      if (equivTo) {
        const equivQuery = equivTo.search;
        const equivRes: QueryResult = equivScope
          ? runQuery(queryFn(equivQuery, equivScope))
          : { elements: [], error: `Equivalent scope target not found: ${JSON.stringify(equivTo.scope)}` };

        engineResult.equivalentToFailMsg = compareQueryResults(
          { name: `${name}(${query})`, result: queryResult },
          { name: `${name}(${equivQuery})`, result: equivRes },
        );
      }

      return { queryResult, engineResult };
    };

    return {
      native: build('native', engines.native),
      nw: build('nw', engines.nw),
    };
  }

  window.__pwHelpers = {
    resolveScope,
    runQuery,
    compareQueryResults,
    toEngineResult,
    getResults,
  };
};
