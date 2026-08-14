/** Lê um arquivo do input como data URI (base64), para enviar no JSON ou pré-visualizar. */
export function lerComoDataUri(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('falha ao ler arquivo'));
    leitor.readAsDataURL(arquivo);
  });
}
