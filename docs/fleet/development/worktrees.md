# Worktree lifecycle

Keep each active branch in a separate worktree. Each PR has a distinct branch. Every implementation agent owns its own branch and worktree, including agents working toward a shared PR. The coordinator integrates their changes into the recorded target branch.

## Create and identify

Resolve temporary storage through Node's `os.tmpdir()`. Use `mkdtemp()` with a repository-specific prefix and place the Git worktree in that unique directory. Do not hardcode `/tmp`, create worktree checkouts inside the repository, or use `.cache/worktrees/` for checkouts.

Before creating a branch or worktree, inspect `git worktree list --porcelain`. Reuse an existing worktree only for the same task and owner. Do not check out the same branch in a second worktree or bypass Git's protection with `--force`.

Record the repository identity, absolute path, source branch, starting commit, task or agent owner, and intended merge target in helper-owned per-worktree metadata beside the checkout. The target might be a PR branch, a development branch, or the stable branch. Keep that metadata local to its temporary parent. Do not create a central ledger or store credentials and task logs in ownership records.

For a version-selection helper, show product version labels to the user and resolve branch names internally. Run commands with the selected worktree as their working directory. Keep installed dependencies, generated output, and tool selection scoped to that worktree. A child process cannot change the calling shell's directory, so provide a visible path when returning to the shell.

## Work and integrate

An agent edits only its assigned worktree. Pass the absolute worktree path when delegating and when executing commands. Preserve other agents' branches, staged changes, and untracked files. Do not use a shared working directory as an integration mechanism.

Commit useful checkpoints because OS temporary storage may be cleaned independently. Temporary worktrees are not the sole durable record of completed work. Publish or push commits only within the existing authorization for the task.

Integrate reviewed commits into the intended target. Separate agent branches can feed one PR branch. Keep unrelated PRs on separate branches. Do not change a worktree's target silently when the original target moves or a PR is retargeted.

## Sweep after merge

Run cleanup after confirmed integration. Operate only on worktrees marked by helper-owned per-worktree metadata. Never sweep arbitrary directories found under `os.tmpdir()`.

Before removal:

1. Confirm that no agent, editor task, preview server, or release process still owns the worktree. A locked worktree stays in place.
2. Check staged, unstaged, untracked, and submodule changes. Preserve any unsaved work. Inspect ignored content too, distinguishing known regenerable output from local notes or unknown files.
3. Resolve the current intended target. Confirm source ancestry with `git merge-base --is-ancestor <source-head> <target-head>` for a normal merge. Recheck the source head immediately before cleanup so later commits cannot be discarded.
4. For squash or rebase integration, verify the completed PR or recorded integration result against the exact source head and target. A closed PR, deleted remote branch, matching title, or patch resemblance alone is insufficient. If verification is uncertain, retain the worktree and explain why.
5. Remove the checkout through `git worktree remove`, then remove only the verified ownership metadata and empty temporary parent. Do not use recursive forced deletion to overcome a dirty or locked checkout. Known regenerable ignored output may be cleaned deliberately after the checks above.

Deleting the local source branch is a separate cleanup decision after integration verification. Never delete the stable branch, development branch, intended target, or a branch still owned by another task. Do not delete remote branches as a side effect of a local sweep.

Report each worktree as removed or retained with a short reason. Never treat a worktree's age or presence under temporary storage as proof that its work is disposable. Existing worktrees outside this layout need deliberate migration, not an automatic move or deletion.

The guided version selector stores ownership metadata beside each helper-created
checkout. Its version launcher and ordinary runner invocation inside that
helper-created checkout refresh a host-tagged PID and random-token pulse while
active. A foreign or unknown host is never interpreted as a local PID.
Clean exit writes a token-matched release marker before removing that pulse.
The selector and sweeper use a short exclusive operation lock. A stale lock is
uncertain and is preserved rather than removed automatically.

The selector's `--sweep` mode previews helper-owned worktrees. `--sweep
--apply` removes only clean worktrees with at least one commit beyond their
recorded starting point when the current source HEAD is an ancestor of the
recorded local target. It rechecks metadata, ownership, HEAD, dirty state, and
ancestry immediately before `git worktree remove`. Squash or rebase outcomes
have no separate proof input in this workflow, so they remain in place. Missing
or malformed metadata, missing targets, unknown pulse state, ignored content,
or legacy temporary checkouts are retained. A dead or expired pulse without a
verified clean-release marker is retained for review.

These leases cover this guided runner only. They do not automatically track
editor sessions, CI jobs, or other agents using a checkout.
