import { createRequire } from 'node:module';
import { ErroHttp } from '../../core/erros';

// pdf-parse e mammoth são CommonJS sem export default detectável pelo ESM. `import`
// direto quebra no tsx cru (produção). createRequire carrega o CJS de verdade — funciona
// no tsx e no vitest — e o import é preguiçoso (só carrega a lib quando o formato aparece).
const requireCjs = createRequire(import.meta.url);
type PdfParser = { getText(): Promise<{ text: string }>; destroy(): Promise<void> };
type PDFParseCtor = new (o: { data: Buffer }) => PdfParser;
type Mammoth = { extractRawText(o: { buffer: Buffer }): Promise<{ value: string }> };

/** Normaliza o interop CJS/ESM: alguns módulos vêm embrulhados em `{ default }`. */
function carregar<T>(nome: string): T {
  const mod = requireCjs(nome) as T & { default?: T };
  return (mod.default ?? mod) as T;
}

/** Teto do texto extraído por documento — evita estourar o contexto do modelo. */
export const MAX_CHARS = 20_000;

const TEXTO_PURO = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'log', 'text']);

function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : '';
}

/** Decodifica o corpo de um data URI base64 (`data:...;base64,XXXX`) em bytes. */
export function bytesDeDataUri(dataUri: string): Buffer {
  const virgula = dataUri.indexOf(',');
  const base64 = virgula >= 0 ? dataUri.slice(virgula + 1) : dataUri;
  return Buffer.from(base64, 'base64');
}

function normalizar(texto: string): string {
  const limpo = texto
    .replace(/^-- \d+ of \d+ --$/gm, '') // separador de página do pdf-parse (ruído)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return limpo.length > MAX_CHARS ? `${limpo.slice(0, MAX_CHARS)}\n…(documento truncado)` : limpo;
}

/**
 * Extrai o texto de um documento anexado (PDF, .docx ou texto simples) para servir de
 * contexto ao modelo. Formatos não suportados viram 415. O texto é normalizado e limitado.
 */
export async function extrairTexto(nome: string, dataUri: string): Promise<string> {
  const ext = extensaoDe(nome);
  const buffer = bytesDeDataUri(dataUri);

  if (ext === 'pdf') {
    const mod = requireCjs('pdf-parse') as { PDFParse: PDFParseCtor };
    const parser = new mod.PDFParse({ data: buffer });
    try {
      const { text } = await parser.getText();
      return normalizar(text);
    } finally {
      await parser.destroy();
    }
  }
  if (ext === 'docx') {
    const mammoth = carregar<Mammoth>('mammoth');
    const { value } = await mammoth.extractRawText({ buffer });
    return normalizar(value);
  }
  if (TEXTO_PURO.has(ext)) {
    return normalizar(buffer.toString('utf8'));
  }
  throw new ErroHttp(415, 'formato_nao_suportado', `Formato de documento não suportado: .${ext || '?'}`);
}
