import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { provedorUso } from '../db/schema/provedor-uso';
import type { ProvedorAtivo } from './catalogo';

export type StatusProvedor = {
  id: string; nome: string; modelo: string;
  percentual: number; disponivel: boolean; atualizadoEm: string | null;
};
export type DadosUso = { restante?: number | undefined; limite?: number | undefined };

export interface PortaUso {
  status(provs: ProvedorAtivo[]): Promise<StatusProvedor[]>;
  registrar(id: string, dados: DadosUso): Promise<void>;
}

const hoje = (): string => new Date().toISOString().slice(0, 10);
const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

async function linhaHoje(id: string) {
  const [linha] = await db.select().from(provedorUso)
    .where(and(eq(provedorUso.provedorId, id), eq(provedorUso.dia, hoje())));
  return linha ?? null;
}

export const usoDb: PortaUso = {
  async status(provs) {
    return Promise.all(provs.map(async (p): Promise<StatusProvedor> => {
      const linha = await linhaHoje(p.id);
      let percentual = 100;
      if (p.leHeaders && linha?.restanteConhecido != null && linha.limiteConhecido) {
        percentual = clamp((linha.restanteConhecido / linha.limiteConhecido) * 100);
      } else if (!p.leHeaders) {
        percentual = clamp(((p.limiteDiario - (linha?.requisicoesUsadas ?? 0)) / p.limiteDiario) * 100);
      }
      return {
        id: p.id, nome: p.nome, modelo: p.modelo,
        percentual, disponivel: percentual > 0,
        atualizadoEm: linha ? linha.atualizadoEm.toISOString() : null,
      };
    }));
  },

  async registrar(id, dados) {
    await db.insert(provedorUso).values({
      provedorId: id, dia: hoje(), requisicoesUsadas: 1,
      restanteConhecido: dados.restante ?? null, limiteConhecido: dados.limite ?? null,
    }).onConflictDoUpdate({
      target: [provedorUso.provedorId, provedorUso.dia],
      set: {
        requisicoesUsadas: sql`${provedorUso.requisicoesUsadas} + 1`,
        restanteConhecido: dados.restante ?? sql`${provedorUso.restanteConhecido}`,
        limiteConhecido: dados.limite ?? sql`${provedorUso.limiteConhecido}`,
        atualizadoEm: sql`now()`,
      },
    });
  },
};
