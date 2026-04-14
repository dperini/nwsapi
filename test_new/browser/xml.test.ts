import { expect } from "@playwright/test";
import { runScenarios } from "./harness/scenarios";

runScenarios('xml', 'normal', [
  {
    name: 'jsdom/svg-test',
    html: `
      <!doctype html>
      <svg xlink:href="foo"></svg>
    `,
    htmlMode: 'document',
    cases: [
      { select: '[*|href]', expect: { count: 1 } },
      { select: '[xlink:href=foo]', expect: { count: 1 }, status: 'fixme' },
      { select: '[xlink\\:href=foo]', expect: { count: 1 }, status: 'fixme' },
    ],
  },

  {
    name: 'jsdom/xml-test',
    html: `<div id="host"></div>`,
    steps: [
      {
        setupPage: async (page) => { await page.evaluate(() => {
          const parser = new DOMParser();
          const xml = `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title></dc:title></cp:coreProperties>`;
          const dom = parser.parseFromString(xml, 'text/xml');
          document.getElementById('host')!.appendChild(document.importNode(dom.documentElement, true));
        }); },
        cases: [
          { select: 'coreProperties', ref: { by: 'id', id: 'host' }, expect: { count: 1 }, status: 'fixme' },
          { select: '*|coreProperties', ref: { by: 'id', id: 'host' }, expect: { count: 1 }, status: 'fixme' },
          { select: '|coreProperties', ref: { by: 'id', id: 'host' }, expect: { count: 0 }, status: 'fixme' },
        ],
      },
    ],
  },

  {
    name: 'xml-test2',
    html: `
      <div id="upper-box"></div>
      <div id="lower-box"></div>
    `,
    steps: [
      {
        setupPage: async (page) => { await page.evaluate(() => {
          const xml1 = '<?xml version="1.0"?><Foo><bar></bar></Foo>';
          const xml2 = xml1.toLowerCase();

          const parser = new DOMParser();
          const dom1 = parser.parseFromString(xml1, 'text/xml');
          const dom2 = parser.parseFromString(xml2, 'text/xml');

          document.getElementById('upper-box')!.appendChild(
            document.importNode(dom1.documentElement, true)
          );
          document.getElementById('lower-box')!.appendChild(
            document.importNode(dom2.documentElement, true)
          );
        }); },
        cases: [
          // <Foo><bar/></Foo>
          { select: 'Foo', ref: { by: 'id', id: 'upper-box' }, expect: { count: 1 } },
          { select: 'foo', ref: { by: 'id', id: 'upper-box' }, expect: { count: 0 }, status: 'fixme' },
          { select: 'bar', ref: { by: 'id', id: 'upper-box' }, expect: { count: 1 } },
          { select: 'foo bar', ref: { by: 'id', id: 'upper-box' }, expect: { count: 0 }, status: 'fixme' },
          { select: 'Foo bar', ref: { by: 'id', id: 'upper-box' }, expect: { count: 1 } },

          // <foo><bar/></foo>
          { select: 'bar', ref: { by: 'id', id: 'lower-box' }, expect: { count: 1 } },
          { select: 'Bar', ref: { by: 'id', id: 'lower-box' }, expect: { count: 0 }, status: 'fixme' },
          { select: 'foo bar', ref: { by: 'id', id: 'lower-box' }, expect: { count: 1 } },
          { select: 'Foo bar', ref: { by: 'id', id: 'lower-box' }, expect: { count: 0 }, status: 'fixme' },
          { select: 'FOO bar', ref: { by: 'id', id: 'lower-box' }, expect: { count: 0 }, status: 'fixme' },
          { select: 'foo BAR', ref: { by: 'id', id: 'lower-box' }, expect: { count: 0 }, status: 'fixme' },
          { select: 'FOO BAR', ref: { by: 'id', id: 'lower-box' }, expect: { count: 0 }, status: 'fixme' },
        ],
      },
    ],
  },

  {
    name: 'xml-test2-literal',
    html: '',
    setupPage: async (page) => {
      const result = await page.evaluate(() => {
        const xml1 = '<?xml version="1.0"?><Foo><bar></bar></Foo>';
        const xml2 = xml1.toLowerCase();

        const parser = new DOMParser();
        const dom1 = parser.parseFromString(xml1, 'text/xml');
        const dom2 = parser.parseFromString(xml2, 'text/xml');

        const run = (selector: string, dom: Document) => {
          let nativeCount = -1;
          let nwCount = -1;
          let nwError = '';

          nativeCount = dom.querySelectorAll(selector).length;
          try {
            nwCount = NW.Dom.select(selector, dom).length;
          } catch (err) {
            nwError = String(err);
          }

          return { nativeCount, nwCount, nwError };
        };

        return {
          upperFoo: run('Foo', dom1),
          upperfoo: run('foo', dom1),
          upperbar: run('bar', dom1),
          upperFoobar: run('Foo bar', dom1),
          upperfoobar: run('foo bar', dom1),

          lowerbar: run('bar', dom2),
          lowerBar: run('Bar', dom2),
          lowerfoobar: run('foo bar', dom2),
          lowerFoobar: run('Foo bar', dom2),
          lowerFOObar: run('FOO bar', dom2),
          lowerfooBAR: run('foo BAR', dom2),
          lowerFOOBAR: run('FOO BAR', dom2),
        };
      });

      expect(result.upperFoo.nativeCount).toEqual(1);
      expect(result.upperfoo.nativeCount).toEqual(0);
      expect(result.upperbar.nativeCount).toEqual(1);
      expect(result.upperfoobar.nativeCount).toEqual(0);
      expect(result.upperFoobar.nativeCount).toEqual(1);

      expect(result.lowerbar.nativeCount).toEqual(1);
      expect(result.lowerBar.nativeCount).toEqual(0);
      expect(result.lowerfoobar.nativeCount).toEqual(1);
      expect(result.lowerFoobar.nativeCount).toEqual(0);
      expect(result.lowerFOObar.nativeCount).toEqual(0);
      expect(result.lowerfooBAR.nativeCount).toEqual(0);
      expect(result.lowerFOOBAR.nativeCount).toEqual(0);

      expect(result.upperFoo.nwCount).toEqual(1);
      expect(result.upperfoo.nwCount).toEqual(0);
      expect(result.upperbar.nwCount).toEqual(1);
      expect(result.upperfoobar.nwCount).toEqual(0);
      expect(result.upperFoobar.nwCount).toEqual(1);

      expect(result.lowerbar.nwCount).toEqual(1);
      expect(result.lowerBar.nwCount).toEqual(0);
      expect(result.lowerfoobar.nwCount).toEqual(1);

      expect(result.lowerFoobar.nwCount).toEqual(0); // likely fixme
      expect(result.lowerFOObar.nwCount).toEqual(0); // likely fixme
      expect(result.lowerfooBAR.nwCount).toEqual(0);
      expect(result.lowerFOOBAR.nwCount).toEqual(0);
    },
  },
]);
