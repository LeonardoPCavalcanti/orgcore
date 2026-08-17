import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../../core/db/client';
import { usoIaUsuario } from '../../core/db/schema/uso-ia-usuario';
import { ErroHttp } from '../../core/erros';

// Mesma noção de "hoje" que consumo-usuario grava (data UTC), para o teto casar
// exatamente com o que foi contabilizado.
const hoje = (): string => new Date().toISOString().slice(0, 10);

/**
 * Lê um teto do ambiente. Ausente, não-numérico ou <= 0 => 0 = SEM limite. Por
 * isso, sem nenhuma variável configurada, o orçamento fica desligado e o
 * comportamento é idêntico ao de antes — os tetos são um freio opt-in para
 * exposição pública, não uma mudança de produto.
 */
function teto(nome: string): number {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

async function consumo(where: SQL): Promise<{ reqs: number; tokens: number }> {
  const [linha] = await db.select({
    reqs: sql<number>`coalesce(sum(${usoIaUsuario.requisicoes}), 0)::int`,
    tokens: sql<number>`coalesce(sum(${usoIaUsuario.tokens}), 0)::int`,
  }).from(usoIaUsuario).where(where);
  return { reqs: linha?.reqs ?? 0, tokens: linha?.tokens ?? 0 };
}

/**
 * Freio de custo para as chaves de IA gratuitas: recusa (429) antes de gastar
 * IA quando o consumo do dia já atingiu um teto. Três tetos independentes, todos
 * opt-in por env:
 *  - IA_LIMITE_TOKENS_USUARIO_DIA  — protege contra um único usuário abusar;
 *  - IA_LIMITE_REQS_USUARIO_DIA    — teto de mensagens/dia (mais previsível p/ demo);
 *  - IA_LIMITE_TOKENS_GLOBAL_DIA   — teto da plataforma inteira (protege a cota grátis).
 *
 * Checado ANTES de gravar a mensagem do usuário e de chamar o modelo — quem
 * estourou não deixa mensagem órfã nem queima cota. O gasto é medido a
 * posteriori, então a última requisição pode ultrapassar um pouco o teto; é um
 * resíduo aceitável para um freio cujo objetivo é conter abuso, não cobrar exato.
 */
export async function verificarOrcamentoIa(usuarioId: string): Promise<void> {
  const limTokensUser = teto('IA_LIMITE_TOKENS_USUARIO_DIA');
  const limReqsUser = teto('IA_LIMITE_REQS_USUARIO_DIA');
  const limTokensGlobal = teto('IA_LIMITE_TOKENS_GLOBAL_DIA');
  if (!limTokensUser && !limReqsUser && !limTokensGlobal) return;

  const dia = hoje();

  if (limTokensUser || limReqsUser) {
    const doUsuario = await consumo(and(eq(usoIaUsuario.usuarioId, usuarioId), eq(usoIaUsuario.dia, dia)) as SQL);
    if (limReqsUser && doUsuario.reqs >= limReqsUser) {
      throw new ErroHttp(429, 'orcamento_ia_usuario',
        'Você atingiu o limite diário de uso de IA. Tente novamente amanhã.');
    }
    if (limTokensUser && doUsuario.tokens >= limTokensUser) {
      throw new ErroHttp(429, 'orcamento_ia_usuario',
        'Você atingiu o limite diário de uso de IA. Tente novamente amanhã.');
    }
  }

  if (limTokensGlobal) {
    const daPlataforma = await consumo(eq(usoIaUsuario.dia, dia));
    if (daPlataforma.tokens >= limTokensGlobal) {
      throw new ErroHttp(429, 'orcamento_ia_global',
        'O limite diário de uso de IA da plataforma foi atingido. Tente novamente mais tarde.');
    }
  }
}
