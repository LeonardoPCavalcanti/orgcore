import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import argon2 from 'argon2';
import { ErroHttp } from '../erros';

const OPCOES = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

const vazadas = new Set(
  readFileSync(join(import.meta.dirname, 'senhas-vazadas.txt'), 'utf8')
    .split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean),
);

/**
 * Conforme NIST SP 800-63B: comprimento mínimo e checagem contra senhas
 * conhecidas. Sem regra de composição e sem expiração forçada — ambas
 * pioram a segurança na prática.
 */
export function validarForcaDaSenha(senha: string): void {
  if (senha.length < 12) {
    throw new ErroHttp(422, 'senha_curta', 'A senha precisa ter ao menos 12 caracteres');
  }
  if (vazadas.has(senha.trim().toLowerCase())) {
    throw new ErroHttp(422, 'senha_comum', 'Esta senha é comum e aparece em listas de vazamentos conhecidos');
  }
}

export const gerarHash = (senha: string): Promise<string> => argon2.hash(senha, OPCOES);

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, senha);
  } catch {
    return false;
  }
}
