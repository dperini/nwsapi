import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import transcript from '../../../../../assets/repo/model-guide/narration/transcript.json' with { type: 'json' }
const state = vi.hoisted(() => ({
  execute: vi.fn(),
  save: vi.fn(),
  generate: vi.fn(),
  dispose: vi.fn(),
  load: vi.fn(),
  main: false,
  root: '',
}))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
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
  nock.cleanAll()
  rmSync(directory, { recursive: true, force: true })
})
async function load() {
  return import('../../../../../scripts/repo/gen/guide/narration.mts')
}
function download() {
  return nock('https://huggingface.co')
    .get('/fixture/model/resolve/pinned/model.onnx')
    .reply(200, 'model')
}

test('pinned model downloads verify integrity and subsequent runs stay offline', async () => {
  const { prepareNarrationModel } = await load()
  const scope = download()
  await prepareNarrationModel(modelDirectory)
  expect(scope.isDone()).toBe(true)
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
  nock('https://huggingface.co')
    .get('/fixture/model/resolve/pinned/model.onnx')
    .reply(503)
  await expect(prepareNarrationModel(modelDirectory)).rejects.toMatchObject({
    code: 'ERR_NARRATION_DOWNLOAD',
  })
  nock('https://huggingface.co')
    .get('/fixture/model/resolve/pinned/model.onnx')
    .reply(200, 'corrupt')
  await expect(prepareNarrationModel(modelDirectory)).rejects.toMatchObject({
    code: 'ERR_NARRATION_INTEGRITY',
  })
  expect(existsSync(path.join(modelDirectory, 'model.onnx'))).toBe(false)
  const bytes = 'nested'
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  nock('https://huggingface.co')
    .get('/fixture/model/resolve/pinned/onnx/nested.bin')
    .reply(200, bytes)
  await prepareNarrationModel(modelDirectory, [
    { name: 'onnx/nested.bin', sha256 },
  ])
  expect(
    readFileSync(path.join(modelDirectory, 'onnx/nested.bin'), 'utf8'),
  ).toBe(bytes)
})

test('spoken segments preserve visible words and validate pace and quiet pause metadata', async () => {
  const { narrationSegments, narrationSpeech } = await load()
  expect(narrationSpeech('nwsapi finds the cards.')).toBe(
    'N W S A P I finds the cards.',
  )
  expect(narrationSpeech('PyTorch trains the model.')).toBe(
    'PyTorch trains the model.',
  )
  const segment = { text: 'A clear sentence ends here.', pauseAfterMs: 420 }
  expect(
    narrationSegments({ text: segment.text, segments: [segment] }),
  ).toEqual([{ ...segment, speed: transcript.speed }])
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
  download()
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
  expect(existsSync(path.dirname(state.save.mock.calls[0]![0]))).toBe(false)
  expect(state.execute).not.toHaveBeenCalled()
})

test('default loader uses CPU inference and commands, while failures clean temporary audio', async () => {
  download()
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
  download()
  await load()
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
