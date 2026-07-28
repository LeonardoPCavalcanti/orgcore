import type { RespostaEu } from '@4med/contracts';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../api';

type Sessao = { eu: RespostaEu | null; carregando: boolean; sair: () => Promise<void> };

const Contexto = createContext<Sessao>({ eu: null, carregando: true, sair: async () => {} });

export const useSessao = (): Sessao => useContext(Contexto);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [eu, setEu] = useState<RespostaEu | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    apiFetch<RespostaEu>('/auth/eu')
      .then(setEu)
      .catch(() => setEu(null))
      .finally(() => setCarregando(false));
  }, []);

  async function sair() {
    await apiFetch('/auth/sair', { method: 'POST' }).catch(() => {});
    setEu(null);
  }

  return <Contexto.Provider value={{ eu, carregando, sair }}>{children}</Contexto.Provider>;
}
