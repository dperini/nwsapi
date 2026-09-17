import { expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { packageFiles } from '../../../../.config/build.config.mts'
import {
  checkPackageManifest,
  packageLayout,
} from '../../../../scripts/repo/build/manifest.mts'
import {
  packPackage,
  stagePackage,
} from '../../../../scripts/repo/build/package.mts'

test('staging and the real tarball contain only explicitly allowed files', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-package-test-'))
  let staged: string | undefined
  try {
    for (const file of packageFiles) {
      const target = path.join(root, file.output)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(
        target,
        file.output.endsWith('.js') ? 'module.exports = {}' : 'export {}',
      )
    }
    for (const file of ['README.md', 'LICENSE', '.env', 'dist/unlisted.js']) {
      writeFileSync(path.join(root, file), 'fixture')
    }
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify(checkPackageManifest()),
    )
    staged = await stagePackage(root)
    const manifest = JSON.parse(
      readFileSync(path.join(staged, 'package.json'), 'utf8'),
    )
    const stagedFiles = readdirSync(staged, {
      recursive: true,
      withFileTypes: true,
    })
      .filter(entry => entry.isFile())
      .map(entry =>
        path
          .relative(staged!, path.join(entry.parentPath, entry.name))
          .replaceAll('\\', '/'),
      )
    expect(stagedFiles.toSorted()).toEqual(manifest.files.toSorted())
    expect(manifest.exports).toEqual(packageLayout('published').exports)
    const packed = await packPackage(path.join(root, 'packed'), root)
    const entries = execFileSync(
      'tar',
      ['-tzf', path.resolve(root, 'packed', packed.filename)],
      {
        cwd: root,
        encoding: 'utf8',
      },
    )
      .trim()
      .split('\n')
    expect(entries.toSorted()).toEqual(
      manifest.files.map((file: string) => 'package/' + file).toSorted(),
    )
  } finally {
    if (staged) {
      rmSync(staged, { recursive: true, force: true })
    }
    rmSync(root, { recursive: true, force: true })
  }
})
