import { afterAll } from 'vitest'
import { fuzz } from '@vitiate/core'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'

// Vitiate replay reads per-target detector options, not plugin defaults.
// The unsafe-eval substring detector also flags correctly escaped literals.
const compilerFuzzOptions = {
  detectors: { prototypePollution: true, unsafeEval: false },
}

const dom = new JSDOM(
  '<!doctype html><main><section class="a"><p id="one" class="item" data-value="a">one</p><p class="item b" data-value="b">two</p><div><span class="b"></span></div></section><section class="b"><p class="item">three</p></section></main>',
)
const { document } = dom.window
const engine = factory(dom.window)
afterAll(() => dom.window.close())

function check(selector: string) {
  const expected = Array.from(document.querySelectorAll(selector))
  const actual = Array.from(engine.select(selector, document))
  if (
    actual.length !== expected.length ||
    actual.some((element, i) => element !== expected[i])
  ) {
    throw new Error(`Selector disagreement: ${JSON.stringify(selector)}`)
  }
  if (engine.first(selector, document) !== (expected[0] ?? null)) {
    throw new Error(`First-match disagreement: ${JSON.stringify(selector)}`)
  }
  for (const element of document.getElementsByTagName('*')) {
    if (engine.match(selector, element) !== expected.includes(element)) {
      throw new Error(`Match disagreement: ${JSON.stringify(selector)}`)
    }
  }
}

// Coverage-guided bytes choose valid grammar productions. The DOM oracle is
// independent; mutation forces cache invalidation between identical queries.
fuzz(
  'generated selectors agree before and after DOM mutation',
  data => {
    const simple = [
      '*',
      'p',
      'section',
      '.item',
      '.a',
      '.b',
      '#one',
      '[data-value]',
      '[data-value="a"]',
      '[data-value="vitiate_eval_inject"]',
    ]
    const pick = (offset: number) =>
      simple[(data[offset] ?? 0) % simple.length]!
    const left = pick(0)
    const right = pick(1)
    const nth = ((data[3] ?? 0) % 5) + 1
    const choices = [
      left,
      `${left} ${right}`,
      `${left} > ${right}`,
      `${left} + ${right}`,
      `${left} ~ ${right}`,
      `${left}, ${right}`,
      `${left}:not(${right})`,
      `:is(${left}, ${right})`,
      `:where(${left}, ${right})`,
      `${left}:nth-child(${nth})`,
      `${left}:nth-child(2n+1)`,
      `${left}:has(> ${right})`,
    ]
    const selector = choices[(data[2] ?? 0) % choices.length]!
    check(selector)
    const node = document.createElement('p')
    node.className = 'item b'
    node.setAttribute('data-value', 'a')
    document.getElementsByTagName('section')[0]!.appendChild(node)
    try {
      check(selector)
    } finally {
      node.remove()
    }
    check(selector)
  },
  compilerFuzzOptions,
)

fuzz(
  'arbitrary selector bytes cannot crash the parser',
  data => {
    const selector = data.toString('utf8')
    try {
      const all = engine.select(selector, document)
      const first = engine.first(selector, document)
      if (first !== (all[0] ?? null) || new Set(all).size !== all.length) {
        throw new Error(
          `Inconsistent selector result: ${JSON.stringify(selector)}`,
        )
      }
    } catch (error) {
      // Invalid selector syntax is expected; internal runtime errors are bugs.
      if (
        !(
          error instanceof dom.window.DOMException &&
          error.name === 'SyntaxError'
        )
      ) {
        throw error
      }
    }
  },
  compilerFuzzOptions,
)
