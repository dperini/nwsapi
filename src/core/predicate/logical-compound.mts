export function isLogicalCompound(name: string) {
  return /^(?:not|is|where)$/.test(name)
}
