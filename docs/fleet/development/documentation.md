# Documentation practices

Put reusable guidance in `docs/fleet/` and repository-specific details in `docs/repo/`. Write complete sentences that a junior developer can understand. Explain unfamiliar terms before using them to describe a decision.

## Choose who owns the document

| Content | Location |
| --- | --- |
| Shared setup steps, test practices, performance methods, or workflow rules | Use `docs/fleet/<topic>/`. Wheelhouse supplies these files. |
| Product behavior, local commands, implementation details, or measured results | Use `docs/repo/<topic>/`. The member maintains these files. |
| Instructions for an agent | Use `docs/fleet/agents.md/` or `docs/repo/agents.md/`, according to ownership. |
| A plan for unfinished work | Use `.claude/plans/`. Keep it local. |
| A review or scan of the current checkout | Use `.claude/reports/`. Keep it local. |
| Recorded benchmark inputs and generated result data | Use `assets/repo/bench/`. Track the data and the scripts that generate the reports. |

Edit shared files in the Wheelhouse template. The installed `docs/fleet/` files are mirrors. Follow the [template ownership rules](../agents.md/no-local-fork.md) when distributing a change.

Repository documentation should link to shared guidance and then explain the local details. For example, a repository's coverage document owns its commands, thresholds, and exclusions. The [shared coverage practices](../testing/coverage.md) explain how to combine reports and review exceptions.

## Use consistent names

Use `perf/` for application and tooling performance. Use `testing/` for testing guidance, including test-runner performance. Write that guidance in `testing/performance.md` so readers can distinguish it from application benchmarks.

| Filename | Purpose |
| --- | --- |
| `practices.md` | Explain how to do the work and evaluate the result. |
| `design.md` | Explain how the implementation works and why it uses that design. |
| `journal.md` | Record hypotheses, measurements, rejected ideas, and decisions. |
| `layout.md` | Explain where files belong and how they relate. |
| A specific name such as `coverage.md` or `caching.md` | Cover one subject that needs its own document. |

Create only the files that the subject needs. Avoid repeating the directory name in its filenames. For example, use `docs/repo/testing/practices.md` and `docs/repo/perf/design.md`. Use lowercase words separated by hyphens.

Keep maintained `README.md` files at the repository root. Link to topic documents from that file or from a related document. Do not add a README or an index to each directory. Preserve filenames and references owned by upstream projects.

Give journal entries descriptive titles. Include the measurement date and source revision when they help reproduce a result. Session numbers and audit rounds do not identify the behavior being measured.

## Match documents and scripts by responsibility

Use the same topic name when a document and a script describe the same responsibility. Compare both existing names and choose the clearer one. For example, use `docs/fleet/agents.md/workspace-installation.md` with `scripts/fleet/check/workspace-installation.mts`.

Choose a name that identifies the behavior without repeating the directory's purpose. Update package commands, runner registrations, imports, tests, and document links together. Keep a broader document's name when it covers several checks. Give a narrower script a name that identifies the part it handles.

The [check naming rules](../agents.md/check-names.md) accept assertion names and names shared with a matching document. A matching filename still needs a review of the two files' responsibilities.

## Decide whether shared guidance needs a condition

Use `template/base/universal/docs/fleet/` when the guidance applies across members. A short table can explain differences between release channels, as in the [publishing practices](../workflows/publishing.md).

Use `template/base/conditional/<capability>/docs/fleet/` for a separate document that applies only to members with that capability. Register it with the matching condition in `scripts/repo/commit-cascade/manifest/bundle.json`. Its installed path still starts with `docs/fleet/`.

Check delivery for a member with the capability and one without it. A universal document must not require a local link to a file absent from some members. Refer to the condition in prose or link back to universal guidance from the conditional document.

## Write and review the prose

Lead with the behavior, instruction, or decision. Use familiar words and name the actor when it makes the sentence clearer. Explain technical terms with a concrete example. Keep headings and table labels short, and use full sentences for instructions and explanations.

Use exact package names in inline code when referring to libraries. In a comparison, format both packages the same way. Put version labels outside the code span unless writing a package specifier.

Prefer separate sentences or a natural conjunction over semicolons joining complete thoughts. Attach abbreviated units to numbers, such as `20ms`, `40px`, and `1.5MB`. Keep a space before spelled-out units. Preserve code, direct quotations, and required syntax.

Apply the [prose skill](../../../.claude/skills/fleet/prose/SKILL.md) and [prose rules](../agents.md/prose-style-and-doctrine.md). The prose hook checks known patterns. Read the result as well, since a passing pattern check cannot establish that an explanation is clear. Preserve valid API signatures when the matcher mistakes them for conversational asides.

## Keep evidence with the explanation

Follow each benchmark chart with a paragraph describing its cases and measurement scope. Put shared methodology in expandable details above the charts. Link the chart to its recorded data and generation command. The [performance practices](../perf/practices.md) explain the required evidence.

Edit a generated document's source or generator, then regenerate it. Store large raw profiles in temporary or ignored storage. Keep the selected benchmark inputs and result data needed to reproduce a published comparison in `assets/repo/bench/`.

Before renaming a document, find its incoming links and any generator or configuration that names it. Update relative links, anchors, and generation paths with the move. Review each change for preserved meaning. Do not apply prose replacements to source code or benchmark values.
