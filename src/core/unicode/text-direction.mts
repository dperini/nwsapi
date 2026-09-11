import {
  arabicLetter,
  leftToRight,
  rightToLeft,
} from '../../external/unicode.js'

export type Direction = 'ltr' | 'rtl'

// The three immutable expressions are bundled once, outside engine instances.
export function textDirection(text: string): Direction | null {
  const left = text.search(leftToRight)
  if (left === 0) {
    return 'ltr'
  }
  const prefix = left < 0 ? text : text.slice(0, left)
  if (rightToLeft.test(prefix) || arabicLetter.test(prefix)) {
    return 'rtl'
  }
  return left < 0 ? null : 'ltr'
}
