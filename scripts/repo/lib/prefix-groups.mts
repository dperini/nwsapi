import path from 'node:path'

const SOURCE_EXTENSION = /(?:\.d)?\.(?:cts|mts|ts)$/

export interface FilenamePrefixGroup {
  directory: string
  prefix: string
  files: string[]
  modules: string[]
  suggestedDirectory: string
  collisions: string[]
}

function sourceStem(file: string): string | undefined {
  const name = path.posix.basename(file)
  return SOURCE_EXTENSION.test(name)
    ? name.replace(SOURCE_EXTENSION, '')
    : undefined
}

export function findFilenamePrefixGroups(
  files: readonly string[],
): FilenamePrefixGroup[] {
  const normalizedFiles = new Set(files.map(file => file.replaceAll('\\', '/')))
  const groups = new Map<string, FilenamePrefixGroup>()

  for (const file of normalizedFiles) {
    const stem = sourceStem(file)
    if (
      stem === undefined ||
      stem.includes('.test') ||
      stem.includes('.spec')
    ) {
      continue
    }
    const tokens = stem.split('-')
    if (tokens.length < 2 || tokens.some(token => token.length === 0)) {
      continue
    }
    const directory = path.posix.dirname(file)
    for (let length = 1; length < tokens.length; length += 1) {
      const prefix = tokens.slice(0, length).join('-')
      const suggestedDirectory = path.posix.join(directory, prefix)
      let group = groups.get(suggestedDirectory)
      if (group === undefined) {
        group = {
          directory,
          prefix,
          files: [],
          modules: [],
          suggestedDirectory,
          collisions: [],
        }
        groups.set(suggestedDirectory, group)
      }
      group.files.push(file)
      if (!group.modules.includes(stem)) {
        group.modules.push(stem)
      }
    }
  }

  const candidates = [...groups.values()].filter(
    group => group.modules.length >= 3,
  )
  return candidates
    .filter(
      group =>
        !group.modules.every(module =>
          candidates.some(
            other =>
              other.directory === group.directory &&
              other.prefix.startsWith(`${group.prefix}-`) &&
              other.modules.includes(module),
          ),
        ),
    )
    .map(group => {
      const targets = group.files.map(file =>
        path.posix.join(
          group.suggestedDirectory,
          path.posix.basename(file).slice(group.prefix.length + 1),
        ),
      )
      return {
        ...group,
        files: group.files.toSorted(),
        modules: group.modules.toSorted(),
        collisions: [group.suggestedDirectory, ...targets]
          .filter(target => normalizedFiles.has(target))
          .toSorted(),
      }
    })
    .toSorted((left, right) =>
      left.suggestedDirectory.localeCompare(right.suggestedDirectory),
    )
}
