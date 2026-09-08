# Shared module names

Use `util` or `utils` for a module whose helpers serve several subjects. Choose one spelling per repository and follow the existing choice.

Give a module a specific name when its exports share a subject. For example, put related parsing functions in `parse.mts`. Use a utility module when no narrower subject describes its contents.

## Avoid repeated or vague names

Do not repeat a directory's name in the module filename. Use `tarball/util.mts` for general helpers in that directory. A name such as `tarball/tarball-helpers.mts` repeats context that the path already supplies.

Avoid generic `-helper` and `-helpers` suffixes. Name the subject or use the repository's chosen utility filename. Keep the same spelling across source and test helpers.

The [code-style rules](code-style.md) explain how to name exported symbols. The [documentation practices](../development/documentation.md) explain when a document and script should share a topic name.

## Enforcement

The check is `scripts/fleet/check/shared-modules-are-named-util.mts`. It checks repeated directory names, helper suffixes, and mixed utility spellings. It reads the full tracked tree to detect mixed spellings even when other checks use a changed-file scope.

Review the purpose of a module before renaming it. Update its imports and callers with the move. The check does not choose between a specific subject name and a utility filename.
