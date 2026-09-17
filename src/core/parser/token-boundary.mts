export function joinsSelectorTokens(before: string, after: string) {
  return (
    (/[\w\u0080-\uffff-]/.test(before) &&
      /[\w\u0080-\uffff(\\-]/.test(after)) ||
    (before == '#' && /[\w\u0080-\uffff\\-]/.test(after)) ||
    (/[~|^$*]/.test(before) && after == '=')
  )
}
