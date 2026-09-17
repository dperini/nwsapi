import assert from 'node:assert/strict'
import { test } from 'vitest'

import { completePlan, planCiTests } from '../../../../scripts/repo/test/ci.mts'

test('an unavailable comparison runs every lane', () => {
  assert.deepEqual(completePlan(), {
    browser: true,
    fullNode: true,
    fuzz: true,
    node: true,
    package: true,
    relatedFiles: [],
    testFiles: [],
  })
})

test('documentation changes do not schedule runtime lanes', () => {
  assert.deepEqual(planCiTests(['docs/repo/testing/performance.md']), {
    browser: false,
    fullNode: false,
    fuzz: false,
    node: false,
    package: false,
    relatedFiles: [],
    testFiles: [],
  })
})

test('source changes schedule every runtime contract and full Node tests', () => {
  assert.deepEqual(planCiTests(['src/core/initialize/load.mts']), {
    browser: true,
    fullNode: true,
    fuzz: true,
    node: true,
    package: true,
    relatedFiles: [],
    testFiles: [],
  })
})

test('workflow and local action changes exercise every runtime lane', () => {
  for (const file of [
    '.github/workflows/node.js.yml',
    '.github/actions/repo/upload-artifact/action.yml',
    'scripts/repo/ci/artifact/upload.mts',
  ]) {
    const plan = planCiTests([file])
    for (const lane of [
      'node',
      'fullNode',
      'browser',
      'package',
      'fuzz',
    ] as const) {
      assert.equal(plan[lane], true, `${file}: ${lane}`)
    }
  }
})

test('a changed Node test runs only its tier', () => {
  const plan = planCiTests(['test/repo/unit/selector-comments.test.mts'])
  assert.equal(plan.node, true)
  assert.equal(plan.fullNode, false)
  assert.equal(plan.browser, false)
  assert.deepEqual(plan.testFiles, [
    'test/repo/unit/selector-comments.test.mts',
  ])
  assert.deepEqual(plan.relatedFiles, [])
})

test('changed helpers and repository scripts use dependency-related tests', () => {
  assert.deepEqual(
    planCiTests(['test/repo/integration/fixture/selector.mts']).relatedFiles,
    ['test/repo/integration/fixture/selector.mts'],
  )
  assert.deepEqual(
    planCiTests(['scripts/repo/lib/test-budget.mts']).relatedFiles,
    ['scripts/repo/lib/test-budget.mts'],
  )
})

test('browser and package fixtures select their distinct lanes', () => {
  assert.equal(
    planCiTests(['test/repo/e2e/selector-comments-browser.test.mts']).browser,
    true,
  )
  assert.equal(
    planCiTests(['test/repo/e2e/jsdom-adapter-package.mts']).package,
    true,
  )
})

test('Node provisioning and consumer changes run package interoperability', () => {
  for (const file of [
    '.config/node-interop.json',
    '.github/workflows/node.js.yml',
    'scripts/repo/node.mts',
    'scripts/repo/setup/tools.mts',
    'scripts/repo/setup/download.mts',
    'scripts/repo/external-tools.mts',
    '.config/external-tools.json',
    '.github/workflows/coverage.yml',
    'test/repo/e2e/fixture/node-interop.mts',
  ]) {
    assert.equal(planCiTests([file]).package, true, file)
  }
})
