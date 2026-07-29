import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../api';
import { AtivarMfa } from './ativar-mfa';

type Vinculo = { unidade: string; cargo: string; inicio: string; fim: string | null; principal: boolean };
type MeusDados = {
  usuario?: { nome: string; email: string; status: string; mfaAtivo: boolean; criadoEm: string };
  vinculos?: Vinculo[];
  geradoEm?: string;
};

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '9px 0', borderTop: '1px solid var(--borda-suave)' }}>
      <span className="texto-fraco" style={{ fontSize: 13 }}>{rotulo}</span>
      <span>{children}</span>
    </div>
  );
}

export function PaginaMeusDados() {
  const [dados, setDados] = useState<MeusDados | null>(null);

  const carregar = useCallback(() => {
    apiFetch<MeusDados>('/auth/meus-dados').then(setDados).catch(() => setDados(null));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function baixar() {
    const arquivo = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meus-dados-4med.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  const u = dados?.usuario;

  return (
    <section>
      <div className="pagina-cabecalho">
        <h1>Minha conta</h1>
        <p className="texto-fraco">Estes são os dados que a plataforma guarda sobre você (LGPD, art. 18).</p>
      </div>

      <div className="card">
        <div className="card-corpo">
          {u ? (
            <>
              <div style={{ marginTop: -9 }}>
                <Linha rotulo="Nome">{u.nome}</Linha>
                <Linha rotulo="E-mail"><span className="mono">{u.email}</span></Linha>
                <Linha rotulo="Situação"><span className="selo selo--marca">{u.status}</span></Linha>
                <Linha rotulo="Verificação 2 fatores">
                  <span className={u.mfaAtivo ? 'selo selo--marca' : 'selo'}>{u.mfaAtivo ? 'Ativa' : 'Inativa'}</span>
                </Linha>
                <Linha rotulo="Desde">{new Date(u.criadoEm).toLocaleDateString('pt-BR')}</Linha>
              </div>

              {dados?.vinculos && dados.vinculos.length > 0 && (
                <div style={{ marginTop: 22 }}>
                  <div className="rotulo-campo" style={{ marginBottom: 8 }}>Vínculos</div>
                  <div className="pilha" style={{ gap: 8 }}>
                    {dados.vinculos.map((v, i) => (
                      <div key={i} className="entre" style={{ background: 'var(--fundo-2)', border: '1px solid var(--borda)', borderRadius: 'var(--r-md)', padding: '10px 13px' }}>
                        <span><strong>{v.cargo}</strong> <span className="texto-fraco">em {v.unidade}</span></span>
                        {v.principal && <span className="selo selo--apoio">principal</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="vazio">Carregando seus dados…</div>
          )}
        </div>
      </div>

      {u && (
        <div style={{ marginTop: 18 }}>
          <AtivarMfa mfaAtivo={u.mfaAtivo} aoAtivar={carregar} />
        </div>
      )}

      <div className="linha" style={{ marginTop: 18, gap: 12 }}>
        <button className="botao botao--primario" type="button" onClick={baixar} disabled={!dados}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
          </svg>
          Baixar meus dados
        </button>
        <a className="botao botao--fantasma" href="/sessoes">Sessões ativas</a>
      </div>
    </section>
  );
}
