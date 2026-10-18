import type { Page } from '@playwright/test'
import type { NativeGlobals } from './host.mts'

export interface TimingOptions {
  html: string
  selectors: Array<{ category: string; selector: string; root?: string }>
  rounds: number
  iterations: number
  minRoundMs: number
  first: boolean
  coldCount: number
}

export async function nativeTiming(page: Page, options: TimingOptions) {
  return page.evaluate(
    ({ html, selectors, rounds, iterations, minRoundMs, first, coldCount }) => {
      const host = window as unknown as NativeGlobals
      const oracle = host.__createContext(html, 0, false)
      const oracleNodes = Array.from(oracle.document.getElementsByTagName('*'))
      let consumed = 0
      const rows = []
      const median = (values: number[]) =>
        values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? null
      const calibrateBatch = (
        query: () => void,
        maximum: number,
        minimumRoundMs: number,
      ) => {
        let batchSize = Math.min(maximum, 4)
        const start = performance.now()
        for (let i = 0; i < batchSize; ++i) {
          query()
        }
        const duration = performance.now() - start
        if (duration > 0) {
          batchSize = Math.max(
            1,
            Math.min(
              maximum,
              Math.floor(
                (batchSize * Math.max(1, minimumRoundMs / 8)) / duration,
              ),
            ),
          )
        }
        return batchSize
      }
      try {
        for (const { category, selector, root: rootSelector } of selectors) {
          const oracleRoot = rootSelector
            ? oracle.document.querySelector(rootSelector)
            : oracle.document
          if (!oracleRoot) {
            throw new Error(`Missing query root: ${rootSelector}`)
          }
          const expected = Array.from(
            oracleRoot.querySelectorAll(selector),
            node => oracleNodes.indexOf(node),
          )
          const samples: number[][] = [[], []]
          const coldSamples: number[][] = [[], []]
          const sampleIterations: number[][] = [[], []]
          const errors: Array<string | null> = [null, null]
          const runEngine = (index: number) => {
            const contexts = Array.from({ length: first ? coldCount : 1 }, () =>
              host.__createContext(html, index),
            )
            const roots = contexts.map(context =>
              rootSelector
                ? context.document.querySelector(rootSelector)
                : context.document,
            )
            const expectedNodes = contexts.map(context => {
              const nodes = Array.from(
                context.document.getElementsByTagName('*'),
              )
              return expected.map(position => nodes[position]!)
            })
            try {
              if (first) {
                // Batch cold calls to exceed the browser timer's precision.
                // Every call gets a separately initialized engine/document.
                const results: Array<Element | null> = Array.from(
                  { length: contexts.length },
                  () => null,
                )
                const start = performance.now()
                for (let i = 0; i < contexts.length; i++) {
                  results[i] = contexts[i]!.first(selector)
                }
                const duration = performance.now() - start
                if (
                  results.some(
                    (node, i) => node !== (expectedNodes[i]![0] ?? null),
                  )
                ) {
                  throw new Error('cold result mismatch')
                }
                coldSamples[index]!.push(duration / contexts.length)
              }
              const context = contexts[0]!
              const expectedFirst = expectedNodes[0]![0] ?? null
              const verify = () => {
                if (first) {
                  return context.first(selector, roots[0]!) === expectedFirst
                }
                const actual = Array.from(context.all(selector, roots[0]!))
                return (
                  actual.length === expectedNodes[0]!.length &&
                  actual.every((node, i) => node === expectedNodes[0]![i])
                )
              }
              if (!verify()) {
                throw new Error('result mismatch')
              }
              const query = first
                ? () => {
                    consumed += context.first(selector, roots[0]!) ? 1 : 0
                  }
                : () => {
                    consumed += context.all(selector, roots[0]!).length
                  }
              const batchSize = calibrateBatch(query, iterations, minRoundMs)
              const warmupStart = performance.now()
              do {
                for (let i = 0; i < batchSize; i++) {
                  query()
                }
              } while (performance.now() - warmupStart < 20)
              let calls = 0
              const start = performance.now()
              do {
                for (let i = 0; i < batchSize; i++) {
                  query()
                }
                calls += batchSize
              } while (performance.now() - start < minRoundMs)
              samples[index]!.push((performance.now() - start) / calls)
              sampleIterations[index]!.push(calls)
              if (!verify()) {
                throw new Error('warm result mismatch')
              }
            } catch (error) {
              errors[index] = String(error)
              samples[index] = []
              coldSamples[index] = []
            } finally {
              for (const context of contexts) {
                context.frame.remove()
              }
            }
          }
          for (let round = 0; round < rounds; round++) {
            for (let turn = 0; turn < 2; turn++) {
              const index = (round + turn) % 2
              if (errors[index]) {
                continue
              }
              runEngine(index)
            }
          }
          rows.push({
            category,
            selector,
            ...(rootSelector ? { root: rootSelector } : {}),
            errors,
            samples,
            sampleIterations,
            milliseconds: samples.map(median),
            coldSamples,
            cold: coldSamples.map(median),
          })
        }
      } finally {
        oracle.frame.remove()
      }
      return { rows, consumed }
    },
    options,
  )
}
