import { rotasAuditoria } from './auditoria/rotas';
import { rotasAuth } from './auth/rotas';
import type { ManifestoModulo } from './modulos/tipos';
import { rotasOrganograma } from './organograma/rotas';

export const manifestoNucleo: ManifestoModulo = {
  nome: 'core',
  permissoes: [
    { chave: 'core.convite.administrar', descricao: 'Convidar colaboradores' },
    { chave: 'core.auditoria.ler', descricao: 'Consultar a trilha de auditoria' },
    { chave: 'core.unidade.ler', descricao: 'Ver o organograma' },
    { chave: 'core.unidade.administrar', descricao: 'Criar e mover unidades' },
    { chave: 'core.papel.administrar', descricao: 'Gerir papéis e permissões' },
    { chave: 'core.delegacao.administrar', descricao: 'Conceder delegações' },
  ],
  rotas: [...rotasAuth, ...rotasAuditoria, ...rotasOrganograma],
  menu: [
    { rotulo: 'Organograma', caminho: '/organograma', permissao: 'core.unidade.ler' },
    { rotulo: 'Auditoria', caminho: '/auditoria', permissao: 'core.auditoria.ler' },
  ],
};
