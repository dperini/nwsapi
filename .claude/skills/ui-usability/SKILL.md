---
name: ui-usability
description: Review documentation and web UI changes for readable content, stable controls, clear feedback, and keyboard or pointer usability.
---

# UI usability

Read `docs/fleet/design/usability.md` from the repository root. For this project's current findings, read `docs/repo/development/usability-review.md`.

Review a complete task: find a document, choose a section, read a table, copy code, and return. Prioritize blocked tasks, lost context, and precision demands before decoration. Keep evidence and assumptions separate.

- Preserve user choices about motion and brief feedback. A 400ms copy check is a local preference, not a general time limit. Essential errors, recovery instructions, and announcements must survive that visual reset.
- Compare hit areas with visible icon sizes. Prefer 44px standalone controls without inflating the glyph. Do not label every small inline text link a target-size failure.
- Check keyboard focus, Escape, browser Back, magnification, light/dark contrast, narrow tables, and reduced motion. Reading mode should keep content geometry stable.
- Keep real link text breakable at words. An external icon should accompany the final word, not turn an entire signature into an unbreakable object. Internal links need no directional decoration.
- Report the state, viewport, action, observed result, impact, and smallest fix. Distinguish a measured defect from a source-level risk and an untested question.

Keep implementation and public reports about observable usability needs. Do not include personal health context. Do not claim a review establishes suitability for every user or certifies conformance.

Use live browser measurements when the request includes an audit or verification. Do not add a test suite, telemetry, or a redesign solely because this skill was loaded. For implementation-only requests, make the scoped change and state what was not checked.
