import path from 'node:path'

export function weightsPath(model: string, host: 'chromium' | 'jsdom') {
  return path.join(model, `${host}-weights.generated.json`)
}
