import { expect, test, vi } from 'vitest'
import { RELEASE } from '../../../../scripts/repo/release/config.mts'
import {
  configureTrust,
  environmentPlan,
  isV3Publisher,
  matchesPublisher,
  parsePublishers,
  setupEnvironment,
  trustArguments,
} from '../../../../scripts/repo/release/trust.mts'
import type { CommandRunner } from '../../../../scripts/repo/lib/command.mts'
import type { Publisher } from '../../../../scripts/repo/release/trust.mts'

const publisher: Publisher = {
  id: 'v3',
  type: 'github',
  permissions: ['createStagedPackage'],
  claims: {
    repository: RELEASE.repository,
    environment: RELEASE.environment,
    workflow_ref: { file: RELEASE.workflow },
  },
}
const environment = {
  deployment_branch_policy: {
    custom_branch_policies: true,
    protected_branches: false,
  },
}
const policies = { branch_policies: [{ name: RELEASE.branch, type: 'branch' }] }

test('trusted publishers are restricted to staging on the v3 workflow and environment', () => {
  expect(parsePublishers(JSON.stringify([publisher]))).toEqual([publisher])
  expect(isV3Publisher(publisher)).toBe(true)
  expect(matchesPublisher(publisher)).toBe(true)
  expect(
    matchesPublisher({
      ...publisher,
      permissions: ['createPackage', 'createStagedPackage'],
    }),
  ).toBe(false)
  expect(() => parsePublishers('{}')).toThrow()
  expect(() => parsePublishers('[{"id":1}]')).toThrow()
  expect(trustArguments()).toContain('--allow-stage-publish')
  expect(trustArguments()).not.toContain('--allow-publish')
  expect(environmentPlan(undefined, undefined)).toMatchObject({
    create: true,
    addBranch: true,
  })
  expect(environmentPlan(environment, policies)).toMatchObject({
    create: false,
    addBranch: false,
  })
  expect(() => environmentPlan({}, policies)).toThrow()
  expect(() =>
    environmentPlan(environment, {
      branch_policies: [{ name: '*', type: 'branch' }],
    }),
  ).toThrow()
})

test('trust migration verifies the replacement before revoking only stale v3 bindings', () => {
  const maintenance: Publisher = {
    ...publisher,
    id: 'maintenance',
    claims: { ...publisher.claims, environment: 'publish-npm' },
  }
  const stale: Publisher = {
    ...publisher,
    id: 'old',
    permissions: ['createPackage'],
  }
  let rows = [maintenance, stale]
  const run = vi.fn<CommandRunner>((command, args) => {
    if (command === 'gh') {
      return {
        status: 0,
        stdout: JSON.stringify(
          args[1]?.endsWith('deployment-branch-policies')
            ? policies
            : environment,
        ),
        stderr: '',
      }
    }
    if (args.includes('github')) {
      rows.push(publisher)
    }
    if (args.includes('revoke')) {
      expect(rows.some(matchesPublisher)).toBe(true)
      expect(args).toContain('--id=old')
      rows = rows.filter(row => row.id !== 'old')
    }
    return { status: 0, stdout: JSON.stringify(rows), stderr: '' }
  })
  expect(setupEnvironment(false, '/tmp', run)).toMatchObject({ create: false })
  configureTrust(false, '/tmp', run)
  expect(rows).toHaveLength(2)
  configureTrust(true, '/tmp', run)
  expect(rows).toEqual([maintenance, publisher])
})

test('failed settings reads and unverifiable replacement publishers cannot revoke trust', () => {
  const run = vi.fn<CommandRunner>((command, args) => ({
    status: 0,
    stdout: JSON.stringify(
      command === 'gh'
        ? args[1]?.endsWith('deployment-branch-policies')
          ? policies
          : environment
        : [],
    ),
    stderr: '',
  }))
  expect(() => configureTrust(true, '/tmp', run)).toThrow('did not verify')
  expect(run.mock.calls.some(([, args]) => args.includes('revoke'))).toBe(false)
  expect(() =>
    setupEnvironment(true, '/tmp', () => ({
      status: 1,
      stdout: '',
      stderr: 'HTTP 403',
    })),
  ).toThrow('Cannot read')
})

test('npm 12 separate flattened JSON objects normalize to registry publisher claims', () => {
  const flat = {
    id: publisher.id,
    type: publisher.type,
    permissions: publisher.permissions,
    repository: RELEASE.repository,
    file: RELEASE.workflow,
    environment: RELEASE.environment,
  }
  const stream =
    JSON.stringify(flat, null, 2) +
    '\n\n' +
    JSON.stringify({ ...flat, id: 'second' }, null, 2) +
    '\n'
  expect(parsePublishers(stream)).toEqual([
    publisher,
    { ...publisher, id: 'second' },
  ])
  expect(parsePublishers('')).toEqual([])
  expect(() => parsePublishers('not json')).toThrow()
})
