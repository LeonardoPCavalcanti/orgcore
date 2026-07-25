import { chavePermissao } from '@4med/contracts';
import { notInArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { permissoes } from '../db/schema/acesso';
import type { ManifestoModulo, RequisicaoAutenticada } from './tipos';

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

export async function sincronizarPermissoes(manifestos: ManifestoModulo[]): Promise<void> {
  const linhas = manifestos.flatMap((m) =>
    m.permissoes.map((p) => ({
      chave: p.chave,
      modulo: m.nome,
      descricao: p.descricao,
      sensivel: p.sensivel ?? false,
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
        },
      });
      await tx.delete(permissoes).where(
        notInArray(permissoes.chave, linhas.map((l) => l.chave)),
      );
    } else {
      await tx.delete(permissoes);
    }
  });
}

/**
 * Registra as rotas de todos os módulos no servidor, depois de validar os
 * manifestos e sincronizar o catálogo de permissões. A injeção de `contexto`
 * na requisição é feita por um hook de autenticação fora deste arquivo
 * (Task 5): aqui apenas repassamos a requisição já enriquecida ao handler.
 */
export async function registrarModulos(
  app: FastifyInstance,
  manifestos: ManifestoModulo[],
): Promise<void> {
  validarManifestos(manifestos);
  await sincronizarPermissoes(manifestos);

  for (const m of manifestos) {
    for (const r of m.rotas) {
      app.route({
        method: r.metodo,
        url: r.caminho,
        handler: async (req, resp) => r.handler(req as unknown as RequisicaoAutenticada, resp),
      });
    }
  }
}
