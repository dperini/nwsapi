import type { Ct2Translator as NativeCt2Translator } from 'ctranslate2'
import { createRequire } from 'node:module'
import { availableParallelism } from 'node:os'
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'

const require = createRequire(import.meta.url)

export type Translate = (texts: string[]) => Promise<string[]>
export const SLOT_PATTERN = /ZXQ\d+QXZ|\{[A-Za-z]\w*\}/g
export const MAX_PASSAGE_CHARACTERS = 400

export function slots(text: string) {
  return [...text.matchAll(SLOT_PATTERN)].map(match => match[0]).toSorted()
}

export function sameSlots(source: string, translated: string) {
  return JSON.stringify(slots(source)) === JSON.stringify(slots(translated))
}

export function pendingTranslations(
  requests: string[],
  cache: Record<string, string>,
) {
  return requests
    .filter(
      text => !Object.hasOwn(cache, text) || !sameSlots(text, cache[text]!),
    )
    .toSorted((a, b) => a.length - b.length)
}

// The native binding does not expose max_input_length/max_decoding_length.
// Bound inputs at sentence/word boundaries instead of silently truncating a long passage.
export function splitPassage(
  text: string,
  limit = MAX_PASSAGE_CHARACTERS,
): string[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Passage limit must be positive.')
  }
  const parts: string[] = []
  let remaining = text
  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit)
    const sentence = [...candidate.matchAll(/[.!?]\s+/g)].at(-1)
    const whitespace = [...candidate.matchAll(/\s+/g)].at(-1)
    const boundary = sentence ?? whitespace
    const end = boundary ? boundary.index + boundary[0].length : limit
    // Do not cut a protected slot or a Unicode surrogate pair in half.
    const slot = [...remaining.matchAll(SLOT_PATTERN)].find(
      match => match.index < end && match.index + match[0].length > end,
    )
    let cut = slot ? slot.index + slot[0].length : end
    if (/[\uD800-\uDBFF]/.test(remaining[cut - 1]!)) {
      cut++
    }
    parts.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut)
  }
  if (remaining) {
    parts.push(remaining)
  }
  return parts
}

export function retainWhitespace(source: string, translated: string) {
  if (!source.trim()) {
    return source
  }
  return `${source.match(/^\s*/)?.[0] ?? ''}${translated.trim()}${source.match(/\s*$/)?.[0] ?? ''}`
}

export async function translatePassages(texts: string[], translate: Translate) {
  const groups = texts.map(text => splitPassage(text))
  const pieces = groups.flat()
  const translated = await translate(pieces)
  if (translated.length !== pieces.length) {
    throw new Error('Translation result count does not match input.')
  }
  if (
    translated.some(
      (text, index) =>
        typeof text !== 'string' || (pieces[index]!.trim() && !text.trim()),
    )
  ) {
    throw new Error('Translation returned empty text for a nonempty passage.')
  }
  let offset = 0
  return groups.map(group =>
    group.map(piece => retainWhitespace(piece, translated[offset++]!)).join(''),
  )
}

export async function retainSlots(
  source: string,
  translated: string,
  translate: Translate,
) {
  const repaired = translated.replace(
    /Z\s*X\s*Q\s*(\d+)\s*Q\s*X\s*Z/g,
    'ZXQ$1QXZ',
  )
  if (sameSlots(source, repaired)) {
    return repaired
  }
  const pieces = source.split(/(ZXQ\d+QXZ|\{[A-Za-z]\w*\})/g)
  const prose = pieces.filter(
    piece => piece.trim() && !/^(ZXQ\d+QXZ|\{[A-Za-z]\w*\})$/.test(piece),
  )
  const mapped = await translatePassages(prose, translate)
  let index = 0
  const result = pieces
    .map(piece =>
      !piece.trim() || /^(ZXQ\d+QXZ|\{[A-Za-z]\w*\})$/.test(piece)
        ? piece
        : retainWhitespace(piece, mapped[index++]!),
    )
    .join('')
  if (!sameSlots(source, result)) {
    throw new Error('Translation changed protected placeholders.')
  }
  return result
}

export function validateModel(root: string) {
  const model = path.join(root, '.cache/guide-translation-model')
  const config = JSON.parse(
    readFileSync(
      path.join(root, '.config/docs-translation/model.json'),
      'utf8',
    ),
  ) as Record<string, unknown>
  const files = [
    'model.bin',
    'config.json',
    'shared_vocabulary.json',
    'source.spm',
    'target.spm',
    'model-source.json',
  ]
  if (!files.every(file => existsSync(path.join(model, file)))) {
    throw new Error(
      'Pinned translation model is missing. Run pnpm run docs:translate:setup.',
    )
  }
  const saved = JSON.parse(
    readFileSync(path.join(model, 'model-source.json'), 'utf8'),
  ) as Record<string, unknown>
  if (
    Object.keys(config).length !== Object.keys(saved).length ||
    Object.entries(config).some(([key, value]) => saved[key] !== value)
  ) {
    throw new Error(
      'Translation model does not match its pin. Run pnpm run docs:translate:setup.',
    )
  }
  return model
}

export function nativeTranslator(modelPath: string): Translate {
  const { Ct2Translator } = require('ctranslate2') as {
    Ct2Translator: typeof NativeCt2Translator
  }
  const translator = new Ct2Translator({
    modelPath,
    device: 'cpu',
    threads: Math.min(4, availableParallelism()),
  })
  return async texts => {
    if (!texts.length) {
      return []
    }
    const output = await translator.translateBatch(texts, {
      beamSize: 4,
      maxBatchSize: 24,
    })
    return output.map(result => result.text)
  }
}

export function saveTranslations(
  file: string,
  translations: Record<string, string>,
) {
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(translations, null, 2) + '\n')
  renameSync(temporary, file)
}

export async function runTranslations(
  root = REPO_ROOT,
  createTranslator: (modelPath: string) => Translate = nativeTranslator,
) {
  const model = validateModel(root)
  const directory = path.join(root, '.cache/docs-localization')
  const output = path.join(directory, 'translations.json')
  const cache = existsSync(output)
    ? (JSON.parse(readFileSync(output, 'utf8')) as Record<string, string>)
    : {}
  const requests = JSON.parse(
    readFileSync(path.join(directory, 'requests.json'), 'utf8'),
  ) as string[]
  const pending = pendingTranslations(requests, cache)
  if (!pending.length) {
    console.log('Translations are current.')
    return
  }
  const translate = createTranslator(model)
  mkdirSync(directory, { recursive: true })
  for (let offset = 0; offset < pending.length; offset += 24) {
    const batch = pending.slice(offset, offset + 24)
    const results = await translatePassages(batch, translate)
    for (const [index, source] of batch.entries()) {
      cache[source] = await retainSlots(source, results[index]!, translate)
    }
    saveTranslations(output, cache)
    console.log(
      `Translated ${Math.min(offset + 24, pending.length)}/${pending.length} new passages`,
    )
  }
}
