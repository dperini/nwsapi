import type { Page } from '@playwright/test'
import type { NativeGlobals } from './native-host.mts'

export interface TimingOptions {
  html: string
  selectors: Array<{ category: string; selector: string }>
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
      try {
        for (const { category, selector } of selectors) {
          const expected = Array.from(
            oracle.document.querySelectorAll(selector),
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
                  return context.first(selector) === expectedFirst
                }
                const actual = Array.from(context.all(selector))
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
                    consumed += context.first(selector) ? 1 : 0
                  }
                : () => {
                    consumed += context.all(selector).length
                  }
              const warmupStart = performance.now()
              do {
                for (let i = 0; i < iterations; i++) {
                  query()
                }
              } while (performance.now() - warmupStart < 20)
              let calls = 0
              const start = performance.now()
              do {
                for (let i = 0; i < iterations; i++) {
                  query()
                }
                calls += iterations
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
