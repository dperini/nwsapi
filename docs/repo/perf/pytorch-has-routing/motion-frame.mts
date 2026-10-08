import { searchProgress, searchTrace } from './dom.mts'
import type { SearchRoute, ToyNode } from './dom.mts'

export function motionFrame(
  nodes: ToyNode[],
  route: SearchRoute,
  beat: number,
) {
  const steps = searchTrace(nodes, route)
  const position = Math.max(0, Math.min(steps.length, Math.floor(beat)))
  const progress = searchProgress(steps, position)
  return {
    ...progress,
    position,
    total: steps.length,
    complete: position === steps.length,
    work: progress.visits + progress.ascents,
  }
}

export function motionPoint(node: ToyNode) {
  if (node.kind === 'root') {
    return { x: 220, y: 22, label: 'DOM' }
  }
  if (node.card === undefined) {
    return { x: 220, y: 283, label: 'outside !' }
  }
  const x = 55 + node.card * 110
  if (node.kind === 'card') {
    return { x, y: 72, label: String.fromCharCode(65 + node.card) }
  }
  if (node.kind === 'warning') {
    const index = Number(node.id.slice(-1))
    return { x: x - 18 + index * 36, y: 197, label: '!' }
  }
  if (node.id.startsWith('body-')) {
    return { x, y: 114, label: 'section' }
  }
  return node.id.startsWith('text-')
    ? { x: x - 18, y: 156, label: 'p' }
    : { x: x + 18, y: 240, label: 'footer' }
}

export function motionShape(label: string) {
  if (label.length > 3) {
    return { width: label.length * 7 + 16, height: 26, radius: 7 }
  }
  const radius = label === 'DOM' ? 18 : 13
  return { width: radius * 2, height: radius * 2, radius }
}
