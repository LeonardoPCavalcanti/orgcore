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
// Fonte de DISPLAY (pôster): pesada e condensada, para as headlines grandes
// ("DEFESA DE MESTRADO", "ARTIGO APROVADO") e o dia da agenda — o peso das refs.
export const FONTE_DISPLAY = 'Anton';
export const HANDLE = '@conect2ai';

/**
 * O "A" da logo Conect2AI: a letra em SI é um "A" vazado na cor da letra (uma moldura Λ
 * com duas pernas e o contra-fundo aberto), e dentro do contra-fundo repousa um
 * triângulo ciano invertido (▽) — exatamente como no original (o branco é só fundo;
 * o que importa é o A preto + o triângulo azul). Data URI de SÓ polígonos (sem texto,
 * que o resvg não rasteriza). Vai entre "NECT2" e "I" para formar o wordmark "CONECT2AI".
 */
export function trianguloA(corLetra: string, acento: string = cores.ciano): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 44">'
    + `<polygon points="20,0 32,0 52,43 40,43 26,12 12,43 0,43" fill="${corLetra}"/>`
    + `<polygon points="18,32 34,32 26,44" fill="${acento}"/>`
    + '</svg>';
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * O "O" da logo Conect2AI: um VOLANTE ciano no lugar da letra — anel externo, barra
 * horizontal, coluna inferior e cubo central preenchido (as raias do volante). No
 * original o volante é inteiro ciano, então este glifo ignora a cor da letra. Data URI
 * de SVG (círculos + linhas). Vai entre "C" e "NECT2" para formar o wordmark completo.
 */
export function volanteO(cor: string = cores.ciano): string {
  const c = cor;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
    + `<circle cx="24" cy="24" r="20" fill="none" stroke="${c}" stroke-width="5"/>`
    + `<line x1="6" y1="24" x2="42" y2="24" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`
    + `<line x1="24" y1="24" x2="24" y2="43" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`
    + `<circle cx="24" cy="24" r="6.5" fill="${c}"/>`
    + '</svg>';
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export const LADO = 1080;

/**
 * Formato retrato do anúncio acadêmico (4:5). O carrossel é quadrado (`LADO`); o
 * anúncio é um card único mais alto, no formato de feed do Instagram.
 */
export const RETRATO = { largura: 1080, altura: 1350 } as const;
