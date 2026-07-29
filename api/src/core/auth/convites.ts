import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { dataDeHoje } from '../db/fuso';
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

    // Checa e-mail duplicado ANTES de gerarHash, não só no catch do insert abaixo.
    // gerarHash roda Argon2id (memoryCost 64 MiB, 3 iterações — tipicamente dezenas a
    // centenas de ms), e um catch pós-insert deixaria esse custo só no caminho "e-mail
    // já é de outro usuário": o caminho "token inválido/expirado/já usado" retorna
    // antes de chamar gerarHash, o caminho "e-mail duplicado" chamaria depois — uma
    // diferença de latência sistemática e mensurável entre dois erros com o mesmo
    // status/código/mensagem, que bastaria para alguém com o token inferir se aquele
    // e-mail já é conta no sistema, mesmo sem diferença nenhuma na resposta em si. Esta
    // checagem faz os dois caminhos de ERRO responderem antes de gerarHash rodar, o que
    // elimina essa diferença sistemática no caso comum (ver ressalva abaixo sobre o
    // caso raro de corrida). Ela é deliberadamente feita FORA de `ehViolacaoDeRestricaoUnica`
    // — aqui é uma consulta de leitura comum, não uma reação a erro do driver.
    const [jaExisteComEsseEmail] = await tx.select({ id: usuarios.id }).from(usuarios)
      .where(eq(usuarios.email, convite.email)).limit(1);
    if (jaExisteComEsseEmail) {
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
      // Rede de segurança para a corrida entre a checagem acima e este insert: se um
      // segundo convite para o MESMO e-mail for aceito nesse intervalo — janela real,
      // mas estreita —, o insert falha por unicidade e caímos aqui. Neste caminho raro
      // gerarHash já rodou, então a assimetria de tempo que a checagem acima existe
      // para evitar volta a existir; eliminá-la exigiria serializar todo aceite de
      // convite (lock global), custo que não se justifica para uma janela de corrida
      // deste tamanho. O que este catch garante, sempre, é a forma da resposta: mesmo
      // status/código/mensagem dos outros dois casos de falha, nunca o erro cru do
      // driver — mas não afirmamos indistinguibilidade total por tempo neste caso raro.
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
      // Data no fuso da organização (ver db/fuso.ts). Um `toISOString()` daria a
      // data UTC: quem aceita o convite à noite no Brasil teria o vínculo
      // começando "amanhã", sem acesso nenhum até o UTC virar.
      inicio: dataDeHoje(),
    });

    return { usuarioId };
  });
}
