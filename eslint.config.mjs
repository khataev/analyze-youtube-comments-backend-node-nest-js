// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Классы модулей Nest пустые по определению: всё описано в декораторе @Module
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Выше по дереву — только через алиасы @/ и @test/ (tsconfig.json). Соседние файлы
      // модуля импортируются через './': при переносе папки целиком эти импорты не меняются
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['../*'], message: "Use the @/ or @test/ alias instead of '../'." }],
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // В тестах подменяем зависимости частичными объектами
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
