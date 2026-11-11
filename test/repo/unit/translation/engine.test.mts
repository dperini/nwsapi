import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import {
  pendingTranslations,
  retainSlots,
  sameSlots,
  splitPassage,
  translatePassages,
  validateModel,
  runTranslations,
} from '../../../../scripts/repo/translation/engine.mts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

export function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'native-translation-'))
  roots.push(root)
  const model = path.join(root, '.cache/guide-translation-model')
  const config = path.join(root, '.config/docs-translation')
  const cache = path.join(root, '.cache/docs-localization')
  for (const dir of [model, config, cache]) {
    mkdirSync(dir, { recursive: true })
  }
  const pin = {
    model: 'example',
    revision: 'abc',
    quantization: 'int8',
    format: 'CTranslate2',
  }
  writeFileSync(path.join(config, 'model.json'), JSON.stringify(pin))
  writeFileSync(path.join(model, 'model-source.json'), JSON.stringify(pin))
  for (const name of [
    'model.bin',
    'config.json',
    'shared_vocabulary.json',
    'source.spm',
    'target.spm',
  ]) {
    writeFileSync(path.join(model, name), '')
  }
  return { root, model, cache }
}

test('only absent or placeholder-invalid translations are retried', () => {
  expect(
    pendingTranslations(['done', 'new', 'use {name}', 'two ZXQ0QXZ ZXQ0QXZ'], {
      done: 'finito',
      'use {name}': 'usa {other}',
      'two ZXQ0QXZ ZXQ0QXZ': 'due ZXQ0QXZ',
    }),
  ).toEqual(['new', 'use {name}', 'two ZXQ0QXZ ZXQ0QXZ'])
})

test('long passages split without losing whitespace, slots, or Unicode', () => {
  const source = 'Hello world. Next sentence with ZXQ123QXZ and 🧙. '.repeat(20)
  const parts = splitPassage(source, 30)
  expect(parts.join('')).toBe(source)
  expect(parts.every(part => part.length <= 40)).toBe(true)
  expect(parts.every(part => !/[\uD800-\uDBFF]$/.test(part))).toBe(true)
  expect(splitPassage('aZXQ123456QXZ tail', 5)[0]).toBe('aZXQ123456QXZ')
})

test('slot repair normalizes model spacing and preserves repeated placeholders', async () => {
  const translate = vi.fn(async (texts: string[]) =>
    texts.map(text => text.trim().toUpperCase()),
  )
  expect(
    await retainSlots('Use ZXQ0QXZ.', 'Usa Z X Q 0 Q X Z.', translate),
  ).toBe('Usa ZXQ0QXZ.')
  expect(translate).not.toHaveBeenCalled()
  const source = 'Use {name} with ZXQ0QXZ and ZXQ0QXZ.'
  const result = await retainSlots(source, 'Perso.', translate)
  expect(result).toBe('USE {name} WITH ZXQ0QXZ AND ZXQ0QXZ.')
  expect(sameSlots(source, result)).toBe(true)
})

test('unexpected result counts fail instead of losing text', async () => {
  await expect(
    translatePassages(['one', 'two'], async () => ['uno']),
  ).rejects.toThrow('count')
})

test('model provenance mismatch fails before loading native code', () => {
  const { root, model } = fixture()
  expect(validateModel(root)).toBe(model)
  writeFileSync(path.join(model, 'model-source.json'), '{}')
  expect(() => validateModel(root)).toThrow('does not match')
})

test('completed batches survive failure and are skipped when resuming', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const { root, cache } = fixture()
  const requests = Array.from(
    { length: 25 },
    (_, i) => `line ${String(i).padStart(2, '0')}`,
  )
  writeFileSync(path.join(cache, 'requests.json'), JSON.stringify(requests))
  let calls = 0
  await expect(
    runTranslations(root, () => async texts => {
      if (++calls === 2) {
        throw new Error('interrupted')
      }
      return texts.map(text => `it: ${text}`)
    }),
  ).rejects.toThrow('interrupted')
  expect(
    Object.keys(
      JSON.parse(readFileSync(path.join(cache, 'translations.json'), 'utf8')),
    ),
  ).toHaveLength(24)
  const translate = vi.fn(async (texts: string[]) =>
    texts.map(text => `it: ${text}`),
  )
  await runTranslations(root, () => translate)
  expect(translate).toHaveBeenCalledExactlyOnceWith(['line 24'])
  const factory = vi.fn(() => translate)
  await runTranslations(root, factory)
  expect(factory).not.toHaveBeenCalled()
})

test('empty model output is rejected and whitespace-only input is preserved', async () => {
  await expect(translatePassages(['text'], async () => [''])).rejects.toThrow(
    'empty text',
  )
  expect(await translatePassages(['  '], async () => [''])).toEqual(['  '])
})
