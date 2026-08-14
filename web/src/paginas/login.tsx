import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch, ErroApi } from '../api';
import { Logo } from '../shell/logo';
import { DesafioMfa } from './desafio-mfa';

export function PaginaLogin({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [desafioMfa, setDesafioMfa] = useState(false);
  const telaRef = useRef<HTMLDivElement>(null);

  // Foco de luz que segue o cursor: atualiza duas variáveis CSS direto no nó (sem
  // re-render), e o brilho renderizado ATRÁS do cartão acende também o vidro por onde
  // o mouse passa. Sem ponteiro (toque), fica o brilho ambiente estático.
  useEffect(() => {
    const el = telaRef.current;
    if (!el) return undefined;
    const mover = (e: PointerEvent) => {
      // Coordenadas de viewport direto (o brilho é `position: fixed`), então casa
      // exatamente com o cursor sem depender do tamanho/offset do container.
      el.style.setProperty('--mx', `${e.clientX}px`);
      el.style.setProperty('--my', `${e.clientY}px`);
    };
    el.addEventListener('pointermove', mover);
    return () => el.removeEventListener('pointermove', mover);
  }, [desafioMfa]);

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
    <div className="login-tela" ref={telaRef}>
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
                autoComplete="username" placeholder="voce@conect2ai.com"
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
