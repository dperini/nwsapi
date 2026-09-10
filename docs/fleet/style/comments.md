# Comment practices

Write a comment only when it preserves a constraint, an external quirk, or an invariant that a reader cannot infer from the code. Prefer one short sentence. Wrap it onto a second line when needed. Use the vocabulary a junior developer would understand.

Do not narrate the task, describe removed code, paste an investigation timeline, or repeat the next statement in English. Put investigation results and measurement history in documentation. Preserve useful existing comments unless the change makes them inaccurate. Public API documentation and required license notices follow their established formats.

Write commands and identifiers in backticks. Do not place an escaped star-slash glob inside a block comment. A formatter may remove the escape and close the comment early. Use a line comment or split the backtick spans around the slash.

The comment-length lint rule is a backstop for large blocks, not the preferred writing length. It permits 20 lines for inline blocks and 40 for API documentation, excluding examples and leading file headers. New explanatory comments should normally stay within two lines. Shortening a comment requires judgment, so the length rule does not delete prose automatically.

These practices are adapted from Wheelhouse's terse-comment and code-style guides. Explicit requests to record measurements beside build settings take precedence over the default against repeating measurements in source comments.
