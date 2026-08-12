/**
 * Costura de remoção de fundo das fotos dos autores. É um seam plugável, no mesmo
 * espírito do gerador de texto: uma interface, duas implementações. O padrão em teste
 * é o `removedorPassthrough` (determinístico, sem rede); o padrão em produção tenta a
 * remoção real e, se ela não estiver disponível, cai no passthrough — o card sai
 * igual, só sem o recorte perfeito.
 *
 * `recortado` diz ao render como desenhar a foto: `true` → silhueta sem moldura sobre
 * o gradiente (como as referências); `false` → headshot numa moldura circular ciano.
 * Assim um post sem remoção de fundo ainda parece intencional.
 */
export interface RemovedorDeFundo {
  remover(foto: Buffer): Promise<{ png: Buffer; recortado: boolean }>;
}

/** Não mexe na foto: devolve os bytes originais, marcados como não-recortados. */
export const removedorPassthrough: RemovedorDeFundo = {
  async remover(foto) {
    return { png: foto, recortado: false };
  },
};

/** Bytes de imagem → data URI, para embutir num `<img>` do satori. */
export function paraDataUri(png: Buffer, tipo = 'image/png'): string {
  return `data:${tipo};base64,${png.toString('base64')}`;
}

// Nome do pacote de recorte numa variável, não num literal, DE PROPÓSITO: assim o
// `import()` não é resolvido em tempo de tipo e o projeto compila SEM o pacote
// instalado. O recorte de fundo real é uma capacidade opcional e pesada (ONNX +
// modelo baixado no primeiro uso); quem quiser ligá-la instala
// `@imgly/background-removal-node` (`pnpm --filter @4med/api add @imgly/background-removal-node`
// + aprovar os build scripts nativos). Sem ela, `criarRemovedor` cai no passthrough.
const PACOTE_RECORTE = '@imgly/background-removal-node';

type RemoveBackground = (
  entrada: Blob,
  opcoes?: { output?: { format?: string } },
) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * Remoção real, via `@imgly/background-removal-node` (ONNX, roda no próprio servidor,
 * sem chave nem API paga). O import é DINÂMICO e por variável — nunca carregado na
 * inicialização, só quando uma foto é de fato recortada. Se o pacote/modelo não
 * estiver disponível, o import ou a chamada lançam, e `criarRemovedor` cai no passthrough.
 */
export const removedorImgly: RemovedorDeFundo = {
  async remover(foto) {
    const mod = (await import(PACOTE_RECORTE)) as { removeBackground: RemoveBackground };
    const saida = await mod.removeBackground(new Blob([foto as unknown as BlobPart]), { output: { format: 'image/png' } });
    const png = Buffer.from(await saida.arrayBuffer());
    return { png, recortado: true };
  },
};

/**
 * Removedor de produção: tenta o recorte real e, em QUALQUER falha (pacote ausente,
 * modelo indisponível, imagem inválida), devolve o passthrough. Nunca lança — a
 * remoção de fundo é um plus, jamais um motivo para o post não sair. `real` é
 * injetável para o teste exercitar o fallback sem baixar modelo nenhum.
 */
export function criarRemovedor(real: RemovedorDeFundo = removedorImgly): RemovedorDeFundo {
  return {
    async remover(foto) {
      try {
        return await real.remover(foto);
      } catch {
        return removedorPassthrough.remover(foto);
      }
    },
  };
}
