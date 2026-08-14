import type { AnuncioResposta } from '@4med/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { PaginaAnuncio } from './anuncio';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

// Padronização de imagem é WASM/canvas — fora do jsdom. O mock devolve a foto como
// recortada e o logo inalterado, sem tocar em nada nativo.
vi.mock('../imagem/padronizar', () => ({
  removerFundo: vi.fn(async (f: string) => ({ dataUri: f, recortado: true })),
  branquearLogo: vi.fn(async (f: string) => f),
}));

const apiFetchMock = vi.mocked(apiFetch);

const anuncio: AnuncioResposta = {
  id: 'a1', tipo: 'artigo_aprovado', titulo: 'Modelos Generativos', criadoEm: '2026-08-12T10:00:00Z',
  headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
  veiculo: null, dataRotulo: null, localRotulo: null,
  imagemUrl: '/conteudo/anuncios/a1/imagem',
  legenda: 'Novo artigo aprovado. Modelos Generativos.\n\n#Conect2AI',
  modelo: 'fake',
  provedorSolicitado: null,
  pessoas: [{ id: 'p1', ordem: 0, nome: 'Júlia', papel: 'Autora', fotoUrl: null }],
  grupos: [],
};

describe('PaginaAnuncio', () => {
  // Default resolvido para chamadas além da fila (ex.: GET /conteudo/ia/provedores no
  // mount) — sem isso, o mock devolve undefined e o `.then` quebra.
  beforeEach(() => { apiFetchMock.mockReset(); apiFetchMock.mockResolvedValue([]); });

  it('lista os anuncios do autor ao montar', async () => {
    apiFetchMock.mockResolvedValueOnce([{ id: 'a1', tipo: 'artigo_aprovado', titulo: 'Modelos Generativos', criadoEm: '2026-08-12T10:00:00Z' }]);
    render(<PaginaAnuncio />);
    expect(await screen.findByText('Modelos Generativos')).toBeInTheDocument();
  });

  it('lista provedores com % e envia o escolhido; mostra o modelo usado', async () => {
    apiFetchMock
      .mockResolvedValueOnce([]) // carga inicial de anuncios
      .mockResolvedValueOnce([ // GET provedores
        { id: 'groq', nome: 'Groq', modelo: 'llama', percentual: 80, disponivel: true, atualizadoEm: null },
        { id: 'gemini', nome: 'Gemini', modelo: 'flash', percentual: 40, disponivel: true, atualizadoEm: null },
      ])
      .mockResolvedValueOnce({ ...anuncio, modelo: 'gemini', provedorSolicitado: 'groq' }) // POST
      .mockResolvedValueOnce([]); // recarga
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);
    expect(await screen.findByText('Groq — 80%')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Modelo de IA'), { target: { value: 'groq' } });
    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Modelos Generativos' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Júlia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    await waitFor(() => {
      const chamada = apiFetchMock.mock.calls.find(([url, opts]) => url === '/conteudo/anuncios' && (opts as { method?: string } | undefined)?.method === 'POST');
      expect(JSON.parse((chamada![1] as { body: string }).body).provedor).toBe('groq');
    });
    expect(await screen.findByText(/gerado por gemini/i)).toBeInTheDocument();
  });

  it('oferece exportar corpus e datasets de treino (SFT/KTO) quando ha anuncios', async () => {
    apiFetchMock.mockResolvedValueOnce([{ id: 'a1', tipo: 'artigo_aprovado', titulo: 'Modelos Generativos', criadoEm: '2026-08-12T10:00:00Z' }]);
    render(<PaginaAnuncio />);
    expect(await screen.findByRole('button', { name: /Corpus completo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dataset SFT/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dataset KTO/ })).toBeInTheDocument();
  });

  it('mostra o estado vazio quando nao ha anuncios', async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    expect(await screen.findByText(/Nenhum anúncio ainda/)).toBeInTheDocument();
  });

  it('mostra os campos de data/local apenas para defesa', async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    expect(screen.queryByLabelText('Data (opcional)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo de anúncio'), { target: { value: 'defesa' } });
    expect(screen.getByLabelText('Data (opcional)')).toBeInTheDocument();
  });

  it('adiciona e remove pessoas do formulario', async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    expect(screen.getByText('Pessoas (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pessoa' }));
    expect(screen.getByText('Pessoas (2)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover pessoa 2' }));
    expect(screen.getByText('Pessoas (1)')).toBeInTheDocument();
  });

  it('gera um anuncio e mostra o preview com a headline', async () => {
    apiFetchMock
      .mockResolvedValueOnce([]) // carga inicial
      .mockResolvedValueOnce([]) // GET provedores (mount)
      .mockResolvedValueOnce(anuncio) // POST
      .mockResolvedValueOnce([{ id: 'a1', tipo: 'artigo_aprovado', titulo: 'Modelos Generativos', criadoEm: '2026-08-12T10:00:00Z' }]); // recarga
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Modelos Generativos' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Júlia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/conteudo/anuncios', expect.objectContaining({ method: 'POST' }));
    });
    expect(await screen.findByAltText('Anúncio: Modelos Generativos')).toBeInTheDocument();
    expect(screen.getByText('ARTIGO APROVADO')).toBeInTheDocument();
  });

  it('envia o corpo com tipo, titulo e pessoas validas', async () => {
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(anuncio).mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Modelos Generativos' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Júlia' } });
    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'Autora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    await waitFor(() => {
      const chamada = apiFetchMock.mock.calls.find(
        ([url, opts]) => url === '/conteudo/anuncios' && (opts as { method?: string } | undefined)?.method === 'POST',
      );
      expect(chamada).toBeTruthy();
      const corpo = JSON.parse((chamada![1] as { body: string }).body);
      expect(corpo).toMatchObject({
        tipo: 'artigo_aprovado', titulo: 'Modelos Generativos',
        pessoas: [{ nome: 'Júlia', papel: 'Autora' }],
      });
    });
  });

  it('monta a variante tabela e envia os grupos', async () => {
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(anuncio).mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Tipo de anúncio'), { target: { value: 'aprovados' } });
    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Pós-Graduação 2026.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar tabela' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'DOUTORADO' } });
    fireEvent.change(screen.getByLabelText('Orientando'), { target: { value: 'Gabriel Masson' } });
    fireEvent.change(screen.getByLabelText('Orientador'), { target: { value: 'Patrícia Endo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    await waitFor(() => {
      const chamada = apiFetchMock.mock.calls.find(
        ([url, opts]) => url === '/conteudo/anuncios' && (opts as { method?: string } | undefined)?.method === 'POST',
      );
      expect(chamada).toBeTruthy();
      const corpo = JSON.parse((chamada![1] as { body: string }).body);
      expect(corpo.grupos).toEqual([{
        titulo: 'DOUTORADO', colunas: ['Orientando', 'Orientador'],
        linhas: [['Gabriel Masson', 'Patrícia Endo']],
      }]);
    });
  });

  it('mostra a legenda gerada e copia para a area de transferencia', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(anuncio).mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Modelos Generativos' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Júlia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    expect(await screen.findByText('Legenda para o Instagram')).toBeInTheDocument();
    expect(screen.getByText(/Novo artigo aprovado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar legenda' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(anuncio.legenda));
    expect(await screen.findByRole('button', { name: 'Legenda copiada' })).toBeInTheDocument();
  });

  it('avalia o resultado (Aprovar) e registra o feedback', async () => {
    apiFetchMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]) // GET provedores (mount)
      .mockResolvedValueOnce(anuncio)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'av1', anuncioId: 'a1', avaliacao: 'aprovado', nota: null, comentario: null, criadoEm: 'x' });
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Modelos Generativos' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Júlia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/conteudo/anuncios/a1/feedback',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    expect(await screen.findByText(/Avaliação registrada: aprovado/)).toBeInTheDocument();
  });

  it('envia logosPosicao e marca fotoRecortada ao anexar a foto', async () => {
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(anuncio).mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Modelos Generativos' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Júlia' } });
    const arquivo = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Foto'), { target: { files: [arquivo] } });
    // Espera o recorte (mockado) terminar: o rótulo passa a marcar a foto.
    await screen.findByText('Foto ✓');

    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));
    await waitFor(() => {
      const chamada = apiFetchMock.mock.calls.find(
        ([url, opts]) => url === '/conteudo/anuncios' && (opts as { method?: string } | undefined)?.method === 'POST',
      );
      expect(chamada).toBeTruthy();
      const corpo = JSON.parse((chamada![1] as { body: string }).body);
      expect(corpo.logosPosicao).toBe('rodape');
      expect(corpo.pessoas[0].fotoRecortada).toBe(true);
    });
  });

  it('oferece o campo de logos parceiros (multiplos arquivos)', async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    expect(screen.getByText('Logos parceiros (opcional)')).toBeInTheDocument();
    const input = document.getElementById('logos') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('image/*');
  });

  it('na defesa, o nivel Doutorado vai como destaque', async () => {
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(anuncio).mockResolvedValueOnce([]);
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Tipo de anúncio'), { target: { value: 'defesa' } });
    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Defesa de Doutorado' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Gabriel' } });
    fireEvent.change(screen.getByLabelText('Nível'), { target: { value: 'DOUTORADO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    await waitFor(() => {
      const chamada = apiFetchMock.mock.calls.find(
        ([url, opts]) => url === '/conteudo/anuncios' && (opts as { method?: string } | undefined)?.method === 'POST',
      );
      expect(chamada).toBeTruthy();
      expect(JSON.parse((chamada![1] as { body: string }).body).destaque).toBe('DOUTORADO');
    });
  });

  it('mostra alerta quando a geracao falha', async () => {
    const { ErroApi } = await vi.importActual<typeof import('../api')>('../api');
    apiFetchMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]) // GET provedores (mount)
      .mockRejectedValueOnce(new ErroApi(503, 'geracao_indisponivel', 'A geração por IA está indisponível no momento.'));
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Título válido' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Júlia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('indisponível');
  });
});
