import { expect, test } from 'vitest'
import { agentBrowserUrl } from '../../../scripts/repo/agent-browser.mts'

test('the agent browser accepts web URLs and rejects executable or local-file schemes', () => {
  expect(agentBrowserUrl([])).toBe('http://127.0.0.1:8765/')
  expect(agentBrowserUrl(['https://example.org'])).toBe('https://example.org/')
  for (const args of [
    ['javascript:alert(1)'],
    ['file:///etc/passwd'],
    ['https://a', 'https://b'],
  ]) {
    expect(() => agentBrowserUrl(args)).toThrow()
  }
})
