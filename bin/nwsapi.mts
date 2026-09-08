#!/usr/bin/env node
const { runCli } = require('../dist/cli.js')
runCli(process.argv.slice(2))
  .then(output => console.log(output))
  .catch(error => {
    console.error(`nwsapi: ${error.message}`)
    process.exitCode = 1
  })
