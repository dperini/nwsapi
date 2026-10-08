const paths = {
  copy: 'M8 8H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3M10 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  check: 'm5 12 4 4 10-10',
  external:
    'M14 3h7v7m0-7L10 14M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  internal: 'M4 12h16m-6-6 6 6-6 6',
} as const

export function iconMarkup(name: keyof typeof paths) {
  return `<svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`
}
