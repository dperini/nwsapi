/*
 * Committed coverage for the Selectors 4 state pseudo-classes wired into
 * src/nwsapi.js (:open, :closed, :modal, :fullscreen, :picture-in-picture
 * and the time-dimensional :current/:past/:future).
 *
 * Uses the same init-script mechanism as wpt.spec.mjs: src/nwsapi.js is
 * evaluated and NW.Dom.install() called before any page script runs, then
 * assertions run in-page against NW.Dom on the fixture page
 * /_repo/test/upstream/fixtures/state-pseudos.html (served by
 * scripts/serve.mjs, which mounts the repo under /_repo/).
 *
 * The last test opens the fixture WITHOUT the init script to capture native
 * Chromium ground truth: NW.Dom.install() patches Document.prototype, so in
 * an instrumented page even a DOMParser-created XMLDocument goes through the
 * NW override — the only way to see the native engine is a clean page.
 */
/* global window, document, DOMParser */
// ^ the page.evaluate() callbacks below run inside Chromium, not in Node.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const nwsapiSource = readFileSync(path.join(repoRoot, 'src', 'nwsapi.js'), 'utf8');

const FIXTURE = '/_repo/test/upstream/fixtures/state-pseudos.html';
const XML_SOURCE = '<root><details open="open"/><dialog open=""/></root>';

const initScript = `${nwsapiSource}
;(function () {
  try {
    window.NW.Dom.install();
  } catch (e) {
    window.__nwInstallError = String((e && e.stack) || e);
  }
})();
`;

async function openFixtureWithNW(page) {
  await page.addInitScript({ content: initScript });
  const response = await page.goto(FIXTURE);
  expect(response, `no HTTP response for ${FIXTURE}`).not.toBeNull();
  expect(
    response.ok(),
    `HTTP ${response.status()} for ${FIXTURE} — is scripts/serve.mjs the server on port 8000?`,
  ).toBe(true);
  expect(
    await page.evaluate('window.__nwInstallError || null'),
    'NW.Dom.install() must not throw',
  ).toBeNull();
  // NW-install canary (same as wpt.spec.mjs): nwsapi returns Arrays.
  expect(
    await page.evaluate('Array.isArray(document.querySelectorAll("html"))'),
    'document.querySelectorAll must return an Array (nwsapi installed)',
  ).toBe(true);
}

test.describe('state pseudo-classes (nwsapi installed)', () => {
  test(':open matches open <details>/<dialog> only', async ({ page }) => {
    await openFixtureWithNW(page);
    const result = await page.evaluate(() => {
      const ids = els => els.map(e => e.id);
      return {
        open: ids(window.NW.Dom.select(':open')),
        detailsOpen: ids(window.NW.Dom.select('details:open')),
        matchClosedDetails: window.NW.Dom.match(':open', document.getElementById('d-closed')),
      };
    });
    expect(result.open).toEqual(['d-open', 'g-open']);
    expect(result.detailsOpen).toEqual(['d-open']);
    expect(result.matchClosedDetails).toBe(false);
  });

  test(':closed matches <details>/<dialog> without the open property', async ({ page }) => {
    await openFixtureWithNW(page);
    const result = await page.evaluate(() => {
      const ids = els => els.map(e => e.id);
      return {
        closed: ids(window.NW.Dom.select(':closed')),
        detailsClosed: ids(window.NW.Dom.select('details:closed')),
        matchOpenDetails: window.NW.Dom.match(':closed', document.getElementById('d-open')),
        // :closed only applies to elements that have an open/closed state, so
        // a plain <div> is neither :open nor :closed.
        matchPlainDiv: window.NW.Dom.match(':closed', document.getElementById('plain')),
      };
    });
    expect(result.closed).toEqual(['d-closed', 'g-closed']);
    expect(result.detailsClosed).toEqual(['d-closed']);
    expect(result.matchOpenDetails).toBe(false);
    expect(result.matchPlainDiv).toBe(false);
  });

  test(':current/:past/:future are valid but never match', async ({ page }) => {
    await openFixtureWithNW(page);
    const result = await page.evaluate(() => {
      const out = {};
      for (const selector of [':current', ':past', ':future', 'div:future']) {
        try {
          out[selector] = window.NW.Dom.select(selector).map(e => e.id);
        } catch (e) {
          out[selector] = `threw: ${e}`;
        }
      }
      return out;
    });
    expect(result[':current']).toEqual([]);
    expect(result[':past']).toEqual([]);
    expect(result[':future']).toEqual([]);
    expect(result['div:future']).toEqual([]);
  });

  test(':fullscreen/:modal/:picture-in-picture follow document element pointers', async ({ page }) => {
    await openFixtureWithNW(page);
    const result = await page.evaluate(() => {
      const ids = els => els.map(e => e.id);
      const out = {
        fullscreenStatic: ids(window.NW.Dom.select(':fullscreen')),
        modalStatic: ids(window.NW.Dom.select(':modal')),
        pipStatic: ids(window.NW.Dom.select(':picture-in-picture')),
      };
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.getElementById('g-open'),
        configurable: true,
      });
      out.fullscreenAfter = ids(window.NW.Dom.select(':fullscreen'));
      out.modalAfter = ids(window.NW.Dom.select(':modal'));
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: document.getElementById('vid'),
        configurable: true,
      });
      out.pipAfter = ids(window.NW.Dom.select(':picture-in-picture'));
      return out;
    });
    // Nothing is really fullscreen/PiP in a static fixture.
    expect(result.fullscreenStatic).toEqual([]);
    expect(result.modalStatic).toEqual([]);
    expect(result.pipStatic).toEqual([]);
    // With document.fullscreenElement stubbed, both :fullscreen and :modal
    // (whose detectable half is the fullscreen flag) match exactly that node.
    expect(result.fullscreenAfter).toEqual(['g-open']);
    expect(result.modalAfter).toEqual(['g-open']);
    expect(result.pipAfter).toEqual(['vid']);
  });

  test(':open never matches in an XML document', async ({ page }) => {
    await openFixtureWithNW(page);
    const result = await page.evaluate((xmlSource) => {
      const xdoc = new DOMParser().parseFromString(xmlSource, 'application/xml');
      const qsaResult = xdoc.querySelectorAll(':open');
      return {
        parserError: xdoc.getElementsByTagName('parsererror').length > 0,
        nwSelect: window.NW.Dom.select(':open', xdoc).length,
        // install() patches Document.prototype, so this goes through NW too
        // (native ground truth lives in the uninstrumented test below).
        qsaLength: qsaResult.length,
        qsaWentThroughNW: Array.isArray(qsaResult),
      };
    }, XML_SOURCE);
    expect(result.parserError).toBe(false);
    expect(result.nwSelect, 'NW.Dom.select(":open", xmlDoc) must match nothing').toBe(0);
    expect(result.qsaLength, 'xdoc.querySelectorAll(":open") must match nothing').toBe(0);
    expect(result.qsaWentThroughNW, 'NW override reaches XMLDocument via Document.prototype').toBe(true);
  });
});

test('native Chromium parity (no nwsapi): :open in HTML and XML', async ({ page }) => {
  // No init script here: this page runs the native engine as ground truth.
  const response = await page.goto(FIXTURE);
  expect(response, `no HTTP response for ${FIXTURE}`).not.toBeNull();
  expect(response.ok(), `HTTP ${response.status()} for ${FIXTURE}`).toBe(true);
  const result = await page.evaluate((xmlSource) => {
    const xdoc = new DOMParser().parseFromString(xmlSource, 'application/xml');
    return {
      qsaIsNative: !Array.isArray(document.querySelectorAll('html')),
      htmlOpen: Array.from(document.querySelectorAll(':open'), e => e.id),
      xmlOpen: xdoc.querySelectorAll(':open').length,
    };
  }, XML_SOURCE);
  expect(result.qsaIsNative, 'this page must run the native engine').toBe(true);
  expect(result.htmlOpen, 'native :open agrees with nwsapi on the HTML fixture').toEqual(['d-open', 'g-open']);
  expect(result.xmlOpen, 'native :open matches nothing in an XML document').toBe(0);
});
