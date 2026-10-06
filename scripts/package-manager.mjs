import {
  invokedByNonNpm,
  nonNpmPackageManagerMessage,
} from './lib/package-manager.mjs'

if (invokedByNonNpm()) {
  console.error(nonNpmPackageManagerMessage())
  process.exit(1)
}
