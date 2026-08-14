/**
 * Kit de padronização de imagem no NAVEGADOR. Remove fundo (WASM) e repinta logos
 * de branco (canvas), antes de enviar ao servidor — sem depender de binário nativo,
 * que é o que falha no Windows. Nada aqui lança para o chamador: em falha, devolve a
 * imagem original, e o card ainda sai.
 */

/**
 * Repinta, no lugar, todo pixel com alfa > 0 para branco (255,255,255), preservando o
 * canal alfa — as bordas anti-aliased continuam suaves. Função pura (sem canvas), para
 * ser testável sem DOM.
 */
export function pixelsParaBranco(dados: Uint8ClampedArray): void {
  for (let i = 0; i < dados.length; i += 4) {
    if (dados[i + 3]! > 0) {
      dados[i] = 255;
      dados[i + 1] = 255;
      dados[i + 2] = 255;
    }
  }
}
