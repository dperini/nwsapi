---
description: Run the repository check task with Jouet.
agent: nwsapi
---

Run the repository checks and summarize any failures.

```sh
if [ -x .cache/bin/jouet ]; then
  .cache/bin/jouet test --cmd -- pnpm run check
else
  pnpm run check
fi
```
