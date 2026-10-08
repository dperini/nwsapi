import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  AutoModelForCTC,
  AutoProcessor,
  AutoTokenizer,
} from '@huggingface/transformers'
import manifest from '../../../../.config/guide-alignment.json' with { type: 'json' }
import transcript from '../../../../assets/repo/model-guide/narration/transcript.json' with { type: 'json' }
import { REPO_ROOT } from '../../lib/paths.mts'

export type WordCue = { text: string; start: number; end: number }
type Token = { id: number; word: number }
type Scores = { data: ArrayLike<number>; frames: number; vocabulary: number }

function readAudio(file: string) {
  const bytes = execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      file,
      '-ac',
      '1',
      '-ar',
      String(manifest.sampleRate),
      '-f',
      'f32le',
      '-',
    ],
    { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 },
  )
  const samples = new Float32Array(bytes.length / 4)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = bytes.readFloatLE(index * 4)
  }
  return samples
}

function bestPredecessor(
  scores: Float64Array,
  labels: number[],
  state: number,
  blank: number,
) {
  let previous = state
  if (state > 0 && scores[state - 1]! > scores[previous]!) {
    previous = state - 1
  }
  if (
    state > 1 &&
    labels[state] !== blank &&
    labels[state] !== labels[state - 2] &&
    scores[state - 2]! > scores[previous]!
  ) {
    previous = state - 2
  }
  return previous
}

function traceAlignment(logits: Scores, tokens: Token[], blank: number) {
  const labels = [blank]
  for (const token of tokens) {
    labels.push(token.id, blank)
  }
  const width = labels.length
  const trace = new Uint8Array(logits.frames * width)
  let scores = new Float64Array(width).fill(-Infinity)
  scores[0] = logits.data[blank]!
  scores[1] = logits.data[labels[1]!]!
  for (let frame = 1; frame < logits.frames; frame += 1) {
    const next = new Float64Array(width)
    for (let state = 0; state < width; state += 1) {
      const previous = bestPredecessor(scores, labels, state, blank)
      next[state] =
        scores[previous]! +
        logits.data[frame * logits.vocabulary + labels[state]!]!
      trace[frame * width + state] = state - previous
    }
    scores = next
  }
  let state = scores[width - 1]! > scores[width - 2]! ? width - 1 : width - 2
  if (!Number.isFinite(scores[state])) {
    throw new Error('The narration could not be aligned with its transcript.')
  }
  const frames = new Int32Array(logits.frames).fill(-1)
  for (let frame = logits.frames - 1; frame >= 0; frame -= 1) {
    if (state % 2 === 1) {
      frames[frame] = tokens[(state - 1) / 2]!.word
    }
    state -= trace[frame * width + state]!
  }
  return frames
}

function wordCues(
  words: string[],
  frames: Int32Array,
  duration: number,
): WordCue[] {
  const step = duration / frames.length
  const cues = words.map(text => ({ text, start: Infinity, end: 0 }))
  frames.forEach((word, frame) => {
    if (word >= 0) {
      const cue = cues[word]!
      cue.start = Math.min(cue.start, frame * step)
      cue.end = Math.max(cue.end, (frame + 1) * step)
    }
  })
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || cue.end <= cue.start) {
      throw new Error(`No spoken interval found for ${cue.text}.`)
    }
  }
  return cues
}

function spokenWord(word: string) {
  return word
    .replaceAll('nwsapi', transcript.pronunciations.nwsapi)
    .replaceAll('’', "'")
    .replaceAll('-', ' ')
    .toUpperCase()
    .replace(/[^A-Z' ]/g, '')
    .trim()
}

export async function loadNarrationAligner() {
  const options = {
    revision: manifest.revision,
    cache_dir: path.join(REPO_ROOT, '.cache/narration-alignment'),
  }
  const [model, processor, tokenizer] = await Promise.all([
    AutoModelForCTC.from_pretrained(manifest.model, {
      ...options,
      dtype: 'q8',
      device: 'cpu',
    }),
    AutoProcessor.from_pretrained(manifest.model, options),
    AutoTokenizer.from_pretrained(manifest.model, options),
  ])
  const blank = tokenizer.pad_token_id ?? 0
  const delimiter = Number(
    tokenizer(' ', { add_special_tokens: false }).input_ids.data[0],
  )
  return {
    async align(file: string, text: string) {
      const samples = readAudio(file)
      const duration = samples.length / manifest.sampleRate
      const words = text.trim().split(/\s+/)
      const tokens: Token[] = []
      words.forEach((word, index) => {
        if (index) {
          tokens.push({ id: delimiter, word: -1 })
        }
        const encoded = tokenizer(spokenWord(word), {
          add_special_tokens: false,
        })
        for (const id of encoded.input_ids.data) {
          tokens.push({ id: Number(id), word: index })
        }
      })
      const inputs = await processor(samples)
      const { logits } = await model(inputs)
      // The CTC path assigns the known words to audio frames, including silence.
      const frames = traceAlignment(
        {
          data: logits.data,
          frames: logits.dims[1],
          vocabulary: logits.dims[2],
        },
        tokens,
        blank,
      )
      return { duration, words: wordCues(words, frames, duration) }
    },
    close: () => model.dispose(),
  }
}
