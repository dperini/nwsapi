import { expect } from "@playwright/test";
import { runScenarios } from "./harness/scenarios";

runScenarios('scope', 'normal', [
  {
    name: 'classes',
    html: `
      <div id="one" class="outer primary"></div>
      <div id="two" class="other-outer"></div>
      <div id="three"></div>
    `,
    cases: [
      { select: 'div', expect: { classes: ['outer primary', 'other-outer', ''] } },
      { select: 'div', expect: { includesClasses: ['other-outer'] } },
      { select: 'div', expect: { includesClasses: ['outer', 'primary'] } },
      { select: 'div', expect: { excludesClasses: ['missing-class'] } },
    ],
  },

  {
    name: 'context-home',
    htmlMode: 'document',
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <body>
          <div id="root" lang="en">
            <div id="lang-parent">
              <div id="lang-child"></div>
            </div>
          </div>

          <div id="class-parent" class="foo box">
            <span id="class-child" class="foo"></span>
          </div>
        </body>
      </html>
    `,
    cases: [
      // Inherited state should differ by home
      { match: ':lang(en)', ref: { by: 'id', id: 'lang-child' }, expect: { ids: ['lang-child'] } },
      { match: ':lang(en)', ref: { by: 'id', id: 'lang-child', home: 'detached' }, expect: { ids: [] } },
      { match: ':lang(en)', ref: { by: 'id', id: 'lang-child', home: 'fragment' }, expect: { ids: [] } },

      // Element-local matching should survive rehoming
      { match: '.foo', ref: { by: 'id', id: 'class-child' }, expect: { ids: ['class-child'] } },
      { match: '.foo', ref: { by: 'id', id: 'class-child', home: 'detached' }, expect: { ids: ['class-child'] } },
      { match: '.foo', ref: { by: 'id', id: 'class-child', home: 'fragment' }, expect: { ids: ['class-child'] } },

      // Ancestor traversal depends on whether the ancestor chain is preserved
      { closest: '.box', ref: { by: 'id', id: 'class-child' }, expect: { ids: ['class-parent'] } },
      { closest: '.box', ref: { by: 'id', id: 'class-child', home: 'detached' }, expect: { ids: [] } },
      { closest: '.box', ref: { by: 'id', id: 'class-child', home: 'fragment' }, expect: { ids: [] } },
    ],
  },

  {
    name: 'equivalent cases that are detached should fail',
    htmlMode: 'document',
    status: 'fail',
    html: `
      <!DOCTYPE html>
      <html>
        <body>
          <section id="left">
            <div class="card">
              <span class="hit">alpha</span>
            </div>
          </section>

          <section id="right">
            <div class="card">
              <span class="hit">alpha</span>
            </div>
          </section>
        </body>
      </html>
    `,
    cases: [
      {
        select: '.hit',
        ref: { by: 'id', id: 'left', home: 'detached' },
        expect: {
          count: 1,
          equivalentCase: {
            select: '.hit',
            ref: { by: 'id', id: 'right', home: 'document' },
          },
        },
      },
    ],
  },

  {
    name: 'setup page can be used to verify test assumptions',
    html: `
      <div class="x"></div>
      <div class="x"></div>
      <span></span>
    `,
    setupPage: async (page) => {
      const result = await page.evaluate(() => ({
        divXCount: document.querySelectorAll('div.x').length,
        spanCount: document.querySelectorAll('span').length,
      }));

      expect(result.divXCount).toEqual(2);
      expect(result.spanCount).toEqual(1);
    },
    cases: [
      { select: 'div.x', expect: { count: 2 } },
      { select: 'span', expect: { count: 1 } },
    ]
  },

  {
    name: 'steps/basic-accumulation',
    html: `
      <div id="box"></div>
    `,
    steps: [
      {
        setupPage: async (page) => {
          await page.evaluate(() => { document.getElementById('box')!.classList.add('a'); });
        },
        cases: [
          { select: '#box.a', expect: { ids: ['box'] } },
          { select: '#box.b', expect: { ids: [] } },
        ],
      },
      {
        setupPage: async (page) => {
          await page.evaluate(() => { document.getElementById('box')!.classList.add('b'); });
        },
        cases: [
          { select: '#box.a', expect: { ids: ['box'] } },
          { select: '#box.b', expect: { ids: ['box'] } },
        ],
      },
    ],
  },

]);