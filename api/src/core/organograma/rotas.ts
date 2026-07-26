import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { registrarAuditoria } from '../auditoria/registro';
import { db } from '../db/client';
import { unidades } from '../db/schema/organograma';
import { semPermissao } from '../erros';
import type { DefinicaoRota } from '../modulos/tipos';
import { criarUnidade } from './servico';

const entradaUnidade = z.object({
  nome: z.string().min(2),
  tipo: z.enum(['empresa', 'diretoria', 'departamento', 'equipe']),
  paiId: z.number().int().positive().nullable(),
});

export const rotasOrganograma: DefinicaoRota[] = [
  {
    metodo: 'GET', caminho: '/organograma', permissao: 'core.unidade.ler',
    handler: async (req) => {
      const escopo = req.contexto.permissoes.get('core.unidade.ler');
      if (!escopo) throw semPermissao();
      return db.select().from(unidades).where(inArray(unidades.id, escopo.unidades));
    },
  },
  {
    metodo: 'POST', caminho: '/organograma', permissao: 'core.unidade.administrar',
    handler: async (req) => {
      const dados = entradaUnidade.parse(req.body);
      const criada = await criarUnidade(dados);
      await registrarAuditoria({
        atorId: req.contexto.usuarioId, acao: 'unidade.criada', recursoTipo: 'unidade',
        recursoId: String(criada.id), unidadeId: criada.id, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''),
        delegacaoId: req.contexto.delegacaoId, depois: criada,
      });
      return criada;
    },
  },
];
