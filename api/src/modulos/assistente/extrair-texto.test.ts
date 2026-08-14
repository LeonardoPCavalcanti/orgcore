import { describe, expect, it } from 'vitest';
import { bytesDeDataUri, extrairTexto, MAX_CHARS } from './extrair-texto';

const dataUri = (texto: string, mime = 'text/plain') =>
  `data:${mime};base64,${Buffer.from(texto, 'utf8').toString('base64')}`;

describe('extrairTexto', () => {
  it('decodifica data URI base64 em bytes', () => {
    expect(bytesDeDataUri(dataUri('olá')).toString('utf8')).toBe('olá');
  });

  it('extrai texto de .txt/.md/.csv', async () => {
    expect(await extrairTexto('nota.txt', dataUri('linha um\nlinha dois'))).toBe('linha um\nlinha dois');
    expect(await extrairTexto('dados.csv', dataUri('a,b\n1,2'))).toBe('a,b\n1,2');
  });

  it('normaliza espaços em excesso e quebras triplas', async () => {
    expect(await extrairTexto('x.txt', dataUri('a   \nb\n\n\n\nc'))).toBe('a\nb\n\nc');
  });

  it('trunca documentos muito grandes', async () => {
    const gigante = 'x'.repeat(MAX_CHARS + 500);
    const r = await extrairTexto('grande.txt', dataUri(gigante));
    expect(r.length).toBeLessThan(MAX_CHARS + 40);
    expect(r).toContain('documento truncado');
  });

  it('rejeita formato não suportado com 415', async () => {
    await expect(extrairTexto('virus.exe', dataUri('MZ'))).rejects.toMatchObject({
      status: 415, codigo: 'formato_nao_suportado',
    });
  });
});
