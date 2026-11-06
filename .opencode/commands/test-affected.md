---
description: Run the tests selected for the current changes with Jouet.
agent: nwsapi
---

Run the affected tests and report which files or test groups Jouet selected and why.

```sh
if [ -x .cache/bin/jouet ]; then
  .cache/bin/jouet test --affected
else
  pnpm run test:node
fi
```
