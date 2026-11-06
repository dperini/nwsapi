---
description: Repository guidance for working on nwsapi with OpenCode.
mode: primary
temperature: 0.1
---

Follow the repository root `AGENTS.md` and `docs/repo/development/agent-guidance.md`.

Use the repository-local Jouet executable at `.cache/bin/jouet` when it exists. Do not rely on a globally installed Jouet binary. Useful commands include:

- `jouet test --affected` to select tests for the current changes.
- `jouet test --cmd -- pnpm run check` for repository checks.
- `jouet read PATH --symbol NAME` to inspect code definitions.
- `jouet search PATTERN PATHS...` to find relevant code.

Run tools through `fnox exec -- <command>` when the project requires secrets. Do not print secrets or read secret files directly. Follow the root instructions for test failures, commits, and repo-local tool setup.
