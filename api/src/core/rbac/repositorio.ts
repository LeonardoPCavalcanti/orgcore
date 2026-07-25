import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { naoEncontrado, semPermissao } from '../erros';
import type { ContextoUsuario } from './contexto';
import { escopoDe } from './escopo';
import { tabelaEscopada } from './tabelas-escopadas';

export type Repositorio = {
  exigir(chave: string): void;
  listar<T>(nomeTabela: string, chave: string): Promise<T[]>;
  obter<T>(nomeTabela: string, chave: string, id: string): Promise<T>;
};

/**
 * Único caminho de leitura de dado escopado. Exige a chave da permissão como
 * argumento — não existe consulta que não informe sob qual permissão está lendo.
 */
export function criarRepositorio(ctx: ContextoUsuario): Repositorio {
  function filtro(nomeTabela: string, chave: string) {
    const escopo = escopoDe(ctx, chave);
    if (!escopo) throw semPermissao();
    const def = tabelaEscopada(nomeTabela);

    if (escopo.alcance === 'proprio' && def.colunaDono) {
      return { def, condicao: eq(def.colunaDono, ctx.usuarioId) };
    }
    return { def, condicao: inArray(def.colunaUnidade, escopo.unidades) };
  }

  return {
    exigir(chave) {
      if (!ctx.permissoes.has(chave)) throw semPermissao();
    },

    async listar<T>(nomeTabela: string, chave: string): Promise<T[]> {
      const { def, condicao } = filtro(nomeTabela, chave);
      return (await db.select().from(def.tabela).where(condicao)) as T[];
    },

    async obter<T>(nomeTabela: string, chave: string, id: string): Promise<T> {
      const { def, condicao } = filtro(nomeTabela, chave);
      const [linha] = await db.select().from(def.tabela)
        .where(and(eq(def.colunaId, id), condicao))
        .limit(1);
      // Fora de escopo é indistinguível de inexistente, de propósito.
      if (!linha) throw naoEncontrado();
      return linha as T;
    },
  };
}
