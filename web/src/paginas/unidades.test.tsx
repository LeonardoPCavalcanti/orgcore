import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { PaginaUnidades } from './unidades';
import type { Unidade } from './organograma';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

const lista: Unidade[] = [
  { id: 1, paiId: null, nome: 'Conect2AI', tipo: 'empresa', caminho: '/1/', ativo: true },
  { id: 2, paiId: 1, nome: 'Marketing', tipo: 'diretoria', caminho: '/1/2/', ativo: true },
];

describe('PaginaUnidades', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('lista as unidades existentes em arvore', async () => {
    apiFetchMock.mockResolvedValueOnce(lista);
    render(<PaginaUnidades />);

    // "Marketing" tambem aparece nas <option> dos selects; a arvore o rende num
    // <span class="arvore-nome">, entao miramos so nele para nao dar match duplo.
    expect(await screen.findByText('Marketing', { selector: '.arvore-nome' })).toBeInTheDocument();
  });

  it('mostra o estado vazio quando nao ha unidades', async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    render(<PaginaUnidades />);

    expect(await screen.findByText('Nenhuma unidade no seu escopo.')).toBeInTheDocument();
  });

  it('mostra alerta quando a carga falha', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('falhou'));
    render(<PaginaUnidades />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
  });

  it('cria uma unidade via POST /organograma e recarrega', async () => {
    apiFetchMock
      .mockResolvedValueOnce(lista) // carga inicial
      .mockResolvedValueOnce({ id: 3 }) // POST
      .mockResolvedValueOnce([...lista, {
        id: 3, paiId: 1, nome: 'Vendas', tipo: 'equipe', caminho: '/1/3/', ativo: true,
      }]); // recarga
    render(<PaginaUnidades />);
    await screen.findByText('Marketing', { selector: '.arvore-nome' });

    fireEvent.change(screen.getByLabelText('Nome da unidade'), { target: { value: 'Vendas' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'equipe' } });
    fireEvent.change(screen.getByLabelText('Unidade superior'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar unidade' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/organograma', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ nome: 'Vendas', tipo: 'equipe', paiId: 1 }),
      }));
    });
    expect(await screen.findByText('Vendas', { selector: '.arvore-nome' })).toBeInTheDocument();
  });

  it('move uma unidade via PATCH /organograma/:id e recarrega', async () => {
    apiFetchMock
      .mockResolvedValueOnce(lista) // carga inicial
      .mockResolvedValueOnce({ id: 2 }) // PATCH
      .mockResolvedValueOnce(lista); // recarga
    render(<PaginaUnidades />);
    await screen.findByText('Marketing', { selector: '.arvore-nome' });

    fireEvent.change(screen.getByLabelText('Unidade a mover'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Novo superior'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mover unidade' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/organograma/2', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ paiId: null }),
      }));
    });
  });
});
