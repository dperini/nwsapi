import { parse, start } from '../cli.mjs'
import { stageRelease } from '../pipeline.mjs'
import { validateTag } from '../lib.mjs'

start(() => {
  const { values } = parse({
    options: {
      'release-as': { type: 'string' },
      tag: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  return stageRelease({
    releaseAs: values['release-as'] || 'patch',
    tag: validateTag(values.tag || 'latest'),
    dryRun: values['dry-run'],
  })
})
