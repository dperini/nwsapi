# Workflow practices

A workflow should verify the revision and artifact it reports. Read the member's committed `.github/workflows/` files to identify its actual triggers, jobs, permissions, and release paths.

## Keep local and hosted checks comparable

Use the fleet setup and install steps before invoking shared runners. Preserve the dependency lockfile and required toolchain. The [setup guide](../development/setup.md) explains why shared files may need restoration after checkout.

Record the revision, runtime, selected suites, and effective configuration with results. Compare test inventories as well as exit codes when local and CI behavior differs. Slower hosted hardware can explain a timing difference, but it does not establish which phase caused it.

Keep logs and diagnostic artifacts when a job fails or times out. A successful subset is not evidence that the complete workflow passed. Follow the [coverage guidance](../testing/coverage.md) when combining lanes and shards.

## Apply the relevant jobs

A JavaScript package, native binary, GitHub Action, and extension can require different build and publication jobs. Generate or update jobs from the member's declared build channels and capabilities. Do not infer a publish channel merely from the presence of a language manifest.

Recurring maintenance may include dependency updates, fuzzing, and workflow-run pruning. These jobs have different scopes from pull-request validation and release jobs. Check their committed schedules and permissions rather than copying a schedule into prose.

Fleet workflow changes belong in the canonical template or conditional source. Member-owned steps belong in their documented extension points. Keep third-party actions pinned according to the [immutable-reference rules](../agents.md/immutable-references.md), and follow the [shared-workflow rules](../agents.md/shared-workflow-cascade.md).

## Validate the workflow that will run

Check YAML and shell syntax through the repository's workflow lint commands. For multiline release notes or pull-request text, write the content to an owned temporary file and pass a file argument such as `--body-file`. Preserve shell quoting so backticks and dollar expressions in prose cannot execute commands.

If a job checks historical product source with current fleet tooling, verify the tooling identity after the final install step. Lifecycle hooks can restore an older payload over a newer overlay. Record both source and tooling revisions so the result identifies what actually ran.

## Separate verification from publishing

A green build is evidence for a release, not permission to publish it. Publishing jobs need the intended revision, artifact, destination, version, and authorization. Follow the [publishing guide](publishing.md) for the differences between distribution channels.

Workflow files and local composite actions needed by GitHub must exist in the committed tree. Runtime restoration of other fleet files cannot replace files that GitHub must read before the job starts.
