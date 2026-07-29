import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { PaginaLogin } from './login';

vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, apiFetch: vi.fn() };
});

const apiFetchMock = vi.mocked(apiFetch);

function preencherEEntrar() {
  fireEvent.change(screen.getByLabelText('E-mail corporativo'), { target: { value: 'x@4med.com' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha muito segura' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('PaginaLogin', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('sem MFA: entra direto apos o login', async () => {
    apiFetchMock.mockResolvedValueOnce({ exigeMfa: false });
    const aoEntrar = vi.fn();
    render(<PaginaLogin aoEntrar={aoEntrar} />);

    preencherEEntrar();

    await waitFor(() => expect(aoEntrar).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Verificação em duas etapas')).not.toBeInTheDocument();
  });

  it('com MFA: mostra o desafio em vez de entrar', async () => {
    apiFetchMock.mockResolvedValueOnce({ exigeMfa: true });
    const aoEntrar = vi.fn();
    render(<PaginaLogin aoEntrar={aoEntrar} />);

    preencherEEntrar();

    expect(await screen.findByText('Verificação em duas etapas')).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toBeInTheDocument();
    expect(aoEntrar).not.toHaveBeenCalled();
  });
});
