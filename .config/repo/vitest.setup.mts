import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { TestProject } from 'vitest/node'
import { markTransformedProcess } from '../../scripts/fleet/cover/process.mts'

export default function setup(project: TestProject) {
  markTransformedProcess(process.env['NWSAPI_SCRIPT_COVERAGE_TRANSFORMED'])
  const build = () => {
    execFileSync(process.execPath, ['scripts/repo/build/run.mts'], {
      cwd: new URL('../../', import.meta.url),
      stdio: 'inherit',
    })
  }
  build()
  // Tests import generated CommonJS files, so watch their sources explicitly.
  if (project.vitest.config.watch) {
    project.vite.watcher.add(
      fileURLToPath(new URL('../../src', import.meta.url)),
    )
  }
  project.onTestsRerun(build)
}
