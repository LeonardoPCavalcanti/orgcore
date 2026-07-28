import { useState, type FormEvent } from 'react';
import { apiFetch, ErroApi } from '../api';

export function PaginaLogin({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      aoEntrar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível entrar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} style={{ maxWidth: 360, margin: '15vh auto', display: 'grid', gap: 12 }}>
      <h1 className="marca">
        <span style={{ color: 'var(--marca)' }}>4</span>med
      </h1>
      <label htmlFor="email">E-mail corporativo</label>
      <input id="email" type="email" value={email} required
        onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="senha">Senha</label>
      <input id="senha" type="password" value={senha} required
        onChange={(e) => setSenha(e.target.value)} />
      {erro && <p role="alert" style={{ color: 'var(--perigo)' }}>{erro}</p>}
      <button className="botao-primario" type="submit" disabled={enviando}>
        {enviando ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
