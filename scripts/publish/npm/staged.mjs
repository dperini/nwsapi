import { start } from '../cli.mjs'
import { npmRead } from '../pipeline.mjs'

start(() => {
  npmRead(['whoami'])
  console.log(npmRead(['stage', 'list', 'nwsapi', '--json']))
})
