import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Legacy app: replaced during the rewrite, not linted until then.
    ignores: [
      'index.html',
      'build.js',
      'src/app.html',
      'src/parse.js',
      'node_modules',
      'dist',
      'coverage',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // The domain layer is pure: no app state, storage, browser APIs, or UI.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app/**', '**/infra/**', '**/ui/**', 'preact', 'preact/*', '@preact/*'],
              message: 'src/domain must not depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
