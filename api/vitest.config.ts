import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const arquivoEnv = join(import.meta.dirname, '.env');
if (existsSync(arquivoEnv)) {
  process.loadEnvFile(arquivoEnv);
}

export default defineConfig({
  test: {
    environment: 'node',
    // Os arquivos de teste compartilham um único Postgres e cada um recria o
    // schema inteiro em beforeAll (prepararBanco): rodar arquivos em paralelo
    // faz um arquivo derrubar as tabelas que outro está usando.
    fileParallelism: false,
  },
});
