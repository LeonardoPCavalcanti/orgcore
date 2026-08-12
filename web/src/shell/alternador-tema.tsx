import { useEffect, useState } from 'react';

type Tema = 'escuro' | 'claro';

/** O escuro é o padrão: é o modo em que a identidade da Conect2AI funciona. */
export function AlternadorTema() {
  const [tema, setTema] = useState<Tema>(
    () => (localStorage.getItem('tema') as Tema | null) ?? 'escuro',
  );

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem('tema', tema);
  }, [tema]);

  const escuro = tema === 'escuro';

  return (
    <button
      type="button"
      className="botao botao--fantasma"
      aria-label={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
      onClick={() => setTema(escuro ? 'claro' : 'escuro')}
    >
      {escuro ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
