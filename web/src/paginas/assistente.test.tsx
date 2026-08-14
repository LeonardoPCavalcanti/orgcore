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
      .mockResolvedValueOnce({ mensagem: { id: 'm2', papel: 'assistant', conteudo: 'Paris.', imagens: [], documentos: [], provedor: 'groq', criadoEm: 'x' } }); // POST mensagens
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

  it('anexa imagem e envia no corpo da mensagem', async () => {
    apiFetchMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'c1', titulo: 'Nova conversa', atualizadoEm: 'x' })
      .mockResolvedValueOnce({ mensagem: { id: 'm2', papel: 'assistant', conteudo: 'ok', imagens: [], documentos: [], provedor: 'groq', criadoEm: 'x' } });
    render(<PaginaAssistente />);
    await screen.findByText(/Olá, Leonardo/);

    const arquivo = new File(['x'], 'foto.png', { type: 'image/png' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [arquivo] } });
    await screen.findByAltText('anexo');

    fireEvent.change(screen.getByPlaceholderText(/Peça/i), { target: { value: 'olha isso' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      const post = apiFetchMock.mock.calls.find(([u, o]) => String(u).endsWith('/mensagens') && (o as { method?: string } | undefined)?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse((post![1] as { body: string }).body).imagens).toHaveLength(1);
    });
  });

  it('com imagem anexada, seleciona o modelo de visão de primeira e mostra a dica', async () => {
    apiFetchMock.mockResolvedValueOnce([
      { id: 'groq', nome: 'Groq', modelo: 'm', percentual: 90, disponivel: true, atualizadoEm: null, visao: false },
      { id: 'gemini', nome: 'Gemini', modelo: 'm', percentual: 80, disponivel: true, atualizadoEm: null, visao: true },
    ]);
    render(<PaginaAssistente />);
    await screen.findByText(/Olá, Leonardo/);
    const sel = screen.getByLabelText('Modelo de IA') as HTMLSelectElement;
    expect(sel.value).toBe('groq');

    const arquivo = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [arquivo] } });
    await screen.findByAltText('anexo');

    expect(await screen.findByText(/lidas pelo Gemini/i)).toBeInTheDocument();
    await waitFor(() => expect(sel.value).toBe('gemini'));
  });

  it('anexa documento e envia nome + dataUri no corpo', async () => {
    apiFetchMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'c1', titulo: 'Nova conversa', atualizadoEm: 'x' })
      .mockResolvedValueOnce({ mensagem: { id: 'm2', papel: 'assistant', conteudo: 'ok', imagens: [], documentos: [], provedor: 'groq', criadoEm: 'x' } });
    render(<PaginaAssistente />);
    await screen.findByText(/Olá, Leonardo/);

    const doc = new File(['conteudo do relatorio'], 'relatorio.txt', { type: 'text/plain' });
    const inputs = document.querySelectorAll('input[type=file]');
    fireEvent.change(inputs[1]!, { target: { files: [doc] } });
    expect(await screen.findByText('relatorio.txt')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Peça/i), { target: { value: 'resuma' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      const post = apiFetchMock.mock.calls.find(([u, o]) => String(u).endsWith('/mensagens') && (o as { method?: string } | undefined)?.method === 'POST');
      expect(post).toBeTruthy();
      const docs = JSON.parse((post![1] as { body: string }).body).documentos as { nome: string; dataUri: string }[];
      expect(docs).toHaveLength(1);
      expect(docs[0]!.nome).toBe('relatorio.txt');
      expect(docs[0]!.dataUri).toMatch(/^data:/);
    });
  });
});
