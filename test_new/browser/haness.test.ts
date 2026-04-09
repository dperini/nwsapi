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
  }
]);