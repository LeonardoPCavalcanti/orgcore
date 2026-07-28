import type { ReactNode } from 'react';
import { Navegacao } from './navegacao';
import { useSessao } from './sessao';

export function Layout({ children }: { children: ReactNode }) {
  const { eu, sair } = useSessao();
  if (!eu) return <>{children}</>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: '100vh' }}>
      <aside style={{ background: 'var(--superficie)', borderRight: '1px solid var(--borda)' }}>
        <div className="marca" style={{ padding: 16, fontSize: 20 }}>
          <span style={{ color: 'var(--marca)' }}>4</span>med
        </div>
        <Navegacao itens={eu.menu} caminhoAtual={window.location.pathname} />
      </aside>
      <main style={{ padding: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ color: 'var(--texto-fraco)', fontSize: 13 }}>Conectado como</div>
            <div>{eu.nome}</div>
          </div>
          <button type="button" onClick={sair}>Sair</button>
        </header>
        {children}
      </main>
    </div>
  );
}
