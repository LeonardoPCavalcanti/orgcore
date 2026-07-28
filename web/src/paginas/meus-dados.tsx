import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export function PaginaMeusDados() {
  const [dados, setDados] = useState<unknown>(null);

  useEffect(() => {
    apiFetch('/auth/meus-dados').then(setDados).catch(() => setDados(null));
  }, []);

  function baixar() {
    const arquivo = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meus-dados-4med.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h1>Minha conta</h1>
      <p style={{ color: 'var(--texto-fraco)' }}>
        Estes são os dados que a plataforma guarda sobre você.
      </p>
      <pre style={{
        background: 'var(--superficie)', padding: 16,
        borderRadius: 'var(--raio)', overflowX: 'auto',
      }}>
        {JSON.stringify(dados, null, 2)}
      </pre>
      <button className="botao-primario" type="button" onClick={baixar} disabled={!dados}>
        Baixar meus dados
      </button>
      <p style={{ marginTop: 24 }}>
        <a href="/sessoes" style={{ color: 'var(--texto-fraco)' }}>Sessões ativas neste dispositivo e em outros</a>
      </p>
    </section>
  );
}
