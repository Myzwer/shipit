import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'handoff/**',
      'coverage/**',
      'scripts/**',
      // Local WIP / private trees (not part of CI checkout; keep local lint aligned)
      '.local/**',
      '.m2-source-pack-*/**',
      'src/dev/**',
      // Tracked historical evidence scripts; private evidence stays gitignored
      'docs/**/evidence/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier,
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        HTMLElement: 'readonly',
        HTMLDetailsElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLButtonElement: 'readonly',
        ImageBitmap: 'readonly',
        ImageBitmapOptions: 'readonly',
        File: 'readonly',
        Blob: 'readonly',
        BlobCallback: 'readonly',
        Event: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        createImageBitmap: 'readonly',
        crypto: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        AbortController: 'readonly',
        MediaQueryList: 'readonly',
        ScrollBehavior: 'readonly',
        KeyboardEvent: 'readonly',
        PointerEvent: 'readonly',
        WheelEvent: 'readonly',
        Node: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Test fixtures routinely use `any` mocks and multi-component stubs.
  {
    files: ['tests/**/*.{ts,vue}', '**/*.{spec,test}.{ts,vue}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/one-component-per-file': 'off',
    },
  },
)
