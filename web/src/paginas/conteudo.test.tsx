import type { CarrosselResposta } from '@4med/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { PaginaConteudo } from './conteudo';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

const carrossel: CarrosselResposta = {
  id: 'c1', tema: 'Edge AI', estilo: 'editorial', criadoEm: '2026-08-12T10:00:00Z',
  legenda: 'Legenda de teste', hashtags: ['#conect2ai', '#edge'],
  slides: [
    { id: 's1', ordem: 0, tipo: 'capa', titulo: 'Edge AI', subtitulo: '', imagemUrl: '/conteudo/slides/s1/imagem' },
    { id: 's2', ordem: 1, tipo: 'conteudo', titulo: 'Ponto 1', subtitulo: 'x', imagemUrl: '/conteudo/slides/s2/imagem' },
    { id: 's3', ordem: 2, tipo: 'cta', titulo: 'Vamos', subtitulo: '', imagemUrl: '/conteudo/slides/s3/imagem' },
  ],
};

describe('PaginaConteudo', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('lista os carrosseis do autor ao montar', async () => {
    apiFetchMock.mockResolvedValueOnce([{ id: 'c1', tema: 'Telemetria', criadoEm: '2026-08-12T10:00:00Z' }]);
    render(<PaginaConteudo />);
    expect(await screen.findByText('Telemetria')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando nao ha carrosseis', async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    render(<PaginaConteudo />);
    expect(await screen.findByText(/Nenhum carrossel ainda/)).toBeInTheDocument();
  });

  it('gera um carrossel e mostra o preview com legenda e hashtags', async () => {
    apiFetchMock
      .mockResolvedValueOnce([]) // carga inicial
      .mockResolvedValueOnce(carrossel) // POST
      .mockResolvedValueOnce([{ id: 'c1', tema: 'Edge AI', criadoEm: '2026-08-12T10:00:00Z' }]); // recarga
    render(<PaginaConteudo />);
    await screen.findByText(/Nenhum carrossel ainda/);

    fireEvent.change(screen.getByLabelText('Tema do carrossel'), { target: { value: 'Edge AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar carrossel' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/conteudo/carrosseis', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tema: 'Edge AI', quantidadeSlides: 7, estilo: 'editorial' }),
      }));
    });

    expect(await screen.findByText('Legenda de teste')).toBeInTheDocument();
    expect(screen.getByText('#edge')).toBeInTheDocument();
    expect(screen.getByAltText('Slide 1: Edge AI')).toBeInTheDocument();
    expect(screen.getByText('Slide 1 de 3')).toBeInTheDocument();
  });

  it('avanca para o proximo slide no preview', async () => {
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce(carrossel).mockResolvedValueOnce([]);
    render(<PaginaConteudo />);
    await screen.findByText(/Nenhum carrossel ainda/);
    fireEvent.change(screen.getByLabelText('Tema do carrossel'), { target: { value: 'Edge AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar carrossel' }));

    await screen.findByText('Slide 1 de 3');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo slide' }));
    expect(screen.getByText('Slide 2 de 3')).toBeInTheDocument();
    expect(screen.getByAltText('Slide 2: Ponto 1')).toBeInTheDocument();
  });

  it('edita o texto de um slide e reflete no preview', async () => {
    const slideEditado = { id: 's1', ordem: 0, tipo: 'capa', titulo: 'Edge AI na borda', subtitulo: '', imagemUrl: '/conteudo/slides/s1/imagem' };
    apiFetchMock
      .mockResolvedValueOnce([]) // carga inicial
      .mockResolvedValueOnce(carrossel) // POST
      .mockResolvedValueOnce([]) // recarga
      .mockResolvedValueOnce(slideEditado); // PATCH
    render(<PaginaConteudo />);
    await screen.findByText(/Nenhum carrossel ainda/);
    fireEvent.change(screen.getByLabelText('Tema do carrossel'), { target: { value: 'Edge AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar carrossel' }));
    await screen.findByText('Slide 1 de 3');

    fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Edge AI na borda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar slide' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/conteudo/slides/s1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ titulo: 'Edge AI na borda', subtitulo: '' }),
      }));
    });
    expect(await screen.findByAltText('Slide 1: Edge AI na borda')).toBeInTheDocument();
  });

  it('refaz um slide com IA (com ângulo) e reflete no preview', async () => {
    const slideRefeito = { id: 's1', ordem: 0, tipo: 'capa', titulo: 'Capa refeita', subtitulo: 'nova', imagemUrl: '/conteudo/slides/s1/imagem' };
    apiFetchMock
      .mockResolvedValueOnce([]) // carga inicial
      .mockResolvedValueOnce(carrossel) // POST gerar
      .mockResolvedValueOnce([]) // recarga
      .mockResolvedValueOnce(slideRefeito); // POST regenerar
    render(<PaginaConteudo />);
    await screen.findByText(/Nenhum carrossel ainda/);
    fireEvent.change(screen.getByLabelText('Tema do carrossel'), { target: { value: 'Edge AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar carrossel' }));
    await screen.findByText('Slide 1 de 3');

    fireEvent.change(screen.getByPlaceholderText(/Ângulo para a IA/), { target: { value: 'mais direto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refazer com IA' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/conteudo/slides/s1/regenerar', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ instrucao: 'mais direto' }),
      }));
    });
    expect(await screen.findByAltText('Slide 1: Capa refeita')).toBeInTheDocument();
  });

  it('remove a foto de um slide (PATCH foto com dataUri null)', async () => {
    const semFoto = { id: 's1', ordem: 0, tipo: 'capa', titulo: 'Edge AI', subtitulo: '', imagemUrl: '/conteudo/slides/s1/imagem' };
    apiFetchMock
      .mockResolvedValueOnce([]) // carga inicial
      .mockResolvedValueOnce(carrossel) // POST gerar
      .mockResolvedValueOnce([]) // recarga
      .mockResolvedValueOnce(semFoto); // PATCH foto
    render(<PaginaConteudo />);
    await screen.findByText(/Nenhum carrossel ainda/);
    fireEvent.change(screen.getByLabelText('Tema do carrossel'), { target: { value: 'Edge AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar carrossel' }));
    await screen.findByText('Slide 1 de 3');

    fireEvent.click(screen.getByRole('button', { name: 'Remover foto' }));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/conteudo/slides/s1/foto', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ dataUri: null, recortada: false }),
      }));
    });
  });

  it('copia a legenda com as hashtags', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce(carrossel).mockResolvedValueOnce([]);
    render(<PaginaConteudo />);
    await screen.findByText(/Nenhum carrossel ainda/);
    fireEvent.change(screen.getByLabelText('Tema do carrossel'), { target: { value: 'Edge AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar carrossel' }));
    await screen.findByText('Legenda de teste');

    fireEvent.click(screen.getByRole('button', { name: 'Copiar legenda' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Legenda de teste\n\n#conect2ai #edge');
    });
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });

  it('mostra alerta quando a geracao falha', async () => {
    const { ErroApi } = await vi.importActual<typeof import('../api')>('../api');
    apiFetchMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new ErroApi(503, 'geracao_indisponivel', 'A geração por IA está indisponível no momento.'));
    render(<PaginaConteudo />);
    await screen.findByText(/Nenhum carrossel ainda/);
    fireEvent.change(screen.getByLabelText('Tema do carrossel'), { target: { value: 'Edge AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar carrossel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('indisponível');
  });
});
