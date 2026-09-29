import { parse, start } from '../cli.mjs'
import { approveRelease } from '../pipeline.mjs'
import { validateStageId, validateVersion } from '../lib.mjs'

start(() => {
  const { values, positionals } = parse({
    options: {
      stage: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const [version] = positionals
  if (positionals.length !== 2 || !values.stage) throw new Error('Usage: npm run npm:approve -- <2.x.y> --stage <UUID> [--dry-run]')
  return approveRelease(validateVersion(version), validateStageId(values.stage), values['dry-run'])
})
