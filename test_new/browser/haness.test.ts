import { runScenarios } from "./harness";

runScenarios('scope', 'normal', [
  {
    name: 'classes',
    html: `
      <div id="one" class="outer primary"></div>
      <div id="two" class="other-outer"></div>
      <div id="three"></div>
    `,
    cases: [
      { selector: 'div', expect: { classes: ['outer primary', 'other-outer', ''] } },
      { selector: 'div', expect: { includesClasses: ['other-outer'] } },
      { selector: 'div', expect: { includesClasses: ['outer', 'primary'] } },
      { selector: 'div', expect: { excludesClasses: ['missing-class'] } },
    ],
  }
]);