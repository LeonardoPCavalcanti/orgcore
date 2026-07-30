import { rotasAuditoria } from './auditoria/rotas';
import { rotasAuth } from './auth/rotas';
import type { ManifestoModulo } from './modulos/tipos';
import { rotasOrganograma } from './organograma/rotas';
import { rotasDelegacao } from './rbac/rotas-delegacao';
import { rotasTeste } from './testes/rotas';

export const manifestoNucleo: ManifestoModulo = {
  nome: 'core',
  permissoes: [
    { chave: 'core.convite.administrar', descricao: 'Convidar colaboradores' },
    // Marcada sensivel de proposito: quem le a trilha de auditoria tambem entra
    // na trilha (auditar quem audita), via o caminho generico do preHandler em
    // core/app.ts.
    { chave: 'core.auditoria.ler', descricao: 'Consultar a trilha de auditoria', sensivel: true },
    { chave: 'core.unidade.ler', descricao: 'Ver o organograma' },
    { chave: 'core.unidade.administrar', descricao: 'Criar e mover unidades' },
    // Autoriza emprestar o PRÓPRIO escopo, e só ele — ver `criarDelegacao`,
    // em rbac/delegacoes.ts, sobre por que não existe delegar o de outra pessoa.
    { chave: 'core.delegacao.criar', descricao: 'Delegar o próprio escopo temporariamente' },
    { chave: 'core.delegacao.administrar', descricao: 'Revogar delegações de terceiros' },
  ],
  // As rotas de teste (`/testes/*`) só existem fora de produção: em produção o
  // ternário devolve `[]` e elas não são registradas. Ver core/testes/rotas.ts.
  rotas: [
    ...rotasAuth, ...rotasAuditoria, ...rotasOrganograma, ...rotasDelegacao,
    ...(process.env.NODE_ENV === 'production' ? [] : rotasTeste),
  ],
  menu: [
    { rotulo: 'Organograma', caminho: '/organograma', permissao: 'core.unidade.ler' },
    { rotulo: 'Unidades', caminho: '/unidades', permissao: 'core.unidade.administrar' },
    { rotulo: 'Convidar', caminho: '/convidar', permissao: 'core.convite.administrar' },
    { rotulo: 'Auditoria', caminho: '/auditoria', permissao: 'core.auditoria.ler' },
    { rotulo: 'Delegações', caminho: '/delegacoes', permissao: 'core.delegacao.criar' },
    { rotulo: 'Minha conta', caminho: '/minha-conta', permissao: 'core.unidade.ler' },
  ],
};
