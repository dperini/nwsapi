import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
process.env['OTUI_ASSET_ROOT'] ??= path.join(directory, 'assets')

const native =
  await import('../../scripts/repo/cli/ui/native/carrier.mts').catch(
    () => undefined,
  )
const loaded = native
  ? await native.loadHybridCarrier(process.env['OTUI_ASSET_ROOT']!)
  : false
const interactive =
  loaded === false
    ? undefined
    : await import('../../scripts/repo/cli/ui/menu.mts').catch(() => undefined)
process.exitCode = interactive ? await interactive.runInteractiveCli() : 78
