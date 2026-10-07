import { expect, test } from 'vitest'
import {
  toyNodes,
  searchTrace,
} from '../../../../../docs/repo/perf/pytorch-has-routing/dom.mts'
import {
  motionFrame,
  motionPoint,
} from '../../../../../docs/repo/perf/pytorch-has-routing/motion-frame.mts'

test('animation frames follow the real teaching traces and clamp the timeline', () => {
  const nodes = toyNodes([2, 0, 1, 0], true)
  const routes = ['forward', 'inverse'] as const
  for (let i = 0, length = routes.length; i < length; i += 1) {
    const route = routes[i]!
    const steps = searchTrace(nodes, route)
    expect(motionFrame(nodes, route, -1).position).toBe(0)
    expect(motionFrame(nodes, route, 1.8).position).toBe(1)
    const frame = motionFrame(nodes, route, steps.length + 20)
    expect(frame.complete).toBe(true)
    expect(frame.matches).toEqual([0, 2])
    expect(frame.work).toBe(
      steps.reduce((sum, step) => sum + step.visit + step.ascent, 0),
    )
  }
})

test('every illustrated DOM node has a stable, distinct point in the film', () => {
  const nodes = toyNodes([2, 2, 2, 2], true)
  const points = nodes.map(motionPoint)
  expect(new Set(points.map(point => `${point.x},${point.y}`)).size).toBe(
    nodes.length,
  )
  expect(
    points.every(
      point => point.x > 0 && point.x < 440 && point.y > 0 && point.y < 310,
    ),
  ).toBe(true)
  expect(points.every(point => point.label.length > 0)).toBe(true)
})

test('outside warnings do not become matches in the animation', () => {
  const nodes = toyNodes([0, 0, 0, 0], true)
  expect(motionFrame(nodes, 'inverse', 100).matches).toEqual([])
  expect(motionFrame(nodes, 'forward', 100).matches).toEqual([])
})
