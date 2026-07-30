import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { registrarAuditoria } from '../auditoria/registro';
import { db } from '../db/client';
import { unidades } from '../db/schema/organograma';
import { ErroHttp, naoEncontrado, semPermissao } from '../erros';
import type { DefinicaoRota } from '../modulos/tipos';
import { exigirAutenticacao } from '../requisicao';
import { criarUnidade, moverUnidade } from './servico';

const entradaUnidade = z.object({
  nome: z.string().min(2),
  tipo: z.enum(['empresa', 'diretoria', 'departamento', 'equipe']),
  paiId: z.number().int().positive().nullable(),
});

// Só o novo pai muda numa movimentação; nome e tipo continuam sendo do POST.
const entradaMover = z.object({
  paiId: z.number().int().positive().nullable(),
});

// `:id` vem da URL como texto; um valor não-numérico ou não-positivo não pode
// apontar para nenhuma unidade, então vira 404 (a regra do projeto para o que não
// pode ser servido), nunca um erro cru de cast.
const idDeUnidade = z.coerce.number().int().positive();

export const rotasOrganograma: DefinicaoRota[] = [
  {
    metodo: 'GET', caminho: '/organograma', permissao: 'core.unidade.ler',
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const escopo = contexto.permissoes.get('core.unidade.ler');
      if (!escopo) throw semPermissao();
      return db.select().from(unidades).where(inArray(unidades.id, escopo.unidades));
    },
  },
  {
    metodo: 'POST', caminho: '/organograma', permissao: 'core.unidade.administrar',
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const dados = entradaUnidade.parse(req.body);
      const criada = await criarUnidade(dados);
      await registrarAuditoria({
        atorId: contexto.usuarioId, acao: 'unidade.criada', recursoTipo: 'unidade',
        recursoId: String(criada.id), unidadeId: criada.id, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''),
        delegacaoId: contexto.delegacaoId, depois: criada,
      });
      return criada;
    },
  },
  {
    metodo: 'PATCH', caminho: '/organograma/:id', permissao: 'core.unidade.administrar',
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const id = idDeUnidade.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const { paiId } = entradaMover.parse(req.body);

      let movida;
      try {
        movida = await moverUnidade(id.data, paiId);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : '';
        // O ciclo e a existência do pai são garantidos por gatilho no banco
        // (migration 0001), que lança em português; `moverUnidade` lança a mesma
        // mensagem quando a própria unidade não existe. Traduzimos para respostas
        // limpas: mover para dentro da própria subárvore é uma requisição inválida
        // (422); unidade ou pai ausente é 404, nunca o erro cru do driver.
        if (/ciclo/i.test(mensagem)) {
          throw new ErroHttp(422, 'movimento_invalido',
            'Mover a unidade para lá criaria um ciclo no organograma');
        }
        if (/nao encontrad/i.test(mensagem)) throw naoEncontrado();
        throw erro;
      }

      await registrarAuditoria({
        atorId: contexto.usuarioId, acao: 'unidade.movida', recursoTipo: 'unidade',
        recursoId: String(movida.id), unidadeId: movida.id, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''),
        delegacaoId: contexto.delegacaoId, depois: movida,
      });
      return movida;
    },
  },
];
