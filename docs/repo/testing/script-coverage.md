# Repository script coverage

Run `pnpm run cover:scripts` to test every Node repository script and Python training script. Unit tests disable network access before importing their modules. Use `nock` for HTTP responses and Vitest for filesystem, subprocess, and browser mocks. Tests mirror their owning script paths beneath `test/repo/unit/` or `test/repo/integration/`.

The command runs unit and integration tests, records coverage from Node subprocesses, and runs the Python unit tests offline. It inventories every `.mts`, `.mjs`, `.js`, and `.py` file beneath `scripts/`, including scripts with no tests. Node files must each reach 98% lines, statements, functions, and branches. Python files must each reach 98% lines and branches. An untested file remains in the denominator.

Reports are written beneath `coverage/scripts/`. Open `coverage/scripts/index.html` for the Node report or inspect `coverage/scripts/gaps.json` for files below the gate. Python details are in `coverage/scripts/python.json`. Run `pnpm run cover:scripts --analyze` to reuse recorded results after changing reporting logic. Rerun tests after changing scripts or test behavior.

Unit and native subprocess coverage can describe the same execution location with different range endings because of source maps. The merger aligns uniquely matching statement starts, function body starts, and branch path starts before adding their counters. Ambiguous locations stay separate. Tests verify that this preserves hit counts and leaves distinct paths uncovered until exercised.
