# Usability for docs and developer tools

Make the next action easy to recognize, perform, and recover from. Prioritize task completion, orientation, and readable results before visual polish. This guide is a review framework, not a conformance claim or a substitute for observing people using the product.

## Review in task order

1. **Start:** identify the page or command, its purpose, prerequisites, and the recommended next action.
2. **Choose:** show a small ordered set of tasks with familiar labels. Keep secondary configuration available without interrupting the main path.
3. **Act:** show the command or consequence before activation. Selection, hover, or restored history must not launch work.
4. **Observe:** show progress and an outcome beside the action. Keep location and focus stable.
5. **Recover:** preserve inputs, offer a clear retry or undo, and let the user return without remembering earlier state.

These priorities follow the W3C cognitive design guide's advice on clear steps, consistent controls, feedback, recovery, and reducing memory demands. [W3C design guide](https://www.w3.org/TR/coga-usable/#design-guide)

## Controls and movement

- Aim for 44px × 44px standalone pointer targets. A small glyph can sit inside a larger hit area. Keep adjacent targets separate. This is our design target, aligned with WCAG's enhanced target criterion, not a claim that 44px is the AA minimum. Inline links have different exceptions. [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- Keep pointer-down movement from activating unrelated controls. Avoid precision dragging as the only way to operate a feature.
- Preserve focus and selection through navigation. Escape closes temporary views and returns focus to their opener. Scrolling toward a chosen section should not immediately replace that choice.
- Use motion to acknowledge an intentional action only where it helps. Honor reduced motion and reading preferences. Keep text geometry stable across appearance modes. Avoid animated focus rings and unsolicited shimmering.
- Keep state transitions interruptible. Repeated clicks or held keys must not queue duplicate expensive work or overlapping animations.

## Feedback without time pressure

A quick checkmark can acknowledge a routine copy. Its visual duration is a product choice. Do not prescribe one duration for every person or task. Keep the control in place and the icon legible throughout the cue.

Keep programmatic status separate from a short visual reset. Announce success without moving focus. Keep failures, retry instructions, and important outcomes available until they are acted on or superseded. Never make a fleeting animation the only evidence that an operation succeeded. [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

## Vision and reading

- Measure text contrast against the actual background in both themes. Normal text needs 4.5:1 and qualifying large text needs 3:1 under WCAG's minimum contrast criterion. Check controls and focus boundaries separately. [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- Combine shape, wording, or position with color. Category pills and readiness colors need readable labels.
- Review at 320 CSS pixels and with browser zoom. A narrow viewport checks reflow, but does not by itself establish that actual zoom works. Keep horizontal scrolling within genuine tables or code regions and make those regions keyboard reachable. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- Let prose and link labels wrap at natural word boundaries. Constrain paragraph measure independently of tables. Keep external indicators with the ending text without making an entire signature unbreakable.
- Check keyboard focus under sticky headers and inside scroll regions. A visible focus outline is insufficient when its target is covered. [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)

## Terminal and setup

Keep selection, task details, the exact command, and activation hints visible in a predictable order. Scroll long output inside the details region. Preserve a readable plain mode for small terminals, non-TTY sessions, and tools that consume linear text.

Print a concise current state, a specific failure, and one useful next command. Distinguish saved history from current readiness. Reuse working tool installations within project constraints, preserve wrappers and pins, and keep fallback tools scoped. Do not turn a retry into an unexpected global migration.

## Evidence and reporting

For a requested audit, record the route or command, state, viewport or terminal dimensions, input method, expected result, observed result, and impact. Prioritize blocked tasks and lost work first, frequent friction second, and cosmetic changes last. Mark source-only risks and untested questions explicitly.

Include keyboard, pointer, reduced motion, narrow view, both themes, failure recovery, and repeated activation as relevant. Native renderer captures establish geometry, not screen-reader compatibility. Source inspection does not establish measured contrast. Automated checks cannot prove that every user will find a task easy.
