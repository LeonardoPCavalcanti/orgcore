import { expect, test } from '@playwright/test';

const SENHA = 'demonstracao conect2ai 2026';

test('analista entra, ve apenas o proprio escopo e perde acesso ao ser desligado', async ({ page, request }) => {
  await request.post('http://localhost:3333/testes/semear');

  await page.goto('/');
  await page.getByLabel('E-mail corporativo').fill('aluno@conect2ai.com');
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Aluno')).toBeVisible();
  // Analista não tem core.auditoria.ler: o item não existe no menu.
  await expect(page.getByRole('link', { name: 'Auditoria' })).toHaveCount(0);

  await request.post('http://localhost:3333/testes/desligar', {
    data: { email: 'aluno@conect2ai.com' },
  });

  await page.reload();
  await expect(page.getByLabel('E-mail corporativo')).toBeVisible();
});

test('o botao Sair encerra a sessao no servidor, nao so na tela', async ({ page, request }) => {
  await request.post('http://localhost:3333/testes/semear');

  await page.goto('/');
  await page.getByLabel('E-mail corporativo').fill('supervisor@conect2ai.com');
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Supervisor')).toBeVisible();

  // Sair é um POST /auth/sair — mutação protegida por CSRF de dupla submissão. Se
  // o front não ecoar o cookie `csrf` no cabeçalho, o servidor recusa com 403, a
  // tela volta pro login mesmo assim, mas a sessão continua VIVA no backend. O
  // reload abaixo é o que separa "saiu de verdade" de "só limpou a tela": recarregar
  // reautentica por /auth/eu; se a sessão sobrevivesse, o app apareceria de novo.
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByLabel('E-mail corporativo')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('E-mail corporativo')).toBeVisible();
  await expect(page.getByText('Supervisor')).toHaveCount(0);
});

test('diretor enxerga a subarvore de marketing e nao a de comercial', async ({ page, request }) => {
  await request.post('http://localhost:3333/testes/semear');

  await page.goto('/');
  await page.getByLabel('E-mail corporativo').fill('admin@conect2ai.com');
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('link', { name: 'Organograma' }).click();
  await expect(page.getByText('Social Media')).toBeVisible();
  await expect(page.getByText('Vendas Internas')).toHaveCount(0);
});
