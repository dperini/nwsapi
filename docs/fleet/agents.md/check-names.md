# Check names

Choose a name that describes what the check verifies. An assertion such as `script-paths-resolve.mts` can state the condition directly. A topic name such as `workspace-installation.mts` can match the document that explains the check.

Compare existing document and script names before choosing one. Use the clearer name for both when their responsibilities match. Keep a broader document distinct from a check that handles only one part of it. Follow the [documentation practices](../development/documentation.md).

## Accepted names

The check at `scripts/fleet/check/check-names.mts` accepts the existing assertion forms. It also accepts a lowercase topic name when a regular Markdown file has the same name under `docs/<owner>/agents.md/`.

Ownership must match. A document under `docs/fleet/` does not approve the name of a check under `scripts/repo/`. Update script registrations, commands, imports, tests, and documentation links together when renaming a check.

## Template and member checks

For a member checkout, the check reads that member's documentation. For a template source, it reads canonical template documentation. An installed copy cannot approve a name missing its canonical document.

A conditional template can use its own document or a universal document with the same name. A document in another conditional layer does not qualify. Each canonical layer is checked before duplicate installed scripts are skipped.

The filename match establishes a connection between the files. Review their contents to confirm that they describe the same responsibility. The check does not establish that semantic match.
