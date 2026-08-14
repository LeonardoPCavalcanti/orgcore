import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { ConversasRecentes } from './conversas';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

describe('ConversasRecentes', () => {
  beforeEach(() => { apiFetchMock.mockReset(); apiFetchMock.mockResolvedValue([]); });

  it('Nova conversa aponta para / e lista conversas como links', async () => {
    apiFetchMock.mockResolvedValueOnce([
      { id: 'c1', titulo: 'Primeira', atualizadoEm: 'x' },
      { id: 'c2', titulo: 'Segunda', atualizadoEm: 'y' },
    ]);
    render(<ConversasRecentes />);
    expect(screen.getByRole('link', { name: /nova conversa/i })).toHaveAttribute('href', '/');
    const link = await screen.findByRole('link', { name: 'Primeira' });
    expect(link).toHaveAttribute('href', '/assistente?c=c1');
    expect(screen.getByRole('link', { name: 'Segunda' })).toBeInTheDocument();
  });

  it('apaga uma conversa e remove da lista', async () => {
    apiFetchMock.mockResolvedValueOnce([{ id: 'c1', titulo: 'Primeira', atualizadoEm: 'x' }]);
    render(<ConversasRecentes />);
    await screen.findByText('Primeira');
    apiFetchMock.mockResolvedValueOnce(undefined); // DELETE
    fireEvent.click(screen.getByRole('button', { name: /apagar Primeira/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/assistente/conversas/c1', expect.objectContaining({ method: 'DELETE' })));
    await waitFor(() => expect(screen.queryByText('Primeira')).not.toBeInTheDocument());
  });
});
