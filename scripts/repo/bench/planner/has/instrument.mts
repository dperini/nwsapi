import { parse } from 'acorn'
import type { Route, RouteFacts } from './contract.mts'

interface Ast {
  type: string
  start: number
  end: number
  [key: string]: unknown
}
interface Edit {
  start: number
  end: number
  text: string
}
export interface Trace {
  cacheHits?: number
  inferences?: number
  entries: number
  decisions: number
  inverse: number
  forward: number
  resolver: number
  empty: number
  facts: RouteFacts | null
  route: Route
  features: number[] | null
}

export function nodes(value: unknown, visit: (node: Ast) => void) {
  if (!value || typeof value !== 'object') {
    return
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      nodes(child, visit)
    }
    return
  }
  const node = value as Ast
  if (typeof node.type === 'string') {
    visit(node)
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'start' && key !== 'end') {
        nodes(child, visit)
      }
    }
  }
}

export function unique<T>(items: T[], description: string): T {
  if (items.length !== 1) {
    throw new Error(`Expected one ${description}, received ${items.length}`)
  }
  return items[0]!
}

export function namedFunction(ast: Ast, name: string) {
  const matches: Ast[] = []
  nodes(ast, node => {
    if (node.type !== 'FunctionDeclaration') {
      return
    }
    const id = node['id'] as Ast
    if (id?.['name'] === name) {
      matches.push(node)
    }
  })
  return unique(matches, `${name} function`)
}

export function applyEdits(source: string, edits: Edit[]) {
  let previous = source.length + 1
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
    if (edit.end > previous) {
      throw new Error('Overlapping planner AST edits')
    }
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
    previous = edit.start
  }
  return source
}

export function functionSource(source: string, name: string) {
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
  }) as unknown as Ast
  const fn = namedFunction(ast, name)
  return source.slice(fn.start, fn.end)
}

export function replaceFunction(
  source: string,
  name: string,
  replacement: string,
) {
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
  }) as unknown as Ast
  const fn = namedFunction(ast, name)
  return applyEdits(source, [
    { start: fn.start, end: fn.end, text: replacement },
  ])
}

export function routeBundle(
  source: string,
  choice: 'baseline' | 'forward' | 'inverse' = 'baseline',
  instrument = false,
  condition?: string,
) {
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
  }) as unknown as Ast
  const fn = namedFunction(ast, 'selectBulkHas')
  const routingCalls: Ast[] = []
  nodes(fn, node => {
    const callee = node['callee'] as Ast
    if (
      node.type === 'CallExpression' &&
      callee?.['name'] === 'shouldDeclineBulkHas'
    ) {
      routingCalls.push(node)
    }
  })
  const routingCall = unique(routingCalls, 'complete has routing condition')
  const gates: Ast[] = []
  nodes(fn, node => {
    const test = node['test'] as Ast
    if (
      node.type === 'IfStatement' &&
      test &&
      test.start <= routingCall.start &&
      routingCall.end <= test.end
    ) {
      gates.push(node)
    }
  })
  const gate = unique(gates, 'complete has routing condition')
  const edits: Edit[] = []
  if (choice !== 'baseline' || condition !== undefined) {
    edits.push({
      start: routingCall.start,
      end: routingCall.end,
      text: condition ?? String(choice === 'forward'),
    })
  }
  if (instrument) {
    traceEdits(
      source,
      ast,
      fn,
      (fn['body'] as Ast)['body'] as Ast[],
      gate,
      edits,
    )
  }
  const edited = applyEdits(source, edits)
  if (!instrument) {
    return edited
  }
  return (
    'var plannerTrace;\n' +
    edited +
    `
;module.exports.resetTrace = function() {
  plannerTrace = { entries: 0, decisions: 0, inverse: 0, forward: 0,
    resolver: 0, empty: 0, facts: null, route: 'ineligible', features: null };
};
module.exports.resetTrace();
module.exports.trace = function() { return plannerTrace; };
module.exports.probes = function() { return plannerTrace.decisions; };
module.exports.features = function() { return plannerTrace.features; };
`
  )
}

export function traceEdits(
  source: string,
  ast: Ast,
  fn: Ast,
  body: Ast[],
  gate: Ast,
  edits: Edit[],
) {
  edits.push({
    start: (fn['body'] as Ast).start + 1,
    end: (fn['body'] as Ast).start + 1,
    text: `\nplannerTrace.entries++; plannerTrace.facts = {
      eligible: true, anchors: anchors.length, witnesses: null,
      denseInverse: plan.denseInverse === true, weakMapAvailable: true };\n`,
  })
  const returns: Ast[] = []
  for (const node of body) {
    if (node.type === 'IfStatement') {
      nodes(node['consequent'], child => {
        if (child.type === 'ReturnStatement') {
          returns.push(child)
        }
      })
    }
  }
  for (const ret of returns) {
    const arg = ret['argument'] as Ast
    const empty = arg?.type === 'ArrayExpression'
    const route = empty ? 'empty' : 'forward'
    const isCapability = ret.start > gate.end
    edits.push({
      start: ret.start,
      end: ret.end,
      text: `{ plannerTrace.${route}++; plannerTrace.route = '${route}';
        ${empty ? 'plannerTrace.facts.witnesses = 0;' : ''}
        ${isCapability ? 'plannerTrace.facts.weakMapAvailable = false;' : ''}
        ${source.slice(ret.start, ret.end)} }`,
    })
  }
  edits.push({
    start: gate.start,
    end: gate.start,
    text: `plannerTrace.decisions++; plannerTrace.facts.witnesses = witnesses.length;
        plannerTrace.features = [anchors.length, witnesses.length, plan.plannerMask,
        witnesses.length / anchors.length];\n`,
  })
  const result = unique(
    body.filter(node => node.type === 'ReturnStatement'),
    'bulk result return',
  )
  edits.push({
    start: result.start,
    end: result.start,
    text: "plannerTrace.inverse++; plannerTrace.route = 'inverse';\n",
  })
  const single = namedFunction(ast, 'runSingle')
  const singleBody = (single['body'] as Ast)['body'] as Ast[]
  const fallback = unique(
    singleBody.filter(node => node.type === 'ReturnStatement'),
    'single resolver fallback',
  )
  edits.push({
    start: fallback.start,
    end: fallback.start,
    text: 'plannerTrace.resolver++;\n',
  })
}
