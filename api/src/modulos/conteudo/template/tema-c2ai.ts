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

export const LADO = 1080;

/**
 * Formato retrato do anúncio acadêmico (4:5). O carrossel é quadrado (`LADO`); o
 * anúncio é um card único mais alto, no formato de feed do Instagram.
 */
export const RETRATO = { largura: 1080, altura: 1350 } as const;
