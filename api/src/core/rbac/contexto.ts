import { alcanceMaisAmplo, type Alcance } from '@4med/contracts';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { cargoPapeis, papelPermissoes, permissoes as tabelaPermissoes, vinculos } from '../db/schema/acesso';
import { unidades } from '../db/schema/organograma';
import { idsDaSubarvore } from '../organograma/servico';

export type EscopoPermissao = {
  alcance: Alcance;
  /** unidades concretas onde esta permissão vale, já expandidas e sem duplicatas */
  unidades: number[];
  /**
   * `sensivel`/`modulo` vêm do catálogo (`permissoes`), carregados pelo mesmo
   * `innerJoin` que `resolverContexto` já fazia — evita uma segunda consulta a
   * `permissoes` só para descobrir se a permissão é sensível (ver `criarApp`).
   *
   * OBRIGATÓRIOS de propósito, mesmo custando um par de campos a mais em cada
   * `EscopoPermissao` montado à mão: é `sensivel` que faz `criarApp` gravar na
   * trilha o acesso a uma leitura sensível. Enquanto era opcional, "o campo não
   * veio" era indistinguível de `sensivel: false` — um refactor que deixasse de
   * projetá-lo no `select` faria `GET /auditoria` passar a servir a trilha inteira
   * SEM registrar o acesso, com `tsc`, `eslint` e a suíte toda verdes. Obrigatório,
   * a mesma omissão vira erro de compilação, que é onde ela precisa aparecer.
   */
  sensivel: boolean;
  modulo: string;
};

export type ContextoUsuario = {
  usuarioId: string;
  /**
   * chave da permissão -> alcance efetivo e as unidades onde ela vale.
   *
   * Cada entrada é isolada por permissão: as unidades de uma chave nunca incluem
   * unidades concedidas apenas por outra chave, mesmo quando vêm de vínculos
   * diferentes do mesmo usuário. Um vínculo em Marketing que concede
   * `x.y.ler:subarvore` e um vínculo em Vendas que concede só `x.y.aprovar` não
   * fazem `x.y.ler` enxergar Vendas.
   */
  permissoes: Map<string, EscopoPermissao>;
  delegacaoId: string | null;
};

/**
 * Resolve o contexto em uma consulta. Sem cache entre requisições: verificar
 * a versão custaria a mesma ida ao banco que esta consulta evita.
 */
export async function resolverContexto(usuarioId: string): Promise<ContextoUsuario> {
  const linhas = await db
    .select({
      chave: papelPermissoes.permissaoChave,
      alcance: papelPermissoes.alcance,
      unidadeId: vinculos.unidadeId,
      caminho: unidades.caminho,
      sensivel: tabelaPermissoes.sensivel,
      modulo: tabelaPermissoes.modulo,
    })
    .from(vinculos)
    .innerJoin(unidades, eq(unidades.id, vinculos.unidadeId))
    .innerJoin(cargoPapeis, eq(cargoPapeis.cargoId, vinculos.cargoId))
    .innerJoin(papelPermissoes, eq(papelPermissoes.papelId, cargoPapeis.papelId))
    // Uma permissão desativada (fora do manifesto atual, ver sincronizarPermissoes)
    // não pode continuar concedendo acesso só porque a concessão antiga em
    // papel_permissoes ainda existe no banco.
    .innerJoin(tabelaPermissoes, eq(tabelaPermissoes.chave, papelPermissoes.permissaoChave))
    .where(and(
      eq(vinculos.usuarioId, usuarioId),
      lte(vinculos.inicio, sql`current_date`),
      or(isNull(vinculos.fim), sql`${vinculos.fim} >= current_date`),
      eq(tabelaPermissoes.ativo, true),
    ));

  const permissoes = new Map<string, EscopoPermissao>();
  // Uma linha com alcance 'subarvore'/'global' repete a mesma expansão sempre que o
  // mesmo caminho aparece de novo (outra permissão do mesmo vínculo, por exemplo).
  const cacheExpansao = new Map<string, Promise<number[]>>();

  const unidadesDaLinha = (alcance: Alcance, unidadeId: number, caminho: string): Promise<number[]> => {
    if (alcance === 'proprio') return Promise.resolve([unidadeId]);
    const chaveCache = alcance === 'global' ? '/' : caminho;
    const existente = cacheExpansao.get(chaveCache);
    if (existente) return existente;
    const promessa = idsDaSubarvore(chaveCache);
    cacheExpansao.set(chaveCache, promessa);
    return promessa;
  };

  for (const l of linhas) {
    // Cada linha só pode alargar o alcance E as unidades da SUA PRÓPRIA chave de
    // permissão — nunca as de outra. É o que impede o vazamento entre
    // departamentos que vínculos diferentes, concedendo permissões diferentes,
    // causariam se o escopo fosse acumulado por usuário em vez de por permissão.
    const concedidas = await unidadesDaLinha(l.alcance, l.unidadeId, l.caminho);
    const atual = permissoes.get(l.chave);
    if (!atual) {
      // `sensivel`/`modulo` são atributos da PERMISSÃO (linha de `permissoes`),
      // não do vínculo — não variam entre as linhas que concedem a mesma chave,
      // então só precisam ser gravados na primeira vez que a chave aparece.
      permissoes.set(l.chave, {
        alcance: l.alcance, unidades: [...concedidas], sensivel: l.sensivel, modulo: l.modulo,
      });
    } else {
      atual.alcance = alcanceMaisAmplo(atual.alcance, l.alcance);
      atual.unidades.push(...concedidas);
    }
  }

  for (const escopo of permissoes.values()) {
    escopo.unidades = [...new Set(escopo.unidades)].sort((a, b) => a - b);
  }

  return { usuarioId, permissoes, delegacaoId: null };
}
