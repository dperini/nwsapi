import { execFileSync } from 'node:child_process'
import type { ExecFileSyncOptions } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { flag } from '@optique/core/primitives'
import { HELP_SHOWN, runCli } from '../../lib/cli/parser.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'
import {
  checkScriptCoverage,
  collectScriptCoverage,
  writeScriptCoverage,
} from './report.mts'
import { checkPythonScriptCoverage, runPythonScriptTests } from './python.mts'

export type ScriptCoverageExecute = (
  command: string,
  args: string[],
  options: ExecFileSyncOptions,
) => unknown

export function runScriptTests(
  root: string,
  directory: string,
  execute: ScriptCoverageExecute = execFileSync,
) {
  rmSync(directory, { recursive: true, force: true })
  const raw = path.join(directory, 'raw')
  mkdirSync(raw, { recursive: true })
  const tiers = ['unit', 'integration']
  for (let i = 0, length = tiers.length; i < length; i += 1) {
    const tier = tiers[i]!
    execute(
      process.execPath,
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        '.config/repo/vitest.scripts.config.mts',
      ],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_DISABLE_COMPILE_CACHE: '1',
          NODE_V8_COVERAGE: raw,
          NWSAPI_TEST_TIER: tier,
          NWSAPI_SCRIPT_COVERAGE_REPORT: path.join(directory, tier),
          NWSAPI_SCRIPT_COVERAGE_TRANSFORMED: path.join(
            directory,
            'transformed',
          ),
        },
      },
    )
  }
}

export async function main(args = process.argv.slice(2)) {
  const values = runCli(
    object({ analyze: withDefault(flag('--analyze'), false) }),
    'cover:scripts',
    args,
    {
      brief: message`Measure and verify coverage for repository scripts.`,
      footer: message`Requires 98% of each coverage metric.`,
    },
  )
  if (values === HELP_SHOWN) {
    return
  }
  const directory = path.join(REPO_ROOT, 'coverage/scripts')
  if (!values.analyze) {
    runScriptTests(REPO_ROOT, directory)
    runPythonScriptTests(REPO_ROOT, directory)
  }
  const { coverage, inventory } = await collectScriptCoverage(
    REPO_ROOT,
    directory,
  )
  const summary = writeScriptCoverage(coverage, directory)
  console.log(
    `Repository scripts: ${inventory.node.length} Node files, ${inventory.python.length} Python files. Node lines ${summary.lines.pct}%, statements ${summary.statements.pct}%, functions ${summary.functions.pct}%, branches ${summary.branches.pct}%.`,
  )
  checkScriptCoverage(coverage)
  checkPythonScriptCoverage(REPO_ROOT, directory, inventory.python)
}

if (isMainModule(import.meta.url)) {
  await main()
}
