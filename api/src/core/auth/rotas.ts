import {
  entradaAceitarConvite, entradaConvite, entradaLogin, entradaMfa,
} from '@4med/contracts';
import { eq } from 'drizzle-orm';
import { registrarAuditoria } from '../auditoria/registro';
import { db } from '../db/client';
import { usuarios } from '../db/schema/acesso';
import { ErroHttp } from '../erros';
import type { DefinicaoRota, RequisicaoAutenticada } from '../modulos/tipos';
import { aceitarConvite, criarConvite } from './convites';
import { conferirMfa, exigeMfa } from './mfa';
import {
  autenticar, criarSessao, listarSessoes, revogarSessao, validarSessao,
} from './sessoes';

const COOKIE = 'sessao';
const opcoesCookie = (expiraEm: Date) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  expires: expiraEm,
});

const origemDe = (req: { ip: string; headers: Record<string, unknown> }) => ({
  ip: req.ip,
  agente: String(req.headers['user-agent'] ?? ''),
});

export const rotasAuth: DefinicaoRota[] = [
  {
    metodo: 'POST', caminho: '/auth/login', permissao: null, publica: true,
    handler: async (req, resp) => {
      const { email, senha } = entradaLogin.parse(req.body);
      const origem = origemDe(req);
      const { usuarioId, exigeMfa: pedeMfa } = await autenticar(email, senha, origem);

      await registrarAuditoria({
        atorId: usuarioId, acao: 'login.sucesso', recursoTipo: 'sessao', recursoId: null,
        unidadeId: null, ip: origem.ip, agente: origem.agente, delegacaoId: null,
      });

      const { token, expiraEm } = await criarSessao(usuarioId, origem);
      resp.setCookie(COOKIE, token, opcoesCookie(expiraEm));
      return { exigeMfa: pedeMfa };
    },
  },
  {
    metodo: 'POST', caminho: '/auth/mfa', permissao: null, autenticada: true,
    handler: async (req) => {
      const { codigo } = entradaMfa.parse(req.body);
      const ok = await conferirMfa(req.contexto.usuarioId, codigo);
      if (!ok) throw new ErroHttp(422, 'codigo_invalido', 'Código inválido');
      return { ok: true };
    },
  },
  {
    metodo: 'POST', caminho: '/auth/sair', permissao: null, autenticada: true,
    handler: async (req, resp) => {
      const token = req.cookies[COOKIE];
      if (token) {
        const { sessaoId } = await validarSessao(token);
        await revogarSessao(sessaoId);
      }
      resp.clearCookie(COOKIE, { path: '/' });
      return { ok: true };
    },
  },
  {
    metodo: 'GET', caminho: '/auth/eu', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = req as RequisicaoAutenticada;
      const menu = req.server.menuDe(new Set(contexto.permissoes.keys()));
      const [u] = await db.select().from(usuarios)
        .where(eq(usuarios.id, contexto.usuarioId)).limit(1);

      return {
        id: contexto.usuarioId,
        nome: u?.nome ?? '',
        email: u?.email ?? '',
        // O front só precisa saber QUE permissões tem e com que alcance;
        // a lista de unidades de cada uma fica no servidor.
        permissoes: Object.fromEntries(
          [...contexto.permissoes].map(([chave, e]) => [chave, e.alcance]),
        ),
        exigeMfa: exigeMfa(contexto),
        menu,
      };
    },
  },
  {
    metodo: 'GET', caminho: '/auth/sessoes', permissao: null, autenticada: true,
    handler: async (req) => listarSessoes(req.contexto.usuarioId),
  },
  {
    metodo: 'DELETE', caminho: '/auth/sessoes/:id', permissao: null, autenticada: true,
    handler: async (req) => {
      const { id } = req.params as { id: string };
      const minhas = await listarSessoes(req.contexto.usuarioId);
      if (!minhas.some((s) => s.id === id)) throw new ErroHttp(404, 'nao_encontrado', 'Sessão não encontrada');
      await revogarSessao(id);
      return { ok: true };
    },
  },
  {
    metodo: 'POST', caminho: '/auth/convites', permissao: 'core.convite.administrar',
    handler: async (req) => {
      const dados = entradaConvite.parse(req.body);
      const { token } = await criarConvite({ ...dados, convidadoPor: req.contexto.usuarioId });
      await registrarAuditoria({
        atorId: req.contexto.usuarioId, acao: 'convite.criado', recursoTipo: 'convite',
        recursoId: dados.email, unidadeId: dados.unidadeId, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''), delegacaoId: req.contexto.delegacaoId,
      });
      // Em produção o token vai por e-mail; aqui ele volta para permitir a demonstração.
      return { token };
    },
  },
  {
    metodo: 'POST', caminho: '/auth/convites/aceitar', permissao: null, publica: true,
    handler: async (req) => {
      const { token, senha } = entradaAceitarConvite.parse(req.body);
      return aceitarConvite(token, senha);
    },
  },
];
