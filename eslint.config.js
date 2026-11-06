import antfu from '@antfu/eslint-config'

export default antfu({
  antislop: true,
  pnpm: true,
  test: false,
  typescript: {
    parserOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  },
  ignores: ['dist/'],
}, {
  // E2E tests load the same compiled code and decorator metadata as production.
  files: ['test/*.test.js'],
  rules: { 'antfu/no-import-dist': 'off' },
})
