import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import transcript from '../../../../assets/repo/model-guide/locales/narration.it.json' with { type: 'json' }
import { REPO_ROOT } from '../../lib/paths.mts'

const directory = path.join(REPO_ROOT, '.cache/guide-speech')
mkdirSync(directory, { recursive: true })
const segmenter = new Intl.Segmenter('it', { granularity: 'sentence' })
const sections = Object.entries(transcript).map(([id, text]) => ({
  id,
  text,
  sentences: Array.from(segmenter.segment(text), part => part.segment.trim()),
}))
const input = path.join(directory, 'sentences.json')
writeFileSync(input, JSON.stringify(sections, null, 2) + '\n')
execFileSync(
  path.join(REPO_ROOT, '.cache/bin/uv'),
  [
    'run',
    '--project',
    '.config/guide-speech',
    '--locked',
    'python',
    'scripts/repo/gen/guide/italian.py',
    input,
  ],
  { cwd: REPO_ROOT, stdio: 'inherit' },
)
