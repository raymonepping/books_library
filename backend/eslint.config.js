import js from '@eslint/js';
import globals from 'globals';
import vue from 'eslint-plugin-vue';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  js.configs.recommended,               // Built-in recommended JS rules
  ...vue.configs['flat/recommended'],   // Vue 3 recommended, flat config
  {
    plugins: {
      prettier: prettierPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.browser,
      },
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
];
