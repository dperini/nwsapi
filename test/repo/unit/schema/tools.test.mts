import { expect, test } from 'vitest'
import manifest from '../../../../.config/external-tools.json' with { type: 'json' }
import { validate } from '../../../../.config/generated/external-tools.mts'
import {
  checkExternalTools,
  GITHUB_TOOLS,
  toolPlan,
} from '../../../../scripts/repo/external-tools.mts'

test('the compiled tool schema rejects extra properties, unknown platforms and unsafe paths', () => {
  expect(validate(manifest).valid).toBe(true)
  const cases = [
    { ...manifest, extra: true },
    { tools: { ...manifest.tools, unknown: {} } },
    {
      tools: {
        ...manifest.tools,
        uv: {
          ...manifest.tools.uv,
          platforms: {
            'linux-unknown': manifest.tools.uv.platforms['linux-x64'],
          },
        },
      },
    },
    {
      tools: {
        ...manifest.tools,
        npm: { ...manifest.tools.npm, binary: '../npm' },
      },
    },
  ]
  for (const data of cases) {
    expect(validate(data).valid).toBe(false)
  }
  const broken = structuredClone(manifest)
  broken.tools.agentshield.integrity = 'sha512-YQ=='
  expect(() => checkExternalTools(broken)).toThrow()
  for (const name of GITHUB_TOOLS) {
    for (const platform of Object.keys(manifest.tools[name].platforms)) {
      expect(toolPlan(name, platform).url).toMatch(/^https:\/\/github\.com\//)
    }
  }
  expect(toolPlan('uv', 'linux-x64').url).toContain(
    `/download/${manifest.tools.uv.tag}/`,
  )
})
