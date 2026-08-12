import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // 忽略目录
  {
    ignores: ['dist/**', 'node_modules/**', 'src/auto-imports.d.ts', 'src/components.d.ts'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  // JS / TS 文件规则
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // —— 宽松项（让新手能顺利提交）——
      'no-console': 'off', // 允许 console.log
      'no-debugger': 'warn',
      'no-unused-vars': 'off', // 关掉 JS 的未使用变量
      '@typescript-eslint/no-unused-vars': 'warn', // TS 的未使用变量只警告
      '@typescript-eslint/no-explicit-any': 'off', // 允许 any
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off', // 配合 auto-import，关掉未定义变量检查
      // —— 仍保留的规范 ——
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'object-shorthand': ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': 'off', // 不强制 type import 写法
      'vue/multi-word-component-names': 'off',
    },
  },
  // Vue SFC 规则
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-debugger': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'object-shorthand': ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': 'off',
      'vue/multi-word-component-names': 'off',
    },
  },
  eslintConfigPrettier,
)
