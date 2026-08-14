import type { ConversaDetalhe, MensagemChat, ProvedorStatus } from '@4med/contracts';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { apiFetch, ErroApi } from '../api';
import { lerComoDataUri } from '../imagem/arquivo';
import { useSessao } from '../shell/sessao';
import { Markdown } from './markdown';

const primeiroNome = (nome: string) => nome.split(' ')[0] ?? nome;
const idDaUrl = () => new URLSearchParams(window.location.search).get('c');

export function PaginaAssistente() {
  const { eu } = useSessao();
  const [conversaId, setConversaId] = useState<string | null>(idDaUrl());
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [provedores, setProvedores] = useState<ProvedorStatus[]>([]);
  const [provedor, setProvedor] = useState('');
  const [anexos, setAnexos] = useState<string[]>([]);
  const [docs, setDocs] = useState<{ nome: string; dataUri: string }[]>([]);
  const [menu, setMenu] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  // Provedores para o seletor de modelo (com %). Rota autenticada, sem RBAC de anúncio.
  useEffect(() => {
    apiFetch<ProvedorStatus[]>('/assistente/provedores')
      .then((ps) => {
        const lista = Array.isArray(ps) ? ps : [];
        setProvedores(lista);
        if (lista[0]) setProvedor((p) => p || lista[0]!.id);
      })
      .catch(() => {});
  }, []);

  // Se a URL aponta uma conversa (?c=…), carrega o histórico dela.
  useEffect(() => {
    const id = idDaUrl();
    if (!id) return;
    apiFetch<ConversaDetalhe>(`/assistente/conversas/${id}`)
      .then((d) => { setConversaId(d.id); setMensagens(d.mensagens); })
      .catch(() => setErro('Não foi possível abrir a conversa'));
  }, []);

  useEffect(() => { fimRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [mensagens, enviando]);

  async function anexar(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    try {
      const novos = await Promise.all(arquivos.map(lerComoDataUri));
      setAnexos((a) => [...a, ...novos].slice(0, 4));
    } catch {
      setErro('Não foi possível ler a imagem');
    }
  }

  async function anexarDoc(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    try {
      const novos = await Promise.all(
        arquivos.map(async (f) => ({ nome: f.name, dataUri: await lerComoDataUri(f) })),
      );
      setDocs((d) => [...d, ...novos].slice(0, 3));
    } catch {
      setErro('Não foi possível ler o documento');
    }
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setErro('');
    setEnviando(true);
    const imagens = anexos;
    const documentos = docs;
    // Otimista: a mensagem do usuário aparece na hora.
    const provisoria: MensagemChat = {
      id: `local-${Date.now()}`, papel: 'user', conteudo, imagens,
      documentos: documentos.map((d) => d.nome), provedor: null, criadoEm: new Date().toISOString(),
    };
    setMensagens((m) => [...m, provisoria]);
    setTexto('');
    setAnexos([]);
    setDocs([]);
    try {
      let id = conversaId;
      if (!id) {
        const conv = await apiFetch<{ id: string }>('/assistente/conversas', { method: 'POST' });
        id = conv.id;
        setConversaId(id);
      }
      const { mensagem } = await apiFetch<{ mensagem: MensagemChat }>(`/assistente/conversas/${id}/mensagens`, {
        method: 'POST', body: JSON.stringify({ conteudo, imagens, documentos, ...(provedor ? { provedor } : {}) }),
      });
      setMensagens((m) => [...m, mensagem]);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível enviar a mensagem');
      setMensagens((m) => m.filter((x) => x.id !== provisoria.id));
      setTexto(conteudo);
      setAnexos(imagens);
      setDocs(documentos);
    } finally {
      setEnviando(false);
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
  }

  const vazio = mensagens.length === 0;

  const composer = (
    <div className="chat-composer">
      {erro && <p role="alert" className="alerta alerta--erro" style={{ marginBottom: 8 }}>{erro}</p>}
      <div className="chat-caixa">
        {anexos.length > 0 && (
          <div className="chat-anexos">
            {anexos.map((src, i) => (
              <div key={i} className="chat-anexo">
                <img src={src} alt="anexo" />
                <button type="button" aria-label={`Remover anexo ${i + 1}`}
                  onClick={() => setAnexos((a) => a.filter((_, k) => k !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        {docs.length > 0 && (
          <div className="chat-docs">
            {docs.map((d, i) => (
              <span key={i} className="chat-doc">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                </svg>
                <span className="chat-doc-nome">{d.nome}</span>
                <button type="button" aria-label={`Remover documento ${d.nome}`}
                  onClick={() => setDocs((a) => a.filter((_, k) => k !== i))}>×</button>
              </span>
            ))}
          </div>
        )}
        <textarea
          className="chat-texto" value={texto} rows={1} placeholder="Peça à IA da Conect2AI…"
          onChange={(e) => setTexto(e.target.value)} onKeyDown={aoTeclar} />
        <div className="chat-caixa-acoes">
          <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={anexar} />
          <input ref={docRef} type="file" accept=".pdf,.docx,.txt,.md,.csv,.json" multiple hidden onChange={anexarDoc} />
          <div className="chat-mais-wrap">
            <button type="button" className="botao botao--fantasma chat-mais" aria-label="Anexar"
              aria-expanded={menu} onClick={() => setMenu((v) => !v)}>+</button>
            {menu && (
              <>
                <div className="chat-mais-fundo" onClick={() => setMenu(false)} aria-hidden="true" />
                <div className="chat-mais-menu" role="menu">
                  <button type="button" role="menuitem" disabled={anexos.length >= 4}
                    onClick={() => { setMenu(false); imgRef.current?.click(); }}>Imagem</button>
                  <button type="button" role="menuitem" disabled={docs.length >= 3}
                    onClick={() => { setMenu(false); docRef.current?.click(); }}>Documento</button>
                </div>
              </>
            )}
          </div>
          <span style={{ flex: 1 }} />
          {provedores.length > 0 && (
            <select className="entrada chat-modelo" aria-label="Modelo de IA" value={provedor}
              onChange={(e) => setProvedor(e.target.value)}>
              {provedores.map((p) => <option key={p.id} value={p.id}>{p.nome} — {p.percentual}%</option>)}
            </select>
          )}
          <button type="button" className="botao botao--primario chat-enviar" aria-label="Enviar"
            disabled={enviando || !texto.trim()} onClick={() => void enviar()}>
            {enviando ? (
              <span aria-hidden="true">…</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (vazio) {
    return (
      <section className="chat-tela chat-tela--vazia">
        <div className="chat-hero">
          <h1 className="chat-saudacao">
            Olá, {eu ? primeiroNome(eu.nome) : 'bem-vindo'}! No que você está pensando?
          </h1>
          {composer}
        </div>
      </section>
    );
  }

  return (
    <section className="chat-tela">
      <div className="chat-thread">
        {mensagens.map((m) => (
          <div key={m.id} className={`chat-bolha chat-bolha--${m.papel}`}>
            {m.imagens.length > 0 && (
              <div className="chat-bolha-imagens">
                {m.imagens.map((src, i) => <img key={i} src={src} alt="anexo" />)}
              </div>
            )}
            {m.documentos.length > 0 && (
              <div className="chat-bolha-docs">
                {m.documentos.map((nome, i) => (
                  <span key={i} className="chat-doc chat-doc--bolha">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                    </svg>
                    <span className="chat-doc-nome">{nome}</span>
                  </span>
                ))}
              </div>
            )}
            {m.papel === 'assistant'
              ? <Markdown texto={m.conteudo} />
              : <div className="chat-bolha-texto">{m.conteudo}</div>}
            {m.papel === 'assistant' && m.provedor && (
              <div className="chat-bolha-fonte texto-fraco">via {m.provedor}</div>
            )}
          </div>
        ))}
        {enviando && <div className="chat-bolha chat-bolha--assistant"><div className="chat-bolha-texto texto-fraco">pensando…</div></div>}
        <div ref={fimRef} />
      </div>
      {composer}
    </section>
  );
}
