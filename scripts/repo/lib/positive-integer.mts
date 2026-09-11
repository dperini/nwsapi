export function positiveInteger(
  value: string,
  name: string,
  max = 10_000,
): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new RangeError(`${name} must be an integer between 1 and ${max}.`)
  }
  return number
}
