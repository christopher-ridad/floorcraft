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
  prettier,
);
