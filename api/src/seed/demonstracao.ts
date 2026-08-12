import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../core/db/client';
import { dataDeHoje } from '../core/db/fuso';
import {
  cargoPapeis, cargos, papeis, papelPermissoes, usuarios, vinculos,
} from '../core/db/schema/acesso';
import { criarUnidade } from '../core/organograma/servico';
import { gerarHash } from '../core/auth/senha';
import { limparBanco } from '../core/db/limpar';
import { sincronizarPermissoes } from '../core/modulos/registro';
import { manifestoNucleo } from '../core/manifesto';
import { manifestoConteudo } from '../modulos/conteudo/manifesto';
import { PERMISSAO_CRIAR as CONTEUDO_CRIAR } from '../modulos/conteudo/rotas';
import { geradorFake } from '../modulos/conteudo/gerador/fake';
import { criarCarrossel } from '../modulos/conteudo/servico';

const SENHA_DEMO = 'demonstracao 4med 2026';

/**
 * Organograma fictício para apresentação. Permite abrir duas sessões lado a
 * lado e mostrar que o analista não enxerga o que o diretor enxerga.
 * Nunca deve rodar em produção.
 */
export async function semearDemonstracao(): Promise<{
  acessos: { email: string; senha: string; cargo: string }[];
}> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed de demonstracao nao roda em producao');
  }

  // Idempotente: parte sempre de um banco limpo, então pode rodar quantas vezes quiser
  // durante a preparação da apresentação.
  await limparBanco();
  await sincronizarPermissoes([manifestoNucleo, manifestoConteudo]);

  const empresa = await criarUnidade({ nome: '4med', tipo: 'empresa', paiId: null });
  const marketing = await criarUnidade({ nome: 'Marketing', tipo: 'diretoria', paiId: empresa.id });
  const comercial = await criarUnidade({ nome: 'Comercial', tipo: 'diretoria', paiId: empresa.id });
  const social = await criarUnidade({ nome: 'Social Media', tipo: 'equipe', paiId: marketing.id });
  const conteudo = await criarUnidade({ nome: 'Conteúdo', tipo: 'equipe', paiId: marketing.id });

  const papelColaborador = { id: randomUUID(), nome: 'Colaborador', descricao: 'Acesso básico' };
  const papelGestor = { id: randomUUID(), nome: 'Gestor', descricao: 'Enxerga a própria subárvore' };
  const papelRh = { id: randomUUID(), nome: 'Gestão de Pessoas', descricao: 'Alcance global' };
  await db.insert(papeis).values([papelColaborador, papelGestor, papelRh]);

  await db.insert(papelPermissoes).values([
    { papelId: papelColaborador.id, permissaoChave: 'core.unidade.ler', alcance: 'proprio' },
    // Marketing/conteúdo cria os próprios carrosséis (escopo próprio: cada um vê só o que é seu).
    { papelId: papelColaborador.id, permissaoChave: CONTEUDO_CRIAR, alcance: 'proprio' },
    { papelId: papelGestor.id, permissaoChave: 'core.unidade.ler', alcance: 'subarvore' },
    { papelId: papelGestor.id, permissaoChave: 'core.auditoria.ler', alcance: 'subarvore' },
    { papelId: papelRh.id, permissaoChave: 'core.unidade.ler', alcance: 'global' },
    { papelId: papelRh.id, permissaoChave: 'core.unidade.administrar', alcance: 'global' },
    { papelId: papelRh.id, permissaoChave: 'core.convite.administrar', alcance: 'global' },
    { papelId: papelRh.id, permissaoChave: 'core.auditoria.ler', alcance: 'global' },
  ]);

  const cargoAnalista = { id: randomUUID(), nome: 'Analista de Marketing', nivel: 1 };
  const cargoCoordenador = { id: randomUUID(), nome: 'Coordenador de Conteúdo', nivel: 2 };
  const cargoDiretor = { id: randomUUID(), nome: 'Diretor de Marketing', nivel: 3 };
  const cargoRh = { id: randomUUID(), nome: 'Analista de RH', nivel: 2 };
  await db.insert(cargos).values([cargoAnalista, cargoCoordenador, cargoDiretor, cargoRh]);

  await db.insert(cargoPapeis).values([
    { cargoId: cargoAnalista.id, papelId: papelColaborador.id },
    { cargoId: cargoCoordenador.id, papelId: papelColaborador.id },
    { cargoId: cargoCoordenador.id, papelId: papelGestor.id },
    { cargoId: cargoDiretor.id, papelId: papelColaborador.id },
    { cargoId: cargoDiretor.id, papelId: papelGestor.id },
    { cargoId: cargoRh.id, papelId: papelRh.id },
  ]);

  const senhaHash = await gerarHash(SENHA_DEMO);
  const pessoas = [
    { email: 'analista@4med.com', nome: 'Ana Ribeiro', cargo: cargoAnalista, unidade: social },
    { email: 'coordenador@4med.com', nome: 'Caio Nunes', cargo: cargoCoordenador, unidade: conteudo },
    { email: 'diretor@4med.com', nome: 'Dario Alves', cargo: cargoDiretor, unidade: marketing },
    { email: 'rh@4med.com', nome: 'Rita Homem', cargo: cargoRh, unidade: empresa },
  ];

  // Início do vínculo no fuso da organização, não em UTC — senão, rodado à noite
  // no Brasil, o vínculo nasceria com data de amanhã e ninguém logaria com acesso.
  const hoje = dataDeHoje();
  for (const p of pessoas) {
    const id = randomUUID();
    await db.insert(usuarios).values({
      id, email: p.email, nome: p.nome, status: 'ativo', senhaHash,
    });
    await db.insert(vinculos).values({
      id: randomUUID(), usuarioId: id, unidadeId: p.unidade.id,
      cargoId: p.cargo.id, principal: true, inicio: hoje,
    });
  }

  // Unidade fora da subárvore do diretor, para evidenciar o limite do escopo.
  await criarUnidade({ nome: 'Vendas Internas', tipo: 'equipe', paiId: comercial.id });

  return {
    acessos: pessoas.map((p) => ({ email: p.email, senha: SENHA_DEMO, cargo: p.cargo.nome })),
  };
}

/**
 * Um carrossel de demonstração já pronto, para a tela de Conteúdo não abrir vazia
 * na apresentação. Usa o gerador FAKE de propósito: determinístico e sem rede,
 * então o seed é reprodutível mesmo sem chave de LLM. Fica FORA de
 * `semearDemonstracao` (chamado por toda a suíte de testes) porque compor os PNGs
 * custa alguns segundos — o CLI de seed a chama à parte, os testes não pagam por isso.
 */
export async function semearCarrosselDemo(): Promise<void> {
  const [analista] = await db.select({ id: usuarios.id }).from(usuarios)
    .where(eq(usuarios.email, 'analista@4med.com'));
  if (!analista) return;
  const [vinculo] = await db.select({ unidadeId: vinculos.unidadeId }).from(vinculos)
    .where(eq(vinculos.usuarioId, analista.id));
  if (!vinculo) return;

  await criarCarrossel({
    tema: 'Edge AI em veículos conectados',
    quantidadeSlides: 6,
    autorId: analista.id,
    unidadeId: vinculo.unidadeId,
    gerador: geradorFake,
  });
}
