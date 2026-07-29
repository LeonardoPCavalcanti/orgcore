import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ErroApi } from '../api';
import { DesafioMfa } from './desafio-mfa';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

describe('DesafioMfa', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('confirma o codigo via POST /auth/mfa e chama aoConfirmar', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true });
    const aoConfirmar = vi.fn();
    render(<DesafioMfa aoConfirmar={aoConfirmar} aoVoltar={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/auth/mfa', {
        method: 'POST', body: JSON.stringify({ codigo: '123456' }),
      });
    });
    expect(aoConfirmar).toHaveBeenCalledTimes(1);
  });

  it('mostra a mensagem do servidor no erro de orcamento e nao entra', async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ErroApi(429, 'muitas_tentativas', 'Muitas tentativas. A sessão foi encerrada; entre novamente.'),
    );
    const aoConfirmar = vi.fn();
    render(<DesafioMfa aoConfirmar={aoConfirmar} aoVoltar={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A sessão foi encerrada');
    expect(aoConfirmar).not.toHaveBeenCalled();
  });

  it('o botao voltar chama aoVoltar', () => {
    const aoVoltar = vi.fn();
    render(<DesafioMfa aoConfirmar={vi.fn()} aoVoltar={aoVoltar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }));
    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });
});
