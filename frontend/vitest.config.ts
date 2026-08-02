import { defineConfig, mergeConfig } from 'vite'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setupTests.ts'],
      globals: false,
      coverage: {
        reporter: ['text', 'lcov'],
      },
    },
  }),
)
