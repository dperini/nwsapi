import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import {
  agentAliasPlan,
  describeAgentSetup,
  main,
} from '../../../../scripts/repo/setup/agents.mts'

test('agent alias plan names generated guidance destinations', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-agent-plan-'))
  try {
    mkdirSync(path.join(root, '.claude/skills/review'), { recursive: true })
    writeFileSync(
      path.join(root, '.claude/skills/review/SKILL.md'),
      '---\nname: review\n---\nReview changes.\n',
    )
    const plan = agentAliasPlan(root)
    expect(plan.changes).toEqual([
      { path: path.join(root, 'CLAUDE.md'), operation: 'create' },
      {
        path: path.join(root, '.agents/skills/review/SKILL.md'),
        operation: 'create',
      },
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('agent setup dry-run does not create aliases', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-agent-dry-run-'))
  try {
    const log = vi.fn()
    main(['--dry-run', '--json'], root, log)
    expect(existsSync(path.join(root, 'CLAUDE.md'))).toBe(false)
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
      type: 'preview',
      command: 'setup/agents',
    })
    expect(describeAgentSetup().options).toContain('--dry-run')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
