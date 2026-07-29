import { randomBytes } from 'node:crypto';
import {
  entradaAceitarConvite, entradaConvite, entradaLogin, entradaMfa,
} from '@4med/contracts';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { registrarAuditoria } from '../auditoria/registro';
import { db } from '../db/client';
import { usuarios } from '../db/schema/acesso';
import {
  ErroHttp, muitasTentativasMfa, naoEncontrado, segundoFatorBloqueado,
} from '../erros';
import type { DefinicaoRota } from '../modulos/tipos';
import { exigirAutenticacao } from '../requisicao';
import { aceitarConvite, criarConvite } from './convites';
import { montarMeusDados } from './meus-dados';
import { ativarMfa, conferirMfa, exigeMfa, prepararMfa } from './mfa';
import {
  absolverTentativaSegundoFator, autenticar, confirmarMfaDaSessao, consumirTentativaMfa,
  consumirTentativaSegundoFator, criarSessao, listarSessoes, revogarSessao,
  revogarSessaoPropria, revogarSessoesPendentes, MAX_FALHAS_MFA_CONTA, MAX_TENTATIVAS_MFA,
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
      const origem = origemDe(req);

      // Esta rota e o UNICO portao entre uma sessao pendente e a aplicacao
      // inteira, entao e o unico lugar onde 10^6 combinacoes de 6 digitos podem
      // ser marteladas. Sao DOIS orcamentos, e A ORDEM DESTAS LINHAS E A GARANTIA:
      // os dois sao COBRADOS E CONFERIDOS antes de `conferirMfa`, nesta sequencia
      // — sessao, conta, so entao o palpite.
      //
      //   1. por SESSAO — teto de rajada. O incremento e um `UPDATE ... RETURNING`
      //      sob o lock da linha da sessao, entao requisicoes simultaneas recebem
      //      valores distintos (1, 2, 3, ...) e so as MAX_TENTATIVAS_MFA primeiras
      //      seguem adiante. Isto so vale porque a comparacao esta AQUI: com ela
      //      depois de `conferirMfa` — como ja esteve —, o contador servia apenas
      //      para revogar a sessao a posteriori e uma rajada simultanea passava
      //      inteira, cada requisicao conferindo o seu palpite (medido: 120
      //      simultaneas na mesma sessao = 12 palpites conferidos, contra um teto
      //      declarado de 5).
      //   2. por CONTA  — teto real do ataque, porque quem tem a senha troca de
      //      sessao de graca (login bem-sucedido nao consome limite nenhum) mas
      //      nao troca de conta: e a conta que ele quer.
      //
      // Palpite errado custa exatamente o mesmo que palpite certo, e um codigo de
      // recuperacao (que `conferirMfa` tambem aceita) sai dos mesmos dois
      // orcamentos: nao ha caminho de confirmacao que escape.
      const tentativasDaSessao = await consumirTentativaMfa(sessaoId);

      // Teto DESTA sessao ja estourado: REVOGA, nao apenas bloqueia. Uma sessao
      // pendente apenas "travada" continuaria de pe ate o teto absoluto,
      // esperando o atacante voltar; revogada, o proximo palpite exige um login
      // novo com senha — que abre uma sessao nova com orcamento proprio, mas
      // continua saindo do orcamento da conta abaixo. Recusa antes de tocar no
      // orcamento da conta: quem excedeu o teto da sessao nao chega a queimar a
      // janela da conta (o bloqueio por conta e um DoS contra o dono legitimo).
      if (tentativasDaSessao > MAX_TENTATIVAS_MFA) {
        await revogarSessao(sessaoId);
        throw muitasTentativasMfa();
      }

      const tentativaDaConta = await consumirTentativaSegundoFator(contexto.usuarioId, origem);

      // Orcamento da conta esgotado nesta janela: recusa ANTES de conferir o
      // codigo, e derruba as sessoes pendentes que existirem — o bloqueio precisa
      // valer independentemente de quantas sessoes novas o atacante crie.
      if (tentativaDaConta === null) {
        await revogarSessoesPendentes(contexto.usuarioId);
        throw segundoFatorBloqueado();
      }

      const ok = await conferirMfa(contexto.usuarioId, codigo);

      if (ok) {
        // Acertou: a tentativa sai do orcamento da conta (so falha conta) e o
        // segundo fator e confirmado NESTA sessao — a unica forma de uma sessao
        // pendente deixar de ser pendente (ver preHandler em core/app.ts).
        await absolverTentativaSegundoFator(tentativaDaConta.id);
        await confirmarMfaDaSessao(sessaoId);
        return { ok: true };
      }

      // Esta falha fechou o orcamento da CONTA. Registra na trilha: o bloqueio e
      // um DoS possivel contra o proprio usuario por quem tem a senha dele (ver
      // MAX_FALHAS_MFA_CONTA, em auth/sessoes.ts), e a defesa aceita para esse
      // residual e ser detectavel. So o evento que FECHA a janela e registrado, e
      // nao cada 429 subsequente: a trilha e append-only, e um evento por
      // tentativa recusada transformaria a propria deteccao em enxurrada — um
      // evento por janela ja mostra o padrao de repeticao ao longo das horas.
      // Sem `antes`/`depois`: o codigo tentado JAMAIS entra na trilha.
      if (tentativaDaConta.falhas >= MAX_FALHAS_MFA_CONTA) {
        await revogarSessoesPendentes(contexto.usuarioId);
        await registrarAuditoria({
          atorId: contexto.usuarioId, acao: 'mfa.bloqueado', recursoTipo: 'sessao',
          recursoId: null, unidadeId: null, ip: origem.ip, agente: origem.agente,
          delegacaoId: contexto.delegacaoId,
        });
        throw segundoFatorBloqueado();
      }

      // Esta falha foi a ULTIMA que cabia na sessao: revoga agora, em vez de
      // esperar a requisicao seguinte esbarrar na checagem la de cima. Nao e ela
      // que garante o teto — o teto e garantido pela comparacao anterior a
      // `conferirMfa` —, e sim o que faz a sessao morrer no mesmo instante em que
      // o orcamento acaba, sem depender de o atacante voltar para descobrir.
      if (tentativasDaSessao >= MAX_TENTATIVAS_MFA) {
        await revogarSessao(sessaoId);
        throw muitasTentativasMfa();
      }

      throw new ErroHttp(422, 'codigo_invalido', 'Código inválido');
    },
  },
  {
    // Cadastro do segundo fator, self-service (sem permissao nova, matriz de
    // autorizacao intacta). Nao entra na allowlist de MFA pendente: so uma sessao
    // ja confirmada (ou de quem ainda nao tem MFA, que nunca nasce pendente)
    // alcanca o cadastro.
    metodo: 'POST', caminho: '/auth/mfa/preparar', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      // So ATIVACAO passa por aqui. Reconfigurar um MFA ja ativo desliga a
      // protecao existente e exige prova de posse do segredo atual — isso vive
      // apenas no servico `prepararMfa(usuarioId, codigo)`, nunca exposto por esta
      // rota. Com o MFA ja ativo, recusa: o front nem oferece o botao, e esta
      // guarda fecha o acesso direto.
      const [u] = await db.select({ mfaAtivo: usuarios.mfaAtivo }).from(usuarios)
        .where(eq(usuarios.id, contexto.usuarioId)).limit(1);
      if (u?.mfaAtivo) {
        throw new ErroHttp(409, 'mfa_ja_ativo', 'A verificação em duas etapas já está ativa');
      }
      const { segredo, uri } = await prepararMfa(contexto.usuarioId);
      return { segredo, otpauth: uri };
    },
  },
  {
    metodo: 'POST', caminho: '/auth/mfa/ativar', permissao: null, autenticada: true,
    handler: async (req) => {
      const { contexto } = exigirAutenticacao(req);
      const { codigo } = entradaMfa.parse(req.body);
      // `ativarMfa` confere o codigo contra o segredo preparado e so entao liga o
      // MFA, devolvendo os codigos de recuperacao (mostrados uma unica vez ao
      // usuario). Codigo errado sobe como 422 `codigo_invalido`, do proprio servico.
      const { codigosRecuperacao } = await ativarMfa(contexto.usuarioId, codigo);
      await registrarAuditoria({
        atorId: contexto.usuarioId, acao: 'mfa.ativado', recursoTipo: 'usuario',
        recursoId: contexto.usuarioId, unidadeId: null, ip: req.ip,
        agente: String(req.headers['user-agent'] ?? ''), delegacaoId: contexto.delegacaoId,
      });
      return { codigosRecuperacao };
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
    metodo: 'GET', caminho: '/auth/meus-dados', permissao: null, autenticada: true,
    handler: async (req) => montarMeusDados(exigirAutenticacao(req).contexto.usuarioId),
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
