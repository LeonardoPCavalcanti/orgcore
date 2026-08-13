/**
 * Costura de melhoria das fotos dos autores — mesmo espírito do removedor de fundo
 * (`silhueta.ts`): uma interface, duas implementações. O padrão em teste é o
 * `melhoradorPassthrough` (não toca na foto); o padrão em produção tenta um realce leve
 * e, se a capacidade não estiver disponível, cai no passthrough — o card sai igual, só
 * sem a foto tratada. É o primeiro passo do fluxo de imagem: roda ANTES do recorte, para
 * o fundo ser removido sobre uma foto já mais limpa/maior.
 *
 * `melhorada` diz se o realce de fato aconteceu (útil para métrica/auditoria futura).
 */
export interface MelhoradorDeFoto {
  melhorar(foto: Buffer): Promise<{ png: Buffer; melhorada: boolean }>;
}

/** Não mexe na foto: devolve os bytes originais, marcados como não-melhorados. */
export const melhoradorPassthrough: MelhoradorDeFoto = {
  async melhorar(foto) {
    return { png: foto, melhorada: false };
  },
};

// Nome do pacote numa VARIÁVEL, não num literal — de propósito, para o `import()` não
// ser resolvido em tempo de tipo e o projeto compilar SEM o pacote instalado. O realce
// real é uma capacidade opcional (binário nativo do `sharp`); quem quiser ligá-la instala
// `sharp` (`pnpm --filter @4med/api add sharp` + aprovar os build scripts). Sem ela,
// `criarMelhorador` cai no passthrough.
const PACOTE_SHARP = 'sharp';
// Abaixo deste lado (px), a foto é ampliada — headshots minúsculos ficam borrados na arte.
const LADO_MINIMO = 800;

type SharpLike = {
  rotate(): SharpLike;
  metadata(): Promise<{ width?: number; height?: number }>;
  resize(opcoes: { width: number; withoutEnlargement?: boolean }): SharpLike;
  normalize(): SharpLike;
  sharpen(): SharpLike;
  png(): SharpLike;
  toBuffer(): Promise<Buffer>;
};

/**
 * Realce real via `sharp` (roda no servidor, sem chave nem API paga). Import DINÂMICO e
 * por variável — carregado só quando uma foto é de fato processada. O tratamento é leve e
 * seguro: respeita a orientação EXIF, amplia fotos pequenas para um lado mínimo, normaliza
 * o contraste e aplica um sharpen suave. Se o pacote não estiver disponível, o import ou a
 * chamada lançam e `criarMelhorador` cai no passthrough.
 */
export const melhoradorSharp: MelhoradorDeFoto = {
  async melhorar(foto) {
    const mod = (await import(PACOTE_SHARP)) as { default?: (b: Buffer) => SharpLike } & ((b: Buffer) => SharpLike);
    const sharp = mod.default ?? mod;
    let img = sharp(foto).rotate();
    const meta = await img.metadata();
    if ((meta.width ?? 0) < LADO_MINIMO && (meta.height ?? 0) < LADO_MINIMO) {
      img = img.resize({ width: LADO_MINIMO, withoutEnlargement: false });
    }
    const png = await img.normalize().sharpen().png().toBuffer();
    return { png, melhorada: true };
  },
};

/**
 * Melhorador de produção: tenta o realce real e, em QUALQUER falha (pacote ausente,
 * imagem inválida), devolve o passthrough. Nunca lança — o realce é um plus, jamais um
 * motivo para o post não sair. `real` é injetável para o teste exercitar o fallback sem
 * depender de nenhum binário nativo.
 */
export function criarMelhorador(real: MelhoradorDeFoto = melhoradorSharp): MelhoradorDeFoto {
  return {
    async melhorar(foto) {
      try {
        return await real.melhorar(foto);
      } catch {
        return melhoradorPassthrough.melhorar(foto);
      }
    },
  };
}
