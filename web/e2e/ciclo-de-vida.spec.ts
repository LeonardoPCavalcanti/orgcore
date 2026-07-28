import { expect, test } from '@playwright/test';

const SENHA = 'demonstracao 4med 2026';

test('analista entra, ve apenas o proprio escopo e perde acesso ao ser desligado', async ({ page, request }) => {
  await request.post('http://localhost:3333/testes/semear');

  await page.goto('/');
  await page.getByLabel('E-mail corporativo').fill('analista@4med.com');
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Ana Ribeiro')).toBeVisible();
  // Analista não tem core.auditoria.ler: o item não existe no menu.
  await expect(page.getByRole('link', { name: 'Auditoria' })).toHaveCount(0);

  await request.post('http://localhost:3333/testes/desligar', {
    data: { email: 'analista@4med.com' },
  });

  await page.reload();
  await expect(page.getByLabel('E-mail corporativo')).toBeVisible();
});

test('diretor enxerga a subarvore de marketing e nao a de comercial', async ({ page, request }) => {
  await request.post('http://localhost:3333/testes/semear');

  await page.goto('/');
  await page.getByLabel('E-mail corporativo').fill('diretor@4med.com');
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('link', { name: 'Organograma' }).click();
  await expect(page.getByText('Social Media')).toBeVisible();
  await expect(page.getByText('Vendas Internas')).toHaveCount(0);
});
