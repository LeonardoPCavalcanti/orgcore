import { PaginaAnuncio } from '../paginas/anuncio';
import { PaginaAssistente } from '../paginas/assistente';
import { PaginaAuditoria } from '../paginas/auditoria';
import { PaginaConteudo } from '../paginas/conteudo';
import { PaginaConvidar } from '../paginas/convidar';
import { PaginaDelegacoes } from '../paginas/delegacoes';
import { PaginaMeusDados } from '../paginas/meus-dados';
import { PaginaOrganograma } from '../paginas/organograma';
import { PaginaSessoes } from '../paginas/sessoes';
import { PaginaUnidades } from '../paginas/unidades';
import { semBase } from './base';
/**
 * Roteamento mínimo por pathname. Os itens do menu são âncoras de verdade: o
 * clique recarrega a página inteira, o servidor de estáticos devolve o mesmo
 * index.html (fallback de SPA) e este switch escolhe a tela pelo caminho atual.
 * O protótipo não precisa de histórico no cliente, então nada de biblioteca de
 * roteamento. Caminho desconhecido cai nas boas-vindas em vez de quebrar.
 */
export function Roteador({ caminho = semBase() }: { caminho?: string }) {
  switch (caminho) {
    case '/organograma':
      return <PaginaOrganograma />;
    case '/unidades':
      return <PaginaUnidades />;
    case '/convidar':
      return <PaginaConvidar />;
    case '/auditoria':
      return <PaginaAuditoria />;
    case '/delegacoes':
      return <PaginaDelegacoes />;
    case '/conteudo':
      return <PaginaConteudo />;
    case '/anuncio':
      return <PaginaAnuncio />;
    case '/minha-conta':
      return <PaginaMeusDados />;
    case '/sessoes':
      return <PaginaSessoes />;
    case '/assistente':
      return <PaginaAssistente />;
    default:
      return <PaginaAssistente />;
  }
}
