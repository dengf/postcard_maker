// ESLint flat config, ported from budget_planner's. This project had no
// linter at all before -- only Prettier, and Prettier is formatting, not
// correctness -- so everything here is new coverage.
//
// The shape follows the sibling repo deliberately: three tools that share
// an architecture should fail for the same reasons. The differences are
// only where this app genuinely differs, and each one is noted below.
//
//  1. `eslint-config-prettier` goes LAST. It switches off every stylistic
//     rule that would disagree with `.prettierrc`. Anything that reformats
//     code does not belong here.
//
//  2. `src/vibeWorker.js` runs in a Worker, where `self` exists and
//     `window`/`document` do not. That is the distinction that catches a
//     `document.` reference in worker code -- which jsdom cannot test for,
//     because in jsdom `document` is always there.
//
//  3. `jsx-a11y` earns its place here more than anywhere else in the line:
//     this is the tool with a doodle surface, a sticker palette and a
//     drag-to-place canvas, and CLAUDE.md's phone rules are mostly about
//     controls that are reachable and labelled.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import testingLibrary from 'eslint-plugin-testing-library';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['pkg*/**', 'dist/**', 'node_modules/**', 'static/**'],
  },

  js.configs.recommended,

  // Flags an `eslint-disable` comment for a rule that no longer fires, so
  // suppressions cannot outlive the thing they suppressed.
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },

  // Everything in src/ is browser code built by webpack/babel.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Injected by webpack's DefinePlugin (see webpack.config.js), so it
        // exists at runtime but appears undeclared to a linter.
        __BUILD_ID__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // Same call as budget_planner: pre-existing effects that setState
      // synchronously are a wasted render, not a wrong result. Visible in
      // every run rather than a blocker on every future PR.
      'react-hooks/set-state-in-effect': 'warn',

      // The compiler-backed purity rule cannot tell a function *defined*
      // during render from one *called* during render, and this app is
      // full of `Date.now()` inside click handlers. Kept visible as a
      // warning rather than trusted as an error.
      'react-hooks/purity': 'warn',

      // `@babel/preset-react` runs in classic mode (see webpack.config.js
      // -- no `runtime: 'automatic'`), so React really must be in scope.
      'react/react-in-jsx-scope': 'error',

      // No propTypes anywhere and no TypeScript; requiring them now would
      // be several hundred warnings of pure noise.
      'react/prop-types': 'off',

      // Coordinates, zoom factors and byte counts get compared a lot here.
      // `==` coercion is never what's wanted, and `!= null` stays allowed
      // because that is how this codebase writes a nullish check.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // An unused variable is either dead code or a typo'd reference.
      // `const { photo, ...rest } = state` is the idiomatic way to omit a
      // key and the binding is unused on purpose -- that is the point.
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // `catch {}` is intentional in several storage and canvas paths
      // (jsdom has no localStorage; WebKit drops Blobs in IndexedDB -- see
      // CLAUDE.md). A genuinely empty block anywhere else is not.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Blocking, unstyled, untestable, and it would sit on top of a photo
      // the user is mid-edit on.
      'no-alert': 'error',

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-var': 'error',
      'prefer-const': 'error',

      // Catches a non-breaking space pasted invisibly into source -- a real
      // hazard next to three catalogs that carry CJK text.
      'no-irregular-whitespace': ['error', { skipRegExps: true }],

      // The message copy in this app is prose with apostrophes in it.
      'react/no-unescaped-entities': 'off',
    },
  },

  // The vibe worker has `self`, not `window`/`document`.
  {
    files: ['src/vibeWorker.js'],
    languageOptions: { globals: globals.worker },
  },

  // Tests run in jsdom with vitest's globals injected (see
  // vitest.config.mjs `globals: true`), so they are neither pure browser
  // nor pure node.
  {
    files: ['src/**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    plugins: { vitest, 'testing-library': testingLibrary },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...vitest.environments.env.globals,
        // Several suites read source files off disk to assert on their
        // text (`pinch-zoom.test.js`, `wasm-call-sites.test.js`), which
        // needs node's globals alongside the browser's.
        ...globals.node,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      ...testingLibrary.configs['flat/react'].rules,

      // A focused or skipped test that reaches main silently stops
      // covering what it claims to cover.
      'vitest/no-focused-tests': 'error',

      // `previewFilter.test.js` compares colours through a `close(got, want)`
      // helper, because these are floating-point channel values and an exact
      // match is the wrong assertion. The rule cannot see an `expect` inside
      // a helper, so six real tests read as empty ones. Naming the helper is
      // the fix; switching the rule off would lose the check everywhere else.
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'close'] }],

      // Same call as budget_planner: the query-style rules are preferences
      // that would rewrite passing tests. The plugin's value here is its
      // async rules, which catch a missing `await` on `findBy*` -- a real,
      // silent source of flake. Those stay on.
      'testing-library/no-container': 'off',
      'testing-library/prefer-screen-queries': 'off',
      'testing-library/no-node-access': 'off',
    },
  },

  // Build tooling runs in node, not a browser.
  {
    files: ['vitest.config.mjs'],
    languageOptions: { globals: globals.node, sourceType: 'module' },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['webpack.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { 'no-console': 'off' },
  },

  prettier,
];
