import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { usuarios, vinculos } from '../db/schema/acesso';
import { convites } from '../db/schema/auth';
import { ErroHttp } from '../erros';
import { gerarHash, validarForcaDaSenha } from './senha';

const VALIDADE_HORAS = 72;

/** Código do driver Postgres para violação de restrição única (unique_violation). */
const CODIGO_PG_VIOLACAO_UNICA = '23505';

/** O token só existe em claro nesta função e no e-mail. O banco guarda o hash. */
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * O driver `pg` lança objetos de erro crus (código, detalhe de constraint, tudo em
 * inglês) que nunca podem chegar ao cliente da API. `erro` é `unknown` de propósito —
 * checamos a forma em vez de confiar num tipo do driver, que este módulo não tem
 * licença para importar (só `core/db/client.ts` pode importar `pg`).
 */
function ehViolacaoDeRestricaoUnica(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  return Reflect.get(erro, 'code') === CODIGO_PG_VIOLACAO_UNICA;
}

export async function criarConvite(entrada: {
  email: string; nome: string; unidadeId: number; cargoId: string; convidadoPor: string;
}): Promise<{ token: string }> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(convites).values({
    id: randomUUID(),
    email: entrada.email.toLowerCase(),
    nome: entrada.nome,
    unidadeId: entrada.unidadeId,
    cargoId: entrada.cargoId,
    tokenHash: hashToken(token),
    convidadoPor: entrada.convidadoPor,
    expiraEm: new Date(Date.now() + VALIDADE_HORAS * 3600_000),
  });
  return { token };
}

export async function aceitarConvite(
  token: string,
  senha: string,
): Promise<{ usuarioId: string }> {
  validarForcaDaSenha(senha);

  return db.transaction(async (tx) => {
    // Reivindica o convite atomicamente no próprio UPDATE: a condição
    // `aceito_em is null` é resolvida pelo Postgres sob o lock de linha do UPDATE,
    // não por um SELECT anterior. Duas transações concorrentes com o mesmo token
    // serializam aqui — a segunda só enxerga o UPDATE da primeira depois que ela
    // comita, e nesse momento `aceito_em` já não é mais null, então ela não
    // reivindica nada. Sem isso, o uso único dependeria só do UNIQUE em
    // `usuarios.email`, uma garantia emprestada de outra tabela por acidente.
    const [convite] = await tx.update(convites)
      .set({ aceitoEm: new Date() })
      .where(and(
        eq(convites.tokenHash, hashToken(token)),
        isNull(convites.aceitoEm),
        gt(convites.expiraEm, new Date()),
      ))
      .returning();

    if (!convite) {
      throw new ErroHttp(400, 'convite_invalido', 'Convite inválido ou expirado');
    }

    const usuarioId = randomUUID();
    try {
      await tx.insert(usuarios).values({
        id: usuarioId,
        email: convite.email,
        nome: convite.nome,
        status: 'ativo',
        senhaHash: await gerarHash(senha),
      });
    } catch (erro) {
      // O e-mail do convite já pertence a um usuário (corrida perdida contra outro
      // convite para o mesmo e-mail, ou o convite ficou parado tempo suficiente para
      // alguém virar usuário por outro caminho). Devolvemos o mesmo erro genérico do
      // convite inválido/expirado — de propósito, não por preguiça: para quem só tem
      // este token, não pode haver diferença observável entre "convite já usado",
      // "convite expirado" e "o e-mail já é de outro usuário". Um código próprio aqui
      // (ex.: `email_ja_cadastrado`) vazaria exatamente essa distinção para qualquer
      // portador do token, virando um oráculo de existência de conta.
      if (ehViolacaoDeRestricaoUnica(erro)) {
        throw new ErroHttp(400, 'convite_invalido', 'Convite inválido ou expirado');
      }
      throw erro;
    }

    await tx.insert(vinculos).values({
      id: randomUUID(),
      usuarioId,
      unidadeId: convite.unidadeId,
      cargoId: convite.cargoId,
      principal: true,
      inicio: new Date().toISOString().slice(0, 10),
    });

    return { usuarioId };
  });
}
