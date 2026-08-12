import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { db, type Db } from '../db/client';
import { usuarios } from '../db/schema/acesso';
import { codigosRecuperacao } from '../db/schema/auth';
import { ErroHttp } from '../erros';
import type { ContextoUsuario } from '../rbac/contexto';

/**
 * Verbo destrutivo (perde dado/estado que não volta sozinho) ou de concessão de
 * poder (cria ou modifica o próprio sistema de acesso). Quem acrescentar um verbo
 * novo com uma dessas duas naturezas deve incluí-lo aqui.
 */
const VERBOS_SENSIVEIS = new Set(['aprovar', 'administrar', 'excluir', 'revogar', 'desligar', 'bloquear']);

/**
 * A exigência é derivada das permissões efetivas, não de uma lista de cargos.
 * Cargo novo com poder herda a exigência automaticamente.
 */
export function exigeMfa(ctx: ContextoUsuario): boolean {
  for (const [chave, escopo] of ctx.permissoes) {
    if (escopo.alcance === 'global') return true;
    const verbo = chave.split('.')[2];
    if (verbo && VERBOS_SENSIVEIS.has(verbo)) return true;
  }
  return false;
}

const hashCodigo = (c: string): string =>
  createHash('sha256').update(c.replace(/\s|-/g, '').toLowerCase()).digest('hex');

/** Índice do passo de tempo TOTP corrente (RFC 6238), na duração de passo configurada na lib. */
const passoAtual = (): number => Math.floor(Date.now() / 1000 / authenticator.allOptions().step);

/**
 * Reivindica atomicamente o passo de tempo TOTP corrente para o usuário — ponto
 * único usado por `conferirMfa`, pela checagem de `ativarMfa` e pela confirmação
 * de `prepararMfa`. Um código só prova posse do autenticador uma vez por passo de
 * tempo, e essa garantia vale ATRAVÉS dos três caminhos: um código visto uma vez
 * (por cima do ombro, num print, numa gravação de tela) não serve de novo em
 * nenhum deles dentro da mesma janela, mesmo que o primeiro uso tenha sido por um
 * caminho diferente do segundo. A condição (`mfaUltimoPasso` nulo ou anterior a
 * este passo) é resolvida pelo Postgres sob o lock de linha do UPDATE, não por um
 * SELECT anterior — chamadas concorrentes no mesmo passo só deixam uma reivindicar.
 * Aceita `db` ou o `tx` de uma transação em andamento, para poder compor com a
 * reivindicação adicional que `ativarMfa`/`prepararMfa` fazem no mesmo passo.
 */
async function reivindicarPassoTotp<E extends Pick<Db, 'update'>>(
  executor: E,
  usuarioId: string,
): Promise<boolean> {
  const passo = passoAtual();
  const [reivindicado] = await executor.update(usuarios)
    .set({ mfaUltimoPasso: passo })
    .where(and(
      eq(usuarios.id, usuarioId),
      or(isNull(usuarios.mfaUltimoPasso), lt(usuarios.mfaUltimoPasso, passo)),
    ))
    .returning();
  return !!reivindicado;
}

export async function prepararMfa(
  usuarioId: string,
  codigoConfirmacao?: string,
): Promise<{ segredo: string; uri: string }> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!u) throw new ErroHttp(404, 'nao_encontrado', 'Usuário não encontrado');

  const segredo = authenticator.generateSecret();
  const uri = authenticator.keyuri(u.email, 'Conect2AI', segredo);

  if (!u.mfaAtivo) {
    // Primeira configuração: não há prova de posse a exigir (o usuário ainda não
    // tem autenticador registrado) nem um valor anterior contra o qual reivindicar
    // por CAS — duas preparações concorrentes aqui são uma corrida residual
    // documentada no relatório, não fechada por esta função.
    await db.update(usuarios).set({ mfaSegredo: segredo, mfaAtivo: false })
      .where(eq(usuarios.id, usuarioId));
    return { segredo, uri };
  }

  // Reconfigurar quando o MFA já está ativo desliga a proteção que existia — só pode
  // prosseguir com prova de posse do segredo ATUAL, um código TOTP válido dele.
  // Sem isso, reabrir o fluxo de configuração (por acidente, ou com uma sessão obtida
  // antes de o MFA ser exigido) desligaria a proteção sem confirmar nada.
  const erroConfirmacao = (): ErroHttp => new ErroHttp(
    422,
    'confirmacao_necessaria',
    'É preciso confirmar um código válido do autenticador atual para reconfigurar o MFA',
  );
  if (!u.mfaSegredo || !codigoConfirmacao || !authenticator.check(codigoConfirmacao, u.mfaSegredo)) {
    throw erroConfirmacao();
  }
  // Extraído para uma const própria (em vez de reler `u.mfaSegredo` dentro do
  // closure abaixo): o TypeScript não propaga o estreitamento de tipo de uma
  // checagem `!u.mfaSegredo` para dentro de uma função aninhada, mesmo com `u`
  // constante — sem isso o compilador voltaria a ver `string | null`.
  const segredoValidado: string = u.mfaSegredo;

  return db.transaction(async (tx) => {
    // A confirmação é uma prova de posse: não pode ser reaproveitada (mesma
    // guarda de replay usada em `conferirMfa`/`ativarMfa`), senão um código visto
    // uma vez por terceiros também serviria para reconfigurar o segundo fator.
    if (!(await reivindicarPassoTotp(tx, usuarioId))) throw erroConfirmacao();

    // Reivindica a reconfiguração condicionada ao segredo contra o qual a
    // confirmação foi validada: se outra reconfiguração concorrente já tiver
    // trocado o segredo nesse meio-tempo, a condição não bate e esta chamada não
    // sobrescreve por cima dela.
    const [reconfigurado] = await tx.update(usuarios)
      .set({ mfaSegredo: segredo, mfaAtivo: false })
      .where(and(eq(usuarios.id, usuarioId), eq(usuarios.mfaSegredo, segredoValidado)))
      .returning();
    if (!reconfigurado) throw erroConfirmacao();

    return { segredo, uri };
  });
}

export async function ativarMfa(
  usuarioId: string,
  codigo: string,
): Promise<{ codigosRecuperacao: string[] }> {
  const erroCodigo = (): ErroHttp => new ErroHttp(422, 'codigo_invalido', 'Código inválido');

  return db.transaction(async (tx) => {
    // Lê o segredo DENTRO da transação e reivindica tudo condicionalmente: sem
    // isso, uma leitura fora da transação poderia validar contra um segredo que
    // `prepararMfa` já substituiu por baixo (corrida entre os dois fluxos).
    const [u] = await tx.select().from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
    if (!u?.mfaSegredo || !authenticator.check(codigo, u.mfaSegredo)) throw erroCodigo();

    if (!(await reivindicarPassoTotp(tx, usuarioId))) throw erroCodigo();

    // Reivindica a ativação condicionada a: (a) o segredo continuar sendo aquele
    // contra o qual o código foi validado — se `prepararMfa` tiver trocado o
    // segredo nesse meio-tempo, a condição não bate; (b) o MFA ainda não estar
    // ativo — fecha a corrida entre duas ativações concorrentes: a segunda, ao
    // tentar reivindicar depois que a primeira já comitou `mfaAtivo = true`, não
    // encontra linha para atualizar e não chega a apagar/substituir os códigos de
    // recuperação que a primeira já gravou.
    const [ativado] = await tx.update(usuarios)
      .set({ mfaAtivo: true })
      .where(and(
        eq(usuarios.id, usuarioId),
        eq(usuarios.mfaSegredo, u.mfaSegredo),
        eq(usuarios.mfaAtivo, false),
      ))
      .returning();
    if (!ativado) throw erroCodigo();

    const codigos = Array.from({ length: 8 }, () => randomBytes(5).toString('hex'));
    await tx.delete(codigosRecuperacao).where(eq(codigosRecuperacao.usuarioId, usuarioId));
    await tx.insert(codigosRecuperacao).values(codigos.map((c) => ({
      id: randomUUID(), usuarioId, codigoHash: hashCodigo(c),
    })));

    return { codigosRecuperacao: codigos };
  });
}

/** Aceita o código do aplicativo autenticador ou um código de recuperação de uso único. */
export async function conferirMfa(usuarioId: string, codigo: string): Promise<boolean> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!u?.mfaSegredo) return false;

  if (authenticator.check(codigo, u.mfaSegredo)) {
    return reivindicarPassoTotp(db, usuarioId);
  }

  // Reivindica o código de recuperação atomicamente no próprio UPDATE: a condição
  // `usado_em is null` é resolvida pelo Postgres sob o lock de linha do UPDATE, não
  // por um SELECT anterior. Chamadas concorrentes com o mesmo código serializam
  // aqui — cada uma só enxerga o UPDATE de quem comitou antes dela, e nesse momento
  // `usado_em` já não é mais null, então não reivindica nada. Sem isso, um SELECT
  // prévio checando `usado_em is null` deixaria todas as chamadas concorrentes
  // verem a linha ainda livre e todas reivindicariam o mesmo código.
  const [recuperacao] = await db.update(codigosRecuperacao)
    .set({ usadoEm: new Date() })
    .where(and(
      eq(codigosRecuperacao.usuarioId, usuarioId),
      eq(codigosRecuperacao.codigoHash, hashCodigo(codigo)),
      isNull(codigosRecuperacao.usadoEm),
    ))
    .returning();

  return !!recuperacao;
}
