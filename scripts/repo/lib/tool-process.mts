import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WIN32 } from './platform.mts'

export function toolProcess(args: string[], windows = WIN32) {
  if (!windows) {
    return {
      command: process.execPath,
      args,
      options: {},
      dispose() {},
    }
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-'))
  const file = path.join(directory, 'arguments.json')
  try {
    writeFileSync(file, JSON.stringify(args))
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
  return {
    // Expand quoted executable paths once. Tool arguments never enter cmd.exe.
    command: '"%NWSAPI_TOOL_NODE%" "%NWSAPI_TOOL_WORKER%"',
    args: [],
    options: {
      shell: true,
      windowsHide: true,
      env: {
        ...process.env,
        NWSAPI_TOOL_NODE: path.normalize(process.execPath),
        NWSAPI_TOOL_WORKER: fileURLToPath(
          new URL('./tool-worker.mts', import.meta.url),
        ),
        NWSAPI_TOOL_ARGUMENTS: file,
      },
    },
    dispose() {
      rmSync(directory, { recursive: true, force: true })
    },
  }
}
