import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

const carrierPath = process.argv[2]
if (!carrierPath) {
  throw new Error('Pass the hybrid carrier path.')
}
const carrier = createRequire(import.meta.url)(carrierPath) as {
  libraryPath: string
}
const opentui = await import('@opentui/core')
opentui.setRenderLibPath(carrier.libraryPath)
await delay(0)
const { runInteractiveCli } = await import('../../cli/ui/menu.mts')
process.exitCode = await runInteractiveCli()
