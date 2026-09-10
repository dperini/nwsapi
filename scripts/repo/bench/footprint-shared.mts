import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { ENGINE_BUILD_PATH } from '../lib/paths.mts'

export const require = createRequire(import.meta.url)
// Benchmark versions are explicit dependencies, independent of jsdom's range.
export const competitorEntry = require.resolve('@asamuzakjp/dom-selector')
export const engineNames = ['NWSAPI', '@asamuzakjp/dom-selector'] as const
export const sha256 = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex')

export function provenance() {
  return {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    cpu: os.cpus()[0]?.model,
    jsdom: require('jsdom/package.json').version as string,
    candidateVersion: require('../../../package.json').version as string,
    candidateSha256: sha256(readFileSync(ENGINE_BUILD_PATH)),
    competitorVersion: require('@asamuzakjp/dom-selector/package.json')
      .version as string,
    lockfileSha256: sha256(
      readFileSync(new URL('../../../pnpm-lock.yaml', import.meta.url)),
    ),
  }
}

export function positiveInteger(value: string, name: string, max = 10_000) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new RangeError(`${name} must be an integer between 1 and ${max}.`)
  }
  return number
}

export function median(values: number[]) {
  if (!values.length || values.some(value => !Number.isFinite(value))) {
    throw new RangeError('Measurements must contain finite samples.')
  }
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function summarize(values: number[]) {
  return {
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    samples: values,
  }
}

export function kib(bytes: number) {
  return `${(bytes / 1024).toFixed(2)}KiB`
}
