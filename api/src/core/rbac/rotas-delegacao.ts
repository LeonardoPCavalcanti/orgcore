import { entradaDelegacao } from '@4med/contracts';
import { desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db/client';
import { usuarios } from '../db/schema/acesso';
import { delegacoes } from '../db/schema/delegacoes';
import type { DefinicaoRota } from '../modulos/tipos';
import { exigirAutenticacao } from '../requisicao';
import { criarDelegacao, PERMISSAO_CRIAR, revogarDelegacao } from './delegacoes';

const origemDe = (req: { ip: string; headers: Record<string, unknown> }) => ({
  ip: req.ip,
  agente: String(req.headers['user-agent'] ?? ''),
});

/**
 * Superfície HTTP da delegação de escopo. A lógica, as garantias e a trilha ficam
 * todas no serviço (rbac/delegacoes.ts); estas rotas só traduzem requisição em
 * chamada e cuidam do escopo da LEITURA (o serviço já cuida do escopo da escrita).
 *
 * Todas exigem `core.delegacao.criar`: é a permissão de "empresto o MEU escopo".
 * Revogar delegação de TERCEIRO depende ainda de `core.delegacao.administrar`, mas
 * isso é conferido dentro de `revogarDelegacao` — não é permissão de rota, porque o
 * dono revoga a própria sem precisar dela, e as duas caem na mesma rota.
 */
export const rotasDelegacao: DefinicaoRota[] = [
  {
    metodo: 'GET', caminho: '/delegacoes', permissao: PERMISSAO_CRIAR,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const uid = contexto.usuarioId;

      // Escopo da leitura ao próprio: só as delegações em que quem chama figura,
      // como delegante OU como destinatário. Nunca as de terceiros entre si.
      const linhas = await db.select().from(delegacoes)
        .where(or(eq(delegacoes.deUsuarioId, uid), eq(delegacoes.paraUsuarioId, uid)))
        .orderBy(desc(delegacoes.criadaEm));

      // Nomes resolvidos numa segunda consulta em vez de dois joins com alias na
      // mesma tabela: o conjunto de ids é pequeno (as delegações de uma pessoa) e a
      // leitura fica direta. Sem linhas, nem consulta.
      const ids = [...new Set(linhas.flatMap((l) => [l.deUsuarioId, l.paraUsuarioId]))];
      const nomes = new Map<string, string>();
      if (ids.length > 0) {
        const pessoas = await db.select({ id: usuarios.id, nome: usuarios.nome })
          .from(usuarios).where(inArray(usuarios.id, ids));
        for (const p of pessoas) nomes.set(p.id, p.nome);
      }

      return linhas.map((l) => ({
        id: l.id,
        inicio: l.inicio,
        fim: l.fim,
        motivo: l.motivo,
        criadaEm: l.criadaEm,
        revogadaEm: l.revogadaEm,
        deUsuarioId: l.deUsuarioId,
        deUsuarioNome: nomes.get(l.deUsuarioId) ?? '',
        paraUsuarioId: l.paraUsuarioId,
        paraUsuarioNome: nomes.get(l.paraUsuarioId) ?? '',
        // Relativo a quem chama: a tela mostra "Revogar" só nas concedidas vigentes.
        papel: l.deUsuarioId === uid ? ('concedida' as const) : ('recebida' as const),
      }));
    },
  },
  {
    metodo: 'POST', caminho: '/delegacoes', permissao: PERMISSAO_CRIAR,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const dados = entradaDelegacao.parse(req.body);
      // `criarDelegacao` valida, grava a linha E registra a trilha na MESMA
      // transação — a rota não duplica auditoria de propósito.
      const { id } = await criarDelegacao(contexto, dados, origemDe(req));
      return { id };
    },
  },
  {
    metodo: 'DELETE', caminho: '/delegacoes/:id', permissao: PERMISSAO_CRIAR,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const { id } = req.params as { id: string };
      // Id malformado, fora de escopo, inexistente e já revogada devolvem todos o
      // mesmo 404 (nunca 403): a autorização (próprio vs. `core.delegacao.administrar`)
      // e a trilha ficam dentro de `revogarDelegacao`.
      await revogarDelegacao(contexto, id, origemDe(req));
      return { ok: true };
    },
  },
];
