import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { naoEncontrado, semPermissao } from '../erros';
import type { ContextoUsuario } from './contexto';
import { escopoDe } from './escopo';
import { tabelaEscopada } from './tabelas-escopadas';

export type Repositorio = {
  /**
   * Confirma só que a chave de permissão existe no contexto — não aplica
   * nenhum filtro de escopo. NÃO é autorização suficiente para uma escrita
   * num registro específico: uma rota de escrita futura que use
   * `repo.exigir('x.criar')` sozinha, sem também checar que a unidade do
   * registro sendo gravado está dentro de `escopoDe(ctx, chave)?.unidades`
   * (ou que o dono bate, quando a tabela tiver coluna de dono), deixa passar
   * gravação fora do escopo do usuário. Use `exigir` só para barrar cedo quem
   * não tem a permissão de jeito nenhum — nunca como a única checagem antes
   * de gravar um registro específico.
   */
  exigir(chave: string): void;
  /**
   * O retorno é `unknown` de propósito: `nomeTabela` é uma string em tempo de
   * execução, sem vínculo nenhum, em tempo de compilação, com a forma real da
   * linha. Um genérico `T` escolhido livremente pelo chamador (desenho
   * original) permitia `listar<Colaborador>('outra_tabela', chave)` compilar
   * sem checagem nenhuma — um cast disfarçado de tipo. Quem consome deve
   * validar a forma da linha (por exemplo com um schema Zod) antes de confiar
   * nos campos.
   */
  listar(nomeTabela: string, chave: string): Promise<unknown[]>;
  obter(nomeTabela: string, chave: string, id: string): Promise<unknown>;
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

    // O filtro por unidade entra sempre — inclusive quando o alcance é
    // `proprio` e a tabela tem coluna de dono. Num sistema que guarda dado de
    // RH, "meus próprios registros" significa os meus DENTRO do meu escopo,
    // não os meus em qualquer lugar da empresa: um registro cujo dono seja o
    // usuário mas que viva numa unidade fora do escopo dele não deve
    // aparecer. Por isso as duas condições se combinam com `and`, nunca uma
    // substituindo a outra.
    const condicaoUnidade = inArray(def.colunaUnidade, escopo.unidades);
    if (escopo.alcance === 'proprio' && def.colunaDono) {
      return { def, condicao: and(eq(def.colunaDono, ctx.usuarioId), condicaoUnidade) };
    }
    return { def, condicao: condicaoUnidade };
  }

  return {
    exigir(chave) {
      if (!ctx.permissoes.has(chave)) throw semPermissao();
    },

    async listar(nomeTabela, chave) {
      const { def, condicao } = filtro(nomeTabela, chave);
      return db.select().from(def.tabela).where(condicao);
    },

    async obter(nomeTabela, chave, id) {
      const { def, condicao } = filtro(nomeTabela, chave);
      const [linha] = await db.select().from(def.tabela)
        .where(and(eq(def.colunaId, id), condicao))
        .limit(1);
      // Fora de escopo é indistinguível de inexistente, de propósito.
      if (!linha) throw naoEncontrado();
      return linha;
    },
  };
}
