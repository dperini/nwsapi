#!/usr/bin/env node
// oxlint-disable-next-line typescript/consistent-type-imports -- Keep this CommonJS launcher a script.
type Cli = typeof import('../scripts/repo/cli.mts')
const { runCli } = require('../cli.js') as Cli
runCli(process.argv.slice(2))
  .then(output => console.log(output))
  .catch((error: unknown) => {
    console.error(
      `nwsapi: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  })
