import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Navegacao } from './navegacao';

const menu = [
  { rotulo: 'Organograma', caminho: '/organograma', permissao: 'core.unidade.ler' },
  { rotulo: 'Auditoria', caminho: '/auditoria', permissao: 'core.auditoria.ler' },
];

describe('Navegacao', () => {
  it('mostra os itens recebidos do servidor', () => {
    render(<Navegacao itens={menu} caminhoAtual="/organograma" />);
    expect(screen.getByText('Organograma')).toBeInTheDocument();
    expect(screen.getByText('Auditoria')).toBeInTheDocument();
  });

  it('nao inventa item que o servidor nao mandou', () => {
    render(<Navegacao itens={[menu[0]!]} caminhoAtual="/organograma" />);
    expect(screen.queryByText('Auditoria')).not.toBeInTheDocument();
  });

  it('marca o item atual com aria-current', () => {
    render(<Navegacao itens={menu} caminhoAtual="/auditoria" />);
    expect(screen.getByText('Auditoria').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('nao renderiza nada quando o menu vem vazio', () => {
    const { container } = render(<Navegacao itens={[]} caminhoAtual="/" />);
    expect(container.querySelector('nav')).toBeNull();
  });
});
