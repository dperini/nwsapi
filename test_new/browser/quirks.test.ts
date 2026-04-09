import { runScenarios } from "./harness/scenarios";

runScenarios('quirks', 'normal', [
  {
    name: 'class token matching in standard mode',
    htmlMode: 'document',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        </head>
      <body>
        <div id="dom">
          <div id="d1" class="foobar"></div>
          <div id="d2" class="fooBar"></div>
          <div id="d3" class="FOOBAR"></div>
        </div>
        <div id="qsa">
          <div id="q1" class="foobar"></div>
          <div id="q2" class="fooBar"></div>
          <div id="q3" class="FOOBAR"></div>
        </div>
      </body>
      </html>`,
    cases: [
      { select: '#dom [class~=foobar]', expect: { ids: ['d1'] } },
      { select: '#qsa [class~=foobar]', expect: { ids: ['q1'] } },
      { select: '#dom [class~=foobar i]', expect: { ids: ['d1', 'd2', 'd3'] } },
      { select: '#qsa [class~=foobar i]', expect: { ids: ['q1', 'q2', 'q3'] } },
    ],
  },
  {
    name: 'class token matching in quirks mode',
    htmlMode: 'document',
    html: `
      <html>
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        </head>
      <body>
        <div id="dom">
          <div id="d1" class="foobar"></div>
          <div id="d2" class="fooBar"></div>
          <div id="d3" class="FOOBAR"></div>
        </div>
        <div id="qsa">
          <div id="q1" class="foobar"></div>
          <div id="q2" class="fooBar"></div>
          <div id="q3" class="FOOBAR"></div>
        </div>
      </body>
      </html>`,
    cases: [
      { select: '#dom [class~=foobar]', expect: { ids: ['d1'] } },
      { select: '#qsa [class~=foobar]', expect: { ids: ['q1'] } },
      { select: '#dom [class~=foobar i]', expect: { ids: ['d1', 'd2', 'd3'] } },
      { select: '#qsa [class~=foobar i]', expect: { ids: ['q1', 'q2', 'q3'] } },
    ],
  }
]);
