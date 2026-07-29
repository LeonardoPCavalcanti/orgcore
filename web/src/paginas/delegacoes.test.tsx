import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { PaginaDelegacoes, type Delegacao } from './delegacoes';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

const concedida: Delegacao = {
  id: 'd1', inicio: '2026-07-01', fim: '2026-07-10', motivo: 'ferias',
  criadaEm: '2026-06-30T00:00:00Z', revogadaEm: null,
  deUsuarioId: 'u1', deUsuarioNome: 'Dario Alves',
  paraUsuarioId: 'u2', paraUsuarioNome: 'Ana Ribeiro',
  papel: 'concedida',
};

describe('PaginaDelegacoes', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('lista as delegacoes com nome, periodo e botao de revogar', async () => {
    apiFetchMock.mockResolvedValueOnce([concedida]);
    render(<PaginaDelegacoes />);

    expect(await screen.findByText('Ana Ribeiro')).toBeInTheDocument();
    expect(screen.getByText('ferias')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01 → 2026-07-10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revogar' })).toBeInTheDocument();
  });

  it('nao oferece revogar para delegacao recebida', async () => {
    apiFetchMock.mockResolvedValueOnce([
      { ...concedida, papel: 'recebida' },
    ]);
    render(<PaginaDelegacoes />);

    expect(await screen.findByText('Dario Alves')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revogar' })).not.toBeInTheDocument();
  });

  it('mostra o estado vazio quando nao ha delegacoes', async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    render(<PaginaDelegacoes />);

    expect(await screen.findByText('Nenhuma delegação registrada.')).toBeInTheDocument();
  });

  it('mostra alerta quando a carga falha', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('falhou'));
    render(<PaginaDelegacoes />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
  });

  it('envia POST /delegacoes com os dados do formulario e recarrega', async () => {
    apiFetchMock
      .mockResolvedValueOnce([]) // carga inicial
      .mockResolvedValueOnce({ id: 'novo' }) // POST
      .mockResolvedValueOnce([concedida]); // recarga apos criar
    render(<PaginaDelegacoes />);
    await screen.findByText('Nenhuma delegação registrada.');

    fireEvent.change(screen.getByLabelText('ID do colaborador'), { target: { value: 'u2' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-07-10' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'ferias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delegar escopo' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/delegacoes', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ paraUsuarioId: 'u2', inicio: '2026-07-01', fim: '2026-07-10', motivo: 'ferias' }),
      }));
    });
    expect(await screen.findByText('Ana Ribeiro')).toBeInTheDocument();
  });

  it('revoga via DELETE e recarrega a lista', async () => {
    apiFetchMock
      .mockResolvedValueOnce([concedida]) // carga inicial
      .mockResolvedValueOnce({ ok: true }) // DELETE
      .mockResolvedValueOnce([]); // recarga
    render(<PaginaDelegacoes />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revogar' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/delegacoes/d1', { method: 'DELETE' });
    });
    expect(await screen.findByText('Nenhuma delegação registrada.')).toBeInTheDocument();
  });
});
