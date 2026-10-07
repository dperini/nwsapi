import { expect, test } from 'vitest'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse, stringify } from 'yaml'
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
    const externalTools = JSON.parse(
      readFileSync(path.join(REPO_ROOT, '.config/external-tools.json'), 'utf8'),
    ) as { tools: { pytorch: { project: string } } }
    const project = externalTools.tools.pytorch.project
    const projectDir = path.join(root, project)
    mkdirSync(projectDir, { recursive: true })
    for (const file of ['pyproject.toml', 'uv.lock']) {
      copyFileSync(
        path.join(REPO_ROOT, project, file),
        path.join(projectDir, file),
      )
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
    const workspaceFile = path.join(root, 'pnpm-workspace.yaml')
    const workspace = readFileSync(workspaceFile, 'utf8')
    const changedWorkspace = parse(workspace)
    changedWorkspace.catalog['ecc-agentshield'] = '0.0.0'
    writeFileSync(workspaceFile, stringify(changedWorkspace))
    expect(() => checkCatalog(root)).toThrow()
    writeFileSync(workspaceFile, workspace)
    const trainingFile = path.join(projectDir, 'pyproject.toml')
    const training = readFileSync(trainingFile, 'utf8')
    writeFileSync(trainingFile, '[project]\ndependencies = []\n')
    expect(() => checkCatalog(root)).toThrow()
    writeFileSync(trainingFile, training)
    const trainingLockFile = path.join(projectDir, 'uv.lock')
    const trainingLock = readFileSync(trainingLockFile, 'utf8')
    writeFileSync(trainingLockFile, '')
    expect(() => checkCatalog(root)).toThrow()
    writeFileSync(trainingLockFile, trainingLock)
    writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'packages: [\n')
    expect(() => checkCatalog(root)).toThrow()
    writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'packages: {}\n')
    expect(() => checkCatalog(root)).toThrow('integrity')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
