# Code style practices

Write code and explanations that a junior developer can follow. Use full sentences, concrete names, and direct statements. Keep implementation details in code and explain constraints in comments only when they are not obvious from the implementation.

Use braces around every conditional and loop body. Put the body on separate lines, even when it contains one statement. `oxlint` enforces braces, and `oxfmt` formats the block. Keep function complexity at or below 15. Extract a named operation when it makes the function easier to understand, rather than moving conditions merely to satisfy the number.

Use two-space indentation, an 80-column target, single quotes, trailing commas, and no optional semicolons in authored code. Use type-only imports for types. Keep generated output formatting separate when a measured distribution requirement calls for different settings.

Pass an explicit working directory to subprocesses. Do not change the current process directory while other work may run in the same process. Keep distributed code readable and do not enable bundler minification.

Test observable behavior, structured results, and parsed syntax. Do not assert Markdown wording or search source text to prove implementation behavior. A stable heading or structural marker may have a local allowance with a reason. Avoid snapshots of complete documents or generated source files.

These practices are adapted from Wheelhouse's shared code-style guide. Repository-specific exceptions and the imported lint rules are recorded in the repository's style configuration documentation.

Split authored modules above 500 lines along their responsibilities. The hard cap is 1,000 lines. A leading `max-file-lines: <category> — <reason>` comment can justify an indivisible file above the hard cap. It cannot exempt a file in the 501–1,000-line band. Generated output and vendored fixtures are outside this rule's scope.
