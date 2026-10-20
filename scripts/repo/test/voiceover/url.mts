export const API_READING_PATH = '/model-guide-reading.html'
export const API_DOCUMENT_QUERY = 'doc=docs/repo/selector/api.md'

export function validateNarrationUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('The narration URL must be an absolute local HTTP URL.')
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !validPort(url.port) ||
    url.pathname !== API_READING_PATH ||
    url.search !== `?${API_DOCUMENT_QUERY}` ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      'Use the local API reader URL: http://127.0.0.1:<port>/model-guide-reading.html?doc=docs/repo/selector/api.md',
    )
  }
  return url
}

export function validPort(port: string) {
  if (!port) {
    return false
  }
  const value = Number(port)
  return Number.isInteger(value) && value > 0 && value <= 65_535
}
