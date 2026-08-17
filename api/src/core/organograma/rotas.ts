import { entradaAlterarCargo } from '@4med/contracts';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { registrarAuditoria } from '../auditoria/registro';
import { db } from '../db/client';
import { unidades } from '../db/schema/organograma';
import { ErroHttp, naoEncontrado, semPermissao } from '../erros';
import type { DefinicaoRota } from '../modulos/tipos';
import { exigirAutenticacao } from '../requisicao';
import {
  cargoExiste, criarUnidade, definirCargoDoVinculo, listarCargos,
  moverUnidade, pessoasNasUnidades, vinculoPorId,
} from './servico';

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

// `:id` do vínculo é uma coluna `uuid`; malformado vira 404 (o que não pode ser
// servido), não um cast cru virando 500.
const idDeVinculo = z.string().uuid();

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
    // Cargos atribuíveis, para o seletor de cargo do organograma. Mesma permissão
    // de administrar unidades: quem não administra a estrutura não define cargos.
    metodo: 'GET', caminho: '/organograma/cargos', permissao: 'core.unidade.administrar',
    handler: async () => listarCargos(),
  },
  {
    // Pessoas (vínculos vigentes) dentro do escopo de quem administra — a matéria-
    // prima da troca de cargo. Reusa o mesmo recorte de unidades da permissão.
    metodo: 'GET', caminho: '/organograma/pessoas', permissao: 'core.unidade.administrar',
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const escopo = contexto.permissoes.get('core.unidade.administrar');
      if (!escopo) throw semPermissao();
      return pessoasNasUnidades(escopo.unidades);
    },
  },
  {
    // Trocar o cargo de uma pessoa. O cargo é o que amarra a pessoa aos papéis
    // (ver rbac/contexto.ts), então esta rota é o ponto onde a hierarquia do
    // organograma passa a "valer para algo": muda o cargo, mudam as permissões.
    metodo: 'PATCH', caminho: '/organograma/vinculos/:id', permissao: 'core.unidade.administrar',
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const escopo = contexto.permissoes.get('core.unidade.administrar');
      if (!escopo) throw semPermissao();

      const id = idDeVinculo.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const { cargoId } = entradaAlterarCargo.parse(req.body);

      // Carrega o alvo ANTES de escrever: precisamos da unidade dele para a
      // checagem de escopo, e do cargo antigo para a trilha.
      const alvo = await vinculoPorId(id.data);
      // Vínculo fora do escopo de quem administra responde igual a vínculo
      // inexistente (404): não revela a existência de quem está fora da subárvore.
      if (!alvo || !escopo.unidades.includes(alvo.unidadeId)) throw naoEncontrado();

      // Cargo inexistente é entrada inválida (422), não um erro cru de FK — e é
      // conferido aqui em vez de depender só do banco para dar uma resposta limpa.
      if (!(await cargoExiste(cargoId))) {
        throw new ErroHttp(422, 'cargo_invalido', 'O cargo indicado não existe');
      }

      const atualizado = await definirCargoDoVinculo(id.data, cargoId);
      // Sumiu entre o SELECT e o UPDATE (corrida com um desligamento): 404.
      if (!atualizado) throw naoEncontrado();

      await registrarAuditoria({
        atorId: contexto.usuarioId, acao: 'vinculo.cargo_alterado', recursoTipo: 'vinculo',
        recursoId: atualizado.id, unidadeId: atualizado.unidadeId, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''), delegacaoId: contexto.delegacaoId,
        antes: { cargoId: alvo.cargoId }, depois: { cargoId: atualizado.cargoId },
      });
      return atualizado;
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
