import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const arquivoEnv = join(import.meta.dirname, '.env');
if (existsSync(arquivoEnv)) {
  process.loadEnvFile(arquivoEnv);
}

// Testes são HERMÉTICOS: nunca chamam a IA real nem os pacotes nativos de imagem, mesmo
// que o `.env` de dev tenha chave/flags ligadas. Sem chave → gerador fake determinístico;
// flags off → passthrough de imagem. Assim o gate não faz rede nem baixa modelo.
process.env.LLM_API_KEY = '';
process.env.RECORTE_FUNDO = 'false';
process.env.REALCE_FOTO = 'false';

export default defineConfig({
  test: {
    environment: 'node',
    // Os arquivos de teste compartilham um único Postgres e cada um recria o
    // schema inteiro em beforeAll (prepararBanco): rodar arquivos em paralelo
    // faz um arquivo derrubar as tabelas que outro está usando.
    fileParallelism: false,
  },
});
