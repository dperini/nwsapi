export const FLIP_DURATION = 320
export const FLIP_DELAY_LIMIT = 800
export const FLIP_TOTAL_DURATION = FLIP_DELAY_LIMIT + FLIP_DURATION
export const FLAP_CHARACTERS = Array.from(
  ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?-_/()[]ÀÈÉÌÒÙàèéìòù',
)
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function graphemes(text: string) {
  return [...segmenter.segment(text)].map(item => item.segment)
}

export function flapCharacter(before: string, after: string, progress: number) {
  if (before === after || progress >= 1) {
    return after
  }
  const start = FLAP_CHARACTERS.indexOf(before)
  const end = FLAP_CHARACTERS.indexOf(after)
  // Unsupported glyphs stay intact, including emoji and wide terminal cells.
  if (start < 0 || end < 0) {
    return after
  }
  if (progress <= 0) {
    return before
  }
  const distance =
    (end - start + FLAP_CHARACTERS.length) % FLAP_CHARACTERS.length
  const step = Math.floor(distance * progress)
  return FLAP_CHARACTERS[(start + step) % FLAP_CHARACTERS.length]!
}

export function flipboardText(
  before: string,
  after: string,
  elapsed: number,
  row = 0,
) {
  if (before === after || elapsed >= FLIP_TOTAL_DURATION) {
    return after
  }
  const previous = before.split('\n').map(graphemes)
  return after
    .split('\n')
    .map((line, lineIndex) =>
      graphemes(line)
        .map((character, column) => {
          const old = previous[lineIndex]?.[column] ?? ' '
          // Keep destination word boundaries fixed while the letters turn.
          if (/\s/.test(character)) {
            return character
          }
          const delay = Math.min(
            FLIP_DELAY_LIMIT,
            (row + lineIndex) * 28 + column * 7,
          )
          return flapCharacter(
            old,
            character,
            (elapsed - delay) / FLIP_DURATION,
          )
        })
        .join(''),
    )
    .join('\n')
}
