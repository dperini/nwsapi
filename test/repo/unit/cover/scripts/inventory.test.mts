import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { scriptInventory } from '../../../../../scripts/repo/cover/scripts/inventory.mts'
import { fixture } from './fixture/input.mts'

test('inventory includes nested Node scripts, generated scripts and Python trainers', () => {
  const input = fixture()
  mkdirSync(path.join(input.root, 'scripts/nested'))
  const names = [
    'nested/data.generated.mjs',
    'tool.js',
    'trainer.py',
    'notes.txt',
  ]
  names.forEach(name =>
    writeFileSync(path.join(input.root, 'scripts', name), ''),
  )
  const inventory = scriptInventory(input.root)
  expect(inventory.node.map(file => path.relative(input.root, file))).toEqual([
    'scripts/nested/data.generated.mjs',
    'scripts/run.mts',
    'scripts/tool.js',
  ])
  expect(inventory.python.map(file => path.relative(input.root, file))).toEqual(
    ['scripts/trainer.py'],
  )
})
