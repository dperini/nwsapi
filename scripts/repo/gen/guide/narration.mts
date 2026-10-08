import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import manifest from '../../../../.config/guide-narration.json' with { type: 'json' }
import transcript from '../../../../assets/repo/model-guide/narration/transcript.json' with { type: 'json' }
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'
import { loadNarrationAligner } from './alignment.mts'
import type { WordCue } from './alignment.mts'
import alignmentManifest from '../../../../.config/guide-alignment.json' with { type: 'json' }

type ModelFile = { name: string; sha256: string }
type NarrationVoice = 'bm_george' | 'bm_fable'
interface NarrationSegment {
  text: string
  pauseAfterMs: number
  speed?: number | undefined
}
interface NarrationSection {
  text: string
  segments: NarrationSegment[]
}
interface SpeechEngine {
  generate(
    text: string,
    options: { voice: NarrationVoice; speed: number },
  ): Promise<{ save(file: string): Promise<unknown> }>
  close(): Promise<unknown>
}
type NarrationOptions = {
  voice?: string | undefined
  directory?: string | undefined
  modelDirectory?: string | undefined
  run?: ((command: string, args: string[]) => void) | undefined
  load?: ((directory: string) => Promise<SpeechEngine>) | undefined
  align?: typeof loadNarrationAligner
}

function hash(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

export async function prepareNarrationModel(
  directory: string,
  files: ModelFile[] = manifest.files,
) {
  for (let i = 0, length = files.length; i < length; i += 1) {
    const file = files[i]!
    const target = path.join(directory, file.name)
    if (existsSync(target)) {
      if (hash(readFileSync(target)) !== file.sha256) {
        throw Object.assign(
          new Error(`Cached narration model checksum mismatch: ${file.name}`),
          {
            code: 'ERR_NARRATION_INTEGRITY',
          },
        )
      }
      continue
    }
    const response = await fetch(
      `https://huggingface.co/${manifest.model}/resolve/${manifest.revision}/${file.name}`,
    )
    if (!response.ok) {
      throw Object.assign(
        new Error(`Narration model download failed: ${response.status}`),
        {
          code: 'ERR_NARRATION_DOWNLOAD',
        },
      )
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (hash(bytes) !== file.sha256) {
      throw Object.assign(
        new Error(`Downloaded narration model checksum mismatch: ${file.name}`),
        {
          code: 'ERR_NARRATION_INTEGRITY',
        },
      )
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
}

function validateSegment(segment: NarrationSegment) {
  const speed = segment.speed ?? transcript.speed
  if (!segment.text.trim() || segment.text.length > 240) {
    throw Object.assign(
      new Error('Keep spoken segments between 1 and 240 characters.'),
      {
        code: 'ERR_NARRATION_TEXT',
      },
    )
  }
  if (
    !Number.isInteger(segment.pauseAfterMs) ||
    segment.pauseAfterMs < 0 ||
    segment.pauseAfterMs > 1500
  ) {
    throw Object.assign(
      new Error('Pause duration must be between 0ms and 1500ms.'),
      {
        code: 'ERR_NARRATION_PAUSE',
      },
    )
  }
  if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.2) {
    throw Object.assign(
      new Error('Narration speed must be between 0.75 and 1.2.'),
      {
        code: 'ERR_NARRATION_SPEED',
      },
    )
  }
  return { ...segment, speed }
}

export function narrationSegments(section: NarrationSection) {
  const segments = section.segments.map(validateSegment)
  if (
    !segments.length ||
    segments.map(segment => segment.text).join(' ') !== section.text
  ) {
    throw Object.assign(
      new Error('Spoken segments must match the visible transcript.'),
      {
        code: 'ERR_NARRATION_TRANSCRIPT',
      },
    )
  }
  const sentences = new Intl.Segmenter(transcript.locale, {
    granularity: 'sentence',
  })
  return segments.flatMap(segment => {
    const parts = Array.from(sentences.segment(segment.text))
    return parts.map((part, index) => ({
      text: part.segment.trim(),
      speed: segment.speed,
      pauseAfterMs:
        index === parts.length - 1
          ? Math.max(segment.pauseAfterMs, transcript.ideaPauseMs)
          : transcript.sentencePauseMs,
    }))
  })
}

export function narrationSpeech(text: string) {
  // Keep conventional spelling in the transcript and pronunciation hints in audio.
  return text
    .replaceAll('nwsapi', transcript.pronunciations.nwsapi)
    .replace(/\blearned\b/g, transcript.pronunciations.learned)
}

function publishNarration(source: string, target: string) {
  const temporary = target + '.tmp'
  try {
    copyFileSync(source, temporary)
    renameSync(temporary, target)
  } finally {
    rmSync(temporary, { force: true })
  }
}

async function loadSpeechEngine(directory: string): Promise<SpeechEngine> {
  const { KokoroTTS } = await import('kokoro-js')
  const engine = await KokoroTTS.from_pretrained(directory, {
    dtype: 'fp32',
    device: 'cpu',
  })
  return {
    generate: (text, options) => engine.generate(text, options),
    close: () => engine.model.dispose(),
  }
}

export async function generateGuideNarration(options: NarrationOptions = {}) {
  const directory =
    options.directory ??
    path.join(REPO_ROOT, 'assets/repo/model-guide/narration')
  const modelDirectory =
    options.modelDirectory ??
    path.join(REPO_ROOT, '.cache/narration-model', manifest.revision)
  await prepareNarrationModel(modelDirectory)
  const run =
    options.run ??
    ((command, args) => {
      execFileSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit' })
    })
  const voice = options.voice ?? transcript.voice
  if (voice !== 'bm_george' && voice !== 'bm_fable') {
    throw Object.assign(
      new Error('Use a configured British narration voice.'),
      {
        code: 'ERR_NARRATION_VOICE',
      },
    )
  }
  const engine = await (options.load ?? loadSpeechEngine)(modelDirectory)
  mkdirSync(directory, { recursive: true })
  const temporary = mkdtempSync(path.join(tmpdir(), 'nwsapi-narration-'))
  let aligner: Awaited<ReturnType<typeof loadNarrationAligner>> | undefined
  const alignedSections: Array<{
    id: string
    duration: number
    words: WordCue[]
  }> = []
  try {
    aligner = await (options.align ?? loadNarrationAligner)()
    for (let i = 0, length = transcript.sections.length; i < length; i += 1) {
      const section = transcript.sections[i]!
      const segments = narrationSegments(section)
      const inputs: string[] = []
      const filters: string[] = []
      const words: WordCue[] = []
      let elapsed = 0
      for (let chunk = 0, count = segments.length; chunk < count; chunk += 1) {
        const segment = segments[chunk]!
        const audioFile = path.join(temporary, `${section.id}-${chunk}.wav`)
        const audio = await engine.generate(narrationSpeech(segment.text), {
          voice,
          speed: segment.speed,
        })
        await audio.save(audioFile)
        const aligned = await aligner.align(audioFile, segment.text)
        words.push(
          ...aligned.words.map(word => ({
            text: word.text,
            start: Number((elapsed + word.start).toFixed(3)),
            end: Number((elapsed + word.end).toFixed(3)),
          })),
        )
        elapsed += aligned.duration + segment.pauseAfterMs / 1000
        inputs.push('-i', audioFile)
        filters.push(
          `[${chunk}:a]apad=pad_dur=${segment.pauseAfterMs / 1000}[s${chunk}]`,
        )
      }
      run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...inputs,
        '-filter_complex',
        `${filters.join(';')};${segments.map((_, index) => `[s${index}]`).join('')}concat=n=${segments.length}:v=0:a=1,loudnorm=I=-18:TP=-1.5:LRA=7[out]`,
        '-map',
        '[out]',
        '-ar',
        '44100',
        '-codec:a',
        'libmp3lame',
        '-metadata',
        `comment=Generated by scripts/repo/gen/guide/narration.mts. ${manifest.library}@${manifest.version}. Voice ${voice}. Model ${manifest.revision}.`,
        '-q:a',
        '2',
        path.join(temporary, section.file),
      ])
      alignedSections.push({ id: section.id, duration: elapsed, words })
    }
    writeFileSync(
      path.join(temporary, 'timings.generated.json'),
      JSON.stringify(
        {
          method: 'ctc-forced-alignment',
          model: alignmentManifest.model,
          revision: alignmentManifest.revision,
          sections: alignedSections,
        },
        null,
        2,
      ) + '\n',
    )
    for (let i = 0, length = transcript.sections.length; i < length; i += 1) {
      const file = transcript.sections[i]!.file
      publishNarration(path.join(temporary, file), path.join(directory, file))
    }
    publishNarration(
      path.join(temporary, 'timings.generated.json'),
      path.join(directory, 'timings.generated.json'),
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
    await engine.close()
    await aligner?.close()
  }
}

if (isMainModule(import.meta.url)) {
  await generateGuideNarration()
}
