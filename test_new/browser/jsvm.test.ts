import { runScenarios } from "./harness/scenarios";

runScenarios('jsvm', 'normal',  [
  {
    name: 'load test selectors',
    markup: `
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
      { select: '#test1 div:not(:empty)', expect: { count: 4 } },
      { select: '#test1 div:nth-child(even):empty', expect: { count: 2 } },
    ],
  },
]);