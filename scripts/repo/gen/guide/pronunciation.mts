import transcript from '../../../../assets/repo/model-guide/narration/transcript.json' with { type: 'json' }

const pronunciations: Record<string, string> = transcript.pronunciations
const names = Object.keys(pronunciations)
  .sort((left, right) => right.length - left.length)
  .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
const pattern = new RegExp(`\\b(?:${names.join('|')})\\b`, 'g')

export function pronounceNarration(text: string) {
  return text.replace(pattern, name => pronunciations[name]!)
}
