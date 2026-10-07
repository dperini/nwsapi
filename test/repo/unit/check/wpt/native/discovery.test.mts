import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import {
  discoveryMetadata,
  discoverNative,
} from '../../../../../../scripts/repo/check/wpt/native/discovery.mts'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((_command: string, args: string[]) =>
    args.includes('rev-parse') ? 'revision\n' : '',
  ),
}))

test('discovers selector links, APIs, validity helpers and unparsed scripts', () => {
  const result = discoveryMetadata(
    '<link rel="help" href="https://drafts.csswg.org/selectors-4/"><script>test_valid_selector(":has(*)"); document.querySelector("div")</script><script>const =</script><script src="helper.js"></script>',
    'page.html',
  )
  expect(result.reasons).toHaveLength(4)
  expect(result.dependencies).toEqual(['helper.js'])
  expect(
    discoveryMetadata('<script>const x = 1</script>', 'plain.html').reasons,
  ).toEqual([])
})

test('follows local script dependencies, handles cycles and reviews missing resources', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-discovery-'))
  try {
    mkdirSync(path.join(root, 'css'))
    writeFileSync(
      path.join(root, 'MANIFEST.json'),
      JSON.stringify({
        items: {
          testharness: {
            css: {
              'page.html': ['hash', ['/css/page.html', {}]],
              'plain.html': ['hash', ['/css/plain.html', {}]],
            },
          },
        },
      }),
    )
    writeFileSync(
      path.join(root, 'css/page.html'),
      '<script src="helper.js"></script><script src="missing.js"></script><script src="http://["></script><script src="https://example.test/external.js"></script><script src="/resources/testharness.js"></script>',
    )
    writeFileSync(
      path.join(root, 'css/helper.js'),
      '// META: script=helper.js\ndocument.querySelector("div")',
    )
    writeFileSync(
      path.join(root, 'css/plain.html'),
      '<script>const plain = true</script>',
    )
    const result = discoverNative(root, 'revision')
    expect(result.scanned).toBe(2)
    expect(result.filesRead).toBe(3)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      test: '/css/page.html',
      file: 'css/page.html',
    })
    expect(result.candidates[0]?.reasons).toHaveLength(3)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
