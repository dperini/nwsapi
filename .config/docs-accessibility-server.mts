import { mergeConfig } from 'vite'
import modelGuideConfig from './model-guide.mts'

export default mergeConfig(modelGuideConfig, {
  server: {
    // Prevent unrelated Markdown edits from reloading a page under test.
    hmr: false,
  },
})
