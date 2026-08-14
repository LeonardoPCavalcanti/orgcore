import type { AnuncioResposta, AnuncioResumo, AvaliacaoAnuncio, GrupoTabela, ProvedorStatus, TipoAnuncio } from '@4med/contracts';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiFetch, ErroApi, urlDaApi } from '../api';
import { removerFundo, branquearLogo } from '../imagem/padronizar';

const TIPOS: { valor: TipoAnuncio; rotulo: string }[] = [
  { valor: 'artigo_aprovado', rotulo: 'Artigo aprovado' },
  { valor: 'defesa', rotulo: 'Defesa (mestrado/doutorado)' },
  { valor: 'aprovados', rotulo: 'Candidatos aprovados' },
];

type PessoaForm = { nome: string; papel: string; foto?: string; fotoRecortada?: boolean };

const pessoaVazia = (): PessoaForm => ({ nome: '', papel: '' });
const grupoVazio = (): GrupoTabela => ({ titulo: '', colunas: ['Orientando', 'Orientador'], linhas: [['', '']] });

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
  const [destaque, setDestaque] = useState('');
  const [dataRotulo, setDataRotulo] = useState('');
  const [localRotulo, setLocalRotulo] = useState('');
  const [pessoas, setPessoas] = useState<PessoaForm[]>([pessoaVazia()]);
  const [grupos, setGrupos] = useState<GrupoTabela[]>([]);
  const [logos, setLogos] = useState<string[]>([]);
  const [logosPosicao, setLogosPosicao] = useState<'topo' | 'rodape'>('rodape');
  const [gerando, setGerando] = useState(false);
  // Contador de imagens sendo padronizadas (recorte/branqueamento no navegador). > 0
  // desabilita "Gerar" para o card sair só quando as fotos/logos estiverem prontos.
  const [processando, setProcessando] = useState(0);

  const [provedores, setProvedores] = useState<ProvedorStatus[]>([]);
  const [provedor, setProvedor] = useState('');

  const [atual, setAtual] = useState<AnuncioResposta | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [avaliado, setAvaliado] = useState<AvaliacaoAnuncio | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    apiFetch<AnuncioResumo[]>('/conteudo/anuncios')
      .then((d) => { setLista(d); setErro(''); })
      .catch(() => setErro('Não foi possível carregar os anúncios'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(carregar, [carregar]);

  useEffect(() => {
    apiFetch<ProvedorStatus[]>('/conteudo/ia/provedores')
      .then((ps) => {
        const lista = Array.isArray(ps) ? ps : [];
        setProvedores(lista);
        if (lista[0]) setProvedor((p) => p || lista[0]!.id);
      })
      .catch(() => {});
  }, []);

  const atualizarCotas = useCallback((forcar: boolean) => {
    apiFetch<ProvedorStatus[]>('/conteudo/ia/provedores/atualizar', { method: 'PATCH', body: JSON.stringify({ forcar }) })
      .then((ps) => setProvedores(Array.isArray(ps) ? ps : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => atualizarCotas(false), 5 * 60_000);
    return () => clearInterval(t);
  }, [atualizarCotas]);

  function alterarPessoa(indice: number, campo: keyof PessoaForm, valor: string) {
    setPessoas((atuais) => atuais.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)));
  }

  async function escolherFoto(indice: number, evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setProcessando((n) => n + 1);
    try {
      const bruta = await lerComoDataUri(arquivo);
      // Recorte de fundo no navegador (WASM). Em falha, `removerFundo` devolve a foto
      // original com recortado=false — o card ainda sai, com o headshot emoldurado.
      const { dataUri, recortado } = await removerFundo(bruta);
      setPessoas((atuais) => atuais.map((p, i) => (i === indice ? { ...p, foto: dataUri, fotoRecortada: recortado } : p)));
    } catch {
      setErro('Não foi possível ler a foto');
    } finally {
      setProcessando((n) => n - 1);
    }
  }

  async function adicionarLogos(evento: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? []);
    evento.target.value = ''; // permite reescolher o mesmo arquivo depois
    if (arquivos.length === 0) return;
    setProcessando((n) => n + 1);
    try {
      const brutos = await Promise.all(arquivos.map(lerComoDataUri));
      // Padroniza cada logo: fundo removido e marca repintada de branco (no navegador).
      const brancos = await Promise.all(brutos.map(branquearLogo));
      setLogos((atuais) => [...atuais, ...brancos].slice(0, 6));
    } catch {
      setErro('Não foi possível ler os logos');
    } finally {
      setProcessando((n) => n - 1);
    }
  }

  function alterarGrupo(i: number, campo: 'titulo', valor: string) {
    setGrupos((gs) => gs.map((g, k) => (k === i ? { ...g, [campo]: valor } : g)));
  }
  function alterarColuna(i: number, col: 0 | 1, valor: string) {
    setGrupos((gs) => gs.map((g, k) => (k === i
      ? { ...g, colunas: (col === 0 ? [valor, g.colunas[1]] : [g.colunas[0], valor]) as [string, string] }
      : g)));
  }
  function alterarCelula(i: number, j: number, col: 0 | 1, valor: string) {
    setGrupos((gs) => gs.map((g, k) => (k === i
      ? { ...g, linhas: g.linhas.map((l, m) => (m === j ? (col === 0 ? [valor, l[1]] : [l[0], valor]) as [string, string] : l)) }
      : g)));
  }

  async function gerar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setGerando(true);
    const pessoasValidas = pessoas
      .filter((p) => p.nome.trim())
      .map((p) => ({
        nome: p.nome.trim(), papel: p.papel.trim(),
        ...(p.foto ? { foto: p.foto } : {}),
        ...(p.fotoRecortada ? { fotoRecortada: true } : {}),
      }));
    // Só grupos com título e ao menos uma linha preenchida viram tabela.
    const gruposValidos = grupos
      .map((g) => ({
        titulo: g.titulo.trim(),
        colunas: [g.colunas[0].trim(), g.colunas[1].trim()] as [string, string],
        linhas: g.linhas
          .filter((l) => l[0].trim() || l[1].trim())
          .map((l) => [l[0].trim(), l[1].trim()] as [string, string]),
      }))
      .filter((g) => g.titulo && g.linhas.length > 0);
    const corpo = {
      tipo, titulo, pessoas: pessoasValidas, grupos: gruposValidos, logosPosicao,
      ...(provedor ? { provedor } : {}),
      ...(logos.length ? { logos } : {}),
      ...(veiculo.trim() ? { veiculo: veiculo.trim() } : {}),
      ...(tipo === 'defesa' && destaque ? { destaque } : {}),
      ...(tipo === 'defesa' && dataRotulo.trim() ? { dataRotulo: dataRotulo.trim() } : {}),
      ...(tipo === 'defesa' && localRotulo.trim() ? { localRotulo: localRotulo.trim() } : {}),
    };
    try {
      const anuncio = await apiFetch<AnuncioResposta>('/conteudo/anuncios', {
        method: 'POST', body: JSON.stringify(corpo),
      });
      setAtual(anuncio);
      setAvaliado(null);
      setTitulo('');
      setPessoas([pessoaVazia()]);
      setGrupos([]);
      setLogos([]);
      setVeiculo(''); setDestaque(''); setDataRotulo(''); setLocalRotulo('');
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
      setAvaliado(null);
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

  async function avaliar(avaliacao: AvaliacaoAnuncio) {
    if (!atual) return;
    try {
      await apiFetch(`/conteudo/anuncios/${atual.id}/feedback`, {
        method: 'PATCH', body: JSON.stringify({ avaliacao }),
      });
      setAvaliado(avaliacao);
    } catch {
      setErro('Não foi possível registrar a avaliação');
    }
  }

  async function copiarLegenda() {
    if (!atual?.legenda) return;
    try {
      await navigator.clipboard.writeText(atual.legenda);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar a legenda');
    }
  }

  async function baixarTreino(caminho: string, arquivo: string) {
    setErro('');
    try {
      const resp = await fetch(urlDaApi(caminho), { credentials: 'include' });
      const texto = await resp.text();
      const blob = new Blob([texto], { type: 'application/x-ndjson' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = arquivo;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro('Não foi possível baixar os dados de treino');
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
            {provedores.length > 0 && (
              <div className="campo">
                <label htmlFor="provedor">Modelo de IA</label>
                <div className="linha" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select className="entrada" id="provedor" value={provedor} style={{ flex: '0 0 240px' }}
                    onChange={(e) => setProvedor(e.target.value)}>
                    {provedores.map((p) => <option key={p.id} value={p.id}>{p.nome} — {p.percentual}%</option>)}
                  </select>
                  <button type="button" className="botao botao--fantasma" onClick={() => atualizarCotas(true)}>Atualizar cotas</button>
                </div>
                <div className="pilha" style={{ gap: 4, marginTop: 6 }}>
                  {provedores.map((p) => (
                    <div key={p.id} className="linha" style={{ gap: 8, alignItems: 'center', fontSize: 12 }}>
                      <span style={{ flex: '0 0 120px' }}>{p.nome}</span>
                      <span style={{ flex: 1, height: 6, background: 'var(--borda, #e0e0e0)', borderRadius: 999 }}>
                        <span style={{ display: 'block', width: `${p.percentual}%`, height: 6, background: '#1BB4D8', borderRadius: 999 }} />
                      </span>
                      <span>{p.percentual}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                <div className="campo" style={{ flex: '0 0 170px' }}>
                  <label htmlFor="nivel">Nível</label>
                  <select className="entrada" id="nivel" value={destaque || 'MESTRADO'}
                    onChange={(e) => setDestaque(e.target.value)}>
                    <option value="MESTRADO">Mestrado</option>
                    <option value="DOUTORADO">Doutorado</option>
                  </select>
                </div>
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

            <div className="campo">
              <span className="rotulo-campo">Tabelas de candidatos (opcional)</span>
              <p className="texto-fraco" style={{ fontSize: 13, marginTop: -2 }}>
                Preencha para o card virar a variante em tabela (ex.: Doutorado/Mestrado) — nesse
                caso, as fotos não aparecem.
              </p>
              <div className="pilha" style={{ gap: 12 }}>
                {grupos.map((g, i) => (
                  <div key={i} className="card" style={{ padding: 0 }}>
                    <div className="card-corpo pilha" style={{ gap: 8 }}>
                      <div className="linha" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="campo" style={{ flex: '1 1 160px' }}>
                          <label htmlFor={`grupo-titulo-${i}`}>Título</label>
                          <input className="entrada" id={`grupo-titulo-${i}`} value={g.titulo}
                            placeholder="DOUTORADO" onChange={(e) => alterarGrupo(i, 'titulo', e.target.value)} />
                        </div>
                        <div className="campo" style={{ flex: '1 1 140px' }}>
                          <label htmlFor={`grupo-col0-${i}`}>Coluna 1</label>
                          <input className="entrada" id={`grupo-col0-${i}`} value={g.colunas[0]}
                            onChange={(e) => alterarColuna(i, 0, e.target.value)} />
                        </div>
                        <div className="campo" style={{ flex: '1 1 140px' }}>
                          <label htmlFor={`grupo-col1-${i}`}>Coluna 2</label>
                          <input className="entrada" id={`grupo-col1-${i}`} value={g.colunas[1]}
                            onChange={(e) => alterarColuna(i, 1, e.target.value)} />
                        </div>
                        <button type="button" className="botao botao--fantasma" aria-label={`Remover tabela ${i + 1}`}
                          onClick={() => setGrupos((gs) => gs.filter((_, k) => k !== i))}>Remover tabela</button>
                      </div>
                      {g.linhas.map((l, j) => (
                        <div key={j} className="linha" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div className="campo" style={{ flex: '1 1 160px' }}>
                            <label htmlFor={`grupo-${i}-l${j}-c0`}>{g.colunas[0] || 'Coluna 1'}</label>
                            <input className="entrada" id={`grupo-${i}-l${j}-c0`} value={l[0]}
                              onChange={(e) => alterarCelula(i, j, 0, e.target.value)} />
                          </div>
                          <div className="campo" style={{ flex: '1 1 160px' }}>
                            <label htmlFor={`grupo-${i}-l${j}-c1`}>{g.colunas[1] || 'Coluna 2'}</label>
                            <input className="entrada" id={`grupo-${i}-l${j}-c1`} value={l[1]}
                              onChange={(e) => alterarCelula(i, j, 1, e.target.value)} />
                          </div>
                          <button type="button" className="botao botao--fantasma" aria-label={`Remover linha ${j + 1} da tabela ${i + 1}`}
                            onClick={() => setGrupos((gs) => gs.map((gr, k) => (k === i ? { ...gr, linhas: gr.linhas.filter((_, m) => m !== j) } : gr)))}>×</button>
                        </div>
                      ))}
                      <div className="linha">
                        <button type="button" className="botao botao--fantasma" disabled={g.linhas.length >= 8}
                          onClick={() => setGrupos((gs) => gs.map((gr, k) => (k === i ? { ...gr, linhas: [...gr.linhas, ['', '']] } : gr)))}>Adicionar linha</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="linha" style={{ gap: 8, marginTop: 8 }}>
                <button type="button" className="botao botao--fantasma" disabled={grupos.length >= 4}
                  onClick={() => setGrupos((gs) => [...gs, grupoVazio()])}>Adicionar tabela</button>
              </div>
            </div>

            <div className="campo">
              <span className="rotulo-campo">Logos parceiros (opcional)</span>
              <p className="texto-fraco" style={{ fontSize: 13, marginTop: -2 }}>
                Marcas de laboratório, universidade ou programa — até 6. São padronizadas
                em branco automaticamente e aparecem como marca no card.
              </p>
              {logos.length > 0 && (
                <div className="linha" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {logos.map((src, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: 'var(--tinta, #101418)',
                      borderRadius: 8, padding: '6px 8px', border: '1px solid var(--borda)',
                    }}>
                      <img src={src} alt={`Logo ${i + 1}`} style={{ height: 28, objectFit: 'contain' }} />
                      <button type="button" className="botao botao--fantasma" aria-label={`Remover logo ${i + 1}`}
                        onClick={() => setLogos((ls) => ls.filter((_, k) => k !== i))}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="linha" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="campo" style={{ flex: '1 1 240px' }}>
                  <input className="entrada" id="logos" type="file" accept="image/*" multiple
                    disabled={logos.length >= 6} onChange={adicionarLogos} />
                </div>
                <div className="campo" style={{ flex: '0 0 200px' }}>
                  <label htmlFor="logos-posicao">Posição dos logos</label>
                  <select className="entrada" id="logos-posicao" value={logosPosicao}
                    onChange={(e) => setLogosPosicao(e.target.value as 'topo' | 'rodape')}>
                    <option value="rodape">Rodapé</option>
                    <option value="topo">Topo</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="linha">
              <button className="botao botao--primario" type="submit" disabled={gerando || processando > 0}>
                {gerando ? 'Gerando…' : processando > 0 ? 'Processando imagens…' : 'Gerar anúncio'}
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
            <p className="texto-fraco" style={{ fontSize: 13, margin: 0 }}>
              gerado por {atual.modelo}
              {atual.provedorSolicitado && atual.provedorSolicitado !== atual.modelo
                ? ` — «${atual.provedorSolicitado}» estava no limite` : ''}
            </p>
            <div className="linha" style={{ justifyContent: 'center' }}>
              <img
                src={urlDaApi(atual.imagemUrl)}
                alt={`Anúncio: ${atual.titulo}`}
                style={{ width: 'min(380px, 80vw)', aspectRatio: '1080 / 1350', borderRadius: 'var(--r-md)', border: '1px solid var(--borda)' }}
              />
            </div>
            {atual.legenda && (
              <div className="campo">
                <span className="rotulo-campo">Legenda para o Instagram</span>
                <pre className="entrada" style={{
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0,
                }}>{atual.legenda}</pre>
              </div>
            )}
            <div className="linha" style={{ gap: 8, justifyContent: 'center' }}>
              <button type="button" className="botao" onClick={baixar}>Baixar imagem</button>
              {atual.legenda && (
                <button type="button" className="botao botao--fantasma" onClick={copiarLegenda}>
                  {copiado ? 'Legenda copiada' : 'Copiar legenda'}
                </button>
              )}
            </div>
            <div className="linha" style={{ gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              {avaliado ? (
                <span className="texto-fraco" role="status">
                  Avaliação registrada: {avaliado === 'aprovado' ? 'aprovado' : 'reprovado'}. Obrigado — isso ajuda a IA a melhorar.
                </span>
              ) : (
                <>
                  <span className="texto-fraco" style={{ fontSize: 13 }}>Este resultado ficou bom?</span>
                  <button type="button" className="botao botao--fantasma" onClick={() => avaliar('aprovado')}>Aprovar</button>
                  <button type="button" className="botao botao--fantasma" onClick={() => avaliar('reprovado')}>Reprovar</button>
                </>
              )}
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
          <>
          <div className="card-corpo" style={{ paddingBottom: 0 }}>
            <p className="texto-fraco" style={{ fontSize: 13, margin: '0 0 8px' }}>
              As avaliações alimentam a melhoria da IA. Exporte os pares entrada→saída para treino.
            </p>
            <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="botao botao--fantasma"
                onClick={() => baixarTreino('/conteudo/anuncios/corpus.jsonl', 'conect2ai-corpus.jsonl')}>
                Corpus completo (JSONL)
              </button>
              <button type="button" className="botao botao--fantasma"
                onClick={() => baixarTreino('/conteudo/anuncios/treino/sft.jsonl', 'conect2ai-sft.jsonl')}>
                Dataset SFT (aprovados)
              </button>
              <button type="button" className="botao botao--fantasma"
                onClick={() => baixarTreino('/conteudo/anuncios/treino/kto.jsonl', 'conect2ai-kto.jsonl')}>
                Dataset KTO (preferência)
              </button>
            </div>
          </div>
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
          </>
        )}
      </div>
    </section>
  );
}
