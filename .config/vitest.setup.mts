import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { TestProject } from 'vitest/node'

export default function setup(project: TestProject) {
  const build = () => {
    execFileSync(process.execPath, ['scripts/build.mts'], {
      cwd: new URL('../', import.meta.url),
      stdio: 'inherit',
    })
  }
  build()
  // Tests import generated CommonJS files, so watch their sources explicitly.
  if (project.vitest.config.watch) {
    project.vite.watcher.add(fileURLToPath(new URL('../src', import.meta.url)))
  }
  project.onTestsRerun(build)
}
