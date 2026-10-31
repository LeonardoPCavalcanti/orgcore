import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida');

export const pool = new pg.Pool({ connectionString: url });
export const db = drizzle(pool);
export type Db = typeof db;

/**
 * A partir do drizzle 0.45 todo erro de consulta chega embrulhado num
 * `DrizzleQueryError` ("Failed query: ...") e o erro cru do Postgres (codigo,
 * mensagem do gatilho, nome da constraint) fica em `cause`. Quem precisa ler o
 * erro original (traduzir gatilho em 422, reconhecer violacao de unicidade)
 * passa por aqui, para nao depender do formato do embrulho.
 */
export function erroDoBanco(erro: unknown): unknown {
  let atual = erro;
  for (let i = 0; i < 5 && typeof atual === 'object' && atual !== null; i++) {
    const nome = Reflect.get(atual, 'name');
    const mensagem = String(Reflect.get(atual, 'message') ?? '');
    const causa = Reflect.get(atual, 'cause');
    const embrulho = nome === 'DrizzleQueryError' || mensagem.startsWith('Failed query');
    if (!embrulho || causa === undefined || causa === null) break;
    atual = causa;
  }
  return atual;
}
