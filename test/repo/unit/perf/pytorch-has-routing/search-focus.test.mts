import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import { replaceWarningSample } from '../../../../../docs/repo/perf/pytorch-has-routing/search-focus.mts'

test('replacing the warning sample restores focus to the corresponding control', () => {
  const dom = new JSDOM(
    '<div id="sample"><button data-warning="1">Warning</button></div>',
  )
  const { document } = dom.window
  const sample = document.querySelector<HTMLElement>('#sample')!
  sample.querySelector('button')!.focus()
  replaceWarningSample(
    sample,
    '<button data-warning="1">Updated warning</button>',
  )
  expect(document.activeElement).toBe(sample.querySelector('button'))
  dom.window.close()
})

test('replacing the warning sample does not move unrelated focus into it', () => {
  const dom = new JSDOM(
    '<button id="outside">Outside</button><div id="sample"><button data-warning="1">Warning</button></div>',
  )
  const { document } = dom.window
  const sample = document.querySelector<HTMLElement>('#sample')!
  const outside = document.querySelector<HTMLButtonElement>('#outside')!
  outside.focus()
  replaceWarningSample(
    sample,
    '<button data-warning="1">Updated warning</button>',
  )
  expect(document.activeElement).toBe(outside)
  dom.window.close()
})
