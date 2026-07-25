import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['api/src/**/*.ts'],
  ignores: ['api/src/core/db/client.ts'],
  languageOptions: {
    parser: tseslint.parser,
  },
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: 'pg', message: 'Acesse o banco apenas por core/db/client.ts' },
        { name: 'drizzle-orm/node-postgres', message: 'Acesse o banco apenas por core/db/client.ts' },
      ],
    }],
  },
});
