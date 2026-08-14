import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { PaginaAssistente } from './assistente';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});
vi.mock('../shell/sessao', () => ({
  useSessao: () => ({ eu: { nome: 'Leonardo Cavalcanti', email: 'a@b.c', menu: [] }, sair: vi.fn() }),
}));

const apiFetchMock = vi.mocked(apiFetch);

describe('PaginaAssistente', () => {
  beforeEach(() => { apiFetchMock.mockReset(); apiFetchMock.mockResolvedValue([]); });

  it('mostra a saudacao com o primeiro nome', async () => {
    render(<PaginaAssistente />);
    expect(await screen.findByText(/Olá, Leonardo/)).toBeInTheDocument();
  });

  it('envia a mensagem: cria conversa, posta e mostra a resposta', async () => {
    apiFetchMock
      .mockResolvedValueOnce([]) // GET /assistente/provedores (mount)
      .mockResolvedValueOnce({ id: 'c1', titulo: 'Nova conversa', atualizadoEm: 'x' }) // POST conversas
      .mockResolvedValueOnce({ mensagem: { id: 'm2', papel: 'assistant', conteudo: 'Paris.', imagens: [], provedor: 'groq', criadoEm: 'x' } }); // POST mensagens
    render(<PaginaAssistente />);
    await screen.findByText(/Olá, Leonardo/);

    fireEvent.change(screen.getByPlaceholderText(/Peça/i), { target: { value: 'Capital da França?' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    expect(await screen.findByText('Paris.')).toBeInTheDocument();
    expect(screen.getByText('Capital da França?')).toBeInTheDocument();
    await waitFor(() => {
      const post = apiFetchMock.mock.calls.find(([u, o]) => String(u).endsWith('/mensagens') && (o as { method?: string } | undefined)?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as { body: string }).body).conteudo).toBe('Capital da França?');
    });
  });
});
