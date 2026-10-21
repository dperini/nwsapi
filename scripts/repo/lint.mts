import { runTool } from './lib/run-tool.mts'
import { lintConfigPath } from './lint/config.mts'
import { lintBinary } from './lint/binary.mts'
import { parseLintArguments, selectedLintFiles } from './lint/files.mts'

const { files, forwarded } = parseLintArguments(process.argv.slice(2))
process.env['OXLINT_TSGOLINT_PATH'] ??= lintBinary()

runTool([
  'node_modules/oxlint/bin/oxlint',
  '--config',
  lintConfigPath(),
  '--tsconfig',
  '.config/tsconfig.check.json',
  ...selectedLintFiles(files),
  ...forwarded,
])
