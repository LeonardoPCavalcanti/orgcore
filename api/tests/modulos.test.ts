import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { sincronizarPermissoes, validarManifestos } from '../src/core/modulos/registro';
import type { ManifestoModulo } from '../src/core/modulos/tipos';
import { db } from '../src/core/db/client';
import { papeis, papelPermissoes, permissoes } from '../src/core/db/schema/acesso';

beforeAll(prepararBanco);
beforeEach(limparBanco);

const base = (over: Partial<ManifestoModulo> = {}): ManifestoModulo => ({
  nome: 'pessoas',
  permissoes: [{ chave: 'pessoas.colaborador.ler', descricao: 'Ler' }],
  rotas: [],
  menu: [],
  ...over,
});

describe('validarManifestos', () => {
  it('aceita manifesto coerente', () => {
    expect(() => validarManifestos([base()])).not.toThrow();
  });

  it('recusa chave de permissao duplicada entre modulos', () => {
    const outro = base({ nome: 'tarefas' });
    expect(() => validarManifestos([base(), outro])).toThrow(/duplicada/i);
  });

  it('recusa rota sem permissao declarada', () => {
    const m = base({
      rotas: [{ metodo: 'GET', caminho: '/colaboradores', permissao: null, handler: async () => ({}) }],
    });
    expect(() => validarManifestos([m])).toThrow(/sem permissao/i);
  });

  it('aceita rota publica explicitamente marcada', () => {
    const m = base({
      rotas: [{ metodo: 'POST', caminho: '/login', permissao: null, publica: true, handler: async () => ({}) }],
    });
    expect(() => validarManifestos([m])).not.toThrow();
  });

  it('aceita rota autenticada sem permissao especifica', () => {
    const m = base({
      rotas: [{ metodo: 'GET', caminho: '/eu', permissao: null, autenticada: true, handler: async () => ({}) }],
    });
    expect(() => validarManifestos([m])).not.toThrow();
  });

  it('recusa rota marcada como publica e autenticada', () => {
    const m = base({
      rotas: [{
        metodo: 'GET', caminho: '/eu', permissao: null,
        publica: true, autenticada: true, handler: async () => ({}),
      }],
    });
    expect(() => validarManifestos([m])).toThrow(/ao mesmo tempo/i);
  });

  it('recusa rota que referencia permissao inexistente', () => {
    const m = base({
      rotas: [{ metodo: 'GET', caminho: '/x', permissao: 'pessoas.inexistente.ler', handler: async () => ({}) }],
    });
    expect(() => validarManifestos([m])).toThrow(/nao declarada/i);
  });

  it('recusa chave fora do padrao modulo.recurso.acao', () => {
    const m = base({ permissoes: [{ chave: 'pessoas.ler', descricao: '' }] });
    expect(() => validarManifestos([m])).toThrow();
  });

  it('recusa permissao cujo prefixo nao e o nome do modulo', () => {
    const m = base({ nome: 'tarefas' });
    expect(() => validarManifestos([m])).toThrow(/prefixo/i);
  });
});

describe('sincronizarPermissoes', () => {
  it('grava o catalogo no banco', async () => {
    await sincronizarPermissoes([base()]);
    const linhas = await db.select().from(permissoes);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.modulo).toBe('pessoas');
  });

  it('desativa (sem apagar) permissao que deixou de existir no manifesto', async () => {
    await sincronizarPermissoes([base()]);
    await sincronizarPermissoes([base({ permissoes: [] })]);
    const linhas = await db.select().from(permissoes);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.ativo).toBe(false);
  });

  it('preserva a concessao em papel_permissoes quando a permissao e desativada', async () => {
    await sincronizarPermissoes([base()]);

    const papel = { id: randomUUID(), nome: 'Colaborador', descricao: '' };
    await db.insert(papeis).values(papel);
    await db.insert(papelPermissoes).values({
      papelId: papel.id, permissaoChave: 'pessoas.colaborador.ler', alcance: 'proprio',
    });

    await sincronizarPermissoes([base({ permissoes: [] })]);

    const concessoes = await db.select().from(papelPermissoes)
      .where(eq(papelPermissoes.papelId, papel.id));
    expect(concessoes).toHaveLength(1);
    expect(concessoes[0]?.permissaoChave).toBe('pessoas.colaborador.ler');
  });

  it('reativa permissao que volta ao manifesto, preservando a concessao original', async () => {
    await sincronizarPermissoes([base()]);

    const papel = { id: randomUUID(), nome: 'Colaborador', descricao: '' };
    await db.insert(papeis).values(papel);
    await db.insert(papelPermissoes).values({
      papelId: papel.id, permissaoChave: 'pessoas.colaborador.ler', alcance: 'subarvore',
    });

    await sincronizarPermissoes([base({ permissoes: [] })]);
    await sincronizarPermissoes([base()]);

    const linhas = await db.select().from(permissoes);
    expect(linhas[0]?.ativo).toBe(true);

    const concessoes = await db.select().from(papelPermissoes).where(and(
      eq(papelPermissoes.papelId, papel.id),
      eq(papelPermissoes.permissaoChave, 'pessoas.colaborador.ler'),
    ));
    expect(concessoes).toHaveLength(1);
    expect(concessoes[0]?.alcance).toBe('subarvore');
  });
});
