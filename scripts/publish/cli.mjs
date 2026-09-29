import { parseArgs } from 'node:util'
import { setupRelease } from './setup.mjs'

export function parse(spec) {
  return parseArgs({
    args: process.argv.slice(2).filter(arg => arg !== '--'),
    strict: true,
    ...spec,
  })
}

export function start(action) {
  try {
    setupRelease()
    return action()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
