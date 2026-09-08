# No burn-down lists

A burn-down list names files that still violate a rule and exempts them from its check. Do not introduce such a list to make a check pass before the violations are fixed.

A permanent exception is part of the rule's intended scope. Document why it is allowed. Keep this distinction clear so a successful check describes the intended behavior.

## Fix violations before adding a check

Count the violations before enabling a new check. `BURNDOWN_PROMPT_THRESHOLD` in `scripts/fleet/constants/burndown.mts` defines when the work needs a separate scope decision.

At or below that threshold, fix the violations as part of the change. Above it, report the count and let the user choose whether to fix them, narrow the rule, or defer the rule.

When removing a deferral list, fix its violations and remove the list and the code that reads it. Delete an empty list rather than leaving a place for future exemptions.

## Enforcement

The check is `scripts/fleet/check/no-burn-down-lists.mts`. It scans check source files for declaration names associated with deferred violations. Names such as `KNOWN_VIOLATIONS` and `PENDING_MIGRATION` are examples.

The scanner recognizes names and declaration patterns. It cannot prove the purpose of an arbitrary data structure. Review the scope and meaning of exceptions even when the scan passes. Renaming a deferral list does not resolve the violations it hides.
