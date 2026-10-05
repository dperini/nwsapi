import type { CompileState } from '../state.mts'

export function typeUnionCondition(state: CompileState, tags: string[]) {
  const direct = tags.map((tag, index) => {
    const read = index ? 'n' : '(n=' + state.read.tag('e') + ')'
    return (
      read +
      '==' +
      JSON.stringify(
        state.engine.HTML_DOCUMENT ? state.engine.asciiLower(tag) : tag,
      )
    )
  })
  if (!state.engine.HTML_DOCUMENT) {
    return direct.join('||')
  }
  const fallback = tags.map(
    tag => 's.matchesTag(e,' + JSON.stringify(tag) + ')',
  )
  if (state.engine.Config.LEGACY) {
    return direct
      .map((check, index) => '(' + check + '||' + fallback[index] + ')')
      .join('||')
  }
  // Check every literal before invoking a helper for foreign-name folding.
  // An HTML-namespace mismatch cannot become a match through that fallback.
  return (
    '(' +
    direct.join('||') +
    ')||(' +
    'e.namespaceURI!=' +
    JSON.stringify(state.engine.NAMESPACE) +
    '&&(' +
    fallback.join('||') +
    '))'
  )
}
