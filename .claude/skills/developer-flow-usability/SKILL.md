---
name: developer-flow-usability
description: Review setup, terminal menus, CLI output, and agent task interfaces for clear ordering, predictable execution, recovery, and toolchain coexistence.
---

# Developer flow usability

Read `docs/fleet/design/usability.md` and `docs/repo/development/toolchain.md` from the repository root. Use the documented JSON discovery interface before inventing commands.

Follow a new checkout through setup, documentation, editing, review, and recovery. Keep the recommended next action visible. Separate current readiness from past outcomes.

- Selecting an item previews it. A separate activation runs it. Repeated key events must not queue duplicate work. Show the exact command before execution.
- Keep essential commands and key hints visible while long details scroll. Use the existing plain menu for narrow terminals or noninteractive use. Do not assume terminal cells equal JavaScript string length.
- Show which phase is running, what failed, and one actionable retry. Preserve useful progress without saving raw logs, credentials, or environment variables as menu history.
- Reuse compatible tools, respect project pins and package-manager wrappers, and keep repairs scoped. Do not edit shell startup files or global defaults as a convenience.
- Keep optional machine configuration opt-in, with the default set to skip. Explain persistent setting changes before consent. Starting narration is a separate explicit action with an easy Stop path. Detect the resulting state before claiming success, and keep permission uncertainty visible.
- Bound narration tests from process launch, including startup and permission waits. Keep spoken output focused on the tested action, and stop immediately on cancellation. A startup sound is not evidence that speech capture succeeded.
- Harnesses use ordered `--list --json` and explicit `--task <id> --json` execution. Do not spawn a TUI inside a noninteractive harness or infer publication authorization from task discovery.
- Keep each branch and implementation agent in a separate worktree under `os.tmpdir()`. Each PR has its own branch. Record the intended target and sweep only confirmed merged, inactive worktrees without uncommitted work. Read `docs/fleet/development/worktrees.md` for creation, integration, and cleanup rules.
- For guided product version selection, use `node scripts/repo/develop/run.mts --version v2|v3`. Discovery with `--list --json` stays read-only. The explicit `--sweep` command previews helper-owned worktrees; require `--apply` for removal and preserve uncertain, dirty, locked, or unmerged entries.
- Use `.claude/skills/` for authored shared skills, root `AGENTS.md` for brief invariants, and ignored generated aliases for discovery. Put captures, logs, and downloads under `.cache/`.

For a requested audit, record evidence for terminal size, Unicode, cancellation, repeat activation, no-TTY behavior, and JSON output. Mark unavailable platform or harness checks as unverified. Do not silently widen the task into installing or upgrading agent products.
