import { PaginaAuditoria } from '../paginas/auditoria';
import { PaginaMeusDados } from '../paginas/meus-dados';
import { PaginaOrganograma } from '../paginas/organograma';
import { PaginaSessoes } from '../paginas/sessoes';

function BoasVindas() {
  return (
    <section>
      <h1>Bem-vindo à intranet 4med</h1>
      <p style={{ color: 'var(--texto-fraco)' }}>
        Selecione um item no menu ao lado para começar.
      </p>
    </section>
  );
}

/**
 * Roteamento mínimo por pathname. Os itens do menu são âncoras de verdade: o
 * clique recarrega a página inteira, o servidor de estáticos devolve o mesmo
 * index.html (fallback de SPA) e este switch escolhe a tela pelo caminho atual.
 * O protótipo não precisa de histórico no cliente, então nada de biblioteca de
 * roteamento. Caminho desconhecido cai nas boas-vindas em vez de quebrar.
 */
export function Roteador({ caminho = window.location.pathname }: { caminho?: string }) {
  switch (caminho) {
    case '/organograma':
      return <PaginaOrganograma />;
    case '/auditoria':
      return <PaginaAuditoria />;
    case '/minha-conta':
      return <PaginaMeusDados />;
    case '/sessoes':
      return <PaginaSessoes />;
    default:
      return <BoasVindas />;
  }
}
