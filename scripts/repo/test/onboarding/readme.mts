import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { extractBlockByTag } from '../../lib/named-blocks.mts'

export interface JourneyStep {
  id: string
  command: string[]
}

export function parseJourney(markdown: string): JourneyStep[] {
  const steps: JourneyStep[] = []
  const pattern =
    /<!-- onboarding:([a-z-]+):start -->\s*```sh\n([\s\S]*?)\n```\s*<!-- onboarding:\1:end -->/g
  for (const match of markdown.matchAll(pattern)) {
    const lines = match[2]!
      .trim()
      .split(/\r?\n/)
      .filter(line => line.trim())
    const command = lines[0]!.trim().split(/\s+/)
    if (command.length === 0 || command.some(part => part.startsWith('#'))) {
      throw new Error(`Invalid onboarding command for ${match[1]}.`)
    }
    steps.push({ id: match[1]!, command })
    for (const [index, line] of lines.slice(1).entries()) {
      steps.push({
        id: `${match[1]}-${index + 2}`,
        command: line.trim().split(/\s+/),
      })
    }
  }
  if (steps.length === 0) {
    throw new Error('README has no marked onboarding commands.')
  }
  if (new Set(steps.map(step => step.id)).size !== steps.length) {
    throw new Error('README onboarding command IDs must be unique.')
  }
  return steps
}

export async function readJourney(repository: string) {
  const markdown = await readFile(path.join(repository, 'README.md'), 'utf8')
  const block = extractBlockByTag(markdown, 'onboarding')
  if (block === undefined) {
    throw new Error('README must have one balanced onboarding section.')
  }
  return parseJourney(block)
}
