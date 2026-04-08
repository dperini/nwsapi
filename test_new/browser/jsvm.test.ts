import { runScenarios } from "./harness";

runScenarios('jsvm', 'normal',  [
  {
    name: 'load test selectors',
    html: `
      <div id="test1">
        <div class="notempty">
        </div>
        <div class="notempty">
          <div class="empty"></div>
          <div class="empty"></div>
        </div>
        <div class="notempty">
        </div>
        <div class="notempty">
          <div class="empty"></div>
          <div class="empty"></div>
        </div>
      </div>
    `,
    cases: [
      { selector: '#test1 div:not(:empty)', expect: { count: 4 } },
      { selector: '#test1 div:nth-child(even):empty', expect: { count: 2 } },
    ],
  },
]);