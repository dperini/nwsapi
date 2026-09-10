export function isCompoundSeparator(
  depth: number,
  chr: number,
  siblings: boolean | undefined,
) {
  return (
    depth === 0 &&
    (chr == 44 /* ',' */ ||
      chr == 62 /* '>' */ ||
      (!siblings && chr == 43) /* '+' */ ||
      (!siblings && chr == 126) /* '~' */ ||
      chr == 32 /* ' ' */ ||
      chr == 9 /* '\t' */ ||
      chr == 10 /* '\n' */ ||
      chr == 12 /* '\f' */ ||
      chr == 13)
  )
}
