import { afterEach, expect, test, vi } from 'vitest'
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
import { pathToFileURL } from 'node:url'
import { transformSync } from '@swc/core'
import {
  renderHasRouteDecision,
  writeHasRouteDecision,
} from '../../../../scripts/repo/gen/has-route-decision.mts'

const repository = path.resolve('.')
const model = path.join(repository, 'assets/repo/pytorch/model')
const temporaryRoots: string[] = []

afterEach(() => {
  const roots = temporaryRoots.splice(0)
  const rootCount = roots.length
  for (let index = 0; index < rootCount; index += 1) {
    rmSync(roots[index]!, { recursive: true, force: true })
  }
})

function temporaryDirectory() {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-route-decision-'),
  )
  temporaryRoots.push(directory)
  return directory
}

async function importGenerated(source: string) {
  const javascript = transformSync(source, {
    filename: 'route.mts',
    jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
    module: { type: 'es6' },
  }).code
  const encoded = Buffer.from(javascript).toString('base64')
  return import(`data:text/javascript;base64,${encoded}`) as Promise<{
    hasRouteDecisionModelId: string
    chromiumPolicy: (...features: number[]) => boolean
    jsdomPolicy: (...features: number[]) => boolean
  }>
}

test('the generated host policies preserve the pinned JavaScript route behavior', async () => {
  const generated = await importGenerated(await renderHasRouteDecision())
  const chromium = (await import(
    path.join(model, 'chromium.generated.mjs')
  )) as { dispatchOverride: (...features: number[]) => boolean }
  const jsdom = (await import(path.join(model, 'jsdom.generated.mjs'))) as {
    dispatchOverride: (...features: number[]) => boolean
  }

  expect(generated.hasRouteDecisionModelId).toBe(
    'planner-dispatch-crossed-2026-10-05-r1',
  )
  const featureCases: Array<[number, number, number, number, number]> = [
    [32, 80, 1, 0, 2.5],
    [96, 320, 2, 0, 3.3],
    [192, 768, 3, 0, 4],
    [12, 48, 1, 0, 4],
    [100, 100, 2, 1, 1],
    [Number.NaN, 120, 1, 0, 3],
  ]
  const featureCount = featureCases.length
  for (let index = 0; index < featureCount; index += 1) {
    const features = featureCases[index]!
    expect(generated.chromiumPolicy(...features)).toBe(
      chromium.dispatchOverride(...features),
    )
    expect(generated.jsdomPolicy(...features)).toBe(
      jsdom.dispatchOverride(...features),
    )
  }
})

test('generation writes reproducible output and rejects stale checks', async () => {
  const directory = temporaryDirectory()
  const fixture = path.join(directory, 'model')
  const output = path.join(directory, 'generated', 'route.mts')
  mkdirSync(fixture)
  const assetNames = [
    'model.txt',
    'chromium.generated.mjs',
    'jsdom.generated.mjs',
  ]
  const assetCount = assetNames.length
  for (let index = 0; index < assetCount; index += 1) {
    const name = assetNames[index]!
    copyFileSync(path.join(model, name), path.join(fixture, name))
  }

  await writeHasRouteDecision({ modelDirectory: fixture, output })
  await expect(
    writeHasRouteDecision({ check: true, modelDirectory: fixture, output }),
  ).resolves.toBeUndefined()
  writeFileSync(output, 'stale')
  await expect(
    writeHasRouteDecision({ check: true, modelDirectory: fixture, output }),
  ).rejects.toThrow('stale')
  await writeHasRouteDecision({ modelDirectory: fixture, output })
  const emitted = await importGenerated(readFileSync(output, 'utf8'))
  const chromium = (await import(
    pathToFileURL(path.join(fixture, 'chromium.generated.mjs')).href
  )) as { dispatchOverride: (...features: number[]) => boolean }
  expect(emitted.chromiumPolicy(96, 320, 2, 0, 3.3)).toBe(
    chromium.dispatchOverride(96, 320, 2, 0, 3.3),
  )
})

test('generation rejects missing model identity and incompatible policy exports', async () => {
  const directory = temporaryDirectory()
  const assetNames = [
    'model.txt',
    'chromium.generated.mjs',
    'jsdom.generated.mjs',
  ]
  const assetCount = assetNames.length
  for (let index = 0; index < assetCount; index += 1) {
    const name = assetNames[index]!
    copyFileSync(path.join(model, name), path.join(directory, name))
  }

  writeFileSync(path.join(directory, 'model.txt'), 'missing identity\n')
  await expect(renderHasRouteDecision(directory)).rejects.toThrow('model-id')

  writeFileSync(
    path.join(directory, 'model.txt'),
    readFileSync(path.join(model, 'model.txt'), 'utf8'),
  )
  writeFileSync(
    path.join(directory, 'chromium.generated.mjs'),
    'export default 1',
  )
  await expect(renderHasRouteDecision(directory)).rejects.toThrow(
    'Unexpected chromium policy export',
  )

  copyFileSync(
    path.join(model, 'chromium.generated.mjs'),
    path.join(directory, 'chromium.generated.mjs'),
  )
  writeFileSync(
    path.join(directory, 'chromium.generated.mjs'),
    'export function dispatchOverride(a, b) { return a > b }',
  )
  await expect(renderHasRouteDecision(directory)).rejects.toThrow(
    'Unexpected chromium policy signature',
  )

  writeFileSync(
    path.join(directory, 'chromium.generated.mjs'),
    [
      'function supportedCategory({ attributes }, dense) { return attributes === 1 && dense === 0; }',
      'function supportedRoute(anchors, witnesses, dense) { return true; }',
      'function inRange(value, minimum, maximum) { return true; }',
      'function supportedInputs(anchors, witnesses, attributes, dense, ratio) { return true; }',
      'export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) { return true; }',
    ].join('\n'),
  )
  await expect(renderHasRouteDecision(directory)).rejects.toThrow(
    'Unexpected chromium policy parameter',
  )
})

test('CLI rejects formatting failures before publishing generated policy', async () => {
  vi.resetModules()
  vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: () => true,
  }))
  vi.doMock('oxfmt', () => ({
    format: async () => ({ errors: [{ message: 'invalid output' }], code: '' }),
  }))
  try {
    await expect(
      import('../../../../scripts/repo/gen/has-route-decision.mts'),
    ).rejects.toThrow()
  } finally {
    vi.doUnmock('oxfmt')
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
  }
})

test('rejects incomplete helper declarations returned by the parser', async () => {
  vi.resetModules()
  const actual = await vi.importActual<{
    parse: (source: string, options: unknown) => unknown
  }>('@ultrathink/acorn.rs.wasm')
  vi.doMock('@ultrathink/acorn.rs.wasm', () => ({
    parse: (source: string, options: unknown) => {
      const ast = actual.parse(source, options) as { body: unknown[] }
      ast.body.push({
        type: 'FunctionDeclaration',
        id: { type: 'Identifier', name: 'extra', start: 0, end: 0 },
        start: 0,
        end: 0,
      })
      ast.body.push(null)
      return ast
    },
  }))
  try {
    const { renderHasRouteDecision: renderMalformedPolicy } =
      await import('../../../../scripts/repo/gen/has-route-decision.mts')
    await expect(renderMalformedPolicy()).rejects.toThrow()
  } finally {
    vi.doUnmock('@ultrathink/acorn.rs.wasm')
  }
})
