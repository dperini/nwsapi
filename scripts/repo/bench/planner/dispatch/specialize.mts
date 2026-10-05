import assert from 'node:assert/strict'
import { parse } from 'acorn'
import { sha256 } from '../../footprint/shared.mts'
import {
  functionSource,
  replaceFunction,
  routeBundle,
} from '../has/instrument.mts'
import { dispatchBundle } from './variants.mts'

interface Node {
  type: string
  [key: string]: unknown
}

function falseGuard(node: Node) {
  const block = node['consequent'] as Node | undefined
  const body = block?.['body'] as Node[] | undefined
  return (
    node.type === 'IfStatement' &&
    !node['alternate'] &&
    body?.length === 1 &&
    body[0]!.type === 'ReturnStatement' &&
    (body[0]!['argument'] as Node)?.['value'] === false
  )
}

function category(node: Node, attributes: number, dense: number): boolean {
  if (node.type === 'LogicalExpression') {
    const left = category(node['left'] as Node, attributes, dense)
    const right = category(node['right'] as Node, attributes, dense)
    assert.ok(node['operator'] === '&&' || node['operator'] === '||')
    return node['operator'] === '&&' ? left && right : left || right
  }
  assert.equal(node.type, 'BinaryExpression')
  assert.equal(node['operator'], '===')
  const left = node['left'] as Node
  const right = node['right'] as Node
  assert.equal(left.type, 'Identifier')
  assert.equal(right.type, 'Literal')
  assert.ok(left['name'] === 'attributes' || left['name'] === 'dense')
  return (left['name'] === 'attributes' ? attributes : dense) === right['value']
}

function terms(node: Node): Node[] {
  if (node.type === 'LogicalExpression' && node['operator'] === '||') {
    return [...terms(node['left'] as Node), ...terms(node['right'] as Node)]
  }
  return [node]
}

function numericBound(node: Node) {
  const left = node['left'] as Node | undefined
  const right = node['right'] as Node | undefined
  return (
    node.type === 'BinaryExpression' &&
    (node['operator'] === '<' || node['operator'] === '>') &&
    left?.type === 'Identifier' &&
    right?.type === 'Literal' &&
    typeof right['value'] === 'number' &&
    Number.isFinite(right['value'])
  )
}

function finiteCallee(node: Node | undefined) {
  return (
    node?.type === 'MemberExpression' &&
    !node['computed'] &&
    (node['object'] as Node)?.['name'] === 'Number' &&
    (node['property'] as Node)?.['name'] === 'isFinite'
  )
}

function finiteGuard(node: Node) {
  const call = node['argument'] as Node | undefined
  const argumentsList = call?.['arguments'] as Node[] | undefined
  return (
    node.type === 'UnaryExpression' &&
    node['operator'] === '!' &&
    call?.type === 'CallExpression' &&
    finiteCallee(call['callee'] as Node) &&
    argumentsList?.length === 1 &&
    argumentsList[0]?.type === 'Identifier'
  )
}

function boundTerm(node: Node) {
  return numericBound(node) || finiteGuard(node)
}

function upperBound(guards: Node[], name: string) {
  const limits = guards
    .map(guard => terms(guard['test'] as Node))
    .filter(items => items.every(boundTerm))
    .flat()
    .filter(
      node =>
        node.type === 'BinaryExpression' &&
        node['operator'] === '>' &&
        (node['left'] as Node)?.['name'] === name &&
        (node['right'] as Node)?.type === 'Literal',
    )
    .map(node => Number((node['right'] as Node)['value']))
  assert.ok(limits.length && limits.every(Number.isFinite), 'Missing bound')
  return Math.min(...limits)
}

export function unfilteredCertificate(model: string) {
  const ast = parse(model.replace(/^export /, ''), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  }) as unknown as Node
  const functions = ast['body'] as Node[]
  assert.equal(functions.length, 1)
  const fn = functions[0]!
  assert.equal(fn.type, 'FunctionDeclaration')
  assert.equal((fn['id'] as Node)['name'], 'dispatchOverride')
  assert.deepEqual(
    (fn['params'] as Node[]).map(node => node['name']),
    ['anchors', 'witnesses', 'attributes', 'dense', 'ratio'],
  )
  const body = (fn['body'] as Node)['body'] as Node[]
  const guards: Node[] = []
  for (const node of body) {
    if (!falseGuard(node)) {
      break
    }
    guards.push(node)
  }
  const first = guards[0]?.['test'] as Node
  assert.equal(first?.type, 'UnaryExpression')
  assert.equal(first['operator'], '!')
  const categories = first['argument'] as Node
  assert.equal(category(categories, 0, 0), false, 'Unfiltered nondense allowed')
  assert.equal(category(categories, 0, 1), true, 'Unexpected category contract')
  const anchors = upperBound(guards, 'anchors')
  const ratio = upperBound(guards, 'ratio')
  assert.ok(
    anchors <= 192 && ratio <= 4,
    'Dense forward inputs remain possible',
  )
  return {
    sourceSha256: sha256(model),
    anchorUpperBound: anchors,
    ratioUpperBound: ratio,
    proof:
      'Attribute mask 0 rejects dense 0. Dense 1 accepts only anchors <=192 and witness ratio <=4, where the baseline route is inverse. DOM candidate counts are integers and ratio is derived from those counts.',
  }
}

function baselineCertificate(source: string) {
  const expected = parse(
    'witnesses.length > anchors.length * 2 && (!plan.denseInverse || anchors.length > 192 || witnesses.length > anchors.length * 4)',
    {
      ecmaVersion: 'latest',
    },
  ) as unknown as Node
  const expression = (expected['body'] as Node[])[0]!['expression'] as Node
  const ast = parse(functionSource(source, 'selectBulkHas'), {
    ecmaVersion: 'latest',
  }) as unknown as Node
  const fn = (ast['body'] as Node[])[0]!
  const body = (fn['body'] as Node)['body'] as Node[]
  const signature = (node: Node) =>
    JSON.stringify(node, (key, value: unknown) =>
      ['start', 'end', 'raw'].includes(key) ? undefined : value,
    )
  const matches = body.filter(
    node =>
      node.type === 'IfStatement' &&
      signature(node['test'] as Node) === signature(expression),
  )
  assert.equal(matches.length, 1, 'Baseline routing contract changed')
}

export function splitDispatchBundle(
  source: string,
  model: string,
  instrument = false,
) {
  unfilteredCertificate(model)
  baselineCertificate(source)
  const dispatched = dispatchBundle(source, model, instrument, true)
  const original = functionSource(source, 'selectBulkHas')
  const modified = functionSource(dispatched, 'selectBulkHas').replace(
    'function selectBulkHas(',
    'function selectBulkHasDispatch(',
  )
  const call = 'var bulk = selectBulkHas(engine, plan.bulkHas, context, list)'
  assert.equal(dispatched.split(call).length, 2, 'Unexpected bulk call')
  const branch = `var bulk;
  if (plan.bulkHas.attributeMask === 0) {
    bulk = selectBulkHas(engine, plan.bulkHas, context, list);
  } else {
    bulk = selectBulkHasDispatch(engine, plan.bulkHas, context, list);
  }`
  // Instrumented probes keep the tracing body on both paths.
  const unchanged = instrument
    ? functionSource(routeBundle(source, 'baseline', true), 'selectBulkHas')
    : original
  return replaceFunction(
    dispatched.replace(call, branch),
    'selectBulkHas',
    unchanged + '\n' + modified,
  )
}
