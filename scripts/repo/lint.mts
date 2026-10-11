import { runTool } from './lib/run-tool.mts'
import { parseLintArguments, selectedLintFiles } from './lint/files.mts'

const { files, forwarded } = parseLintArguments(process.argv.slice(2))

runTool([
  'node_modules/oxlint/bin/oxlint',
  '--config',
  '.config/oxlint.json',
  '--tsconfig',
  '.config/tsconfig.check.json',
  ...selectedLintFiles(files),
  ...forwarded,
])
