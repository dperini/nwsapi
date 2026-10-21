import { runTool } from './lib/run-tool.mts'
import { lintConfigPath } from './lint/config.mts'
import { parseLintArguments, selectedLintFiles } from './lint/files.mts'

const { files, forwarded } = parseLintArguments(process.argv.slice(2))

runTool([
  'node_modules/oxlint/bin/oxlint',
  '--config',
  lintConfigPath(),
  '--tsconfig',
  '.config/tsconfig.check.json',
  ...selectedLintFiles(files),
  ...forwarded,
])
