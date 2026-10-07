import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach } from 'vitest'

const directories: string[] = []
afterEach(() => {
  for (let i = 0, length = directories.length; i < length; i += 1) {
    rmSync(directories[i]!, { recursive: true, force: true })
  }
  directories.length = 0
})

export function fixture() {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'nwsapi-script-coverage-')),
  )
  directories.push(root)
  const directory = path.join(root, 'coverage')
  for (const name of [
    'scripts',
    'coverage/raw',
    'coverage/transformed',
    'coverage/unit',
    'coverage/integration',
  ]) {
    mkdirSync(path.join(root, name), { recursive: true })
  }
  const entry = path.join(root, 'scripts/run.mts')
  writeFileSync(entry, 'const value: number = 42\nconsole.log(value)\n')
  return { root, directory, entry }
}

export function executeFixture(input: ReturnType<typeof fixture>) {
  execFileSync(process.execPath, [input.entry], {
    cwd: input.root,
    env: {
      ...process.env,
      NODE_V8_COVERAGE: path.join(input.directory, 'raw'),
      NODE_DISABLE_COMPILE_CACHE: '1',
    },
    stdio: 'pipe',
  })
}
