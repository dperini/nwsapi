import { parse, start } from '../cli.mjs'
import { rejectRelease } from '../pipeline.mjs'
import { validateStageId, validateVersion } from '../lib.mjs'

start(() => {
  const { values, positionals } = parse({
    options: { stage: { type: 'string' } },
  })
  const [version] = positionals
  if (positionals.length !== 2 || !values.stage) throw new Error('Usage: npm run npm:reject -- <2.x.y> --stage <UUID>')
  return rejectRelease(validateVersion(version), validateStageId(values.stage))
})
