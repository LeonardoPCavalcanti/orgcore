import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/core/db/client';
import {
  cargoPapeis, cargos, papeis, papelPermissoes, permissoes, usuarios, vinculos,
} from '../../src/core/db/schema/acesso';
import { criarUnidade } from '../../src/core/organograma/servico';

export async function criarCenarioAcesso() {
  const empresa = await criarUnidade({ nome: '4med', tipo: 'empresa', paiId: null });
  const marketing = await criarUnidade({ nome: 'Marketing', tipo: 'diretoria', paiId: empresa.id });
  const vendas = await criarUnidade({ nome: 'Vendas', tipo: 'diretoria', paiId: empresa.id });
  const equipeSocial = await criarUnidade({ nome: 'Social', tipo: 'equipe', paiId: marketing.id });

  await db.insert(permissoes).values([
    { chave: 'pessoas.colaborador.ler', modulo: 'pessoas', descricao: 'Ler colaboradores' },
  ]);

  const papelBasico = { id: randomUUID(), nome: 'Colaborador', descricao: '' };
  const papelGestor = { id: randomUUID(), nome: 'Gestor', descricao: '' };
  await db.insert(papeis).values([papelBasico, papelGestor]);
  await db.insert(papelPermissoes).values([
    { papelId: papelBasico.id, permissaoChave: 'pessoas.colaborador.ler', alcance: 'proprio' },
    { papelId: papelGestor.id, permissaoChave: 'pessoas.colaborador.ler', alcance: 'subarvore' },
  ]);

  const cargoAnalista = { id: randomUUID(), nome: 'Analista', nivel: 1 };
  const cargoDiretor = { id: randomUUID(), nome: 'Diretor', nivel: 3 };
  await db.insert(cargos).values([cargoAnalista, cargoDiretor]);
  await db.insert(cargoPapeis).values([
    { cargoId: cargoAnalista.id, papelId: papelBasico.id },
    { cargoId: cargoDiretor.id, papelId: papelBasico.id },
    { cargoId: cargoDiretor.id, papelId: papelGestor.id },
  ]);

  const analista = { id: randomUUID(), email: 'analista@4med.com', nome: 'Ana', status: 'ativo' as const };
  const diretor = { id: randomUUID(), email: 'diretor@4med.com', nome: 'Dario', status: 'ativo' as const };
  await db.insert(usuarios).values([analista, diretor]);

  const hoje = new Date().toISOString().slice(0, 10);
  await db.insert(vinculos).values([
    { id: randomUUID(), usuarioId: analista.id, unidadeId: equipeSocial.id, cargoId: cargoAnalista.id, principal: true, inicio: hoje },
    { id: randomUUID(), usuarioId: diretor.id, unidadeId: marketing.id, cargoId: cargoDiretor.id, principal: true, inicio: hoje },
  ]);

  return {
    empresa, marketing, vendas, equipeSocial,
    analista, diretor,
    cargoAnalista, cargoDiretor,
    async encerrarVinculo(usuarioId: string) {
      await db.update(vinculos)
        .set({ fim: '2020-01-01' })
        .where(eq(vinculos.usuarioId, usuarioId));
    },
  };
}
