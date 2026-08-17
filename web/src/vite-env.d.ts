/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Liga o modo demonstração (dados de exemplo, sem backend). Definido no build do GitHub Pages. */
  readonly VITE_DEMO?: string;
  /** URL do backend em produção quando NÃO é demo. */
  readonly VITE_API_URL?: string;
}
