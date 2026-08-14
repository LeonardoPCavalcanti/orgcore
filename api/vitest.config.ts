import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const arquivoEnv = join(import.meta.dirname, '.env');
if (existsSync(arquivoEnv)) {
  process.loadEnvFile(arquivoEnv);
}

// Testes são HERMÉTICOS: nunca chamam a IA real nem os pacotes nativos de imagem, mesmo
// que o `.env` de dev tenha chaves/flags ligadas. Sem NENHUMA chave de provedor → gerador
// fake determinístico; flags off → passthrough de imagem. Assim o gate não faz rede.
for (const chave of [
  'LLM_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'GEMINI_API_KEY',
  'OPENROUTER_API_KEY', 'SAMBANOVA_API_KEY', 'MISTRAL_API_KEY', 'NVIDIA_API_KEY',
]) {
  process.env[chave] = '';
}
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
