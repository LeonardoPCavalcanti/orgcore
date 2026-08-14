import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { db } from '../src/core/db/client';
import { cargos } from '../src/core/db/schema/acesso';
import { unidades } from '../src/core/db/schema/organograma';
import { manifestoNucleo } from '../src/core/manifesto';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const SENHA = 'demonstracao conect2ai 2026';
let app: FastifyInstance;

beforeAll(async () => {
  await prepararBanco();
  app = await criarApp([manifestoNucleo]);
});
beforeEach(limparBanco);

/**
 * Login devolve DOIS cookies: a sessão e o token CSRF de dupla submissão. Toda
 * mutação (POST/PATCH/DELETE) numa rota não-pública exige o cookie `csrf`
 * repetido no cabeçalho `x-csrf-token` (ver o preHandler em core/app.ts). Sem os
 * dois, o rh — que DEVERIA passar nos POST — levaria 403 de CSRF antes da
 * checagem de permissão, e a matriz mediria a coisa errada.
 */
type Credenciais = { sessao: string; csrf: string };

async function entrar(email: string): Promise<Credenciais> {
  const resp = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email, senha: SENHA },
  });
  return {
    sessao: resp.cookies.find((c) => c.name === 'sessao')?.value ?? '',
    csrf: resp.cookies.find((c) => c.name === 'csrf')?.value ?? '',
  };
}

/**
 * `core.delegacao.administrar` NÃO tem permissão de rota: quem revoga a própria
 * delegação usa `core.delegacao.criar` (a rota DELETE /delegacoes/:id), e a
 * autorização extra para revogar a de TERCEIRO é conferida DENTRO de
 * `revogarDelegacao`, não no manifesto. Como nenhuma rota declara essa chave, ela
 * não pode ser exercida por `app.inject` e fica aqui — a garantia dela mora nos
 * testes de serviço (delegacoes.test.ts), não na matriz HTTP.
 *
 * `core.delegacao.criar` SAIU desta lista quando as rotas de /delegacoes entraram:
 * agora tem casos de verdade na matriz, abaixo. `core.papel.administrar` nunca
 * esteve aqui — nenhum código a usa, é permissão morta e saiu do manifesto.
 */
const SEM_ROTA_HTTP = new Set(['core.delegacao.administrar']);

describe('cobertura de rotas', () => {
  it('toda rota declara permissao, ou e publica, ou exige apenas sessao', () => {
    // Um `permissao: null` sem `publica` nem `autenticada` seria uma rota servida
    // sem nenhuma decisão de acesso declarada. O boot já recusa esse caso
    // (validarManifestos), mas a matriz também o trava, aqui, em linguagem de teste.
    const faltando = manifestoNucleo.rotas.filter(
      (r) => r.permissao === null && r.publica !== true && r.autenticada !== true,
    );
    expect(faltando).toEqual([]);
  });

  it('toda permissao com rota tem um caso na matriz; as sem rota estao na allowlist', () => {
    const cobertas = new Set(CASOS.map((c) => c.permissao));
    const declaradas = manifestoNucleo.permissoes.map((p) => p.chave);
    // Se falhar: alguém declarou permissão sem caso na matriz e sem pôr na
    // allowlist de "ainda sem rota". Permissão sem teste é permissão sem garantia.
    const descobertas = declaradas.filter((d) => !cobertas.has(d) && !SEM_ROTA_HTTP.has(d));
    expect(descobertas).toEqual([]);
  });

  it('a allowlist de permissoes sem rota nao apodrece', () => {
    const declaradas = new Set(manifestoNucleo.permissoes.map((p) => p.chave));
    for (const chave of SEM_ROTA_HTTP) {
      // Entrada morta na allowlist (permissão que nem existe mais) esconderia buraco.
      expect(declaradas.has(chave)).toBe(true);
      // Se a rota entrou, a permissão sai daqui e vira caso de verdade na matriz —
      // senão a cobertura passaria a mentir sobre ela.
      expect(manifestoNucleo.rotas.some((r) => r.permissao === chave)).toBe(false);
    }
  });
});

// Id sintético para exercitar a rota DELETE de delegação: todos os cargos do seed
// são barrados no preHandler pela permissão ANTES de o id importar, então ele
// nunca precisa apontar para uma linha real.
const DELEGACAO_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const CASOS = [
  { permissao: 'core.unidade.ler', metodo: 'GET' as const, url: '/organograma',
    permitidos: ['aluno', 'supervisor', 'admin', 'secretaria'] },
  { permissao: 'core.unidade.administrar', metodo: 'POST' as const, url: '/organograma',
    permitidos: ['secretaria'] },
  { permissao: 'core.auditoria.ler', metodo: 'GET' as const, url: '/auditoria',
    permitidos: ['supervisor', 'admin', 'secretaria'] },
  { permissao: 'core.convite.administrar', metodo: 'POST' as const, url: '/auth/convites',
    permitidos: ['secretaria'] },
  // Delegação: NENHUM cargo do seed carrega `core.delegacao.criar` — nem o rh, que
  // tem alcance global mas não a permissão de delegar. Logo todos são barrados nas
  // três rotas. O caminho POSITIVO (quem TEM a permissão cria, lista e revoga por
  // HTTP) fica em rotas-delegacao.test.ts, onde a concessão é feita à mão.
  { permissao: 'core.delegacao.criar', metodo: 'GET' as const, url: '/delegacoes',
    permitidos: [] as string[] },
  { permissao: 'core.delegacao.criar', metodo: 'POST' as const, url: '/delegacoes',
    permitidos: [] as string[] },
  { permissao: 'core.delegacao.criar', metodo: 'DELETE' as const,
    url: `/delegacoes/${DELEGACAO_INEXISTENTE}`, permitidos: [] as string[] },
];

const TODOS = ['aluno', 'supervisor', 'admin', 'secretaria'] as const;
const MUTANTES = new Set(['POST', 'PATCH', 'DELETE']);
const email = (papel: string) => `${papel}@conect2ai.com`;

describe('matriz de autorizacao', () => {
  for (const caso of CASOS) {
    for (const papel of TODOS) {
      const deveriaPassar = caso.permitidos.includes(papel);

      it(`${papel} ${deveriaPassar ? 'acessa' : 'e barrado em'} ${caso.metodo} ${caso.url}`,
        async () => {
          await semearDemonstracao();
          const cred = await entrar(email(papel));
          const mutante = MUTANTES.has(caso.metodo);

          const resp = await app.inject({
            method: caso.metodo,
            url: caso.url,
            cookies: { sessao: cred.sessao, csrf: cred.csrf },
            // Cabeçalho e corpo só nas mutações — o CSRF de dupla submissão só é
            // exigido em POST/PATCH/DELETE, e o corpo idem.
            ...(mutante
              ? { headers: { 'x-csrf-token': cred.csrf }, payload: await corpoValido(caso.url) }
              : {}),
          });

          if (deveriaPassar) {
            expect(resp.statusCode).toBeLessThan(400);
          } else {
            // Fora do escopo é 403 sem_permissao (usuário legítimo, cargo sem o
            // verbo). 404 também é aceito: a regra do projeto para "não pode ser
            // servido" é 404, e o preHandler o usa no estado impossível.
            expect([403, 404]).toContain(resp.statusCode);
          }
        });
    }
  }
});

/**
 * Corpos válidos montados a partir do que o seed criou. Ids inventados dariam
 * violação de chave estrangeira (500), o que mascararia a falha de autorização
 * que este teste quer medir. Só importa para o caso que DEVE passar (o rh); para
 * os barrados a requisição morre no preHandler, antes de olhar o corpo.
 */
async function corpoValido(url: string): Promise<Record<string, unknown>> {
  if (url === '/organograma') {
    return { nome: `Diretoria ${randomUUID().slice(0, 8)}`, tipo: 'diretoria', paiId: null };
  }
  if (url === '/auth/convites') {
    const [unidade] = await db.select({ id: unidades.id }).from(unidades).limit(1);
    const [cargo] = await db.select({ id: cargos.id }).from(cargos).limit(1);
    return {
      email: `convidado-${randomUUID()}@conect2ai.com`,
      nome: 'Convidado',
      unidadeId: unidade?.id ?? 1,
      cargoId: cargo?.id ?? randomUUID(),
    };
  }
  return {};
}
