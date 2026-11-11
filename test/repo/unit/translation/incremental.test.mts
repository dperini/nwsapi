import { afterEach, expect, test } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  DOCUMENT_CATALOG,
  STRING_CATALOG,
  translateIncremental,
} from '../../../../scripts/repo/translation/incremental.mts'

const roots: string[] = []
export function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'incremental-translation-'))
  roots.push(root)
  mkdirSync(path.join(root, 'docs'), { recursive: true })
  mkdirSync(path.dirname(path.join(root, DOCUMENT_CATALOG)), {
    recursive: true,
  })
  writeFileSync(path.join(root, 'README.md'), 'Unselected readme.\n')
  writeFileSync(path.join(root, 'docs/changed.md'), 'Open the documentation.\n')
  writeFileSync(
    path.join(root, 'docs/other.md'),
    'Do not translate this document.\n',
  )
  const other = { sha256: 'unchanged', text: 'Reviewed Italian text.' }
  writeFileSync(
    path.join(root, DOCUMENT_CATALOG),
    JSON.stringify({ 'docs/other.md': other, 'docs/deleted.md': other }),
  )
  writeFileSync(
    path.join(root, STRING_CATALOG),
    JSON.stringify({ 'Existing label': 'Etichetta esistente' }),
  )
  return { root, other }
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test('translates only changed sources and preserves unrelated catalog entries', async () => {
  const { root, other } = fixture()
  const seen: string[] = []
  const translated = await translateIncremental(
    ['docs/changed.md', 'docs/deleted.md'],
    root,
    async directory => {
      const cache = path.join(directory, '.cache/docs-localization')
      const requests = JSON.parse(
        readFileSync(path.join(cache, 'requests.json'), 'utf8'),
      ) as string[]
      seen.push(...requests)
      writeFileSync(
        path.join(cache, 'translations.json'),
        JSON.stringify(
          Object.fromEntries(requests.map(text => [text, `Italian: ${text}`])),
        ),
      )
    },
  )
  expect(translated).toEqual([DOCUMENT_CATALOG, STRING_CATALOG])
  expect(seen).toEqual(['Open the documentation.'])
  const documents = JSON.parse(
    readFileSync(path.join(root, DOCUMENT_CATALOG), 'utf8'),
  )
  expect(documents['docs/other.md']).toEqual(other)
  expect(documents['docs/deleted.md']).toBeUndefined()
  expect(documents['docs/changed.md'].text).toContain(
    'Italian: Open the documentation.',
  )
  expect(
    JSON.parse(readFileSync(path.join(root, STRING_CATALOG), 'utf8')),
  ).toEqual({ 'Existing label': 'Etichetta esistente' })
})

test('cached passages skip inference and non-source commits skip translation entirely', async () => {
  const { root } = fixture()
  mkdirSync(path.join(root, '.cache/docs-localization'), { recursive: true })
  writeFileSync(
    path.join(root, '.cache/docs-localization/translations.json'),
    JSON.stringify({ 'Open the documentation.': 'Apri la documentazione.' }),
  )
  let calls = 0
  const translate = async () => {
    calls++
  }
  await translateIncremental(['docs/changed.md'], root, translate)
  expect(
    await translateIncremental(['src/example.mts'], root, translate),
  ).toEqual([])
  expect(calls).toBe(0)
})

test('invalid translation output fails before publishing either catalog', async () => {
  const { root } = fixture()
  const original = readFileSync(path.join(root, DOCUMENT_CATALOG), 'utf8')
  await expect(
    translateIncremental(['docs/changed.md'], root, async () => {}),
  ).rejects.toThrow('Missing or invalid translation')
  expect(readFileSync(path.join(root, DOCUMENT_CATALOG), 'utf8')).toBe(original)
})
