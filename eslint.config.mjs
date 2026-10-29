import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** Forbids files in one layer from importing the given outer layers or packages. */
function layerRule(files, forbidden) {
  return {
    files: [files],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: forbidden, message: 'Layers may only depend inward.' }] },
      ],
    },
  };
}

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
  // Layers depend inward only: ui → app → domain, and infra implements app's ports.
  layerRule('src/domain/**/*.ts', [
    '**/app/**',
    '**/infra/**',
    '**/ui/**',
    'preact',
    'preact/*',
    '@preact/*',
  ]),
  layerRule('src/app/**/*.ts', [
    '**/infra/**',
    '**/ui/**',
    'preact',
    'preact/*',
    '@preact/signals',
  ]),
  layerRule('src/infra/**/*.ts', ['**/ui/**', 'preact', 'preact/*', '@preact/*']),
  prettier,
);
