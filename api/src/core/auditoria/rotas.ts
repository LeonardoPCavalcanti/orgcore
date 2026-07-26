import { z } from 'zod';
import { semPermissao } from '../erros';
import type { DefinicaoRota } from '../modulos/tipos';
import { consultarAuditoria } from './registro';

const filtroConsulta = z.object({
  acao: z.string().optional(),
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

export const rotasAuditoria: DefinicaoRota[] = [
  {
    metodo: 'GET', caminho: '/auditoria', permissao: 'core.auditoria.ler',
    handler: async (req) => {
      const filtro = filtroConsulta.parse(req.query);
      // A consulta é limitada às unidades em que ESTA permissão vale.
      const escopo = req.contexto.permissoes.get('core.auditoria.ler');
      if (!escopo) throw semPermissao();
      return consultarAuditoria({
        unidades: escopo.unidades,
        alcanceGlobal: escopo.alcance === 'global',
        ...(filtro.acao !== undefined ? { acao: filtro.acao } : {}),
        ...(filtro.de !== undefined ? { de: filtro.de } : {}),
        ...(filtro.ate !== undefined ? { ate: filtro.ate } : {}),
      });
    },
  },
];
