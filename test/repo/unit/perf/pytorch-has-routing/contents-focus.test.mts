import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  focusContentsHeading,
  handleContentsActivation,
  isUnmodifiedContentsActivation,
} from '../../../../../docs/repo/perf/pytorch-has-routing/contents-focus.mts'

test('contents focus moves to the section heading without changing native link activation', () => {
  const dom = new JSDOM(
    '<section id="target"><h2>Target heading</h2></section>',
  )
  const { document } = dom.window
  const section = document.querySelector<HTMLElement>('#target')!
  const heading = focusContentsHeading(section)
  expect(heading.textContent).toBe('Target heading')
  expect(heading.tabIndex).toBe(-1)
  expect(document.activeElement).toBe(heading)

  const link = document.createElement('a')
  link.href = '#target'
  const click = new dom.window.MouseEvent('click', { button: 0 })
  expect(isUnmodifiedContentsActivation(click)).toBe(true)
  expect(click.defaultPrevented).toBe(false)
  for (const init of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ]) {
    expect(
      isUnmodifiedContentsActivation(new dom.window.MouseEvent('click', init)),
    ).toBe(false)
  }
  const prevented = new dom.window.MouseEvent('click', { cancelable: true })
  prevented.preventDefault()
  expect(isUnmodifiedContentsActivation(prevented)).toBe(false)
  dom.window.close()
})

test('contents activation focuses a heading and opens its disclosure', () => {
  const dom = new JSDOM(
    '<details><summary>More</summary><section id="target"><h2>Target heading</h2></section></details><a href="#target">Target</a>',
  )
  const { document } = dom.window
  const details = document.querySelector('details')!
  const heading = document.querySelector<HTMLElement>('h2')!
  heading.scrollIntoView = () => {}
  const link = document.querySelector<HTMLAnchorElement>('a')!
  const click = new dom.window.MouseEvent('click', { button: 0 })
  const scheduled: FrameRequestCallback[] = []
  const accepted = handleContentsActivation(
    click,
    link,
    () => {},
    document,
    callback => {
      scheduled.push(callback)
      return 1
    },
  )
  expect(accepted).toBe(true)
  expect(click.defaultPrevented).toBe(false)
  expect(details.open).toBe(false)
  scheduled[0]!(0)
  expect(details.open).toBe(true)
  expect(document.activeElement).toBe(heading)
  dom.window.close()
})

test('modified contents activation leaves the link and contents state alone', () => {
  const dom = new JSDOM(
    '<section id="target"><h2>Target</h2></section><a href="#target">Target</a>',
  )
  const { document } = dom.window
  const link = document.querySelector<HTMLAnchorElement>('a')!
  const onActivate = () => {
    throw new Error('Modified activation must not close the contents')
  }
  const scheduled: FrameRequestCallback[] = []
  const accepted = handleContentsActivation(
    new dom.window.MouseEvent('click', { button: 0, ctrlKey: true }),
    link,
    onActivate,
    document,
    callback => {
      scheduled.push(callback)
      return 1
    },
  )
  expect(accepted).toBe(false)
  expect(scheduled).toHaveLength(0)
  expect(document.activeElement).toBe(document.body)
  dom.window.close()
})
