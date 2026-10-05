import { parse } from 'acorn'
import type { Node, VariableDeclarator, Literal } from 'acorn'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { registerLegacy } from '../common/legacy.mts'

test('generated identifiers restart for each compilation and remain unique when nested', t => {
  const { window } = new JSDOM(
    '<main><p class="a b"><i class="a b"></i></p><p class="a"><i class="a b"></i></p></main>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const selector = ':not(:nth-child(2)):is(.a.b, :not(.missing))'
  const first = engine.compile(selector, true, false)!
  const firstAst = parseResolver(first)
  engine.configure({}, true)
  const second = engine.compile(selector, true, false)!
  expect(parseResolver(second)).toEqual(firstAst)
  expect(engine.select(selector, window.document)).toEqual(
    Array.from(window.document.querySelectorAll(selector)),
  )
  expect(engine.match(selector, window.document.querySelector('i')!)).toBe(
    window.document.querySelector('i')!.matches(selector),
  )
})

test('nested inline class predicates hoist regex constants before candidate loops', t => {
  const { window } = new JSDOM('<main><p class="a b"></p></main>')
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const resolver = engine.compile(':is(.a.b):where(.a)', true, false)!
  const ast = parseResolver(resolver)
  const constants: Array<{ pattern: string; inLoop: boolean }> = []
  walk(ast, (node, inLoop) => {
    if (node.type !== 'VariableDeclarator') {
      return
    }
    const declaration = node as VariableDeclarator
    if (
      declaration.id.type !== 'Identifier' ||
      !declaration.id.name.startsWith('_c')
    ) {
      return
    }
    const value = declaration.init as Literal
    expect(value.type).toBe('Literal')
    expect(value.regex).toBeDefined()
    constants.push({ pattern: value.regex!.pattern, inLoop })
  })
  expect(constants).toHaveLength(2)
  expect(new Set(constants.map(value => value.pattern)).size).toBe(2)
  expect(constants.every(value => !value.inLoop)).toBe(true)
  expect(engine.select(':is(.a.b):where(.a)', window.document)).toEqual(
    Array.from(window.document.querySelectorAll(':is(.a.b):where(.a)')),
  )
})

test('validation-only compilation does not perturb resolver names', t => {
  const { window } = new JSDOM('<main><p class="a"></p></main>', {
    url: 'https://example.test/',
  })
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  const first = engine.compile(':not(:nth-child(2))', true, false)!
  const firstAst = parseResolver(first)
  engine.compile(':is(:not(:nth-child(3)))', true, false)
  engine.configure({}, true)
  const second = engine.compile(':not(:nth-child(2))', true, false)!
  expect(parseResolver(second)).toEqual(firstAst)
  expect(engine.select(':not(:nth-child(2))', window.document)).toEqual(
    Array.from(window.document.querySelectorAll(':not(:nth-child(2))')),
  )
})

test('nested compiler extension reentry preserves identifiers across modes and legacy execution', t => {
  const { window } = new JSDOM(
    '<main><p class="a"></p><p class="a"></p></main>',
    {
      url: 'https://example.test/',
    },
  )
  t.onTestFinished(() => window.close())
  const engine = registerLegacy(factory(window))
  let reentered = false
  engine.registerSelector('reenter', /^:(reenter)(.*)/, (match, source) => {
    if (!reentered) {
      reentered = true
      engine.compile(':not(:nth-child(3))', true, false)
    }
    return { source, status: true, match }
  })
  for (const legacy of [false, true]) {
    engine.configure({ LEGACY: legacy }, true)
    const selector = ':not(:nth-child(3)):reenter'
    const first = engine.compile(selector, true, true)!
    const firstAst = parseResolver(first)
    engine.configure({}, true)
    reentered = false
    const second = engine.compile(selector, true, true)!
    expect(parseResolver(second)).toEqual(firstAst)
    expect(
      second(
        Array.from(window.document.querySelectorAll('p')),
        () => false,
        window.document,
        [],
      ),
    ).toEqual(Array.from(window.document.querySelectorAll('p')))
    expect(engine.match(selector, window.document.querySelector('p')!)).toBe(
      true,
    )
  }
})

function parseResolver(resolver: (...args: never[]) => unknown) {
  return parse('(' + resolver.toString() + ')', { ecmaVersion: 'latest' })
}

function walk(
  value: unknown,
  visit: (node: Node, inLoop: boolean) => void,
  inLoop = false,
): void {
  if (!value || typeof value !== 'object') {
    return
  }
  if (Array.isArray(value)) {
    value.forEach(item => walk(item, visit, inLoop))
    return
  }
  if (typeof Reflect.get(value, 'type') === 'string') {
    const node = value as Node
    inLoop ||= /^(?:For|While|DoWhile)/.test(node.type)
    visit(node, inLoop)
  }
  Object.values(value).forEach(child => walk(child, visit, inLoop))
}
