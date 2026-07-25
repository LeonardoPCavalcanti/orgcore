import { chavePermissao } from '@4med/contracts';
import { notInArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { permissoes } from '../db/schema/acesso';
import type { ManifestoModulo } from './tipos';

/**
 * Executado no boot. Qualquer inconsistência derruba a aplicação — é a garantia
 * de que rota nova nunca sobe desprotegida por esquecimento.
 */
export function validarManifestos(manifestos: ManifestoModulo[]): void {
  const vistas = new Map<string, string>();

  for (const m of manifestos) {
    for (const p of m.permissoes) {
      chavePermissao.parse(p.chave);
      // A duplicidade é checada antes do prefixo: quando dois módulos declaram a
      // mesma chave, o segundo quase sempre também viola o prefixo (a chave não
      // pode começar com dois nomes de módulo ao mesmo tempo). O erro que importa
      // reportar é o conflito entre módulos, não o prefixo do módulo perdedor.
      const dono = vistas.get(p.chave);
      if (dono) {
        throw new Error(
          `permissao "${p.chave}" duplicada entre os modulos "${dono}" e "${m.nome}"`,
        );
      }
      if (!p.chave.startsWith(`${m.nome}.`)) {
        throw new Error(
          `permissao "${p.chave}" precisa usar o prefixo do modulo "${m.nome}"`,
        );
      }
      vistas.set(p.chave, m.nome);
    }
  }

  for (const m of manifestos) {
    for (const r of m.rotas) {
      const id = `${r.metodo} ${r.caminho}`;
      // Toda rota precisa declarar uma das três: permissão, pública ou autenticada.
      // O silêncio nunca é interpretado como liberado.
      if (r.permissao === null && r.publica !== true && r.autenticada !== true) {
        throw new Error(`rota "${id}" do modulo "${m.nome}" esta sem permissao declarada`);
      }
      if (r.publica === true && r.autenticada === true) {
        throw new Error(`rota "${id}" nao pode ser publica e autenticada ao mesmo tempo`);
      }
      if (r.permissao !== null && !vistas.has(r.permissao)) {
        throw new Error(`rota "${id}" usa permissao "${r.permissao}" nao declarada em manifesto`);
      }
    }
    for (const item of m.menu) {
      if (!vistas.has(item.permissao)) {
        throw new Error(
          `item de menu "${item.rotulo}" usa permissao "${item.permissao}" nao declarada em manifesto`,
        );
      }
    }
  }
}

/**
 * Sincroniza o catálogo de permissões a partir dos manifestos.
 *
 * PRÉ-CONDIÇÃO (não verificada aqui): `manifestos` precisa ser o conjunto COMPLETO
 * de módulos da aplicação, nunca um subconjunto — qualquer módulo ausente desta
 * lista tem suas permissões desativadas (ver abaixo). Chamar esta função com um
 * subconjunto desativa, silenciosamente, as permissões dos módulos que ficaram
 * de fora.
 *
 * PRÉ-CONDIÇÃO (não verificada aqui): assume que `validarManifestos` já rodou
 * sobre este mesmo conjunto de manifestos. Em particular, não detecta chave de
 * permissão duplicada entre manifestos — duas linhas com a mesma chave no mesmo
 * lote produzem erro cru do Postgres (violação de chave primária dentro do
 * próprio INSERT), não uma mensagem em português. Isso só é seguro porque, na
 * composição real do boot, `validarManifestos` sempre roda antes e barra
 * duplicidade antes de chegar aqui.
 *
 * Nunca apaga uma permissão: `papel_permissoes.permissao_chave` referencia
 * `permissoes.chave` com `on delete cascade`, e apagar a permissão apagaria
 * junto, de forma irreversível e silenciosa, toda concessão que dependia dela —
 * o efeito de um simples typo ou de uma refatoração de nome vira gente perdendo
 * acesso sem aviso. Em vez disso: a chave presente no manifesto é upsertada com
 * `ativo = true`; a chave ausente é marcada `ativo = false`, preservando a linha
 * e as concessões associadas. Se a chave voltar ao manifesto depois, ela reativa
 * e as concessões antigas voltam a valer exatamente como estavam.
 */
export async function sincronizarPermissoes(manifestos: ManifestoModulo[]): Promise<void> {
  const linhas = manifestos.flatMap((m) =>
    m.permissoes.map((p) => ({
      chave: p.chave,
      modulo: m.nome,
      descricao: p.descricao,
      sensivel: p.sensivel ?? false,
      ativo: true,
    })),
  );

  await db.transaction(async (tx) => {
    if (linhas.length > 0) {
      await tx.insert(permissoes).values(linhas).onConflictDoUpdate({
        target: permissoes.chave,
        set: {
          modulo: sql`excluded.modulo`,
          descricao: sql`excluded.descricao`,
          sensivel: sql`excluded.sensivel`,
          ativo: sql`excluded.ativo`,
        },
      });
      await tx.update(permissoes)
        .set({ ativo: false })
        .where(notInArray(permissoes.chave, linhas.map((l) => l.chave)));
    } else {
      await tx.update(permissoes).set({ ativo: false });
    }
  });
}
