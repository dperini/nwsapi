export interface EngineConfiguration {
  [key: string]: boolean | number
  CACHE_LIMIT: number
  CACHE_BYTES: number
  IDS_DUPES: boolean
  FORGIVING: boolean
  LEGACY: boolean
  NEURAL_PLANNER: boolean
  NODE_LIST: boolean
  LOGERRORS: boolean
  USR_EVENT: boolean
  VERBOSITY: boolean
}

export interface Configure {
  (): EngineConfiguration
  (option: 'CACHE_LIMIT' | 'CACHE_BYTES'): number
  (option: string): boolean | number
  (options: Record<string, unknown>, clear?: boolean): boolean
}

export function validateCacheOptions(options: Record<string, unknown>) {
  const names = ['CACHE_LIMIT', 'CACHE_BYTES']
  for (let index = 0, length = names.length; index < length; ++index) {
    const name = names[index]!
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      const value = options[name]
      if (
        typeof value !== 'number' ||
        value < 0 ||
        value > 9007199254740991 ||
        value % 1 !== 0
      ) {
        throw new TypeError(name + ' must be a nonnegative safe integer')
      }
    }
  }
}
