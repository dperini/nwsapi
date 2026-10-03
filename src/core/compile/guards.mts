import { parsePure, pureCompiler, pureCompound, pureSelector } from './pure.mts'
import type { EngineState } from '../state/types.mts'

export function orderGuards(engine: EngineState, selector: string) {
  if (
    !pureCompiler(engine) ||
    selector.length > 512 ||
    !/[\[:]/.test(selector)
  ) {
    return selector
  }
  const parts = parsePure(selector)
  if (parts) {
    return parts.compounds
      .map(part => orderCompound(engine, part))
      .map((part, index) => (index ? parts.relations[index - 1] : '') + part)
      .join('')
  }
  const pseudo =
    /^(.*)(:(has|is|where|not|nth-child|nth-last-child|nth-of-type|nth-last-of-type)\((.*)\))$/.exec(
      selector,
    )
  if (
    !pseudo ||
    !pureCompound(pseudo[1]!) ||
    !pureArgument(engine, pseudo[3]!, pseudo[4]!)
  ) {
    return selector
  }
  const compound = orderCompound(engine, pseudo[1]!)
  const type = /^(?:[a-zA-Z][-\w]*|\*)/.exec(compound)?.[0] || ''
  return type + pseudo[2] + compound.slice(type.length)
}

function pureArgument(engine: EngineState, name: string, argument: string) {
  if (name.slice(0, 4) === 'nth-') {
    return /^(?:even|odd|[+-]?\d+|[+-]?\d*n(?:\s*[+-]\s*\d+)?)$/.test(argument)
  }
  return engine
    .splitList(argument)
    .every(branch =>
      pureSelector(
        name === 'has' && /^[>+~]/.test(branch) ? '*' + branch : branch,
      ),
    )
}

function orderCompound(engine: EngineState, compound: string) {
  const pieces = compound.match(
    /\[(?:"[^"]*"|'[^']*'|[^\]])*\]|[.#][_a-zA-Z][-\w]*|[a-zA-Z][-\w]*|\*/g,
  )!
  const seen: Record<string, boolean> = engine.primordials.ObjectCreate(null)
  const buckets = ['', '', '', '']
  for (let index = 0, length = pieces.length; index < length; ++index) {
    const piece = pieces[index]!
    if (!seen[piece]) {
      seen[piece] = true
      const bucket =
        piece[0] === '[' ? 1 : piece[0] === '.' ? 2 : piece[0] === '#' ? 3 : 0
      buckets[bucket] += piece
    }
  }
  // Continuations wrap in reverse order, so the cheapest guards go last.
  return buckets.join('')
}
