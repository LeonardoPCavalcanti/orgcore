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

// import() dinâmico com especificador LITERAL, para o Vite pré-empacotar o pacote e o
// navegador resolvê-lo — o WASM só carrega quando uma imagem é de fato processada. O
// teste substitui `_interno.carregarRemocao` e nunca baixa o modelo (hermético).
export const _interno = {
  async carregarRemocao(): Promise<(b: Blob) => Promise<Blob>> {
    const mod = await import('@imgly/background-removal');
    return mod.removeBackground;
  },
};

async function paraBlob(fonte: string): Promise<Blob> {
  return (await fetch(fonte)).blob();
}

function blobParaDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('falha ao ler blob'));
    leitor.readAsDataURL(blob);
  });
}

/** Remove o fundo via WASM. Em qualquer falha, devolve a fonte + recortado:false. */
export async function removerFundo(fonte: string): Promise<{ dataUri: string; recortado: boolean }> {
  try {
    const remove = await _interno.carregarRemocao();
    const semFundo = await remove(await paraBlob(fonte));
    return { dataUri: await blobParaDataUri(semFundo), recortado: true };
  } catch {
    return { dataUri: fonte, recortado: false };
  }
}

/** Remove o fundo e repinta a marca de branco (canvas), preservando o alfa. */
export async function branquearLogo(fonte: string): Promise<string> {
  try {
    const { dataUri, recortado } = await removerFundo(fonte);
    const base = recortado ? dataUri : fonte;
    const img = new Image();
    img.src = base;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return base;
    ctx.drawImage(img, 0, 0);
    const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
    pixelsParaBranco(dados.data);
    ctx.putImageData(dados, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return fonte;
  }
}
