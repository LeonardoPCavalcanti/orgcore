/**
 * Template visual da marca Conect2AI. Um laboratório de IA / veículos conectados:
 * fundo de tinta neutra com um único acento ciano, tipografia geométrica
 * (Space Grotesk) nos títulos e Inter no corpo. `capa` e `cta` são painéis de
 * tinta (marca em negativo); `conteudo` é claro, com filete e pill ciano.
 */
export const TEMPLATE_C2AI = 'c2ai';

export const cores = {
  tinta: '#101418',
  tintaFundo: '#0B0F14',
  ciano: '#1BB4D8',
  cianoProfundo: '#128DAA',
  claro: '#F4F6F8',
  branco: '#FFFFFF',
  neutro: '#54606E',
  neutroClaro: '#93A1AD',
} as const;

export const FONTE_TITULO = 'Space Grotesk';
export const FONTE_CORPO = 'Inter';
export const HANDLE = '@conect2ai';

/**
 * O "A" da logo C2AI: a letra em SI é um "A" vazado na cor da letra (uma moldura Λ
 * com duas pernas e o contra-fundo aberto), e dentro do contra-fundo repousa um
 * triângulo ciano invertido (▽) — exatamente como no original (o branco é só fundo;
 * o que importa é o A preto + o triângulo azul). Data URI de SÓ polígonos (sem texto,
 * que o resvg não rasteriza). Vai entre "C2" e "I" para formar o wordmark "C2AI".
 */
export function trianguloA(corLetra: string): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 44">'
    + `<polygon points="23,0 29,0 52,43 41,43 26,15 11,43 0,43" fill="${corLetra}"/>`
    + `<polygon points="18,31 34,31 26,44" fill="${cores.ciano}"/>`
    + '</svg>';
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export const LADO = 1080;

/**
 * Formato retrato do anúncio acadêmico (4:5). O carrossel é quadrado (`LADO`); o
 * anúncio é um card único mais alto, no formato de feed do Instagram.
 */
export const RETRATO = { largura: 1080, altura: 1350 } as const;
