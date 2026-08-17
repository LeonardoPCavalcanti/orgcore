import type { ReactNode } from 'react';
import type { ItemMenu } from '@4med/contracts';
import { comBase } from './base';

const svg = (filhos: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{filhos}</svg>
);

/** Ícone por caminho conhecido; um ponto neutro para o que não mapear. */
function icone(caminho: string): ReactNode {
  if (caminho.startsWith('/organograma')) {
    return svg(<><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-2h12v2" /></>);
  }
  if (caminho.startsWith('/auditoria')) {
    return svg(<><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>);
  }
  if (caminho.startsWith('/minha-conta') || caminho.startsWith('/sessoes')) {
    return svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>);
  }
  return svg(<circle cx="12" cy="12" r="3" />);
}

/**
 * O menu vem inteiro do servidor, derivado das permissões efetivas.
 * O front nunca decide o que mostrar — só desenha o que recebeu.
 */
export function Navegacao({ itens, caminhoAtual }: {
  itens: ItemMenu[];
  caminhoAtual: string;
}) {
  if (itens.length === 0) return null;

  return (
    <nav className="nav" aria-label="Navegação principal">
      {itens.map((item) => (
        <a
          key={item.caminho}
          href={comBase(item.caminho)}
          className="nav-item"
          aria-current={item.caminho === caminhoAtual ? 'page' : undefined}
        >
          {icone(item.caminho)}
          {item.rotulo}
        </a>
      ))}
    </nav>
  );
}
