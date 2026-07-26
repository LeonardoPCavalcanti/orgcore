import { randomBytes } from 'node:crypto';
import {
  entradaAceitarConvite, entradaConvite, entradaLogin, entradaMfa,
} from '@4med/contracts';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { registrarAuditoria } from '../auditoria/registro';
import { db } from '../db/client';
import { usuarios } from '../db/schema/acesso';
import { ErroHttp, muitasTentativasMfa, naoEncontrado } from '../erros';
import type { DefinicaoRota } from '../modulos/tipos';
import { exigirAutenticacao } from '../requisicao';
import { aceitarConvite, criarConvite } from './convites';
import { conferirMfa, exigeMfa } from './mfa';
import {
  autenticar, confirmarMfaDaSessao, consumirTentativaMfa, criarSessao, listarSessoes,
  revogarSessao, revogarSessaoPropria, MAX_TENTATIVAS_MFA,
} from './sessoes';

const COOKIE_SESSAO = 'sessao';
const COOKIE_CSRF = 'csrf';

const opcoesCookieSessao = (expiraEm: Date) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  expires: expiraEm,
});

// O cookie CSRF precisa ser LEGIVEL pelo front (para ecoar o valor no cabecalho
// `x-csrf-token` a cada mutacao) — por isso, ao contrario do cookie de sessao,
// nunca httpOnly. `SameSite=Lax` sozinho ja barra a maior parte do CSRF cross-site
// em navegadores modernos; este token de dupla submissao e a camada extra pedida
// pela especificacao, e continua util em cenarios que `SameSite` nao cobre (ex.:
// subdominios do mesmo site, navegadores antigos). Expira no teto absoluto da
// sessao (`limiteEm`), nao no prazo curto de renovacao deslizante (`expiraEm`):
// como este cookie nao e renovado a cada requisicao, usar o prazo curto o faria
// desaparecer no meio de uma sessao ainda valida (renovada), quebrando toda
// mutacao subsequente com `csrf_invalido` mesmo com o login continuando bom.
const opcoesCookieCsrf = (limiteEm: Date) => ({
  httpOnly: false,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  expires: limiteEm,
});

const origemDe = (req: { ip: string; headers: Record<string, unknown> }) => ({
  ip: req.ip,
  agente: String(req.headers['user-agent'] ?? ''),
});

// `:id` vem da URL e é interpolado numa coluna `uuid`: um valor malformado faria o
// Postgres recusar o cast com erro cru, que o setErrorHandler traduziria em 500.
// Sessão que não é do usuário e sessão que não existe têm a mesma resposta, 404.
const idDeSessao = z.string().uuid();

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

      // Sessao nasce pendente quando a conta tem MFA ativo — ver o comentario em
      // `criarSessao` (auth/sessoes.ts) sobre por que quem AINDA NAO ativou o MFA
      // (mesmo que devesse, por `exigeMfa(ctx)`) nunca nasce pendente: bloquear
      // esse caso deixaria a conta sem nenhum caminho para completar o cadastro
      // do segundo fator.
      const { token, expiraEm, limiteEm } = await criarSessao(usuarioId, origem, {
        mfaPendente: pedeMfa,
      });
      resp.setCookie(COOKIE_SESSAO, token, opcoesCookieSessao(expiraEm));
      resp.setCookie(COOKIE_CSRF, randomBytes(24).toString('base64url'), opcoesCookieCsrf(limiteEm));
      return { exigeMfa: pedeMfa };
    },
  },
  {
    metodo: 'POST', caminho: '/auth/mfa', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto, sessaoId } = exigirAutenticacao(req);
      const { codigo } = entradaMfa.parse(req.body);

      // Esta rota e o UNICO portao entre uma sessao pendente e a aplicacao
      // inteira, entao e o unico lugar onde 10^6 combinacoes de 6 digitos podem
      // ser marteladas. O orcamento e cobrado ANTES de conferir o codigo: palpite
      // errado custa exatamente o mesmo que palpite certo, e um codigo de
      // recuperacao (que `conferirMfa` tambem aceita) sai do mesmo orcamento —
      // nao ha caminho de confirmacao que escape do contador.
      const tentativas = await consumirTentativaMfa(sessaoId);
      const ok = await conferirMfa(contexto.usuarioId, codigo);

      if (ok) {
        // Confirma o segundo fator NESTA sessao — e a unica forma de uma sessao
        // pendente deixar de ser pendente (ver preHandler em core/app.ts).
        await confirmarMfaDaSessao(sessaoId);
        return { ok: true };
      }

      // Esgotou o orcamento: REVOGA, nao apenas bloqueia. Uma sessao pendente
      // apenas "travada" continuaria de pe ate o teto absoluto, esperando o
      // atacante voltar; revogada, o proximo palpite exige um login novo com
      // senha, que passa pelos limites de `tentativas_login`. E o que transforma
      // "10^6 palpites por sessao" em "MAX_TENTATIVAS_MFA palpites por login".
      if (tentativas >= MAX_TENTATIVAS_MFA) {
        await revogarSessao(sessaoId);
        throw muitasTentativasMfa();
      }

      throw new ErroHttp(422, 'codigo_invalido', 'Código inválido');
    },
  },
  {
    metodo: 'POST', caminho: '/auth/sair', permissao: null, autenticada: true,
    handler: async (req, resp) => {
      // `sessaoId` ja vem validado pelo preHandler desta mesma requisicao —
      // chamar `validarSessao` de novo aqui renovaria a sessao (renovacao
      // deslizante) um instante antes de revoga-la, sem necessidade nenhuma.
      const { sessaoId } = exigirAutenticacao(req);
      await revogarSessao(sessaoId);
      resp.clearCookie(COOKIE_SESSAO, { path: '/' });
      resp.clearCookie(COOKIE_CSRF, { path: '/' });
      return { ok: true };
    },
  },
  {
    metodo: 'GET', caminho: '/auth/eu', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
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
    // `listarSessoes` projeta so o que a tela precisa — nunca `token_hash` nem o
    // estado interno do gate de MFA (ver `SessaoVisivel`, em auth/sessoes.ts).
    handler: async (req) => listarSessoes(exigirAutenticacao(req).contexto.usuarioId),
  },
  {
    metodo: 'DELETE', caminho: '/auth/sessoes/:id', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const { id } = req.params as { id: string };
      if (!idDeSessao.safeParse(id).success) throw naoEncontrado();
      // A posse e condicao do proprio UPDATE (`revogarSessaoPropria`), nao de um
      // SELECT anterior: nada entre conferir e escrever.
      if (!(await revogarSessaoPropria(id, contexto.usuarioId))) throw naoEncontrado();
      return { ok: true };
    },
  },
  {
    metodo: 'POST', caminho: '/auth/convites', permissao: 'core.convite.administrar',
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const dados = entradaConvite.parse(req.body);
      const { token } = await criarConvite({ ...dados, convidadoPor: contexto.usuarioId });
      await registrarAuditoria({
        atorId: contexto.usuarioId, acao: 'convite.criado', recursoTipo: 'convite',
        recursoId: dados.email, unidadeId: dados.unidadeId, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''), delegacaoId: contexto.delegacaoId,
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
