import { expect, test } from 'vitest'
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkCatalog } from '../../../../scripts/repo/check/catalog.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

test('dependency pins agree with the tool manifest and reject Socket library dependencies', () => {
  checkCatalog()
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-catalog-test-'))
  try {
    for (const file of [
      'package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
    ]) {
      copyFileSync(path.join(REPO_ROOT, file), path.join(root, file))
    }
    const file = path.join(root, 'package.json')
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    for (const dependencies of [
      { ...pkg.devDependencies, typebox: '^1.0.0' },
      { ...pkg.devDependencies, '@socketsecurity/lib': 'catalog:' },
    ]) {
      writeFileSync(
        file,
        JSON.stringify({ ...pkg, devDependencies: dependencies }),
      )
      expect(() => checkCatalog(root)).toThrow()
    }
    writeFileSync(
      file,
      JSON.stringify({ ...pkg, packageManager: 'pnpm@1.0.0' }),
    )
    expect(() => checkCatalog(root)).toThrow('pnpm')
    writeFileSync(file, JSON.stringify(pkg))
    writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'packages: {}\n')
    expect(() => checkCatalog(root)).toThrow('integrity')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
