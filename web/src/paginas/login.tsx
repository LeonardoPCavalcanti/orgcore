import { useState, type FormEvent } from 'react';
import { apiFetch, ErroApi } from '../api';
import { Logo } from '../shell/logo';
import { DesafioMfa } from './desafio-mfa';

export function PaginaLogin({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [desafioMfa, setDesafioMfa] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const { exigeMfa } = await apiFetch<{ exigeMfa: boolean }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, senha }),
      });
      // Login de conta com MFA ativo abre uma sessao PENDENTE no servidor: em vez
      // de entrar, apresenta o desafio do segundo fator. Sem isso, a sessao
      // pendente so alcancaria /auth/mfa e /auth/sair, e o app recarregado ficaria
      // preso em 401 mfa_pendente.
      if (exigeMfa) setDesafioMfa(true);
      else aoEntrar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível entrar');
    } finally {
      setEnviando(false);
    }
  }

  if (desafioMfa) {
    return <DesafioMfa aoConfirmar={aoEntrar} aoVoltar={() => setDesafioMfa(false)} />;
  }

  return (
    <div className="login-tela">
      <div className="card login-card">
        <div className="card-corpo">
          <div className="login-marca"><Logo size={40} /></div>
          <h1>Entrar</h1>
          <p className="texto-fraco" style={{ marginTop: 4, marginBottom: 22 }}>
            Acesse a intranet corporativa.
          </p>
          <form className="form" onSubmit={enviar}>
            <div className="campo">
              <label htmlFor="email">E-mail corporativo</label>
              <input className="entrada" id="email" type="email" value={email} required
                autoComplete="username" placeholder="voce@4med.com"
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="senha">Senha</label>
              <input className="entrada" id="senha" type="password" value={senha} required
                autoComplete="current-password" placeholder="••••••••••"
                onChange={(e) => setSenha(e.target.value)} />
            </div>
            {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}
            <button className="botao botao--primario botao--bloco" type="submit" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
