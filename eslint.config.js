import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import typescriptEslint from 'typescript-eslint';

/* Module path resolution */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const basePlugins = {
  react: reactPlugin,
  'react-hooks': reactHooksPlugin,
  'react-refresh': reactRefreshPlugin,
  import: importPlugin,
  'unused-imports': unusedImportsPlugin,
  '@typescript-eslint': typescriptEslint.plugin,
  prettier: prettierPlugin,
};

const baseLanguageOptions = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  globals: {
    document: 'readonly',
    navigator: 'readonly',
    window: 'readonly',
  },
};

const tsLanguageOptions = {
  ...baseLanguageOptions,
  parser: typescriptEslint.parser,
  parserOptions: {
    project: ['./tsconfig.json', './tsconfig.node.json'],
    ecmaFeatures: {
      jsx: true,
    },
    skipLibCheck: true,
    warnOnUnsupportedTypeScriptVersion: false,
  },
};

const jsLanguageOptions = {
  ...baseLanguageOptions,
  parser: typescriptEslint.parser,
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
};

const importSettings = {
  'import/resolver': {
    node: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      moduleDirectory: ['node_modules', 'src'],
    },
    typescript: {
      alwaysTryTypes: true,
      project: './tsconfig.json',
    },
  },
  'import/parsers': {
    '@typescript-eslint/parser': ['.ts', '.tsx'],
  },
  'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
};

export default typescriptEslint.config(
  {
    /* Core configuration */
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/public/**',
      '**/.eslintrc.cjs',
      '.prettierrc.js',
      '**/build/**',
      '**/coverage/**',
      '**/*.config.js',
      'eslint.config.js',
      'vite.config.ts',
      'tailwind.config.js',
      '**/stats.html',
      '**/routeTree.gen.ts',
    ],
    languageOptions: baseLanguageOptions,
    /* Plugin registration */
    plugins: basePlugins,
    /* ESLint rules */
    rules: {
      /* Format with Prettier */
      'prettier/prettier': ['warn', {}, { usePrettierrc: true }],

      /* React rules */
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-sort-props': [
        'warn',
        {
          callbacksLast: true,
          shorthandFirst: true,
          ignoreCase: true,
          reservedFirst: true,
        },
      ],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      /* TypeScript strict rules */
      '@typescript-eslint/no-unused-vars': 'off' /* Using unused-imports plugin instead */,
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'warn',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/restrict-template-expressions': [
        'warn',
        {
          allowNumber: true,
          allowBoolean: true,
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/no-restricted-types': 'error',

      /* Clean up unused code */
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      /* Import organization */
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          pathGroups: [
            {
              pattern: 'react',
              group: 'builtin',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'always',
          distinctGroup: true,
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/no-duplicates': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-useless-path-segments': 'error',
      'import/no-cycle': 'warn',
      'import/no-named-as-default-member': 'warn',
      'import/no-named-as-default': 'warn',

      /* Code quality */
      'no-console': 'error',
      'no-debugger': 'warn',
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'eol-last': ['error', 'always'],
    },
    settings: {
      react: {
        version: 'detect',
      },
      ...importSettings,
    },
  },
  {
    files: ['**/routeTree.gen.ts'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  /* JavaScript-specific config */
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    ignores: ['.prettierrc.js', 'eslint.config.js', '**/*.config.js'],
    plugins: basePlugins,
    languageOptions: jsLanguageOptions,
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  /* JavaScript files that need parserOptions.project */
  {
    files: ['scripts/*.{js,ts}', 'scripts/**/*.{js,ts}'],
    plugins: basePlugins,
    languageOptions: {
      ...jsLanguageOptions,
      parserOptions: {
        ...jsLanguageOptions.parserOptions,
        project: ['./tsconfig.json', './tsconfig.node.json'],
        skipLibCheck: true,
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'no-console': 'off',
    },
  },

  /* TypeScript-specific rules */
  {
    files: [
      'src/lib/config.ts',
      'src/lib/services/appInsights.ts',
      'src/lib/services/logger.ts',
      'src/i18n.ts',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: basePlugins,
    languageOptions: tsLanguageOptions,
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
          allowConciseArrowFunctionExpressionsStartingWithVoid: true,
          allowFunctionsWithoutTypeParameters: true,
          allowedNames: ['Component', 'App', 'Page', 'Layout', 'Route'],
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/naming-convention': [
        'warn',
        /* Type definitions */
        {
          selector: ['typeLike'],
          format: ['PascalCase'],
        },
        /* Variables and functions */
        {
          selector: ['function', 'variable', 'parameter', 'method', 'accessor'],
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        /* Constants */
        {
          selector: 'variable',
          modifiers: ['const'],
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        /* React components */
        {
          selector: 'variable',
          filter: {
            regex: '^[A-Z][a-zA-Z0-9]+$',
            match: true,
          },
          format: ['PascalCase'],
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
      '@typescript-eslint/method-signature-style': ['warn', 'property'],
      '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }],
      '@typescript-eslint/prefer-ts-expect-error': 'warn',
      '@typescript-eslint/consistent-indexed-object-style': ['warn', 'record'],
    },
  },

  /* Component rules */
  {
    files: ['**/src/components/**/*.{tsx,jsx}'],
    plugins: basePlugins,
    languageOptions: jsLanguageOptions,
    rules: {
      'react/display-name': 'warn',
      'react/prefer-stateless-function': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      'react/no-deprecated': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/no-unsafe': 'warn',
    },
  },

  /* Test file exceptions */
  {
    files: ['**/*.test.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}'],
    plugins: basePlugins,
    languageOptions: jsLanguageOptions,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'off',
      'max-lines': 'off',
    },
  },

  /* Config file exceptions */
  {
    files: ['**/*.config.{js,ts,mjs,cjs}', 'vite.config.ts'],
    plugins: basePlugins,
    languageOptions: jsLanguageOptions,
    rules: {
      'import/no-default-export': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  }
);
