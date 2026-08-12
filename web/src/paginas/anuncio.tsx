import type { AnuncioResposta, AnuncioResumo, TipoAnuncio } from '@4med/contracts';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiFetch, ErroApi, urlDaApi } from '../api';

const TIPOS: { valor: TipoAnuncio; rotulo: string }[] = [
  { valor: 'artigo_aprovado', rotulo: 'Artigo aprovado' },
  { valor: 'defesa', rotulo: 'Defesa (mestrado/doutorado)' },
  { valor: 'aprovados', rotulo: 'Candidatos aprovados' },
];

type PessoaForm = { nome: string; papel: string; foto?: string };

const pessoaVazia = (): PessoaForm => ({ nome: '', papel: '' });

function lerComoDataUri(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('falha ao ler arquivo'));
    leitor.readAsDataURL(arquivo);
  });
}

export function PaginaAnuncio() {
  const [lista, setLista] = useState<AnuncioResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [tipo, setTipo] = useState<TipoAnuncio>('artigo_aprovado');
  const [titulo, setTitulo] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [dataRotulo, setDataRotulo] = useState('');
  const [localRotulo, setLocalRotulo] = useState('');
  const [pessoas, setPessoas] = useState<PessoaForm[]>([pessoaVazia()]);
  const [gerando, setGerando] = useState(false);

  const [atual, setAtual] = useState<AnuncioResposta | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    apiFetch<AnuncioResumo[]>('/conteudo/anuncios')
      .then((d) => { setLista(d); setErro(''); })
      .catch(() => setErro('Não foi possível carregar os anúncios'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(carregar, [carregar]);

  function alterarPessoa(indice: number, campo: keyof PessoaForm, valor: string) {
    setPessoas((atuais) => atuais.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)));
  }

  async function escolherFoto(indice: number, evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    try {
      alterarPessoa(indice, 'foto', await lerComoDataUri(arquivo));
    } catch {
      setErro('Não foi possível ler a foto');
    }
  }

  async function gerar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setGerando(true);
    const pessoasValidas = pessoas
      .filter((p) => p.nome.trim())
      .map((p) => ({ nome: p.nome.trim(), papel: p.papel.trim(), ...(p.foto ? { foto: p.foto } : {}) }));
    const corpo = {
      tipo, titulo, pessoas: pessoasValidas,
      ...(veiculo.trim() ? { veiculo: veiculo.trim() } : {}),
      ...(tipo === 'defesa' && dataRotulo.trim() ? { dataRotulo: dataRotulo.trim() } : {}),
      ...(tipo === 'defesa' && localRotulo.trim() ? { localRotulo: localRotulo.trim() } : {}),
    };
    try {
      const anuncio = await apiFetch<AnuncioResposta>('/conteudo/anuncios', {
        method: 'POST', body: JSON.stringify(corpo),
      });
      setAtual(anuncio);
      setTitulo('');
      setPessoas([pessoaVazia()]);
      setVeiculo(''); setDataRotulo(''); setLocalRotulo('');
      carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível gerar o anúncio');
    } finally {
      setGerando(false);
    }
  }

  async function abrir(id: string) {
    setErro('');
    try {
      setAtual(await apiFetch<AnuncioResposta>(`/conteudo/anuncios/${id}`));
    } catch {
      setErro('Não foi possível abrir o anúncio');
    }
  }

  async function apagar(id: string) {
    setErro('');
    try {
      await apiFetch(`/conteudo/anuncios/${id}`, { method: 'DELETE' });
      if (atual?.id === id) setAtual(null);
      carregar();
    } catch {
      setErro('Não foi possível apagar o anúncio');
    }
  }

  async function baixar() {
    if (!atual) return;
    try {
      const resp = await fetch(urlDaApi(atual.imagemUrl), { credentials: 'include' });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `conect2ai-anuncio-${atual.id}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro('Não foi possível baixar a imagem');
    }
  }

  const ehDefesa = tipo === 'defesa';

  return (
    <section>
      <div className="pagina-cabecalho">
        <h1>Criar anúncio</h1>
        <p className="texto-fraco">
          Monte um card de anúncio acadêmico da Conect2AI — artigo aprovado, defesa ou
          aprovados. Informe as pessoas e a IA compõe a arte pronta para o Instagram.
        </p>
      </div>

      {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-corpo">
          <form className="form" onSubmit={gerar}>
            <div className="linha" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="campo" style={{ flex: '0 0 260px' }}>
                <label htmlFor="tipo">Tipo de anúncio</label>
                <select className="entrada" id="tipo" value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoAnuncio)}>
                  {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                </select>
              </div>
              <div className="campo" style={{ flex: '1 1 240px' }}>
                <label htmlFor="veiculo">Veículo / evento (opcional)</label>
                <input className="entrada" id="veiculo" value={veiculo}
                  placeholder="Ex.: CBIS 2026, IEEE Access" onChange={(e) => setVeiculo(e.target.value)} />
              </div>
            </div>

            <div className="campo">
              <label htmlFor="titulo">Título do trabalho</label>
              <textarea className="entrada" id="titulo" value={titulo} required rows={2}
                placeholder="Ex.: Generative Language Models for Disease Treatment Recommendations"
                onChange={(e) => setTitulo(e.target.value)} />
            </div>

            {ehDefesa && (
              <div className="linha" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div className="campo" style={{ flex: '0 0 200px' }}>
                  <label htmlFor="data">Data (opcional)</label>
                  <input className="entrada" id="data" value={dataRotulo}
                    placeholder="Ex.: 07 DE AGOSTO" onChange={(e) => setDataRotulo(e.target.value)} />
                </div>
                <div className="campo" style={{ flex: '1 1 240px' }}>
                  <label htmlFor="local">Horário / local (opcional)</label>
                  <input className="entrada" id="local" value={localRotulo}
                    placeholder="Ex.: 9h · Google Meet" onChange={(e) => setLocalRotulo(e.target.value)} />
                </div>
              </div>
            )}

            <div className="campo">
              <span className="rotulo-campo">Pessoas ({pessoas.length})</span>
              <div className="pilha" style={{ gap: 8 }}>
                {pessoas.map((p, i) => (
                  <div key={i} className="linha" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="campo" style={{ flex: '1 1 180px' }}>
                      <label htmlFor={`nome-${i}`}>Nome</label>
                      <input className="entrada" id={`nome-${i}`} value={p.nome}
                        onChange={(e) => alterarPessoa(i, 'nome', e.target.value)} />
                    </div>
                    <div className="campo" style={{ flex: '1 1 140px' }}>
                      <label htmlFor={`papel-${i}`}>Papel</label>
                      <input className="entrada" id={`papel-${i}`} value={p.papel}
                        placeholder="Autor, Orientador…" onChange={(e) => alterarPessoa(i, 'papel', e.target.value)} />
                    </div>
                    <div className="campo" style={{ flex: '0 0 auto' }}>
                      <label htmlFor={`foto-${i}`}>Foto{p.foto ? ' ✓' : ''}</label>
                      <input className="entrada" id={`foto-${i}`} type="file" accept="image/*"
                        onChange={(e) => escolherFoto(i, e)} />
                    </div>
                    <button type="button" className="botao botao--fantasma" aria-label={`Remover pessoa ${i + 1}`}
                      onClick={() => setPessoas((a) => a.filter((_, j) => j !== i))}>Remover</button>
                  </div>
                ))}
              </div>
              <div className="linha" style={{ gap: 8, marginTop: 8 }}>
                <button type="button" className="botao botao--fantasma" disabled={pessoas.length >= 10}
                  onClick={() => setPessoas((a) => [...a, pessoaVazia()])}>Adicionar pessoa</button>
              </div>
            </div>

            <div className="linha">
              <button className="botao botao--primario" type="submit" disabled={gerando}>
                {gerando ? 'Gerando…' : 'Gerar anúncio'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {atual && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-corpo pilha">
            <div className="entre">
              <h2>{atual.titulo}</h2>
              <span className="selo selo--marca">{atual.headline.prefixo} {atual.headline.destaque}</span>
            </div>
            <div className="linha" style={{ justifyContent: 'center' }}>
              <img
                src={urlDaApi(atual.imagemUrl)}
                alt={`Anúncio: ${atual.titulo}`}
                style={{ width: 'min(380px, 80vw)', aspectRatio: '1080 / 1350', borderRadius: 'var(--r-md)', border: '1px solid var(--borda)' }}
              />
            </div>
            <div className="linha" style={{ gap: 8, justifyContent: 'center' }}>
              <button type="button" className="botao" onClick={baixar}>Baixar imagem</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {carregando ? (
          <div className="card-corpo"><div className="vazio">Carregando…</div></div>
        ) : lista.length === 0 ? (
          <div className="card-corpo"><div className="vazio">Nenhum anúncio ainda. Gere o primeiro acima.</div></div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Título</th><th>Criado em</th><th aria-label="Ações" /></tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id}>
                    <td>{a.titulo}</td>
                    <td className="mono">{new Date(a.criadoEm).toLocaleString('pt-BR')}</td>
                    <td className="numero">
                      <div className="linha" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className="botao botao--fantasma" onClick={() => abrir(a.id)}>Abrir</button>
                        <button type="button" className="botao botao--perigo" onClick={() => apagar(a.id)}>Apagar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
