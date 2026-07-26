import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { usuarios } from '../db/schema/acesso';
import { sessoes, tentativasLogin } from '../db/schema/auth';
import { ErroHttp, naoAutenticado } from '../erros';
import { conferirSenha, gerarHash } from './senha';

export type Origem = { ip: string; agente: string };

const HORAS_SESSAO = 12;
const DIAS_LIMITE = 7;
const JANELA_MINUTOS = 15;

// Dois limites, duas ameaças diferentes — ver o comentário completo em `autenticar`:
// MAX_TENTATIVAS_IP protege qualquer conta (inclusive inexistente) contra um único IP
// hostil; MAX_TENTATIVAS_CONTA protege uma conta específica contra força bruta
// distribuída em vários IPs.
const MAX_TENTATIVAS_IP = 6;
const MAX_TENTATIVAS_CONTA = 20;

/**
 * Orçamento de tentativas de segundo fator por SESSÃO.
 *
 * Por que 5: o código TOTP tem 6 dígitos (10⁶ combinações) e vale por um passo de
 * 30 s. Cinco palpites por sessão dão ao atacante uma chance de 5 em 10⁶ (0,0005%)
 * por login — e, como estourar o orçamento REVOGA a sessão, cada bloco de 5
 * palpites custa um login completo, que por sua vez esbarra nos limites de
 * `tentativas_login` (6 por IP e 20 por conta a cada 15 min). O teto real de
 * palpites passa a ser ~30 por IP a cada 15 minutos, não ilimitado: para chegar a
 * 1% de chance seriam necessários ~10⁴ logins, ~2 000 janelas de 15 min, mais de
 * 20 dias contra um único IP já bloqueado no caminho. Cinco também é folgado o
 * bastante para o uso legítimo: erro de digitação e relógio dessincronizado (a
 * `otplib` já tolera a janela vizinha) raramente passam de duas ou três repetições
 * antes de a pessoa recorrer a um código de recuperação.
 *
 * Por sessão, e não por IP: quem chegou até aqui já tem a senha e quer atravessar
 * o segundo fator DESTA sessão — ela é o alvo. Um contador por IP seria contornado
 * por um atacante distribuído; um por conta permitiria trancar o dono legítimo de
 * fora a partir de qualquer origem. A sessão é a única chave que o atacante não
 * consegue nem trocar de graça (precisa de um login novo) nem usar contra outra
 * pessoa.
 */
export const MAX_TENTATIVAS_MFA = 5;

let hashFicticioPromise: Promise<string> | undefined;

/**
 * Hash Argon2id de um valor aleatório sem relação com senha real de ninguém — calculado
 * uma única vez por processo (lazy, cacheado em `hashFicticioPromise`) com a MESMA
 * função `gerarHash` usada para senhas de verdade, em vez de um texto fixo copiado à
 * mão. Isso garante duas coisas ao mesmo tempo: (1) o hash é sempre uma string PHC
 * genuína, produzida pela própria lib instalada, então `argon2.verify` nunca a rejeita
 * de cara por formato — sempre roda o Argon2id completo; (2) os parâmetros de custo
 * (memoryCost/timeCost/parallelism) vêm de `OPCOES` em `senha.ts`, então não têm como
 * divergir silenciosamente se aquele arquivo mudar esses valores no futuro. Ver o
 * comentário em `autenticar` sobre o canal lateral de tempo que isso fecha.
 */
export function hashFicticio(): Promise<string> {
  hashFicticioPromise ??= gerarHash(randomBytes(32).toString('hex'));
  return hashFicticioPromise;
}

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const credenciaisInvalidas = () =>
  new ErroHttp(401, 'credenciais_invalidas', 'Credenciais inválidas');

const muitasTentativas = () =>
  new ErroHttp(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde alguns minutos.');

export async function autenticar(
  email: string,
  senha: string,
  origem: Origem,
): Promise<{ usuarioId: string; exigeMfa: boolean }> {
  const alvo = email.toLowerCase();
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000);

  // Limite por IP (sozinho, sem filtrar por email): fecha a exaustão de CPU. Como
  // `conferirSenha` roda sempre — inclusive para usuário inexistente, ver abaixo — um
  // atacante num único IP poderia rotacionar e-mails que nunca se repetem (um por
  // tentativa) e forçar um Argon2id completo (64 MiB, 3 iterações) por chamada, sem
  // nunca esbarrar num teto amarrado ao par (email, ip), já que o par nunca se repete.
  // Contar só por IP, ignorando o email da tentativa, fecha isso: 6 tentativas erradas
  // de QUALQUER combinação de e-mails a partir do mesmo IP em 15 minutos bloqueiam esse
  // IP. Escolhido apertado (mesmo valor do limite antigo por conta) porque tentativas
  // legítimas do mesmo IP contra a MESMA conta raramente passam de meia dúzia antes de
  // a pessoa desistir ou pedir redefinição de senha.
  const [{ total: totalIp } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tentativasLogin)
    .where(and(
      eq(tentativasLogin.ip, origem.ip),
      eq(tentativasLogin.sucesso, false),
      gt(tentativasLogin.criadaEm, desde),
    ));

  if (totalIp >= MAX_TENTATIVAS_IP) {
    throw muitasTentativas();
  }

  // Limite por conta (agregando todos os IPs): fecha a força bruta distribuída — um
  // atacante com vários IPs, cada um sob a cota individual acima, ainda não poderia
  // testar senhas contra a MESMA conta indefinidamente. Deliberadamente mais folgado
  // (20 em vez de 6) que o limite por IP: como ele agrega tentativas de qualquer
  // origem, um valor igual ao limite por IP reabriria o problema original desta tarefa
  // — um atacante de UM ÚNICO IP já esbarraria primeiro no limite por IP (acima) bem
  // antes de chegar a 20, então o dono legítimo, entrando de outro IP, não é afetado
  // por um atacante de IP único. Só um atacante com várias origens distintas (mais caro
  // de montar) consegue somar as 20 tentativas e bloquear a conta por 15 minutos — um
  // residual aceito conscientemente: qualquer limite por conta que agregue IPs tem essa
  // mesma tensão, e a alternativa (sem limite algum por conta) deixa a força bruta
  // distribuída sem nenhum teto.
  const [{ total: totalConta } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tentativasLogin)
    .where(and(
      eq(tentativasLogin.email, alvo),
      eq(tentativasLogin.sucesso, false),
      gt(tentativasLogin.criadaEm, desde),
    ));

  if (totalConta >= MAX_TENTATIVAS_CONTA) {
    throw muitasTentativas();
  }

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, alvo)).limit(1);

  // conferirSenha roda SEMPRE, mesmo sem usuário: contra hashFicticio() quando não há
  // usuário (ou ele ainda não tem senha_hash, ex.: convite não aceito). Um curto-circuito
  // do tipo `usuario?.status === 'ativo' && conferirSenha(...)` pareceria equivalente,
  // mas não é — "usuário inexistente" e "conta desligada" retornariam sem chamar
  // Argon2id, enquanto "senha errada" (usuário existe e está ativo) chamaria. Isso cria
  // uma diferença sistemática e mensurável de dezenas a centenas de ms (o custo do
  // Argon2id configurado em `senha.ts`, memoryCost 64 MiB) entre "essa conta não
  // existe/está desligada" e "essa conta existe e está ativa" — um oráculo de tempo, com
  // a mesma mensagem de erro nos três casos mas latências diferentes. Chamar
  // `conferirSenha` incondicionalmente elimina essa diferença: os três caminhos de erro
  // (inexistente, senha errada, desligado) sempre pagam o custo de um Argon2id.
  const senhaConfere = await conferirSenha(senha, usuario?.senhaHash ?? await hashFicticio());
  const ok = usuario !== undefined && usuario.status === 'ativo' && senhaConfere;

  await db.insert(tentativasLogin).values({ email: alvo, ip: origem.ip, sucesso: ok });

  // Mesma resposta para usuário inexistente, senha errada e conta desligada — sem
  // oráculo de existência de conta.
  if (!ok || !usuario) throw credenciaisInvalidas();

  return { usuarioId: usuario.id, exigeMfa: usuario.mfaAtivo };
}

export async function criarSessao(
  usuarioId: string,
  origem: Origem,
  opcoes: { mfaPendente?: boolean } = {},
): Promise<{ token: string; expiraEm: Date; limiteEm: Date }> {
  const token = randomBytes(32).toString('base64url');
  const agora = Date.now();
  const expiraEm = new Date(agora + HORAS_SESSAO * 3600_000);
  const limiteEm = new Date(agora + DIAS_LIMITE * 86_400_000);

  await db.insert(sessoes).values({
    id: randomUUID(),
    usuarioId,
    tokenHash: hashToken(token),
    ip: origem.ip,
    agente: origem.agente,
    expiraEm,
    limiteEm,
    // Quem tem MFA ativo no momento do login nasce com a sessao pendente: so o
    // preHandler da aplicacao (api/src/core/app.ts) e que decide o que uma sessao
    // pendente pode acessar. Quem NAO tem MFA ativo nunca nasce pendente, mesmo
    // que as permissoes do usuario exijam MFA por politica (ver exigeMfa em
    // mfa.ts) — bloquear esse caso trancaria a conta fora do proprio fluxo de
    // ativacao do segundo fator, sem nenhum caminho de saida.
    mfaPendente: opcoes.mfaPendente ?? false,
  });

  return { token, expiraEm, limiteEm };
}

/** Valida e renova de forma deslizante, respeitando o teto absoluto. */
export async function validarSessao(
  token: string,
): Promise<{ usuarioId: string; sessaoId: string; mfaPendente: boolean }> {
  const agora = new Date();
  // Junção com `usuarios` e exigência de `status = 'ativo'` na própria consulta: sem
  // isso, "desligamento corta o acesso na hora" dependeria inteiramente de todo fluxo
  // de desligamento futuro lembrar de chamar `revogarSessoesDoUsuario` — sem nenhuma
  // rede. Se algum caminho esquecer, ou houver uma corrida entre mudar o status e
  // revogar, a sessão continuaria válida por até `DIAS_LIMITE` dias. Checar o status
  // aqui, a cada validação, torna a garantia central desta tarefa verdadeira por
  // construção, não por disciplina de quem chama `revogarSessoesDoUsuario`. O custo é
  // uma junção a mais por requisição, indexada pela chave primária de `usuarios`.
  const [linha] = await db.select().from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
    .where(and(
      eq(sessoes.tokenHash, hashToken(token)),
      isNull(sessoes.revogadaEm),
      gt(sessoes.expiraEm, agora),
      gt(sessoes.limiteEm, agora),
      eq(usuarios.status, 'ativo'),
    )).limit(1);

  if (!linha) throw naoAutenticado();
  const { sessoes: sessao } = linha;

  // Renovação deslizante é privilégio de sessão JÁ CONFIRMADA. Enquanto o segundo
  // fator não foi apresentado, a sessão vive apenas o prazo que ganhou no login e
  // não ganha um minuto a mais por ser usada: sem isso, cada tentativa contra
  // `POST /auth/mfa` empurrava `expira_em` para frente e a janela de ataque se
  // auto-renovava até o teto absoluto de 7 dias. `ultimo_uso` também não é tocado —
  // atividade de uma sessão que ainda não provou quem é não deve poluir a tela de
  // sessões ativas, que existe justamente para o dono reconhecer o que é dele.
  if (!sessao.mfaPendente) {
    const novaExpiracao = new Date(Math.min(
      agora.getTime() + HORAS_SESSAO * 3600_000,
      sessao.limiteEm.getTime(),
    ));
    await db.update(sessoes)
      // `clock_timestamp()` (avanca de verdade a cada chamada, mesmo dentro da mesma
      // transacao) em vez do `agora` calculado em JS: `Date.now()`/`new Date()` no
      // Node tem resolucao de relogio do sistema operacional (no Windows, tipicamente
      // ~15ms), entao duas sessoes tocadas em sequencia rapida podiam gravar o MESMO
      // instante em `ultimo_uso` e empatar na ordenacao de `listarSessoes` — o empate
      // era resolvido de forma nao deterministica (ordem fisica das linhas no heap
      // apos o UPDATE), causando o teste "lista so as sessoes ativas..." falhar de
      // forma intermitente. `clock_timestamp()` tem resolucao de microssegundos e
      // sempre avanca, eliminando o empate na pratica.
      .set({ ultimoUso: sql`clock_timestamp()`, expiraEm: novaExpiracao })
      .where(eq(sessoes.id, sessao.id));
  }

  return { usuarioId: sessao.usuarioId, sessaoId: sessao.id, mfaPendente: sessao.mfaPendente };
}

/**
 * Consome UMA tentativa de segundo fator desta sessão e devolve quantas já foram
 * gastas, contando esta. O incremento é resolvido pelo próprio `UPDATE ...
 * RETURNING`, sob o lock de linha do Postgres — nunca por um SELECT anterior
 * seguido de UPDATE, que deixaria N requisições concorrentes lerem o mesmo valor
 * antigo e gastarem uma única unidade do orçamento entre todas (mesmo padrão de
 * claim atômico de `reivindicarPassoTotp`, em mfa.ts, e do consumo de código de
 * recuperação). Cobra ANTES de conferir o código: um palpite errado precisa custar
 * exatamente o mesmo que um certo, senão o orçamento não limita nada.
 */
export async function consumirTentativaMfa(sessaoId: string): Promise<number> {
  const [linha] = await db.update(sessoes)
    .set({ tentativasMfa: sql`${sessoes.tentativasMfa} + 1` })
    .where(and(eq(sessoes.id, sessaoId), isNull(sessoes.revogadaEm)))
    .returning({ tentativas: sessoes.tentativasMfa });

  // Sessão revogada entre o preHandler e aqui (revogação concorrente, logout em
  // outra aba): nada a consumir, e nada a confirmar — recusa em vez de seguir.
  if (!linha) throw naoAutenticado();
  return linha.tentativas;
}

export async function revogarSessao(sessaoId: string): Promise<void> {
  await db.update(sessoes).set({ revogadaEm: new Date() }).where(eq(sessoes.id, sessaoId));
}

/**
 * Revoga uma sessão exigindo a posse dela no próprio `WHERE`, e devolve se alguma
 * linha foi de fato revogada. Substitui o par "listar as minhas e conferir se o id
 * está na lista, depois revogar" — ali a posse era garantida por uma propriedade
 * externa (o dono de uma sessão nunca muda) e não pela consulta que escreve. Aqui
 * a garantia é do próprio UPDATE: quem não é dono não encontra linha e recebe 404,
 * nunca 403 (403 confirmaria que a sessão existe).
 */
export async function revogarSessaoPropria(
  sessaoId: string,
  usuarioId: string,
): Promise<boolean> {
  const [linha] = await db.update(sessoes)
    .set({ revogadaEm: new Date() })
    .where(and(
      eq(sessoes.id, sessaoId),
      eq(sessoes.usuarioId, usuarioId),
      isNull(sessoes.revogadaEm),
    ))
    .returning({ id: sessoes.id });
  return linha !== undefined;
}

/** Confirma o segundo fator da sessao: chamado por POST /auth/mfa quando `conferirMfa` aceita. */
export async function confirmarMfaDaSessao(sessaoId: string): Promise<void> {
  await db.update(sessoes).set({ mfaPendente: false }).where(eq(sessoes.id, sessaoId));
}

/** Chamado no desligamento e na suspensão: corta o acesso na hora. */
export async function revogarSessoesDoUsuario(usuarioId: string): Promise<void> {
  await db.update(sessoes).set({ revogadaEm: new Date() }).where(and(
    eq(sessoes.usuarioId, usuarioId),
    isNull(sessoes.revogadaEm),
  ));
}

/**
 * O que a tela de sessões ativas precisa mostrar, e SÓ isso. Projeção explícita em
 * vez de `select()` de tudo: `token_hash` é material de autenticação do servidor e
 * `mfa_pendente`/`tentativas_mfa` são estado interno do gate de segundo fator —
 * nenhum deles tem consumidor do lado do cliente, e um `select()` sem projeção
 * despeja qualquer coluna nova pela mesma rota HTTP, em silêncio, no dia em que
 * alguém acrescentar uma.
 */
export type SessaoVisivel = {
  id: string;
  ip: string;
  agente: string;
  criadaEm: Date;
  ultimoUso: Date;
};

export async function listarSessoes(usuarioId: string): Promise<SessaoVisivel[]> {
  // Desempate por `criadaEm` (imutavel, atribuido uma unica vez no insert):
  // rede extra contra qualquer empate residual em `ultimoUso`, alem do
  // `clock_timestamp()` usado em `validarSessao` — ver comentario la.
  return db.select({
    id: sessoes.id,
    ip: sessoes.ip,
    agente: sessoes.agente,
    criadaEm: sessoes.criadaEm,
    ultimoUso: sessoes.ultimoUso,
  }).from(sessoes).where(and(
    eq(sessoes.usuarioId, usuarioId),
    isNull(sessoes.revogadaEm),
  )).orderBy(desc(sessoes.ultimoUso), desc(sessoes.criadaEm));
}
