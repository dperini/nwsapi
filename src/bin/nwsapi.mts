#!/usr/bin/env node
import { runCli } from '../../scripts/repo/cli.mts'

runCli(process.argv.slice(2))
  .then(output => console.log(output))
  .catch((error: unknown) => {
    console.error(
      `nwsapi: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  })
