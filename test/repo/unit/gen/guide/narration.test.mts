import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import transcript from '../../../../../assets/repo/model-guide/narration/transcript.json' with { type: 'json' }
const state = vi.hoisted(() => ({
  execute: vi.fn(),
  save: vi.fn(),
  generate: vi.fn(),
  dispose: vi.fn(),
  load: vi.fn(),
  align: vi.fn(),
  closeAligner: vi.fn(),
  main: false,
  root: '',
}))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
vi.mock('../../../../../scripts/repo/gen/guide/alignment.mts', () => ({
  loadNarrationAligner: async () => ({
    align: state.align,
    close: state.closeAligner,
  }),
}))
vi.mock('kokoro-js', () => ({ KokoroTTS: { from_pretrained: state.load } }))
vi.mock('../../../../../.config/guide-narration.json', () => ({
  default: {
    model: 'fixture/model',
    revision: 'pinned',
    files: [
      {
        name: 'model.onnx',
        sha256:
          '9372c470eeadd5ecd9c3c74c2b3cb633f8e2f2fad799250a0f70d652b6b825e4',
      },
    ],
  },
}))
vi.mock('../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
vi.mock('../../../../../scripts/repo/lib/paths.mts', () => ({
  get REPO_ROOT() {
    return state.root
  },
}))
let directory = ''
let modelDirectory = ''
const voice = transcript.voice
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.align.mockImplementation(async (_file: string, text: string) => ({
    duration: 2,
    words: text.split(/\s+/).map((word, index) => ({
      text: word,
      start: index * 0.1,
      end: (index + 1) * 0.1,
    })),
  }))
  state.main = false
  directory = mkdtempSync(path.join(tmpdir(), 'nwsapi-narration-test-'))
  state.root = directory
  state.execute.mockImplementation((_command: string, args: string[]) => {
    writeFileSync(args.at(-1)!, 'rendered audio')
  })
  modelDirectory = path.join(directory, 'model')
  state.generate.mockResolvedValue({ save: state.save })
  state.load.mockResolvedValue({
    generate: state.generate,
    model: { dispose: state.dispose },
  })
})
afterEach(() => {
  transcript.voice = voice
  rmSync(directory, { recursive: true, force: true })
})
async function load() {
  return import('../../../../../scripts/repo/gen/guide/narration.mts')
}
function download(body: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }))
}
function cacheModel() {
  mkdirSync(modelDirectory, { recursive: true })
  writeFileSync(path.join(modelDirectory, 'model.onnx'), 'model')
}

test('pinned model downloads verify integrity and subsequent runs stay offline', async () => {
  const { prepareNarrationModel } = await load()
  const request = download('model')
  await prepareNarrationModel(modelDirectory, undefined, request)
  expect(request).toHaveBeenCalledOnce()
  expect(readFileSync(path.join(modelDirectory, 'model.onnx'), 'utf8')).toBe(
    'model',
  )
  await prepareNarrationModel(modelDirectory)
  writeFileSync(path.join(modelDirectory, 'model.onnx'), 'corrupt')
  await expect(prepareNarrationModel(modelDirectory)).rejects.toMatchObject({
    code: 'ERR_NARRATION_INTEGRITY',
  })
})

test('failed and corrupt downloads never leave model files in the cache', async () => {
  const { prepareNarrationModel } = await load()
  await expect(
    prepareNarrationModel(modelDirectory, undefined, download('', 503)),
  ).rejects.toMatchObject({ code: 'ERR_NARRATION_DOWNLOAD' })
  await expect(
    prepareNarrationModel(modelDirectory, undefined, download('corrupt')),
  ).rejects.toMatchObject({ code: 'ERR_NARRATION_INTEGRITY' })
  expect(existsSync(path.join(modelDirectory, 'model.onnx'))).toBe(false)
  const bytes = 'nested'
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const request = download(bytes)
  await prepareNarrationModel(
    modelDirectory,
    [{ name: 'onnx/nested.bin', sha256 }],
    request,
  )
  expect(request).toHaveBeenCalledOnce()
  expect(
    readFileSync(path.join(modelDirectory, 'onnx/nested.bin'), 'utf8'),
  ).toBe(bytes)
})

test('spoken segments preserve visible words and validate pace and quiet pause metadata', async () => {
  const { narrationSegments, narrationSpeech } = await load()
  expect(narrationSpeech('nwsapi finds the cards.')).toBe(
    `${transcript.pronunciations.nwsapi} finds the cards.`,
  )
  expect(narrationSpeech('PyTorch trains the model.')).toBe(
    'PyTorch trains the model.',
  )
  const segment = { text: 'A clear sentence ends here.', pauseAfterMs: 420 }
  expect(
    narrationSegments({ text: segment.text, segments: [segment] }),
  ).toEqual([
    {
      ...segment,
      pauseAfterMs: transcript.ideaPauseMs,
      speed: transcript.speed,
    },
  ])
  const invalid = [
    { changes: { text: '' }, code: 'ERR_NARRATION_TEXT' },
    { changes: { text: 'x'.repeat(241) }, code: 'ERR_NARRATION_TEXT' },
    { changes: { pauseAfterMs: 1.5 }, code: 'ERR_NARRATION_PAUSE' },
    { changes: { pauseAfterMs: -1 }, code: 'ERR_NARRATION_PAUSE' },
    { changes: { pauseAfterMs: 1501 }, code: 'ERR_NARRATION_PAUSE' },
    { changes: { speed: NaN }, code: 'ERR_NARRATION_SPEED' },
    { changes: { speed: 0.74 }, code: 'ERR_NARRATION_SPEED' },
    { changes: { speed: 1.21 }, code: 'ERR_NARRATION_SPEED' },
  ]
  for (let i = 0, length = invalid.length; i < length; i += 1) {
    const entry = invalid[i]!
    expect(() =>
      narrationSegments({
        text: segment.text,
        segments: [{ ...segment, ...entry.changes }],
      }),
    ).toThrow(expect.objectContaining({ code: entry.code }))
  }
  expect(() => narrationSegments({ text: '', segments: [] })).toThrow(
    expect.objectContaining({ code: 'ERR_NARRATION_TRANSCRIPT' }),
  )
  expect(() =>
    narrationSegments({ text: 'Different words.', segments: [segment] }),
  ).toThrow(expect.objectContaining({ code: 'ERR_NARRATION_TRANSCRIPT' }))
})

test('local neural speech joins sentence chunks into normalized section audio and releases the model', async () => {
  cacheModel()
  const { generateGuideNarration, narrationSegments } = await load()
  const run = vi.fn((_command: string, args: string[]) => {
    writeFileSync(args.at(-1)!, 'rendered audio')
  })
  const close = vi.fn()
  await generateGuideNarration({
    directory,
    modelDirectory,
    run,
    load: async () => ({ generate: state.generate, close }),
  })
  expect(run).toHaveBeenCalledTimes(transcript.sections.length)
  let generated = 0
  for (let i = 0, length = transcript.sections.length; i < length; i += 1) {
    const section = transcript.sections[i]!
    const segments = narrationSegments(section)
    generated += segments.length
    const args = run.mock.calls[i]![1] as string[]
    expect(run.mock.calls[i]![0]).toBe('ffmpeg')
    expect(path.basename(args.at(-1)!)).toBe(section.file)
    expect(path.dirname(args.at(-1)!)).not.toBe(directory)
    expect(readFileSync(path.join(directory, section.file), 'utf8')).toBe(
      'rendered audio',
    )
    expect(existsSync(path.join(directory, section.file + '.tmp'))).toBe(false)
    expect(args.filter(value => value === '-i').length).toBe(segments.length)
    expect(args[args.indexOf('-filter_complex') + 1]).toContain(
      `concat=n=${segments.length}:v=0:a=1`,
    )
    const filters = args[args.indexOf('-filter_complex') + 1]!
    for (let index = 0, count = segments.length; index < count; index += 1) {
      expect(filters).toContain(
        `[${index}:a]apad=pad_dur=${segments[index]!.pauseAfterMs / 1000}[s${index}]`,
      )
    }
  }
  expect(state.generate).toHaveBeenCalledTimes(generated)
  expect(state.save).toHaveBeenCalledTimes(generated)
  expect(
    state.generate.mock.calls.every(
      args =>
        args[1].voice === 'bm_george' &&
        args[1].speed >= 0.94 &&
        args[1].speed <= 0.97,
    ),
  ).toBe(true)
  expect(close).toHaveBeenCalledOnce()
  expect(state.align).toHaveBeenCalledTimes(generated)
  expect(state.closeAligner).toHaveBeenCalledOnce()
  const timings = JSON.parse(
    readFileSync(path.join(directory, 'timings.generated.json'), 'utf8'),
  )
  expect(timings.sections).toHaveLength(transcript.sections.length)
  expect(timings.sections[0].words[0].start).toBe(0)
  expect(existsSync(path.dirname(state.save.mock.calls[0]![0]))).toBe(false)
  expect(state.execute).not.toHaveBeenCalled()
})

test('default loader uses CPU inference and commands, while failures clean temporary audio', async () => {
  cacheModel()
  const { generateGuideNarration } = await load()
  await generateGuideNarration({ directory, modelDirectory })
  expect(state.load).toHaveBeenCalledWith(modelDirectory, {
    dtype: 'fp32',
    device: 'cpu',
  })
  expect(
    state.execute.mock.calls.every(args => args[2].stdio === 'inherit'),
  ).toBe(true)
  expect(state.dispose).toHaveBeenCalledOnce()
  const failure = Object.assign(new Error(), { code: 'ERR_COMMAND' })
  let rendered = 0
  await expect(
    generateGuideNarration({
      directory,
      modelDirectory,
      run: (_command, args) => {
        rendered += 1
        if (rendered === 2) {
          throw failure
        }
        writeFileSync(args.at(-1)!, 'replacement audio')
      },
    }),
  ).rejects.toMatchObject({ code: 'ERR_COMMAND' })
  expect(rendered).toBe(2)
  for (let i = 0, length = transcript.sections.length; i < length; i += 1) {
    expect(
      readFileSync(path.join(directory, transcript.sections[i]!.file), 'utf8'),
    ).toBe('rendered audio')
  }
  expect(state.dispose).toHaveBeenCalledTimes(2)
  expect(existsSync(path.dirname(state.save.mock.calls.at(-1)![0]))).toBe(false)
  await expect(
    generateGuideNarration({ directory, modelDirectory, voice: 'unsupported' }),
  ).rejects.toMatchObject({ code: 'ERR_NARRATION_VOICE' })
})

test('direct invocation uses the cached model and tracked asset paths on any host', async () => {
  state.main = true
  const request = vi.fn(async () => new Response('model'))
  vi.stubGlobal('fetch', request)
  await load()
  expect(request).toHaveBeenCalledOnce()
  const model = path.join(directory, '.cache/narration-model/pinned')
  expect(state.load).toHaveBeenCalledWith(model, {
    dtype: 'fp32',
    device: 'cpu',
  })
  expect(path.basename(state.execute.mock.calls[0]![1].at(-1))).toBe(
    transcript.sections[0]!.file,
  )
  expect(
    readFileSync(
      path.join(
        directory,
        'assets/repo/model-guide/narration',
        transcript.sections[0]!.file,
      ),
      'utf8',
    ),
  ).toBe('rendered audio')
  const { generateGuideNarration } = await load()
  await generateGuideNarration({
    directory,
    modelDirectory: model,
    voice: 'bm_fable',
  })
  expect(state.generate.mock.calls.at(-1)![1].voice).toBe('bm_fable')
})
