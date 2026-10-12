# Worktree lifecycle

Keep each active branch in a separate worktree. Each PR has a distinct branch. Every implementation agent owns its own branch and worktree, including agents working toward a shared PR. The coordinator integrates their changes into the recorded target branch.

## Create and identify

Resolve temporary storage through Node's `os.tmpdir()`. Use `mkdtemp()` with a repository-specific prefix and place the Git worktree in that unique directory. Do not hardcode `/tmp`, create worktree checkouts inside the repository, or use `.cache/worktrees/` for checkouts.

Before creating a branch or worktree, inspect `git worktree list --porcelain`. Reuse an existing worktree only for the same task and owner. Do not check out the same branch in a second worktree or bypass Git's protection with `--force`.

Record the repository identity, absolute path, source branch, starting commit, task or agent owner, and intended merge target. The target might be a PR branch, a development branch, or the stable branch. Keep that small local registry outside temporary worktrees so it survives their removal. Do not store credentials or task logs in it.

For a version-selection helper, show product version labels to the user and resolve branch names internally. Run commands with the selected worktree as their working directory. Keep installed dependencies, generated output, and tool selection scoped to that worktree. A child process cannot change the calling shell's directory, so provide a visible path when returning to the shell.

## Work and integrate

An agent edits only its assigned worktree. Pass the absolute worktree path when delegating and when executing commands. Preserve other agents' branches, staged changes, and untracked files. Do not use a shared working directory as an integration mechanism.

Commit useful checkpoints because OS temporary storage may be cleaned independently. Temporary worktrees are not the sole durable record of completed work. Publish or push commits only within the existing authorization for the task.

Integrate reviewed commits into the intended target. Separate agent branches can feed one PR branch. Keep unrelated PRs on separate branches. Do not change a worktree's target silently when the original target moves or a PR is retargeted.

## Sweep after merge

Run cleanup after confirmed integration, and reconcile abandoned entries during later setup or version selection. Operate only on worktrees registered as owned by the helper or agent workflow. Never sweep arbitrary directories found under `os.tmpdir()`.

Before removal:

1. Confirm that no agent, editor task, preview server, or release process still owns the worktree. A locked worktree stays in place.
2. Check staged, unstaged, untracked, and submodule changes. Preserve any unsaved work. Inspect ignored content too, distinguishing known regenerable output from local notes or unknown files.
3. Resolve the current intended target. Confirm source ancestry with `git merge-base --is-ancestor <source-head> <target-head>` for a normal merge. Recheck the source head immediately before cleanup so later commits cannot be discarded.
4. For squash or rebase integration, verify the completed PR or recorded integration result against the exact source head and target. A closed PR, deleted remote branch, matching title, or patch resemblance alone is insufficient. If verification is uncertain, retain the worktree and explain why.
5. Remove the checkout through `git worktree remove`, then remove its empty temporary parent and update the registry. Do not use recursive forced deletion to overcome a dirty or locked checkout. Known regenerable ignored output may be cleaned deliberately after the checks above.

Deleting the local source branch is a separate cleanup decision after integration verification. Never delete the stable branch, development branch, intended target, or a branch still owned by another task. Do not delete remote branches as a side effect of a local sweep.

Report each worktree as removed or retained with a short reason. Never treat a worktree's age or presence under temporary storage as proof that its work is disposable. Existing worktrees outside this layout need deliberate migration, not an automatic move or deletion.
