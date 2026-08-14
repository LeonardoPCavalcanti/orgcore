import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { PaginaConvidar } from './convidar';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

const unidades = [{ id: 1, nome: 'Marketing' }, { id: 2, nome: 'Comercial' }];
const cargos = [
  { id: 'c1', nome: 'Aluno' },
  { id: 'c2', nome: 'Secretaria' },
];

describe('PaginaConvidar', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('popula os selects de unidade e cargo com dados reais', async () => {
    apiFetchMock
      .mockResolvedValueOnce(unidades)
      .mockResolvedValueOnce(cargos);
    render(<PaginaConvidar />);

    expect(await screen.findByRole('option', { name: 'Marketing' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Secretaria' })).toBeInTheDocument();
  });

  it('mostra alerta quando a carga dos selects falha', async () => {
    // As duas cargas (organograma + cargos) correm num Promise.all; ambas falham.
    apiFetchMock
      .mockRejectedValueOnce(new Error('falhou'))
      .mockRejectedValueOnce(new Error('falhou'));
    render(<PaginaConvidar />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
  });

  it('envia POST /auth/convites e exibe o link de aceite gerado', async () => {
    apiFetchMock
      .mockResolvedValueOnce(unidades)
      .mockResolvedValueOnce(cargos)
      .mockResolvedValueOnce({ token: 'tok-123' });
    render(<PaginaConvidar />);
    await screen.findByRole('option', { name: 'Marketing' });

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'nova@conect2ai.com' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nova Pessoa' } });
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/auth/convites', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'nova@conect2ai.com', nome: 'Nova Pessoa', unidadeId: 1, cargoId: 'c1',
        }),
      }));
    });
    expect(await screen.findByText(/aceitar-convite\?token=tok-123/)).toBeInTheDocument();
  });
});
