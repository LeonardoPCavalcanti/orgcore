/**
 * Limitador de taxa em memória, janela fixa por chave (ex.: IP). Proposital não
 * usar plugin externo: a demo roda numa instância única, a contagem em memória
 * basta, e o projeto prefere peças pequenas e auditáveis a dependências novas.
 * (Num deploy multi-instância, trocar o armazenamento por Redis seria o passo
 * seguinte — a interface `excedeu` não muda.)
 *
 * Todos os limites são opt-in: `limite <= 0` = desligado. Sem configuração, o
 * limitador é um no-op e o comportamento é idêntico ao de antes.
 */
type Balde = { contagem: number; reinicioEm: number };
const baldes = new Map<string, Balde>();

/**
 * Conta mais um acerto em `chave` e diz se a janela atual estourou o `limite`.
 * A janela reinicia sozinha quando expira (o balde velho é sobrescrito), então
 * chaves reaproveitadas não vazam memória; chaves distintas (IPs diferentes) são
 * poucas numa demo. `agora` é injetável para teste.
 */
export function excedeu(chave: string, limite: number, janelaMs: number, agora: number = Date.now()): boolean {
  if (limite <= 0) return false;
  const b = baldes.get(chave);
  if (!b || agora >= b.reinicioEm) {
    baldes.set(chave, { contagem: 1, reinicioEm: agora + janelaMs });
    return false;
  }
  b.contagem += 1;
  return b.contagem > limite;
}

/** Zera o estado. Só para teste — nunca chamado em produção. */
export function limparBaldes(): void {
  baldes.clear();
}
