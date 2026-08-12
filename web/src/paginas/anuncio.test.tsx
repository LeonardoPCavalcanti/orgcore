import type { AnuncioResposta } from '@4med/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { PaginaAnuncio } from './anuncio';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

const anuncio: AnuncioResposta = {
  id: 'a1', tipo: 'artigo_aprovado', titulo: 'Modelos Generativos', criadoEm: '2026-08-12T10:00:00Z',
  headline: { prefixo: 'ARTIGO', destaque: 'APROVADO' },
  veiculo: null, dataRotulo: null, localRotulo: null,
  imagemUrl: '/conteudo/anuncios/a1/imagem',
  pessoas: [{ id: 'p1', ordem: 0, nome: 'Júlia', papel: 'Autora', fotoUrl: null }],
};

describe('PaginaAnuncio', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('lista os anuncios do autor ao montar', async () => {
    apiFetchMock.mockResolvedValueOnce([{ id: 'a1', tipo: 'artigo_aprovado', titulo: 'Modelos Generativos', criadoEm: '2026-08-12T10:00:00Z' }]);
    render(<PaginaAnuncio />);
    expect(await screen.findByText('Modelos Generativos')).toBeInTheDocument();
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
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce(anuncio).mockResolvedValueOnce([]);
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

  it('mostra alerta quando a geracao falha', async () => {
    const { ErroApi } = await vi.importActual<typeof import('../api')>('../api');
    apiFetchMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new ErroApi(503, 'geracao_indisponivel', 'A geração por IA está indisponível no momento.'));
    render(<PaginaAnuncio />);
    await screen.findByText(/Nenhum anúncio ainda/);

    fireEvent.change(screen.getByLabelText('Título do trabalho'), { target: { value: 'Título válido' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Júlia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar anúncio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('indisponível');
  });
});
