import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PaginaLogin } from './paginas/login';
import { Layout } from './shell/layout';
import { Roteador } from './shell/roteador';
import { ProvedorSessao, useSessao } from './shell/sessao';
import './shell/tema.css';

function App() {
  const { eu, carregando } = useSessao();

  if (carregando) return <p style={{ padding: 24 }}>Carregando...</p>;
  if (!eu) return <PaginaLogin aoEntrar={() => window.location.reload()} />;

  return (
    <Layout>
      <Roteador />
    </Layout>
  );
}

const raiz = document.getElementById('raiz');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <ProvedorSessao>
        <App />
      </ProvedorSessao>
    </StrictMode>,
  );
}
