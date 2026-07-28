import { useEffect, useState } from 'react';

type Tema = 'escuro' | 'claro';

/** O escuro é o padrão: é o modo em que a identidade da 4med funciona. */
export function AlternadorTema() {
  const [tema, setTema] = useState<Tema>(
    () => (localStorage.getItem('tema') as Tema | null) ?? 'escuro',
  );

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem('tema', tema);
  }, [tema]);

  return (
    <button
      type="button"
      aria-label={tema === 'escuro' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      onClick={() => setTema(tema === 'escuro' ? 'claro' : 'escuro')}
    >
      {tema === 'escuro' ? 'Claro' : 'Escuro'}
    </button>
  );
}
