import { rm } from 'node:fs/promises'
import { obsoleteOutputs, outputs } from '../../.config/build.config.mts'

// Only remove named build outputs, never their source directories.
await Promise.all(
  [...outputs, ...obsoleteOutputs].map(file => rm(file, { force: true })),
)
