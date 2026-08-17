import type { CargoDisponivel, PessoaNaUnidade } from '@4med/contracts';
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
    </section>
  );
}
