import { planoCarrossel } from '@4med/contracts';
import { describe, expect, it } from 'vitest';
import { geradorFake } from './fake';

describe('geradorFake', () => {
  it('monta 1 capa + (n-2) conteudo + 1 cta', async () => {
    const plano = await geradorFake.gerar('Edge AI em veiculos', 5);
    expect(plano.slides.map((s) => s.tipo)).toEqual(['capa', 'conteudo', 'conteudo', 'conteudo', 'cta']);
  });

  it('respeita a borda n=3 (1 capa + 1 conteudo + 1 cta)', async () => {
    const plano = await geradorFake.gerar('sensores', 3);
    expect(plano.slides.map((s) => s.tipo)).toEqual(['capa', 'conteudo', 'cta']);
  });

  it('e deterministico: duas chamadas iguais devolvem o mesmo plano', async () => {
    const a = await geradorFake.gerar('telemetria', 7);
    const b = await geradorFake.gerar('telemetria', 7);
    expect(a).toEqual(b);
  });

  it('devolve um plano que satisfaz o contrato planoCarrossel', async () => {
    const plano = await geradorFake.gerar('modelos embarcados', 6);
    expect(() => planoCarrossel.parse(plano)).not.toThrow();
  });

  it('usa o tema na capa e deriva hashtags dele', async () => {
    const plano = await geradorFake.gerar('Visao computacional', 4);
    expect(plano.slides[0]).toMatchObject({ tipo: 'capa', titulo: 'Visao computacional' });
    expect(plano.hashtags).toContain('#conect2ai');
    expect(plano.hashtags).toContain('#visao');
  });
});
