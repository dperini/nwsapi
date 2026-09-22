#!/bin/sh
set -eu

# The launcher serves the pinned upstream/wpt checkout on localhost:8000.

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec node "$root/test/wpt/wpt-launcher.mjs" serve
