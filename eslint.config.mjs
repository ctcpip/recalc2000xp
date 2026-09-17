import ultraMegaConfig from 'eslint-config-ultra-mega';

export default [
  ...ultraMegaConfig,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        document: 'readonly',
        Element: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        localStorage: 'readonly',
        process: 'readonly',
      },
    },
  },
];
