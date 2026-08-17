import { novoCarrossel } from '@4med/contracts';
import { z } from 'zod';
import { registrarAuditoria } from '../../core/auditoria/registro';
import { naoEncontrado } from '../../core/erros';
import type { DefinicaoRota } from '../../core/modulos/tipos';
import { exigirAutenticacao } from '../../core/requisicao';
import { criarMelhorador, melhoradorPassthrough } from './anuncio/template/melhorador';
import { criarRemovedor, removedorPassthrough } from './anuncio/template/silhueta';
import { criarGerador } from './gerador';
import {
  apagarCarrossel, criarCarrossel, imagemDoSlide, listarCarrosseis, obterCarrossel,
} from './servico';

export const PERMISSAO_CRIAR = 'conteudo.carrossel.criar';

// Pipeline de imagem ligado por env (mesmas flags do anúncio): sem elas, passthrough
// determinístico (padrão em teste/CI); com elas, o recorte/realce real (pacotes nativos).
const recortarFundo = (): typeof removedorPassthrough =>
  process.env.RECORTE_FUNDO === 'true' ? criarRemovedor() : removedorPassthrough;
const realcarFoto = (): typeof melhoradorPassthrough =>
  process.env.REALCE_FOTO === 'true' ? criarMelhorador() : melhoradorPassthrough;

// Fotos chegam como base64 no JSON; ~12MB cobre uma foto de capa com folga (o serviço
// ainda limita cada foto por tamanho).
const LIMITE_CORPO = 12 * 1024 * 1024;

// `:id` chega como texto; um valor que não seja UUID não pode apontar para nenhum
// registro, então vira 404 (regra do projeto) — nunca um erro cru de cast do Postgres.
const idDeUuid = z.string().uuid();

export const rotasConteudo: DefinicaoRota[] = [
  {
    metodo: 'POST', caminho: '/conteudo/carrosseis', permissao: PERMISSAO_CRIAR,
    bodyLimit: LIMITE_CORPO,
    handler: async (req, resp) => {
      const { contexto } = exigirAutenticacao(req);
      const { tema, quantidadeSlides, estilo, fotos } = novoCarrossel.parse(req.body);

      // Unidade associada ao ato, no padrão que `criarApp` usa para auditar leituras
      // sensíveis: a primeira unidade do escopo da permissão. Com a concessão
      // `proprio` do seed, é a unidade de vínculo do próprio autor.
      const unidadeId = contexto.permissoes.get(PERMISSAO_CRIAR)?.unidades[0];
      if (unidadeId === undefined) throw naoEncontrado();

      const carrossel = await criarCarrossel({
        tema, quantidadeSlides, estilo, autorId: contexto.usuarioId, unidadeId,
        gerador: criarGerador(),
        ...(fotos ? { fotos } : {}),
        melhorador: realcarFoto(), removedor: recortarFundo(),
      });

      await registrarAuditoria({
        atorId: contexto.usuarioId, acao: 'conteudo.carrossel.criado', recursoTipo: 'conteudo',
        recursoId: carrossel.id, unidadeId, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''), delegacaoId: contexto.delegacaoId,
        depois: { tema, quantidadeSlides, slides: carrossel.slides.length },
      });

      return resp.code(201).send(carrossel);
    },
  },
  {
    metodo: 'GET', caminho: '/conteudo/carrosseis', permissao: PERMISSAO_CRIAR,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      return listarCarrosseis(contexto.usuarioId);
    },
  },
  {
    metodo: 'GET', caminho: '/conteudo/carrosseis/:id', permissao: PERMISSAO_CRIAR,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const id = idDeUuid.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const carrossel = await obterCarrossel(id.data, contexto.usuarioId);
      if (!carrossel) throw naoEncontrado();
      return carrossel;
    },
  },
  {
    metodo: 'GET', caminho: '/conteudo/slides/:id/imagem', permissao: PERMISSAO_CRIAR,
    handler: async (req, resp) => {
      const { contexto } = exigirAutenticacao(req);
      const id = idDeUuid.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const imagem = await imagemDoSlide(id.data, contexto.usuarioId);
      if (!imagem) throw naoEncontrado();
      // Bytes binários pela rota dedicada — nunca embutidos no JSON de resposta.
      return resp.header('content-type', imagem.tipo).send(imagem.bytes);
    },
  },
  {
    metodo: 'DELETE', caminho: '/conteudo/carrosseis/:id', permissao: PERMISSAO_CRIAR,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const id = idDeUuid.safeParse((req.params as { id: string }).id);
      if (!id.success) throw naoEncontrado();
      const apagou = await apagarCarrossel(id.data, contexto.usuarioId);
      if (!apagou) throw naoEncontrado();
      return { apagado: true };
    },
  },
];
