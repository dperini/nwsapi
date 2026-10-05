import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import { compileProbe } from '../../../../../scripts/repo/bench/planner/has/evidence.mts'
import { fixtures } from '../../../../../scripts/repo/bench/planner/has/fixtures.mts'
import {
  adaptiveBundle,
  adaptiveVariants,
} from '../../../../../scripts/repo/bench/planner/adaptive/variants.mts'

test('adaptive continuations preserve ordered results across shapes and mutation', () => {
  const selected = fixtures().filter(entry =>
    [
      'nested-32-4-plain',
      'flat-32-4-filtered',
      'external-32-4-plain',
      'ragged-32-1-filtered',
      'flat-32-0-plain',
      'small-8-4-plain',
      'clustered-32-1-plain',
      'mixed-32-4-filtered',
    ].includes(entry.id),
  )
  const factories = adaptiveVariants().map(compileProbe)
  for (const entry of selected) {
    for (const factory of factories) {
      const { window } = new JSDOM(entry.html)
      try {
        const doc = window.document
        const engine = factory(window)
        const check = () => {
          expect(
            Array.from(engine.select(entry.selector, doc)),
            entry.id,
          ).toEqual(Array.from(doc.querySelectorAll(entry.selector)))
        }
        check()
        check()
        const witness = doc.querySelector('.witness')
        if (witness) {
          doc.body.append(witness)
          check()
          witness.setAttribute('data-ok', '0')
          check()
          witness.remove()
          check()
        }
        const first = doc.querySelector('.card')
        first?.append(
          Object.assign(doc.createElement('i'), { className: 'witness' }),
        )
        check()
      } finally {
        window.close()
      }
    }
  }
}, 30_000)

test('forced prefix continuations see identical useful observations', () => {
  const entry = fixtures().find(value => value.id === 'nested-32-4-plain')!
  const observations: unknown[] = []
  for (const mode of ['prefix-continue', 'prefix-switch'] as const) {
    const factory = compileProbe(adaptiveBundle(mode, 4, true)) as ReturnType<
      typeof compileProbe
    > & {
      observations(): number[][]
      resetObservations(): void
    }
    const { window } = new JSDOM(entry.html)
    try {
      const engine = factory(window)
      engine.select(entry.selector, window.document)
      factory.resetObservations()
      const result = engine.select(entry.selector, window.document)
      expect(result).toEqual(
        Array.from(window.document.querySelectorAll(entry.selector)),
      )
      expect(factory.observations()).toHaveLength(1)
      expect(factory.observations()[0]![1]).toBe(4)
      observations.push(factory.observations())
    } finally {
      window.close()
    }
  }
  expect(observations[0]).toEqual(observations[1])
})
