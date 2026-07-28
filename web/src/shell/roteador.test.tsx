import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Roteador } from './roteador';

describe('Roteador', () => {
  it('desenha o organograma em /organograma', () => {
    render(<Roteador caminho="/organograma" />);
    expect(screen.getByRole('heading', { name: 'Organograma' })).toBeInTheDocument();
  });

  it('desenha a auditoria em /auditoria', () => {
    render(<Roteador caminho="/auditoria" />);
    expect(screen.getByRole('heading', { name: 'Auditoria' })).toBeInTheDocument();
  });

  it('desenha minha conta em /minha-conta', () => {
    render(<Roteador caminho="/minha-conta" />);
    expect(screen.getByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
  });

  it('desenha as sessoes em /sessoes', () => {
    render(<Roteador caminho="/sessoes" />);
    expect(screen.getByRole('heading', { name: 'Sessões ativas' })).toBeInTheDocument();
  });

  it('cai nas boas-vindas para caminho desconhecido', () => {
    render(<Roteador caminho="/rota-que-nao-existe" />);
    expect(screen.getByRole('heading', { name: /bem-vindo/i })).toBeInTheDocument();
  });
});
