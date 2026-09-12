import { createReadStream, readFileSync, existsSync, globSync } from 'node:fs'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { isMainModule } from '../../../lib/run-node.mts'
import type { NativePlan } from './pool.mts'

export async function nativeStatus(directory: string) {
  const files = globSync('plan*.json', { cwd: directory }).filter(file =>
    /^plan(?:-\d+)?\.json$/.test(file),
  )
  const plans: NativePlan[] = files.map(file =>
    JSON.parse(readFileSync(path.join(directory, file), 'utf8')),
  )
  if (!plans.length) {
    throw new Error('No native execution plan was recorded.')
  }
  const completed = new Set<string>()
  const statuses: Record<string, number> = {}
  const subtests: Record<string, number> = {}
  let finishedRuns = 0
  for (const file of files) {
    const events = path.join(
      directory,
      file.replace('plan', 'events').replace('.json', '.jsonl'),
    )
    if (!existsSync(events)) {
      continue
    }
    const lines = createInterface({
      input: createReadStream(events),
      crlfDelay: Infinity,
    })
    for await (const line of lines) {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        break
      } // A live writer may leave the last line incomplete.
      if (event.action === 'test_end') {
        completed.add(JSON.stringify([event.subsuite || '', event.test]))
        statuses[event.status] = (statuses[event.status] || 0) + 1
      } else if (event.action === 'test_status') {
        subtests[event.status] = (subtests[event.status] || 0) + 1
      } else if (event.action === 'suite_end') {
        finishedRuns++
      }
    }
  }
  return {
    browser: plans[0]!.browser,
    revision: plans[0]!.revision,
    planned: plans.reduce((sum, plan) => sum + plan.tests.length, 0),
    completed: completed.size,
    finished: finishedRuns === plans.length,
    statuses,
    subtests,
    provisional: true,
  }
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({ options: { directory: { type: 'string' } } })
  if (!values.directory) {
    throw new Error('Pass --directory with the native run artifact directory.')
  }
  console.log(JSON.stringify(await nativeStatus(values.directory), null, 2))
}
