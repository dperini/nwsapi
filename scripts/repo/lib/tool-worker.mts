import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const file = process.env['NWSAPI_TOOL_ARGUMENTS']
if (!file) {
  throw new Error('Tool argument file is missing.')
}
const args: unknown = JSON.parse(readFileSync(file, 'utf8'))
if (
  !Array.isArray(args) ||
  args.length === 0 ||
  !args.every(value => typeof value === 'string')
) {
  throw new Error('Tool arguments must be a nonempty array of strings.')
}
delete process.env['NWSAPI_TOOL_ARGUMENTS']
delete process.env['NWSAPI_TOOL_NODE']
delete process.env['NWSAPI_TOOL_WORKER']
const entry = path.resolve(args[0]!)
process.argv = [process.execPath, entry, ...args.slice(1)]
await import(pathToFileURL(entry).href)
