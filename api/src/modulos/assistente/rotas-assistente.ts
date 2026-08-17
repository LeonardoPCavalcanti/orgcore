import { entradaRestricaoCargo, novaMensagem, renomearConversa } from '@4med/contracts';
import { z } from 'zod';
import { registrarAuditoria } from '../../core/auditoria/registro';
import { criarClientePadrao } from '../../core/llm';
import { catalogoPublico } from '../../core/llm/catalogo';
import { naoEncontrado } from '../../core/erros';
import type { DefinicaoRota } from '../../core/modulos/tipos';
import { cargoExiste } from '../../core/organograma/servico';
import { exigirAutenticacao } from '../../core/requisicao';
import {
  apagarConversa, criarConversa, enviarMensagem, listarConversas, obterConversa, renomearConversaSvc,
} from './servico-assistente';
import { rankingConsumo } from './consumo-usuario';
import { definirRestricao, listarRestricoes, provedoresPermitidosParaUsuario } from './restricoes-ia';

// Anexos (imagens e documentos) chegam como base64 no JSON; ~20MB cobre PDFs/docs + imagens.
const LIMITE_CORPO = 20 * 1024 * 1024;

const idDeUuid = z.string().uuid();
const idDaRota = (req: { params: unknown }) => idDeUuid.parse((req.params as { id?: string }).id);

export const rotasAssistente: DefinicaoRota[] = [
  {
    // Status dos provedores (cota estimada) para o seletor — autenticada, sem RBAC de
    // anúncio, para o chat funcionar a qualquer usuário logado.
    metodo: 'GET', caminho: '/assistente/provedores', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      // Só os provedores que o cargo do usuário libera (Fatia: limitar IAs por cargo).
      const permitidos = await provedoresPermitidosParaUsuario(contexto.usuarioId);
      const cliente = criarClientePadrao(permitidos ?? undefined);
      return cliente ? cliente.provedores() : [];
    },
  },
  {
    // Estado das restrições de IA por cargo, para a tela de administração. Mesma
    // permissão de administrar unidades — quem governa os cargos governa o acesso
    // às IAs deles.
    metodo: 'GET', caminho: '/assistente/restricoes-ia', permissao: 'core.unidade.administrar',
    handler: async (req) => {
      exigirAutenticacao(req);
      return { provedores: catalogoPublico(), porCargo: await listarRestricoes() };
    },
  },
  {
    metodo: 'PATCH', caminho: '/assistente/restricoes-ia/:cargoId', permissao: 'core.unidade.administrar',
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const cargoId = idDeUuid.safeParse((req.params as { cargoId: string }).cargoId);
      if (!cargoId.success) throw naoEncontrado();
      if (!(await cargoExiste(cargoId.data))) throw naoEncontrado();
      const { provedores } = entradaRestricaoCargo.parse(req.body);

      const efetivo = await definirRestricao(cargoId.data, provedores);
      await registrarAuditoria({
        atorId: contexto.usuarioId, acao: 'cargo.restricao_ia', recursoTipo: 'cargo',
        recursoId: cargoId.data, unidadeId: null, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''), delegacaoId: contexto.delegacaoId,
        depois: { provedores: efetivo },
      });
      return { cargoId: cargoId.data, provedores: efetivo };
    },
  },
  {
    // Ranking de consumo de IA por usuário — visão de oversight (admin/auditoria).
    metodo: 'GET', caminho: '/assistente/consumo', permissao: 'core.auditoria.ler', autenticada: true,
    handler: async (req) => {
      exigirAutenticacao(req);
      return rankingConsumo();
    },
  },
  {
    metodo: 'GET', caminho: '/assistente/conversas', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      return listarConversas(contexto.usuarioId);
    },
  },
  {
    metodo: 'POST', caminho: '/assistente/conversas', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      return criarConversa(contexto.usuarioId);
    },
  },
  {
    metodo: 'GET', caminho: '/assistente/conversas/:id', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      return obterConversa(idDaRota(req), contexto.usuarioId);
    },
  },
  {
    metodo: 'PATCH', caminho: '/assistente/conversas/:id', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const { titulo } = renomearConversa.parse(req.body);
      return renomearConversaSvc(idDaRota(req), contexto.usuarioId, titulo);
    },
  },
  {
    metodo: 'DELETE', caminho: '/assistente/conversas/:id', permissao: null, autenticada: true,
    handler: async (req, resp) => {
      const { contexto } = exigirAutenticacao(req);
      await apagarConversa(idDaRota(req), contexto.usuarioId);
      return resp.status(204).send();
    },
  },
  {
    metodo: 'POST', caminho: '/assistente/conversas/:id/mensagens', permissao: null, autenticada: true,
    bodyLimit: LIMITE_CORPO,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const dados = novaMensagem.parse(req.body);
      // Cliente já restrito ao whitelist do cargo: mesmo um `preferido` proibido no
      // corpo não alcança um provedor fora do conjunto — ele nem entra no cliente.
      const permitidos = await provedoresPermitidosParaUsuario(contexto.usuarioId);
      return enviarMensagem({
        conversaId: idDaRota(req), usuarioId: contexto.usuarioId, dados,
        cliente: criarClientePadrao(permitidos ?? undefined),
      });
    },
  },
];
