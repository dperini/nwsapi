import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { threadId } from 'node:worker_threads'

export function markTransformedProcess(directory: string | undefined) {
  if (directory === undefined) {
    return
  }
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, `${process.pid}-${threadId}.json`), '{}\n')
}
