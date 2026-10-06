import { requireNpm } from './lib/package-manager.mjs'

requireNpm(process.env['npm_config_user_agent'])
