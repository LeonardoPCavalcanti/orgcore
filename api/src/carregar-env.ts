import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Carrega as variáveis de `api/.env` (DATABASE_URL etc.) em desenvolvimento.
//
// Importado como EFEITO COLATERAL e ANTES de qualquer módulo que leia
// `process.env`: `core/db/client.ts` lê `DATABASE_URL` no topo do módulo, e
// imports ES são avaliados na ordem — então este precisa ser o primeiro import
// de `servidor.ts` para o valor já estar em `process.env` quando o cliente subir.
//
// Em produção o arquivo não existe e as variáveis vêm do ambiente da hospedagem;
// `loadEnvFile` não sobrescreve o que já está definido no ambiente.
const arquivoEnv = join(import.meta.dirname, '../.env');
if (existsSync(arquivoEnv)) {
  process.loadEnvFile(arquivoEnv);
}
