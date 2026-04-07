import { runScenarios } from "./harness";

runScenarios('issues', 'normal',  [
  {
    name: 'issue 160 adjacent-descendant regression',
    modifier: 'fixme',
    html: `
      <div>
        <div class="neighbor"></div>
        <div>
          <a>
            <img class="target">
          </a>
        </div>
      </div>
    `,
    cases: [
      { selector: '.neighbor + div .target', expect: { count: 1 } },
      { selector: '.neighbor + * .target', expect: { count: 1 } },
    ],
  },
]);