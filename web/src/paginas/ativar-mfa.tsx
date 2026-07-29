import { useState, type FormEvent } from 'react';
import type { RespostaAtivarMfa, RespostaPrepararMfa } from '@4med/contracts';
import { toString as gerarSvgQr } from 'qrcode';
import { apiFetch, ErroApi } from '../api';

/**
 * Gera o QR do `otpauth://` como um data URL de SVG — sem imagem de rede e sem
 * canvas (o SVG e string pura, funciona igual no navegador e no jsdom dos testes).
 */
async function qrDataUrl(otpauth: string): Promise<string> {
  const svg = await gerarSvgQr(otpauth, { type: 'svg', margin: 1, width: 200 });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type Etapa = 'inicio' | 'configurar' | 'concluido';

/**
 * Cadastro do segundo fator na Minha conta. Quando o MFA ja esta ativo, so mostra
 * o estado; quando inativo, conduz preparar (QR + chave) -> ativar (codigo) ->
 * exibicao unica dos codigos de recuperacao.
 */
export function AtivarMfa({
  mfaAtivo, aoAtivar,
}: { mfaAtivo: boolean; aoAtivar: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>('inicio');
  const [segredo, setSegredo] = useState('');
  const [qr, setQr] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigos, setCodigos] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function preparar() {
    setErro('');
    setOcupado(true);
    try {
      const { segredo: s, otpauth } = await apiFetch<RespostaPrepararMfa>(
        '/auth/mfa/preparar', { method: 'POST' },
      );
      setSegredo(s);
      setQr(await qrDataUrl(otpauth));
      setEtapa('configurar');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível iniciar a ativação');
    } finally {
      setOcupado(false);
    }
  }

  async function ativar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setOcupado(true);
    try {
      const { codigosRecuperacao } = await apiFetch<RespostaAtivarMfa>(
        '/auth/mfa/ativar', { method: 'POST', body: JSON.stringify({ codigo }) },
      );
      setCodigos(codigosRecuperacao);
      setEtapa('concluido');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível ativar a verificação');
    } finally {
      setOcupado(false);
    }
  }

  if (mfaAtivo) {
    return (
      <div className="card">
        <div className="card-corpo">
          <h2 style={{ marginTop: 0 }}>Verificação em duas etapas</h2>
          <p className="texto-fraco" style={{ marginBottom: 0 }}>
            Sua conta está protegida. A cada login será pedido um código do aplicativo autenticador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-corpo">
        <h2 style={{ marginTop: 0 }}>Verificação em duas etapas</h2>

        {etapa === 'inicio' && (
          <>
            <p className="texto-fraco">
              Adicione uma camada extra de segurança: além da senha, o login pedirá um código gerado no seu celular.
            </p>
            {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}
            <button className="botao botao--primario" type="button" onClick={preparar} disabled={ocupado}>
              {ocupado ? 'Preparando…' : 'Ativar verificação em duas etapas'}
            </button>
          </>
        )}

        {etapa === 'configurar' && (
          <>
            <p className="texto-fraco">
              Leia o código abaixo com um aplicativo autenticador (Google Authenticator, Authy, 1Password) e informe o código de seis dígitos gerado.
            </p>
            <div className="pilha" style={{ alignItems: 'center' }}>
              <img src={qr} alt="QR code para configurar o autenticador"
                width={200} height={200}
                style={{ background: '#fff', borderRadius: 'var(--r-md)', padding: 8 }} />
              <div style={{ width: '100%' }}>
                <div className="rotulo-campo" style={{ marginBottom: 6 }}>Ou digite a chave manualmente</div>
                <div className="bloco-codigo">{segredo}</div>
              </div>
            </div>
            <form className="form" onSubmit={ativar} style={{ marginTop: 16 }}>
              <div className="campo">
                <label htmlFor="codigo-ativar">Código do aplicativo</label>
                <input className="entrada" id="codigo-ativar" type="text" value={codigo} required
                  inputMode="numeric" autoComplete="one-time-code"
                  placeholder="000000" onChange={(e) => setCodigo(e.target.value.trim())} />
              </div>
              {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}
              <button className="botao botao--primario" type="submit" disabled={ocupado}>
                {ocupado ? 'Ativando…' : 'Confirmar e ativar'}
              </button>
            </form>
          </>
        )}

        {etapa === 'concluido' && (
          <>
            <p role="alert" className="alerta alerta--erro">
              Guarde estes códigos de recuperação em um lugar seguro. Cada um serve uma única vez e é a única forma de entrar se você perder o acesso ao aplicativo autenticador. Eles não serão mostrados de novo.
            </p>
            <div className="bloco-codigo" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
              {codigos.map((c) => <span key={c}>{c}</span>)}
            </div>
            <button className="botao botao--primario" type="button" onClick={aoAtivar} style={{ marginTop: 14 }}>
              Concluir
            </button>
          </>
        )}
      </div>
    </div>
  );
}
