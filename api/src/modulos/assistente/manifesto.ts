import type { ManifestoModulo } from '../../core/modulos/tipos';
import { rotasAssistente } from './rotas-assistente';

/**
 * Módulo Assistente. O chat da home: conversa geral com o motor multi-provedor. Rotas
 * autenticadas sem permissão RBAC específica (o chat é pessoal, disponível a qualquer
 * usuário logado). Não tem item de menu — é a própria home, e a lista "Recentes" é UI
 * do front, não menu de permissão.
 */
export const manifestoAssistente: ManifestoModulo = {
  nome: 'assistente',
  permissoes: [],
  rotas: rotasAssistente,
  menu: [],
};
