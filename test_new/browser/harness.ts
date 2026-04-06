import test, { chromium, expect, firefox, webkit } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

export type SelectorScenario = {
  name: string;
  html: string;
  htmlMode?: 'body' | 'document';
  browsers?: BrowserName[];
  cases: SelectorCase[];
  setupPage?: (page: Page) => void | Promise<void>;
};

const browserNames = ['chromium', 'firefox', 'webkit'] as const;
type BrowserName = typeof browserNames[number];

type SelectorCase = {
  selector: string;
  root?: SelectorRoot;
  expect?: SelectorExpectation;
};

type SelectorExpectation = {
  exact?: boolean;
  count?: number;
  ids?: string[];
  includesIds?: string[];
  excludesIds?: string[];
  throws?: boolean;
};

type SelectorResult = {
  exactMatch: boolean;
  mismatchMsg: string;
  native: {
    count: number;
    ids: string[];
    threw: boolean;
  };
  nw: {
    count: number;
    ids: string[];
    threw: boolean;
  };
};

type SelectorRoot =
  | { kind: 'document' }
  | { kind: 'id'; value: string }
  | { kind: 'selector'; value: string };

export function runScenarios(label: string, scenarios: SelectorScenario[]): void {
  test.describe(label, () => {
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
      await Promise.all(browserNames.map((name) => browsers[name].close()));
    });

    for (const s of scenarios) {
      test(s.name, async () => {
        await runScenario(s, pages);
      });
    }
  });
}

async function runScenario(s: SelectorScenario, pages: Record<BrowserName, Page>): Promise<void> {
  const scenarioBrowsers = s.browsers ?? browserNames;

  for (const browserName of scenarioBrowsers) {
    const page = pages[browserName];
    await setupPage(page, s);

    for (const c of s.cases) {
      const result = await evalSelector(page, c);
      const exp = c.expect ?? { exact: true };
      const msg = `[${browserName}] ${s.name} :: ${c.selector}\n${result.mismatchMsg}`;

      if (exp.throws) {
        expect(result.nw.threw, msg).toBe(true);
        continue;
      } else {
        expect(result.nw.threw, msg).toBe(false);
      }

      const skipNative = result.native.threw;

      if (exp.count !== undefined) {
        if (!skipNative) expect(result.native.count, msg).toBe(exp.count);
        expect(result.nw.count, msg).toBe(exp.count);
      }

      if (exp.ids) {
        if (!skipNative) expect(result.native.ids, msg).toEqual(exp.ids);
        expect(result.nw.ids, msg).toEqual(exp.ids);
      }

      if (exp.includesIds) {
        for (const id of exp.includesIds) {
          if (!skipNative) expect(result.native.ids, msg).toContain(id);
          expect(result.nw.ids, msg).toContain(id);
        }
      }

      if (exp.excludesIds) {
        for (const id of exp.excludesIds) {
          if (!skipNative) expect(result.native.ids, msg).not.toContain(id);
          expect(result.nw.ids, msg).not.toContain(id);
        }
      }

      if ((exp.exact ?? true) && !skipNative) {
        expect(result.exactMatch, msg).toBe(true);
      }
    }
  }
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
  return await page.evaluate((t) => {
    const root =
      t.root?.kind === 'document' || !t.root ? document
      : t.root.kind === 'id' ? document.getElementById(t.root.value)
      : document.querySelector(t.root.value);
    
    if (!root) {
      return {
        exactMatch: false,
        mismatchMsg: `Root element not found for selector: ${JSON.stringify(t.root)}`,
        native: { count: 0, ids: [], threw: false },
        nw: { count: 0, ids: [], threw: false },
      };
    }

    let native: Element[] = [];
    let nw: Element[] = [];
    let nativeError = '';
    let nwError = '';

    try { native = [...root.querySelectorAll(t.selector)]; }
    catch (e) { nativeError = e instanceof Error ? e.message : String(e); }

    try { nw = NW.Dom.select(t.selector, root); }
    catch (e) { nwError = e instanceof Error ? e.message : String(e); }

    if (nwError) {
      return {
        exactMatch: false,
        mismatchMsg: nativeError && nwError
          ? `Both threw:\n  native error: ${nativeError}\n  nw error: ${nwError}`
          : `NW threw an error while native did not: ${nwError}`,
        native: { count: 0, ids: [], threw: !!nativeError },
        nw: { count: 0, ids: [], threw: !!nwError },
      };
    }

    const nativeIds = native.map((el) => el.id);
    const nwIds = nw.map((el: Element) => el.id);

    const describe = (el: Element | undefined) => {
      if (!el) return '(missing)';
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || '',
        html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 120),
      };
    };

    let exactMatch = true;
    let mismatchMsg = '';

    if (native.length !== nw.length) {
      exactMatch = false;
      mismatchMsg =
        `count mismatch: native=${native.length}, nw=${nw.length}\n` +
        `first native=${JSON.stringify(describe(native[0]))}\n` +
        `first nw=${JSON.stringify(describe(nw[0]))}`;
    } else {
      for (let i = 0; i < native.length; ++i) {
        if (native[i] !== nw[i]) {
          exactMatch = false;
          mismatchMsg =
            `element mismatch at index ${i}\n` +
            `native=${JSON.stringify(describe(native[i]))}\n` +
            `nw=${JSON.stringify(describe(nw[i]))}`;
          break;
        }
      }
    }

    return {
      exactMatch,
      mismatchMsg,
      native: { count: native.length, ids: nativeIds, threw: !!nativeError },
      nw: { count: nw.length, ids: nwIds, threw: !!nwError },
    };
  }, selCase);
}
