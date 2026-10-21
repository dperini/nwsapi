import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  activeTool,
  dependencyReport,
  executableOwner,
  resolveExecutable,
} from '../../../scripts/develop/diagnostics.mts'

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'nwsapi-diagnostics-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (name, value) => {
    const file = path.join(root, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(value))
  }
  write('package.json', { devDependencies: { '@fixture/tool': '1.0.0' } })
  write('package-lock.json', {
    packages: {
      '': { devDependencies: { '@fixture/tool': '1.0.0' } },
      'node_modules/@fixture/tool': { version: '1.0.0' },
    },
  })
  return { root, write }
}

test('empty dependency directories and wrong installed versions need setup', t => {
  const { root, write } = fixture(t)
  mkdirSync(path.join(root, 'node_modules'))
  assert.equal(dependencyReport(root).ready, false)
  write('node_modules/@fixture/tool/package.json', { version: '0.9.0' })
  assert.equal(dependencyReport(root).ready, false)
  write('node_modules/@fixture/tool/package.json', { version: '1.0.0' })
  assert.deepEqual(dependencyReport(root), { ready: true, issues: [] })
})

test('manifest changes and malformed lockfiles invalidate dependency readiness', t => {
  const { root, write } = fixture(t)
  write('node_modules/@fixture/tool/package.json', { version: '1.0.0' })
  write('package.json', { devDependencies: { '@fixture/tool': '2.0.0' } })
  assert.equal(dependencyReport(root).ready, false)
  write('package-lock.json', {})
  assert.equal(dependencyReport(root).ready, false)
})

test('PATH resolution keeps the first executable and reports missing tools', t => {
  const { root } = fixture(t)
  const bin = path.join(root, 'bin')
  mkdirSync(bin)
  const filename = process.platform === 'win32' ? 'node.exe' : 'node'
  symlinkSync(process.execPath, path.join(bin, filename))
  const env = {
    ...process.env,
    PATH: `${path.join(root, 'missing')}${path.delimiter}${bin}`,
  }
  const report = activeTool('node', root, bin, env)
  const expectedExecutable = path.join(bin, filename)
  assert.equal(
    process.platform === 'win32'
      ? report.executable?.toLowerCase()
      : report.executable,
    process.platform === 'win32'
      ? expectedExecutable.toLowerCase()
      : expectedExecutable,
  )
  assert.equal(report.pathEntry, 2)
  assert.equal(report.version, process.versions.node)
  assert.equal(report.owner, 'checkout')
  assert.equal(resolveExecutable('not-a-tool', env), undefined)
  assert.equal(activeTool('not-a-tool', root, bin, env).executable, undefined)
})

test('tool ownership is inferred without changing external installations', () => {
  assert.equal(
    executableOwner(
      '/shim/node',
      '/home/dev/.nvm/versions/node/bin/node',
      '/checkout/bin',
    ),
    'nvm',
  )
  assert.equal(
    executableOwner('/shim/node', '/opt/homebrew/bin/node', '/checkout/bin'),
    'Homebrew',
  )
  assert.equal(
    executableOwner('/custom/node', '/custom/node', '/checkout/bin'),
    'external (owner unknown)',
  )
})
