import { novaMensagem, renomearConversa } from '@4med/contracts';
import { z } from 'zod';
import { criarClientePadrao } from '../../core/llm';
import type { DefinicaoRota } from '../../core/modulos/tipos';
import { exigirAutenticacao } from '../../core/requisicao';
import {
  apagarConversa, criarConversa, enviarMensagem, listarConversas, obterConversa, renomearConversaSvc,
} from './servico-assistente';

// As imagens anexadas chegam como base64 no JSON; ~8MB cobre até 4 imagens com folga.
const LIMITE_CORPO = 8 * 1024 * 1024;

const idDeUuid = z.string().uuid();
const idDaRota = (req: { params: unknown }) => idDeUuid.parse((req.params as { id?: string }).id);

export const rotasAssistente: DefinicaoRota[] = [
  {
    // Status dos provedores (cota estimada) para o seletor — autenticada, sem RBAC de
    // anúncio, para o chat funcionar a qualquer usuário logado.
    metodo: 'GET', caminho: '/assistente/provedores', permissao: null, autenticada: true,
    handler: async (req) => {
      exigirAutenticacao(req);
      const cliente = criarClientePadrao();
      return cliente ? cliente.provedores() : [];
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
      return enviarMensagem({
        conversaId: idDaRota(req), usuarioId: contexto.usuarioId, dados, cliente: criarClientePadrao(),
      });
    },
  },
];
