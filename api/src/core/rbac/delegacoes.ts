import { randomUUID } from 'node:crypto';
import { and, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import { registrarAuditoria } from '../auditoria/registro';
import type { Origem } from '../auth/sessoes';
import { db } from '../db/client';
import { dataDeHoje } from '../db/fuso';
import { usuarios } from '../db/schema/acesso';
import { delegacoes } from '../db/schema/delegacoes';
import { delegacaoInvalida, delegacaoSobreposta, naoEncontrado, semPermissao } from '../erros';
import type { ContextoUsuario } from './contexto';

/** Delegar o PRÓPRIO escopo. Ver `criarDelegacao` sobre por que não existe "delegar o de outro". */
export const PERMISSAO_CRIAR = 'core.delegacao.criar';
/** Revogar delegação alheia (o delegante revoga a dele sem precisar desta). */
export const PERMISSAO_ADMINISTRAR = 'core.delegacao.administrar';

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data existente e escrita como o Postgres espera. O ida-e-volta pelo `Date`
 * pega o que o regex não pega: `2026-02-31` casa com o formato, e sem esta
 * checagem chegaria ao banco como erro cru de sintaxe (500) em vez de 422.
 */
function dataValida(valor: string): boolean {
  if (!FORMATO_DATA.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

/**
 * Rede de segurança para violações de chave estrangeira: o delegante deixou de
 * existir entre a resolução do contexto e o insert. O destinatário já foi
 * conferido antes, pelo `select ... for update` que trava a linha dele.
 *
 * 404, nunca 403 — e nunca uma mensagem que confirme, para quem está sondando,
 * qual dos dois ids é o inexistente. Qualquer outro erro sobe intacto: engolir o
 * desconhecido aqui transformaria falha de banco em "delegação recusada", que é
 * mentira.
 */
function traduzirErroDoBanco(erro: unknown): unknown {
  const { code } = erro as { code?: string };
  if (code === '23503') return naoEncontrado();
  return erro;
}

/**
 * Empresta o escopo de quem chama para outra pessoa, por um período.
 *
 * O DELEGANTE É SEMPRE `ctx.usuarioId`. Não existe parâmetro para dizer de quem
 * é o escopo emprestado, e essa ausência é a garantia central desta função:
 * com um `deUsuarioId` livre, qualquer chamador com a permissão de delegar
 * escreveria uma linha dizendo que o diretor delegou para ele — escalonamento
 * de privilégio em uma chamada, sem nada no caminho para barrar. A permissão
 * `core.delegacao.criar` autoriza emprestar O PRÓPRIO escopo; ela nunca
 * autoriza emprestar o de outra pessoa.
 *
 * Delegação criada por quem ESTÁ agindo sob delegação também empresta apenas o
 * escopo próprio de quem chama (ver `resolverContexto`): B não repassa adiante
 * o que A emprestou a ele. `delegacaoId` vai para a trilha justamente para que
 * esse caso apareça na auditoria.
 */
export async function criarDelegacao(
  ctx: ContextoUsuario,
  entrada: { paraUsuarioId: string; inicio: string; fim: string; motivo: string },
  origem: Origem,
): Promise<{ id: string }> {
  if (!ctx.permissoes.has(PERMISSAO_CRIAR)) throw semPermissao();

  if (!FORMATO_UUID.test(entrada.paraUsuarioId)) throw naoEncontrado();
  if (entrada.paraUsuarioId === ctx.usuarioId) {
    throw delegacaoInvalida('Não é possível delegar para si mesmo.');
  }
  if (!dataValida(entrada.inicio) || !dataValida(entrada.fim)) {
    throw delegacaoInvalida('As datas de início e fim precisam estar no formato AAAA-MM-DD.');
  }
  // Comparação de texto: em `AAAA-MM-DD` a ordem lexicográfica é a cronológica.
  if (entrada.fim < entrada.inicio) {
    throw delegacaoInvalida('O fim da vigência não pode ser anterior ao início.');
  }
  if (entrada.motivo.trim() === '') {
    throw delegacaoInvalida('O motivo da delegação é obrigatório.');
  }

  const id = randomUUID();
  try {
    // Três coisas na MESMA transação, nesta ordem, e a ordem é a garantia:
    //
    // 1. Lock na linha do DESTINATÁRIO. É o mesmo padrão de `criarSessao` para
    //    "no máximo uma sessão pendente por conta". Serializa todas as tentativas
    //    dirigidas à mesma pessoa — e só a elas: delegações para pessoas
    //    diferentes não se esperam.
    // 2. Checagem de sobreposição. Vem DEPOIS do lock de propósito: em READ
    //    COMMITTED cada comando pega um snapshot novo, então quem esperou o lock
    //    enxerga o que a transação anterior comitou. Antes do lock, leria o
    //    passado e concluiria que está livre.
    // 3. Insert + trilha. A linha e o registro dela caem ou passam juntos: fora
    //    da transação, uma falha ao auditar deixaria escopo emprestado sem
    //    rastro — exatamente o que a trilha existe para impedir.
    //
    // O lock é tomado aqui, e não no início da função, para não segurar a linha
    // durante as validações — mesmo motivo pelo qual `criarSessao` só o toma
    // depois do Argon2id.
    await db.transaction(async (tx) => {
      const [destinatario] = await tx.select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.id, entrada.paraUsuarioId))
        .for('update');
      // Sem linha não há quem travar, e a corrida deixa de existir junto com o
      // destinatário. Mesma resposta do id malformado: 404, sem dizer qual id.
      if (!destinatario) throw naoEncontrado();

      // Intervalos fechados nas duas pontas: [a,b] e [c,d] se tocam quando
      // a <= d e b >= c. `fim` é o último dia de vigência, não o primeiro de fora.
      const [conflito] = await tx.select({ id: delegacoes.id })
        .from(delegacoes)
        .where(and(
          eq(delegacoes.paraUsuarioId, entrada.paraUsuarioId),
          isNull(delegacoes.revogadaEm),
          lte(delegacoes.inicio, entrada.fim),
          gte(delegacoes.fim, entrada.inicio),
        ))
        .limit(1);
      if (conflito) throw delegacaoSobreposta();

      await tx.insert(delegacoes).values({
        id,
        deUsuarioId: ctx.usuarioId,
        paraUsuarioId: entrada.paraUsuarioId,
        inicio: entrada.inicio,
        fim: entrada.fim,
        motivo: entrada.motivo,
      });
      await registrarAuditoria({
        atorId: ctx.usuarioId, acao: 'delegacao.criada', recursoTipo: 'delegacao',
        recursoId: id, unidadeId: null, ip: origem.ip, agente: origem.agente,
        delegacaoId: ctx.delegacaoId,
        depois: {
          paraUsuarioId: entrada.paraUsuarioId,
          inicio: entrada.inicio,
          fim: entrada.fim,
          motivo: entrada.motivo,
        },
      }, tx);
    });
  } catch (erro) {
    throw traduzirErroDoBanco(erro);
  }

  return { id };
}

/**
 * Encerra a delegação antes do prazo. Só o delegante ou quem tem
 * `core.delegacao.administrar`.
 *
 * A autorização entra na CONDIÇÃO do UPDATE, e não numa leitura anterior: ler
 * para decidir e depois escrever abre a janela em que a delegação é revogada
 * (ou trocada) entre as duas idas ao banco. Um único `update ... returning`
 * condicionado resolve dono, vigência e revogação prévia de uma vez — se nada
 * volta, nada foi alterado.
 *
 * Não encontrada, de outra pessoa e já revogada devolvem todas o mesmo 404: um
 * 403 no caso "não é sua" confirmaria a existência da delegação para quem está
 * sondando ids.
 */
export async function revogarDelegacao(
  ctx: ContextoUsuario,
  id: string,
  origem: Origem,
): Promise<void> {
  if (!FORMATO_UUID.test(id)) throw naoEncontrado();

  const condicoes: SQL[] = [eq(delegacoes.id, id), isNull(delegacoes.revogadaEm)];
  if (!ctx.permissoes.has(PERMISSAO_ADMINISTRAR)) {
    condicoes.push(eq(delegacoes.deUsuarioId, ctx.usuarioId));
  }

  await db.transaction(async (tx) => {
    const [linha] = await tx.update(delegacoes)
      .set({ revogadaEm: new Date() })
      .where(and(...condicoes))
      .returning({
        id: delegacoes.id,
        deUsuarioId: delegacoes.deUsuarioId,
        paraUsuarioId: delegacoes.paraUsuarioId,
      });

    // `throw` dentro da transação desfaz o UPDATE — que, neste caminho, não
    // alterou nada de qualquer forma.
    if (!linha) throw naoEncontrado();

    await registrarAuditoria({
      atorId: ctx.usuarioId, acao: 'delegacao.revogada', recursoTipo: 'delegacao',
      recursoId: linha.id, unidadeId: null, ip: origem.ip, agente: origem.agente,
      delegacaoId: ctx.delegacaoId,
      antes: { deUsuarioId: linha.deUsuarioId, paraUsuarioId: linha.paraUsuarioId },
    }, tx);
  });
}

/**
 * Delegação vigente hoje para esta pessoa, se houver.
 *
 * `limit(1)` sem desempate porque o conjunto tem, por invariante, no máximo uma
 * linha: `criarDelegacao` serializa sob lock as criações dirigidas à mesma
 * pessoa e recusa período sobreposto (ver o comentário longo na migration 0007
 * sobre o que essa invariante garante e o que ela NÃO garante). Um desempate por
 * `order by` só tornaria determinística a escolha entre duas delegações que não
 * deveriam coexistir — e esconderia, em vez de expor, a quebra da invariante.
 *
 * A vigência é comparada no fuso da organização, nunca no do servidor de banco
 * — ver `dataDeHoje`, em db/fuso.ts.
 */
export async function delegacaoAtiva(
  paraUsuarioId: string,
): Promise<{ id: string; deUsuarioId: string } | null> {
  const [d] = await db
    .select({ id: delegacoes.id, deUsuarioId: delegacoes.deUsuarioId })
    .from(delegacoes)
    .where(and(
      eq(delegacoes.paraUsuarioId, paraUsuarioId),
      isNull(delegacoes.revogadaEm),
      lte(delegacoes.inicio, dataDeHoje()),
      gte(delegacoes.fim, dataDeHoje()),
    ))
    .limit(1);
  return d ?? null;
}
