import type { ReactNode } from 'react';
import { AlternadorTema } from './alternador-tema';
import { Logo } from './logo';
import { Navegacao } from './navegacao';
import { useSessao } from './sessao';

const iniciais = (nome: string) =>
  nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '4';

const primeiroNome = (nome: string) => nome.split(' ')[0] ?? nome;

export function Layout({ children }: { children: ReactNode }) {
  const { eu, sair } = useSessao();
  if (!eu) return <>{children}</>;

  return (
    <div className="app">
      <aside className="lateral">
        <div className="lateral-topo">
          <Logo size={28} />
        </div>
        <div className="lateral-rotulo">Navegação</div>
        <Navegacao itens={eu.menu} caminhoAtual={window.location.pathname} />
        <div className="lateral-rodape usuario">
          <div className="avatar" aria-hidden="true">{iniciais(eu.nome)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="usuario-nome">{eu.nome}</div>
            <div className="usuario-rotulo" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {eu.email}
            </div>
          </div>
        </div>
      </aside>

      <div className="conteudo">
        <header className="topo">
          <div className="texto-fraco">Olá, {primeiroNome(eu.nome)}</div>
          <div className="linha">
            <AlternadorTema />
            <button type="button" className="botao botao--fantasma" onClick={sair}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sair
            </button>
          </div>
        </header>
        <div className="pagina">{children}</div>
      </div>
    </div>
  );
}
