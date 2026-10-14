export const nativeCarrierMatrix = [
  { triple: 'darwin-arm64', library: 'libopentui.dylib', proof: 'host-proven' },
  { triple: 'darwin-x64', library: 'libopentui.dylib', proof: 'pending' },
  { triple: 'linux-arm64-gnu', library: 'libopentui.so', proof: 'pending' },
  { triple: 'linux-arm64-musl', library: 'libopentui.so', proof: 'pending' },
  { triple: 'linux-x64-gnu', library: 'libopentui.so', proof: 'pending' },
  { triple: 'linux-x64-musl', library: 'libopentui.so', proof: 'pending' },
  { triple: 'win32-arm64-msvc', library: 'opentui.dll', proof: 'pending' },
  { triple: 'win32-x64-msvc', library: 'opentui.dll', proof: 'pending' },
] as const

export type NativeCarrierTarget = (typeof nativeCarrierMatrix)[number]
