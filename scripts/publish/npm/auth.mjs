import { start } from '../cli.mjs'
import { npm } from '../lib.mjs'

start(() => npm(['login'], { interactive: true }))
