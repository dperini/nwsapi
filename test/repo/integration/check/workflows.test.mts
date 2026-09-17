import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { expect, test } from 'vitest'
import {
  actionReferences,
  checkInlineWorkflows,
} from '../../../../scripts/repo/check/workflows.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

test('all workflow and nested composite action references remain local', () => {
  expect(() => checkInlineWorkflows()).not.toThrow()
  expect(
    actionReferences({
      jobs: {
        test: { steps: [{ uses: 'remote/action@sha' }, { run: 'true' }] },
      },
    }),
  ).toEqual(['remote/action@sha'])
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-workflows-'))
  try {
    const workflows = path.join(directory, '.github/workflows')
    mkdirSync(workflows, { recursive: true })
    const file = path.join(workflows, 'test.yml')
    for (const reference of [
      'remote/action@sha',
      './.github/actions/../../../escape',
      './.github/actions/missing',
    ]) {
      writeFileSync(
        file,
        stringify({ jobs: { test: { steps: [{ uses: reference }] } } }),
      )
      expect(() => checkInlineWorkflows(directory)).toThrow()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === 'win32')(
  'inline checkouts select the event commit with full ancestry and no persisted credentials',
  () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), 'nwsapi-checkout-inline-'),
    )
    try {
      const remote = path.join(directory, 'remote')
      mkdirSync(remote)
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: remote, encoding: 'utf8' }).trim()
      git('init', '-q')
      git('config', 'user.name', 'Test')
      git('config', 'user.email', 'test@example.invalid')
      const branch = git('symbolic-ref', '--short', 'HEAD')
      const commits: string[] = []
      for (const value of ['first', 'event', 'newer']) {
        writeFileSync(path.join(remote, 'content'), value)
        git('add', 'content')
        git('commit', '-qm', value)
        commits.push(git('rev-parse', 'HEAD'))
      }
      for (const name of ['node.js.yml', 'coverage.yml']) {
        const workflow = parse(
          readFileSync(path.join(REPO_ROOT, '.github/workflows', name), 'utf8'),
        )
        expect(workflow.on.push.branches).toEqual(['prerelease/3.0.0'])
        const job = Object.values(workflow.jobs)[0] as {
          steps: Array<{ name?: string; run?: string }>
        }
        const step = job.steps.find(item => item.name === 'Bootstrap checkout')!
        const target = path.join(directory, name)
        mkdirSync(target)
        execFileSync('bash', ['-c', step.run!], {
          cwd: target,
          stdio: 'pipe',
          env: {
            ...process.env,
            SERVER_URL: 'file://' + directory,
            REPOSITORY: 'remote',
            TRIGGER_SHA: commits[1]!,
            GITHUB_TOKEN: 'fixture-token',
          },
        })
        expect(readFileSync(path.join(target, 'content'), 'utf8')).toBe('event')
        expect(
          execFileSync('git', ['rev-list', '--count', 'HEAD'], {
            cwd: target,
            encoding: 'utf8',
          }).trim(),
        ).toBe('2')
        expect(
          execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
            cwd: target,
            encoding: 'utf8',
          }).trim(),
        ).toBe('false')
        expect(
          execFileSync('git', ['rev-parse', `refs/remotes/origin/${branch}`], {
            cwd: target,
            encoding: 'utf8',
          }).trim(),
        ).toBe(commits[2])
        expect(
          spawnSync(
            'git',
            ['config', '--local', '--get-regexp', 'extraheader|credential'],
            { cwd: target },
          ).status,
        ).toBe(1)
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
