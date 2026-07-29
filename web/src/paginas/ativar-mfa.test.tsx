import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { AtivarMfa } from './ativar-mfa';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

// QR gerado de forma deterministica no teste — o objetivo aqui e o fluxo de
// cadastro, nao a codificacao do QR (coberta pela propria biblioteca).
vi.mock('qrcode', () => ({ toString: vi.fn(async () => '<svg data-teste="qr" />') }));

const apiFetchMock = vi.mocked(apiFetch);

describe('AtivarMfa', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('com MFA ativo, mostra o estado e nao oferece botao de ativar', () => {
    render(<AtivarMfa mfaAtivo aoAtivar={vi.fn()} />);
    expect(screen.getByText(/Sua conta está protegida/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ativar verificação/ })).not.toBeInTheDocument();
  });

  it('fluxo inativo: preparar mostra QR e chave, ativar mostra os codigos de recuperacao', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ segredo: 'ABC123SEGREDO', otpauth: 'otpauth://totp/4med:x?secret=ABC123SEGREDO' })
      .mockResolvedValueOnce({ codigosRecuperacao: ['aaaa11112222', 'bbbb33334444'] });
    const aoAtivar = vi.fn();
    render(<AtivarMfa mfaAtivo={false} aoAtivar={aoAtivar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ativar verificação em duas etapas' }));

    // Etapa configurar: QR (img) e a chave em texto.
    expect(await screen.findByText('ABC123SEGREDO')).toBeInTheDocument();
    expect(screen.getByAltText(/QR code/i)).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/auth/mfa/preparar', { method: 'POST' });

    fireEvent.change(screen.getByLabelText('Código do aplicativo'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ativar' }));

    // Etapa concluido: aviso e os codigos, mostrados uma unica vez.
    expect(await screen.findByText('aaaa11112222')).toBeInTheDocument();
    expect(screen.getByText('bbbb33334444')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Guarde estes códigos');
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/auth/mfa/ativar', {
        method: 'POST', body: JSON.stringify({ codigo: '123456' }),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(aoAtivar).toHaveBeenCalledTimes(1);
  });
});
