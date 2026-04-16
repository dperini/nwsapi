import { expect } from "@playwright/test";
import { runScenarios } from "./harness/scenarios";

runScenarios('xml', 'normal', [
  {
    name: 'jsdom/svg-test',
    markup: `
      <!doctype html>
      <svg xlink:href="foo"></svg>
    `,
    markupMode: 'html-document',
    cases: [
      { select: '[*|href]', expect: { count: 1 } },
      { select: '[xlink:href=foo]', expect: { count: 1 }, status: 'fixme' },
      { select: '[xlink\\:href=foo]', expect: { count: 1 }, status: 'fixme' },
    ],
  },

  {
    name: 'jsdom/xml-import-test',
    markup: `<div id="host"></div>`,
    setupPage: async (page) => { await page.evaluate(() => {
      const parser = new DOMParser();
      const xml = `<?xml version="1.0"?>
        <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title></dc:title>
        </cp:coreProperties>`;
      const dom = parser.parseFromString(xml, 'text/xml');
      document.getElementById('host')!.appendChild(document.importNode(dom.documentElement, true));
    }); },
    cases: [
      { select: 'coreProperties', ref: { by: 'id', id: 'host' }, expect: { count: 1 }, status: 'fixme' },
      { select: '*|coreProperties', ref: { by: 'id', id: 'host' }, expect: { count: 1 }, status: 'fixme' },
      { select: '|coreProperties', ref: { by: 'id', id: 'host' }, expect: { count: 0 }, status: 'fixme' },
    ],
  },

  {
    name: 'jsdom/xml-markup-mode',
    markup: `<?xml version="1.0"?>
      <cp:coreProperties
          xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
          xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title></dc:title>
      </cp:coreProperties>`,
    markupMode: 'xml-document',
    cases: [
      { select: 'coreProperties', expect: { count: 1 }, status: 'fixme' },
      { select: '*|coreProperties', expect: { count: 1 }, status: 'fixme' },
      { select: '|coreProperties', expect: { count: 0 }, status: 'fixme' },
    ],
  },

  {
    name: 'xml-import-case-insensitivity',
    markup: `<div id="host"></div>`,
    setupPage: async (page) => {
      await page.evaluate(() => {
        const xml = `<?xml version="1.0"?><Foo><bar></bar></Foo>`;
        const dom = new DOMParser().parseFromString(xml, 'text/xml');
        document.getElementById('host')!.appendChild(
          document.importNode(dom.documentElement, true)
        );
      });
    },
    cases: [
      { select: 'Foo', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
      { select: 'foo', ref: { by: 'id', id: 'host' }, expect: { count: 0 }, status: 'fixme' },
      { select: 'bar', ref: { by: 'id', id: 'host' }, expect: { count: 1 } },
      { select: 'Bar', ref: { by: 'id', id: 'host' }, expect: { count: 0 }, status: 'fixme' },
    ],
  },

  {
    name: 'xml-markup-mode-case-sensitivity',
    markupMode: 'xml-document',
    markup: `
      <root>
        <upper id="upper">
          <Foo><bar></bar></Foo>
        </upper>
        <lower id="lower">
          <foo><bar /></foo>
        </lower>
      </root>`,
    cases: [
      // upper: <Foo><bar/></Foo>
      { select: 'Foo', ref: { by: 'id', id: 'upper' }, expect: { count: 1 } },
      { select: 'foo', ref: { by: 'id', id: 'upper' }, expect: { count: 0 } },
      { select: 'bar', ref: { by: 'id', id: 'upper' }, expect: { count: 1 } },
      { select: 'Foo bar', ref: { by: 'id', id: 'upper' }, expect: { count: 1 } },
      { select: 'foo bar', ref: { by: 'id', id: 'upper' }, expect: { count: 0 } },

      // lower: <foo><bar/></foo>
      { select: 'foo', ref: { by: 'id', id: 'lower' }, expect: { count: 1 } },
      { select: 'Foo', ref: { by: 'id', id: 'lower' }, expect: { count: 0 } },
      { select: 'bar', ref: { by: 'id', id: 'lower' }, expect: { count: 1 } },
      { select: 'Bar', ref: { by: 'id', id: 'lower' }, expect: { count: 0 } },
      { select: '#lower foo bar', expect: { count: 1 } },
      { select: '#lower Foo bar', expect: { count: 0 } },
      { select: '#lower FOO bar', expect: { count: 0 } },
      { select: '#lower foo BAR', expect: { count: 0 } },
      { select: '#lower FOO BAR', expect: { count: 0 } },
    ],
  },

]);
