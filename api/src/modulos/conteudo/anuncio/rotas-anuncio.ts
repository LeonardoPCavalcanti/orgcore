import { novoAnuncio } from '@4med/contracts';
import { z } from 'zod';
import { registrarAuditoria } from '../../../core/auditoria/registro';
import { naoEncontrado } from '../../../core/erros';
import type { DefinicaoRota } from '../../../core/modulos/tipos';
import { exigirAutenticacao } from '../../../core/requisicao';
import { criarGeradorAnuncio } from './gerador';
import {
  apagarAnuncio, criarAnuncio, fotoDaPessoa, imagemDoAnuncio, listarAnuncios, obterAnuncio,
} from './servico-anuncio';
import { criarRemovedor } from './template/silhueta';

export const PERMISSAO_ANUNCIO = 'conteudo.anuncio.criar';

// As fotos chegam como base64 no JSON, que estoura o limite padrão de 1MB do Fastify.
// ~12MB cobre até 10 fotos com folga (o serviço ainda limita cada foto por tamanho).
const LIMITE_CORPO = 12 * 1024 * 1024;

const idDeUuid = z.string().uuid();

export const rotasAnuncio: DefinicaoRota[] = [
  {
    metodo: 'POST', caminho: '/conteudo/anuncios', permissao: PERMISSAO_ANUNCIO, bodyLimit: LIMITE_CORPO,
    handler: async (req, resp) => {
      const { contexto } = exigirAutenticacao(req);
      const dados = novoAnuncio.parse(req.body);

      const unidadeId = contexto.permissoes.get(PERMISSAO_ANUNCIO)?.unidades[0];
      if (unidadeId === undefined) throw naoEncontrado();

      const anuncio = await criarAnuncio({
        dados, autorId: contexto.usuarioId, unidadeId,
        gerador: criarGeradorAnuncio(), removedor: criarRemovedor(),
      });

      await registrarAuditoria({
        atorId: contexto.usuarioId, acao: 'conteudo.anuncio.criado', recursoTipo: 'conteudo',
        recursoId: anuncio.id, unidadeId, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''), delegacaoId: contexto.delegacaoId,
        depois: { tipo: dados.tipo, pessoas: anuncio.pessoas.length },
      });

      return resp.code(201).send(anuncio);
    },
  },
  {
    metodo: 'GET', caminho: '/conteudo/anuncios', permissao: PERMISSAO_ANUNCIO,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      return listarAnuncios(contexto.usuarioId);
    },
  },
  {
    metodo: 'GET', caminho: '/conteudo/anuncios/:id', permissao: PERMISSAO_ANUNCIO,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const id = idDeUuid.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const anuncio = await obterAnuncio(id.data, contexto.usuarioId);
      if (!anuncio) throw naoEncontrado();
      return anuncio;
    },
  },
  {
    metodo: 'GET', caminho: '/conteudo/anuncios/:id/imagem', permissao: PERMISSAO_ANUNCIO,
    handler: async (req, resp) => {
      const { contexto } = exigirAutenticacao(req);
      const id = idDeUuid.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const imagem = await imagemDoAnuncio(id.data, contexto.usuarioId);
      if (!imagem) throw naoEncontrado();
      return resp.header('content-type', imagem.tipo).send(imagem.bytes);
    },
  },
  {
    metodo: 'GET', caminho: '/conteudo/anuncios/pessoas/:id/foto', permissao: PERMISSAO_ANUNCIO,
    handler: async (req, resp) => {
      const { contexto } = exigirAutenticacao(req);
      const id = idDeUuid.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const foto = await fotoDaPessoa(id.data, contexto.usuarioId);
      if (!foto) throw naoEncontrado();
      return resp.header('content-type', foto.tipo).send(foto.bytes);
    },
  },
  {
    metodo: 'DELETE', caminho: '/conteudo/anuncios/:id', permissao: PERMISSAO_ANUNCIO,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const id = idDeUuid.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const apagou = await apagarAnuncio(id.data, contexto.usuarioId);
      if (!apagou) throw naoEncontrado();
      return { apagado: true };
    },
  },
];
