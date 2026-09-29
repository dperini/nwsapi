import { start } from '../cli.mjs'
import { finalizeRelease } from '../pipeline.mjs'
import { validateVersion } from '../lib.mjs'

start(() => {
  const [version] = process.argv.slice(2).filter(arg => arg !== '--')
  if (!version || process.argv.length !== 3) throw new Error('Usage: npm run npm:finalize -- <2.x.y>')
  return finalizeRelease(validateVersion(version))
})
