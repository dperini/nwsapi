import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { transformSync } from '@swc/core'
import {
  renderTypeUnionRouteDecision,
  writeTypeUnionRouteDecision,
} from '../../../../scripts/repo/gen/type-union-route-decision.mts'

const repository = path.resolve('.')
const input = path.join(
  repository,
  'assets/repo/bench/planner-2026-10-03/shared-model.json',
)
const roots: string[] = []

afterEach(() => {
  const temporaryRoots = roots.splice(0)
  const rootCount = temporaryRoots.length
  for (let index = 0; index < rootCount; index += 1) {
    rmSync(temporaryRoots[index]!, { recursive: true, force: true })
  }
})

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-union-route-'))
  roots.push(directory)
  return directory
}

async function importGenerated(source: string) {
  const javascript = transformSync(source, {
    filename: 'route.mts',
    jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
    module: { type: 'es6' },
  }).code
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
  ) as Promise<{
    typeUnionModelId: string
    chooseBroad: (count: number, total: number, arity: number) => boolean
  }>
}

test('the generated type-union decision matches its saved experimental expression', async () => {
  const generated = await importGenerated(await renderTypeUnionRouteDecision())
  const reference = (await import(
    path.join(
      repository,
      'assets/repo/bench/planner-2026-10-03/shared-model.mjs',
    )
  )) as {
    chooseBroad: (count: number, total: number, arity: number) => boolean
  }

  expect(generated.typeUnionModelId).toBe('planner-2026-10-03')
  const featureCases: Array<[number, number, number]> = [
    [2, 131, 2],
    [455, 1155, 6],
    [500, 1000, 2],
    [2, 131, 4],
    [900, 1200, 6],
  ]
  const featureCount = featureCases.length
  for (let index = 0; index < featureCount; index += 1) {
    const features = featureCases[index]!
    expect(generated.chooseBroad(...features)).toBe(
      reference.chooseBroad(...features),
    )
  }
})

test('generation writes reproducible output and rejects stale checks', async () => {
  const directory = temporaryDirectory()
  const fixture = path.join(directory, 'model.json')
  const output = path.join(directory, 'generated', 'route.mts')
  writeFileSync(fixture, readFileSync(input, 'utf8'))

  await writeTypeUnionRouteDecision({ input: fixture, output })
  await expect(
    writeTypeUnionRouteDecision({ check: true, input: fixture, output }),
  ).resolves.toBeUndefined()
  writeFileSync(output, 'stale')
  await expect(
    writeTypeUnionRouteDecision({ check: true, input: fixture, output }),
  ).rejects.toThrow('stale')
  await writeTypeUnionRouteDecision({ input: fixture, output })
  const emitted = await importGenerated(readFileSync(output, 'utf8'))
  const reference = (await import(
    pathToFileURL(
      path.join(
        repository,
        'assets/repo/bench/planner-2026-10-03/shared-model.mjs',
      ),
    ).href
  )) as {
    chooseBroad: (count: number, total: number, arity: number) => boolean
  }
  expect(emitted.chooseBroad(455, 1155, 6)).toBe(
    reference.chooseBroad(455, 1155, 6),
  )
})

test('generation rejects model data without a guarded route expression', async () => {
  const directory = temporaryDirectory()
  const fixture = path.join(directory, 'model.json')
  writeFileSync(fixture, JSON.stringify({ model: { broad: false } }))
  await expect(renderTypeUnionRouteDecision(fixture)).rejects.toThrow(
    'missing its guarded expression',
  )
})
