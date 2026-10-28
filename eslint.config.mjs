import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['lib/chem/analyze.ts'], rules: { '@typescript-eslint/no-unused-vars': 'off' } },
  { files: ['components/ConfirmCard.tsx'], rules: { '@next/next/no-img-element': 'off' } },
  globalIgnores([
    '.next/**',
    'public/rdkit/**',
    '.venv/**',
    'output/**',
    '.playwright-mcp/**',
    'next-env.d.ts',
  ]),
]);
