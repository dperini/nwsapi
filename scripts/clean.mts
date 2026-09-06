import { rm } from 'node:fs/promises'
import { outputs } from '../.config/build.config.mts'

// Only remove named build outputs, never their source directories.
await Promise.all(outputs.map(file => rm(file, { force: true })))
