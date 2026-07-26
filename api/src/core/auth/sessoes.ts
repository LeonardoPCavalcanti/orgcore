import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { usuarios } from '../db/schema/acesso';
import { sessoes, tentativasLogin, type Sessao } from '../db/schema/auth';
import { ErroHttp, naoAutenticado } from '../erros';
import { conferirSenha } from './senha';

export type Origem = { ip: string; agente: string };

const HORAS_SESSAO = 12;
const DIAS_LIMITE = 7;
const MAX_TENTATIVAS = 6;
const JANELA_MINUTOS = 15;

/**
 * Hash Argon2id de um valor aleatório sem relação com senha real de ninguém, gerado
 * uma única vez (offline, com os mesmos parâmetros de `senha.ts`) e fixado aqui. Existe
 * só para dar a `conferirSenha` um hash válido para verificar quando não há usuário —
 * ver o comentário em `autenticar` sobre o canal lateral de tempo que isso fecha.
 */
const HASH_FICTICIO = '$argon2id$v=19$m=65536,p=1,t=3$nwH2nJONoRFACFdTh59ySw$T3FF2EmZLXJFjbnnPzrantN+WhkBljYP8cUIbqynpfY';

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const credenciaisInvalidas = () =>
  new ErroHttp(401, 'credenciais_invalidas', 'Credenciais inválidas');

export async function autenticar(
  email: string,
  senha: string,
  origem: Origem,
): Promise<{ usuarioId: string; exigeMfa: boolean }> {
  const alvo = email.toLowerCase();

  // Escopo do bloqueio: email E ip, não só email. Contar só por email (como no
  // exemplo original desta tarefa) deixa qualquer terceiro, de qualquer IP, bloquear a
  // conta de outra pessoa de propósito — bastaria errar a senha dela seis vezes para
  // negar acesso ao dono legítimo, sem precisar saber nada além do e-mail-alvo. Ao
  // escopar por (email, ip), um atacante só consome a cota da combinação email+IP dele
  // mesmo; o dono da conta, entrando do IP de sempre, não é afetado por tentativas
  // erradas feitas de outro IP. Isso não impede um atacante com múltiplos IPs de tentar
  // senhas contra a mesma conta (cada IP tem sua própria cota) — fechar isso exigiria um
  // limite agregado por conta independente de IP, o que reintroduziria o problema de
  // negação de serviço acima; o trade-off escolhido aqui prioriza não permitir que um
  // único IP hostil tranque o dono legítimo fora da própria conta.
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tentativasLogin)
    .where(and(
      eq(tentativasLogin.email, alvo),
      eq(tentativasLogin.ip, origem.ip),
      eq(tentativasLogin.sucesso, false),
      gt(tentativasLogin.criadaEm, new Date(Date.now() - JANELA_MINUTOS * 60_000)),
    ));

  if (total >= MAX_TENTATIVAS) {
    throw new ErroHttp(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde alguns minutos.');
  }

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, alvo)).limit(1);

  // conferirSenha roda SEMPRE, mesmo sem usuário: contra HASH_FICTICIO quando não há
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
  const senhaConfere = await conferirSenha(senha, usuario?.senhaHash ?? HASH_FICTICIO);
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
): Promise<{ token: string; expiraEm: Date }> {
  const token = randomBytes(32).toString('base64url');
  const agora = Date.now();
  const expiraEm = new Date(agora + HORAS_SESSAO * 3600_000);

  await db.insert(sessoes).values({
    id: randomUUID(),
    usuarioId,
    tokenHash: hashToken(token),
    ip: origem.ip,
    agente: origem.agente,
    expiraEm,
    limiteEm: new Date(agora + DIAS_LIMITE * 86_400_000),
  });

  return { token, expiraEm };
}

/** Valida e renova de forma deslizante, respeitando o teto absoluto. */
export async function validarSessao(token: string): Promise<{ usuarioId: string; sessaoId: string }> {
  const agora = new Date();
  const [sessao] = await db.select().from(sessoes).where(and(
    eq(sessoes.tokenHash, hashToken(token)),
    isNull(sessoes.revogadaEm),
    gt(sessoes.expiraEm, agora),
    gt(sessoes.limiteEm, agora),
  )).limit(1);

  if (!sessao) throw naoAutenticado();

  const novaExpiracao = new Date(Math.min(
    agora.getTime() + HORAS_SESSAO * 3600_000,
    sessao.limiteEm.getTime(),
  ));
  await db.update(sessoes)
    .set({ ultimoUso: agora, expiraEm: novaExpiracao })
    .where(eq(sessoes.id, sessao.id));

  return { usuarioId: sessao.usuarioId, sessaoId: sessao.id };
}

export async function revogarSessao(sessaoId: string): Promise<void> {
  await db.update(sessoes).set({ revogadaEm: new Date() }).where(eq(sessoes.id, sessaoId));
}

/** Chamado no desligamento e na suspensão: corta o acesso na hora. */
export async function revogarSessoesDoUsuario(usuarioId: string): Promise<void> {
  await db.update(sessoes).set({ revogadaEm: new Date() }).where(and(
    eq(sessoes.usuarioId, usuarioId),
    isNull(sessoes.revogadaEm),
  ));
}

export async function listarSessoes(usuarioId: string): Promise<Sessao[]> {
  return db.select().from(sessoes).where(and(
    eq(sessoes.usuarioId, usuarioId),
    isNull(sessoes.revogadaEm),
  )).orderBy(desc(sessoes.ultimoUso));
}
