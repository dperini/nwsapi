import { type Engine, type EquivalentCase, type ContextRef, type ContextHome, NwsapiId } from "./scenarios";

export interface PwHelpers {
  resolveContext(ref: ContextRef | undefined): QueryContext | null;
  runQuery(query: () => Element[]): QueryResult;
  compareQueryResults(a: NamedQueryResult, b: NamedQueryResult): string | undefined;
  toEngineResult(res: QueryResult): EngineResult;
  getResults(queryFn: EngineQuery, query: string, ctx: QueryContext | null, ctxErrorMsg?: string): EngineAndQueryResult;
  getEngineQuery(c: EquivalentCase, n: Engine): EngineQuery;
  getCaseQuery(c: EquivalentCase): string;
  getCaseLabel(c: EquivalentCase, n: Engine): string;
  stringify(obj: unknown): string;
  isRehomed(ref?: ContextRef): boolean;
}

export type EvalResult = {
  info: string;
  mismatchMsg?: string;
  equivMismatchMsg?: string;
} & Record<Engine, EngineResult>;

export type EngineResult = {
  count: number;
  ids: string[];
  classes: string[];
  threw: boolean;
};

export type EngineQuery = (query: string, ctx: QueryContext) => () => Element[];
export type EngineAndQueryResult = { queryResult: QueryResult; engineResult: EngineResult; };
export type NamedQueryResult = { name: string; result: QueryResult; };
export type QueryResult = { elements: Element[]; error: string };

export function installBrowserHelpers(): void {
  function assertNever(x: never): never {
    throw new Error(`Unexpected key: ${x}`);
  }

  function isElement(x: unknown): x is Element {
    return typeof x === 'object' && x !== null && 'nodeType' in x && x.nodeType === 1;
  }

  // function isDocument(x: unknown): x is Document {
  //   return typeof x === 'object' && x !== null && 'nodeType' in x && x.nodeType === 9;
  // }

  function isDocFrag(x: unknown): x is DocumentFragment {
    return typeof x === 'object' && x !== null && 'nodeType' in x && x.nodeType === 11;
  }

  function isRehomed(ref?: ContextRef): boolean {
    return !!ref && ref.by !== 'document' && ref.by !== 'iframe' && !!ref.home && ref.home !== 'document';
  }

  // Source - https://stackoverflow.com/a/65443215
  function stringify(obj: unknown): string {
    let json = JSON.stringify(obj, null, 2) as string | undefined;
    if (json === undefined) return String(obj);
    json = json.replace(/^[\t ]*"[^:\n\r]+(?<!\\)":/gm, function (match) {
        return match.replace(/"/g, "");
    });
    return json.replace(/"/g, "'").replace(/\s+/g, ' ');
  }

  function runQuery(query: () => Element[]) {
    try {
      const id: NwsapiId = 'nwsapi-bootstrap';
      const els = query().filter((el) => el.getAttribute('id') !== id);
      return { elements: els, error: '' };
    } catch (e) {
      return { elements: [], error: e instanceof Error ? e.message : String(e) };
    }
  }

  function describe(el: Element | undefined) {
    if (!el) return '(missing)';
    const id = el.getAttribute('id');
    const className = el.getAttribute('class');
    return `<${el.tagName.toLowerCase()}${id ? ` id='${id}'` : ''}${className ? ` class='${className}'` : ''}>`;
  }

  function compareQueryResults(a: NamedQueryResult, b: NamedQueryResult): string | undefined {
    if (a.result.error || b.result.error) {
      if (a.result.error && b.result.error) {
        return `Both threw:\n  ${a.name} error: ${a.result.error}\n  ${b.name} error: ${b.result.error}`;
      }
      return a.result.error
        ? `Throw mismatch:\n  ${a.name} threw while ${b.name} did not.\n  error: ${a.result.error}`
        : `Throw mismatch:\n  ${b.name} threw while ${a.name} did not.\n  error: ${b.result.error}`;
    }

    const aElems = a.result.elements;
    const bElems = b.result.elements;

    let mismatchMsg: string | undefined;
    if (aElems.length !== bElems.length) {
      mismatchMsg = `Count mismatch:\n  ${a.name} = ${aElems.length}\n  ${b.name} = ${bElems.length}`;
    }

    const maxLen = Math.max(aElems.length, bElems.length);
    for (let i = 0; i < maxLen; ++i) {
      if (aElems[i] !== bElems[i]) {
        mismatchMsg = mismatchMsg ? mismatchMsg + '\n' : '';
        mismatchMsg += `First element mismatch at index ${i}:\n` +
          `  ${a.name}[${i}] = ${describe(aElems[i])}\n` +
          `  ${b.name}[${i}] = ${describe(bElems[i])}`;
        break;
      }
    }

    return mismatchMsg;
  }

  function resolveContext(ref?: ContextRef): QueryContext | null {
    if (!ref || ref.by === 'document') return document;

    if (ref.by === 'iframe') {
      const iframe = document.getElementById(ref.id);
      if (!(iframe instanceof HTMLIFrameElement)) return null;
      return iframe.contentDocument ?? null;
    }

    const el = ref.by === 'id' ? document.getElementById(ref.id)
      : ref.by === 'first' ? document.querySelector(ref.selector)
      : null;

    if (!el) return null;

    const home: ContextHome = ref.home ?? 'document';
    if (home === 'document') return el;

    const clone = el.cloneNode(true);
    if (!isElement(clone)) return null;
    if (home === 'detached') return clone;

    if (home === 'fragment') {
      const frag = document.createDocumentFragment();
      frag.appendChild(clone);

      // Return the clone rehomed so matches/closest stay sane.
      return clone;
    }

    return null;
  }

  function toEngineResult(res: QueryResult): EngineResult {
    return {
      count: res.elements.length,
      ids: res.elements.map((el) => el.getAttribute('id') ?? ''),
      classes: res.elements.map((el) => el.getAttribute('class') ?? ''),
      threw: !!res.error,
    };
  }

  function getResults(queryFn: EngineQuery, query: string, ctx: QueryContext | null, ctxErrorMsg?: string): EngineAndQueryResult {
    const queryResult: QueryResult = ctx
      ? runQuery(queryFn(query, ctx))
      : { elements: [], error: ctxErrorMsg ?? 'No context provided' };

    const engineResult = toEngineResult(queryResult);
    return { queryResult, engineResult };
  }

  function getEngineQuery(c: EquivalentCase, ng: Engine): EngineQuery {
    switch (true) {
      case 'select' in c:
        if (ng === 'native') return (query, ctx) => () => [...ctx.querySelectorAll(query)];
        if (ng === 'nw') return (query, ctx) => () => NW.Dom.select(query, ctx);
        break;

      case 'first' in c:
        if (ng === 'native') {
          return (query, ctx) => () => {
            const el = ctx.querySelector(query);
            return el ? [el] : [];
          };
        }
        if (ng === 'nw') {
          return (query, ctx) => () => {
            const el = NW.Dom.first(query, ctx);
            return el ? [el] : [];
          };
        }
        break;

      case 'byTag' in c:
        if (ng === 'native') {
          return (query, ctx) => () =>
            isDocFrag(ctx)
              ? [...ctx.querySelectorAll(query)]
              : [...ctx.getElementsByTagName(query)];
        }
        if (ng === 'nw') return (query, ctx) => () => NW.Dom.byTag(query, ctx);
        break;

      case 'byClass' in c:
        if (ng === 'native') {
          return (query, ctx) => () =>
            isDocFrag(ctx)
              ? [...ctx.querySelectorAll(`.${query}`)]
              : [...ctx.getElementsByClassName(query)];
        }
        if (ng === 'nw') return (query, ctx) => () => NW.Dom.byClass(query, ctx);
        break;

      case 'byId' in c:
        if (ng === 'native') {
          return (query, ctx) => () => {
            const el = isElement(ctx)
              ? ctx.querySelector(`#${CSS.escape(query)}`)
              : ctx.getElementById(query);
            return el ? [el] : [];
          };
        }
        if (ng === 'nw') return (query, ctx) => () => NW.Dom.byId(query, ctx);
        break;

      case 'match' in c:
        if (ng === 'native') {
          return (query, ctx) => () => {
            if (!isElement(ctx)) throw new Error(`Context for 'match' case must be an Element`);
            const el = ctx;
            return el.matches(query) ? [el] : [];
          };
        }
        if (ng === 'nw') {
          return (query, ctx) => () => {
            if (!isElement(ctx)) throw new Error(`Context for 'match' case must be an Element`);
            const el = ctx;
            return NW.Dom.match(query, el) ? [el] : [];
          };
        }
        break;

      case 'closest' in c:
        if (ng === 'native') {
          return (query, ctx) => () => {
            if (!isElement(ctx)) throw new Error(`Context for 'closest' case must be an Element`);
            const el = ctx;
            const hit = el.closest(query);
            return hit ? [hit] : [];
          };
        }
        if (ng === 'nw') {
          return (query, ctx) => () => {
            if (!isElement(ctx)) throw new Error(`Context for 'closest' case must be an Element`);
            const el = ctx;
            const hit = NW.Dom.closest(query, el);
            return hit ? [hit] : [];
          };
        }
        break;

      default:
        throw assertNever(c);
    }

    throw assertNever(ng);
  }

  function getCaseQuery(c: EquivalentCase): string {
    switch (true) {
      case 'select' in c: return c.select;
      case 'first' in c: return c.first;
      case 'byTag' in c: return c.byTag;
      case 'byClass' in c: return c.byClass;
      case 'byId' in c: return c.byId;
      case 'match' in c: return c.match;
      case 'closest' in c: return c.closest;
      default: throw assertNever(c);
    }
  }

  function getCaseLabel(c: EquivalentCase, engine: Engine): string {
    switch (true) {
      case 'select' in c:
        return engine === 'native'
          ? `querySelectorAll(${c.select})`
          : `NW.Dom.select(${c.select})`;

      case 'first' in c:
        return engine === 'native'
          ? `querySelector(${c.first})`
          : `NW.Dom.first(${c.first})`;

      case 'byTag' in c:
        return engine === 'native'
          ? `byTag:${c.byTag}`
          : `NW.Dom.byTag(${c.byTag})`;

      case 'byClass' in c:
        return engine === 'native'
          ? `byClass:${c.byClass}`
          : `NW.Dom.byClass(${c.byClass})`;

      case 'byId' in c:
        return engine === 'native'
          ? `byId:${c.byId}`
          : `NW.Dom.byId(${c.byId})`;

      case 'match' in c:
        return engine === 'native'
          ? `matches(${c.match})`
          : `NW.Dom.match(${c.match})`;

      case 'closest' in c:
        return engine === 'native'
          ? `closest(${c.closest})`
          : `NW.Dom.closest(${c.closest})`;

      default:
        throw assertNever(c);
    }
  }

  window.__pwHelpers = {
    resolveContext,
    runQuery,
    compareQueryResults,
    toEngineResult,
    getResults,
    getEngineQuery,
    getCaseQuery,
    getCaseLabel,
    stringify,
    isRehomed,
  };
};
