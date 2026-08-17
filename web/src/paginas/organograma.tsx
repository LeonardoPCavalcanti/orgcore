import type { CargoDisponivel, PessoaNaUnidade, ProvedorCatalogo, RestricoesIa } from '@4med/contracts';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ErroApi } from '../api';
import { useSessao } from '../shell/sessao';

export type Unidade = {
  id: number; paiId: number | null; nome: string;
  tipo: string; caminho: string; ativo: boolean;
};
export type NoArvore = Unidade & { filhos: NoArvore[] };

/**
 * O servidor devolve só as unidades dentro do escopo do cargo. Quando o pai
 * fica de fora, o nó vira raiz — é assim que o diretor vê a própria subárvore.
 */
export function montarArvore(lista: Unidade[]): NoArvore[] {
  const porId = new Map<number, NoArvore>(lista.map((u) => [u.id, { ...u, filhos: [] }]));
  const raizes: NoArvore[] = [];

  for (const no of porId.values()) {
    const pai = no.paiId === null ? undefined : porId.get(no.paiId);
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
  }
  return raizes;
}

type Contexto = {
  cargos: CargoDisponivel[];
  /** unidadeId -> pessoas com vínculo vigente ali */
  porUnidade: Map<number, PessoaNaUnidade[]>;
  /** quando presente, o usuário pode trocar cargos (tem core.unidade.administrar) */
  alterarCargo?: (vinculoId: string, cargoId: string) => Promise<void>;
  /** vínculos com uma troca em voo, para desabilitar o seletor */
  salvando: Set<string>;
  erros: Map<string, string>;
};

function LinhaPessoa({ pessoa, ctx }: { pessoa: PessoaNaUnidade; ctx: Contexto }) {
  const erro = ctx.erros.get(pessoa.vinculoId);
  return (
    <li className="org-pessoa">
      <span className="org-pessoa-info">
        <span className="org-pessoa-nome">{pessoa.nome}</span>
        <span className="org-pessoa-email texto-fraco">{pessoa.email}</span>
      </span>
      {ctx.alterarCargo ? (
        <span className="org-pessoa-cargo">
          <select
            aria-label={`Cargo de ${pessoa.nome}`}
            className="entrada org-cargo-select"
            value={pessoa.cargoId}
            disabled={ctx.salvando.has(pessoa.vinculoId)}
            onChange={(e) => { void ctx.alterarCargo?.(pessoa.vinculoId, e.target.value); }}
          >
            {ctx.cargos.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          {erro && <span role="alert" className="org-pessoa-erro">{erro}</span>}
        </span>
      ) : (
        <span className="selo">{pessoa.cargoNome}</span>
      )}
    </li>
  );
}

const CTX_VAZIO: Contexto = { cargos: [], porUnidade: new Map(), salvando: new Set(), erros: new Map() };

/**
 * `ctx` é opcional: telas que só listam a estrutura (mover unidades) usam a
 * árvore sem pessoas nem seletor de cargo, e recebem o contexto vazio.
 */
export function ArvoreUnidades({ nos, ctx = CTX_VAZIO }: { nos: NoArvore[]; ctx?: Contexto }) {
  if (nos.length === 0) return null;
  return (
    <ul className="arvore">
      {nos.map((no) => {
        const pessoas = ctx.porUnidade.get(no.id) ?? [];
        return (
          <li key={no.id} className="arvore-no">
            <span className="arvore-linha">
              <span className="arvore-nome">{no.nome}</span>
              <span className="selo">{no.tipo}</span>
            </span>
            {pessoas.length > 0 && (
              <ul className="org-pessoas">
                {pessoas.map((p) => <LinhaPessoa key={p.vinculoId} pessoa={p} ctx={ctx} />)}
              </ul>
            )}
            <ArvoreUnidades nos={no.filhos} ctx={ctx} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Whitelist de IAs por cargo. Um cargo sem restrição mostra todos os provedores
 * marcados ("Sem restrição"); desmarcar algum vira uma restrição de verdade.
 * Voltar a marcar todos (ou desmarcar todos) libera tudo de novo — o servidor
 * trata catálogo cheio e vazio como o mesmo estado canônico "sem restrição".
 */
export function RestricoesIaPorCargo({ cargos }: { cargos: CargoDisponivel[] }) {
  const [provedores, setProvedores] = useState<ProvedorCatalogo[]>([]);
  const [restritos, setRestritos] = useState<Map<string, Set<string>>>(new Map());
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState('');

  useEffect(() => {
    apiFetch<RestricoesIa>('/assistente/restricoes-ia')
      .then((r) => {
        setProvedores(r.provedores);
        setRestritos(new Map(r.porCargo.map((c) => [c.cargoId, new Set(c.provedores)])));
      })
      .catch(() => setErro('Não foi possível carregar as restrições de IA'));
  }, []);

  const todos = useMemo(() => provedores.map((p) => p.id), [provedores]);
  // Conjunto exibido de um cargo: a whitelist quando restrito, ou tudo quando não.
  const marcadosDe = (cargoId: string): Set<string> => restritos.get(cargoId) ?? new Set(todos);

  async function alternar(cargoId: string, provedorId: string) {
    const atual = new Set(marcadosDe(cargoId));
    if (atual.has(provedorId)) atual.delete(provedorId);
    else atual.add(provedorId);

    setErro('');
    setSalvando((s) => new Set(s).add(cargoId));
    try {
      const r = await apiFetch<{ cargoId: string; provedores: string[] }>(
        `/assistente/restricoes-ia/${cargoId}`,
        { method: 'PATCH', body: JSON.stringify({ provedores: [...atual] }) },
      );
      setRestritos((m) => {
        const n = new Map(m);
        if (r.provedores.length === 0) n.delete(cargoId);
        else n.set(cargoId, new Set(r.provedores));
        return n;
      });
    } catch {
      setErro('Falha ao salvar a restrição de IA');
    } finally {
      setSalvando((s) => { const n = new Set(s); n.delete(cargoId); return n; });
    }
  }

  if (provedores.length === 0) return null;

  return (
    <div className="card">
      <div className="card-corpo">
        <div className="pagina-cabecalho">
          <h2>IAs por cargo</h2>
          <p className="texto-fraco">
            Escolha quais modelos cada cargo pode usar no chat. Um cargo com todos
            marcados fica sem restrição; desmarcar todos também libera todos.
          </p>
        </div>
        <ul className="restricoes-lista">
          {cargos.map((c) => {
            const marcados = marcadosDe(c.id);
            const semRestricao = !restritos.has(c.id);
            return (
              <li key={c.id} className="restricao-linha">
                <span className="restricao-cargo">
                  <span className="arvore-nome">{c.nome}</span>
                  {semRestricao && <span className="selo">Sem restrição</span>}
                </span>
                <span className="restricao-chips">
                  {provedores.map((p) => {
                    const on = marcados.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`provedor-chip${on ? ' provedor-chip--on' : ''}`}
                        aria-pressed={on}
                        disabled={salvando.has(c.id)}
                        onClick={() => { void alternar(c.id, p.id); }}
                      >
                        {p.nome}
                      </button>
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>
        {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}
      </div>
    </div>
  );
}

export function PaginaOrganograma() {
  const { eu } = useSessao();
  const podeAdministrar = Boolean(eu?.permissoes['core.unidade.administrar']);

  const [nos, setNos] = useState<NoArvore[]>([]);
  const [cargos, setCargos] = useState<CargoDisponivel[]>([]);
  const [pessoas, setPessoas] = useState<PessoaNaUnidade[]>([]);
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const [erros, setErros] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState('');

  useEffect(() => {
    apiFetch<Unidade[]>('/organograma')
      .then((lista) => setNos(montarArvore(lista)))
      .catch(() => setErro('Não foi possível carregar o organograma'));
  }, []);

  // Pessoas e cargos só existem para quem administra — o servidor recusaria as
  // duas rotas para os demais, então nem chegamos a pedir.
  useEffect(() => {
    if (!podeAdministrar) return;
    void Promise.all([
      apiFetch<CargoDisponivel[]>('/organograma/cargos'),
      apiFetch<PessoaNaUnidade[]>('/organograma/pessoas'),
    ])
      .then(([cs, ps]) => { setCargos(cs); setPessoas(ps); })
      .catch(() => setErro('Não foi possível carregar as pessoas do organograma'));
  }, [podeAdministrar]);

  const porUnidade = useMemo(() => {
    const mapa = new Map<number, PessoaNaUnidade[]>();
    for (const p of pessoas) {
      const lista = mapa.get(p.unidadeId);
      if (lista) lista.push(p);
      else mapa.set(p.unidadeId, [p]);
    }
    return mapa;
  }, [pessoas]);

  async function alterarCargo(vinculoId: string, cargoId: string) {
    setErros((m) => { const n = new Map(m); n.delete(vinculoId); return n; });
    setSalvando((s) => new Set(s).add(vinculoId));
    try {
      await apiFetch(`/organograma/vinculos/${vinculoId}`, {
        method: 'PATCH', body: JSON.stringify({ cargoId }),
      });
      const cargoNome = cargos.find((c) => c.id === cargoId)?.nome ?? '';
      setPessoas((lista) => lista.map((p) =>
        p.vinculoId === vinculoId ? { ...p, cargoId, cargoNome } : p));
    } catch (e) {
      const msg = e instanceof ErroApi ? e.message : 'Falha ao alterar o cargo';
      setErros((m) => new Map(m).set(vinculoId, msg));
    } finally {
      setSalvando((s) => { const n = new Set(s); n.delete(vinculoId); return n; });
    }
  }

  const ctx: Contexto = {
    cargos,
    porUnidade,
    salvando,
    erros,
    ...(podeAdministrar ? { alterarCargo } : {}),
  };

  return (
    <section>
      <div className="pagina-cabecalho">
        <h1>Organograma</h1>
        <p className="texto-fraco">
          {podeAdministrar
            ? 'Você vê as unidades do seu escopo e pode alterar o cargo de cada pessoa.'
            : 'Você vê as unidades que o seu cargo alcança.'}
        </p>
      </div>
      {erro && <p role="alert" className="alerta alerta--erro">{erro}</p>}
      <div className="card">
        <div className="card-corpo">
          {nos.length > 0
            ? <ArvoreUnidades nos={nos} ctx={ctx} />
            : !erro && <div className="vazio">Nenhuma unidade no seu escopo.</div>}
        </div>
      </div>
      {podeAdministrar && cargos.length > 0 && <RestricoesIaPorCargo cargos={cargos} />}
    </section>
  );
}
