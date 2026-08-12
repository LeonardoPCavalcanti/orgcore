import { PaginaAnuncio } from '../paginas/anuncio';
import { PaginaAuditoria } from '../paginas/auditoria';
import { PaginaConteudo } from '../paginas/conteudo';
import { PaginaConvidar } from '../paginas/convidar';
import { PaginaDelegacoes } from '../paginas/delegacoes';
import { PaginaMeusDados } from '../paginas/meus-dados';
import { PaginaOrganograma } from '../paginas/organograma';
import { PaginaSessoes } from '../paginas/sessoes';
import { PaginaUnidades } from '../paginas/unidades';
import { useSessao } from './sessao';

function BoasVindas() {
  const { eu } = useSessao();
  const primeiro = eu?.nome.split(' ')[0];
  return (
    <section>
      <div className="pagina-cabecalho">
        <h1>{primeiro ? `Bem-vindo, ${primeiro}` : 'Bem-vindo à intranet Conect2AI'}</h1>
        <p className="texto-fraco">Escolha por onde começar.</p>
      </div>
      {eu && eu.menu.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          {eu.menu.map((item) => (
            <a key={item.caminho} href={item.caminho} className="card atalho">
              <div className="card-corpo">
                <div style={{ fontWeight: 600 }}>{item.rotulo}</div>
                <div className="texto-fraco" style={{ fontSize: 13, marginTop: 4 }}>
                  Abrir {item.rotulo.toLowerCase()}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
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
    default:
      return <BoasVindas />;
  }
}
