import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './paths.mts'
import { runNode } from './run-node.mts'

export type TaskKind = 'check' | 'update'
export interface Task {
  name: string
  entry: string
  args: string[]
}

function files(directory: string, kind: TaskKind): string[] {
  const found: string[] = []
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const entry = path.join(directory, item.name)
    if (item.isDirectory()) {
      found.push(...files(entry, kind))
    } else if (item.isFile() && item.name === `${kind}.mts`) {
      found.push(entry)
    }
  }
  return found
}

function packageTask(
  name: string,
  command: string,
  kind: TaskKind,
  root: string,
): Task {
  const match = /^node scripts\/repo\/run\.mts (\S+\.mts)(?: ([-\w ]+))?$/.exec(
    command,
  )
  if (!match) {
    throw new Error(
      `${name} must run its subject/${kind}.mts through scripts/repo/run.mts`,
    )
  }
  const entry = path.resolve(root, match[1]!)
  const relative = path.relative(root, entry).replaceAll('\\', '/')
  if (
    !new RegExp(`^scripts/(repo|fleet)/.+/${kind}\\.mts$`).test(relative) ||
    !existsSync(entry)
  ) {
    throw new Error(`${name} has no existing subject/${kind}.mts entrypoint`)
  }
  return { name, entry, args: match[2]?.split(/\s+/) || [] }
}

export function discoverTasks(kind: TaskKind, root = REPO_ROOT): Task[] {
  const pkg = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    scripts: Record<string, string>
  }
  const tasks = new Map<string, Task>()
  for (const [name, command] of Object.entries(pkg.scripts)) {
    if (name.endsWith(`:${kind}`)) {
      const task = packageTask(name, command, kind, root)
      tasks.set(task.entry, task)
    }
  }
  for (const owner of ['repo', 'fleet']) {
    const directory = path.join(root, 'scripts', owner)
    if (!existsSync(directory)) {
      continue
    }
    for (const entry of files(directory, kind)) {
      // Root compatibility loaders delegate to the umbrella, so exclude them.
      if (path.dirname(entry) !== directory && !tasks.has(entry)) {
        tasks.set(entry, {
          name: path.relative(directory, path.dirname(entry)),
          entry,
          args: [],
        })
      }
    }
  }
  return [...tasks.values()].toSorted((a, b) => {
    const priority = (task: Task) =>
      task.name === 'dependency:update'
        ? 0
        : task.name === 'wpt-native:update'
          ? 2
          : 1
    return priority(a) - priority(b) || a.name.localeCompare(b.name)
  })
}

export function runTasks(kind: TaskKind, args: string[] = [], run = runNode) {
  const tasks = discoverTasks(kind)
  const failures: Error[] = []
  for (const task of tasks) {
    console.log(`[${kind}] ${task.name}`)
    try {
      run(task.entry, [...task.args, ...args])
    } catch (error) {
      if (kind === 'update') {
        throw error
      }
      failures.push(new Error(`${task.name}: ${String(error)}`))
    }
  }
  if (failures.length) {
    throw new AggregateError(
      failures,
      `${failures.length} checks failed:\n${failures.map(error => error.message).join('\n')}`,
    )
  }
}
