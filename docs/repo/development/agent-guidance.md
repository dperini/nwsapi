# Shared agent guidance

Run `pnpm run setup:agents` to create the local guidance aliases. Normal setup reaches the same generator through `prepare`. The direct entry point works before dependencies are installed:

```sh
node scripts/repo/setup/agents.mts
```

Run `pnpm run setup:agents --check` to report missing or stale aliases without writing. Restart an existing agent session if its skill list does not refresh.

## One source for each instruction

| Consumer    | Instructions                                   | Skills                                                                             |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Claude Code | Generated `CLAUDE.md` imports root `AGENTS.md` | Authored `.claude/skills/<name>/SKILL.md`                                          |
| Codex       | Root `AGENTS.md`                               | Generated `.agents/skills/<name>/SKILL.md`                                         |
| OpenCode    | Root `AGENTS.md`                               | The same `.agents/skills/` aliases, with `.claude/skills/` compatibility discovery |

Edit `AGENTS.md` or the authored skill. Generated aliases are small copies marked with their owning generator. The skill name stays identical across hosts. There is no extra `.codex` or `.opencode` configuration to maintain, and setup does not modify user-level configuration, authentication, permissions, shell aliases, or MCP settings.

This follows Wheelhouse's template pattern: authoritative `AGENTS.md`, a generated Claude import, shared skill sources under `.claude`, and a generated flat `.agents/skills` surface. This checkout uses a flat source tree because it has only two skills. It does not import the fleet's larger hook and adapter system.

The generator preserves custom files and reports conflicts. Its standalone command exits unsuccessfully on conflicts. During `prepare`, `--optional` reports them without blocking the package build. It refuses symlinked output files or parent directories so setup cannot write through a project alias into unrelated configuration. Repeated runs leave current aliases unchanged. Remove an obsolete generated skill directory manually after removing or renaming its source. The generator does not sweep local skills.

Each skill is a short entry point with repository-root references to maintained documentation. Supporting guides belong under `docs/fleet/` or `docs/repo/`, so these aliases do not need a copied resource tree.

## Available skills

- `ui-usability`: documentation and web UI review, reading, focus, target size, feedback, motion, and reflow.
- `developer-flow-usability`: setup, terminal menus, CLI output, recovery, tool ownership, and harness execution.

Ask any supported harness to use the named skill. In Codex, use `$ui-usability` or `$developer-flow-usability`. Claude Code exposes `/ui-usability` and `/developer-flow-usability`. OpenCode discovers the same named skills through its skill tool.

## Isolate agent work

Each implementation agent uses its own branch and worktree under `os.tmpdir()`. Each PR uses a separate branch. Record where the work should merge, integrate it explicitly, and sweep the temporary worktree after confirming that merge. Existing worktrees are not migrated or deleted merely because this policy changed. See the [worktree lifecycle](../../fleet/development/worktrees.md).

The current `pnpm run dev` menu does not yet create, switch, or sweep worktrees. These rules define the behavior required of that future helper and of agents creating worktrees now.

## Keep local state local

The repository already ignores files by default and opts maintained files in. The two authored `SKILL.md` files are explicit exceptions. `CLAUDE.md`, `.agents/`, `.codex/`, `.opencode/`, and local `.claude` plans, reports, and caches remain ignored. Do not allow the entire `.claude` tree into Git to add a skill.

Keep screenshots, logs, temporary fixtures, downloads, and generated audit data under `.cache/`. Keep maintained review findings in `docs/repo/development/`. Do not store personal context, machine-specific credentials, or session transcripts in shared skills or instructions.

## Discovery references

Codex documents `.agents/skills` discovery, Claude Code documents project `.claude/skills`, and OpenCode documents both paths. Harness settings may disable discovery, so filesystem setup alone does not prove that a particular running session loaded a skill. [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code skills](https://code.claude.com/docs/en/skills), [OpenCode skills](https://docs.opencode.ai/docs/skills/)

The ignore policy uses explicit opt-ins as described in the supplied article's public introduction. The rest of that article was not available in the fetched page. [Ignore everything by default](https://packagemain.tech/p/gitignore-everything-by-default)
