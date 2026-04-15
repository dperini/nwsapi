import { runScenarios } from "./harness/scenarios";

runScenarios('issues', 'normal',  [
  {
    name: 'issue 160 adjacent-descendant regression',
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
      { select: '.neighbor + div .target', expect: { count: 1 } },
      { select: '.neighbor + * .target', expect: { count: 1 }, status: 'fixme' },
    ],
  },
]);