-- Anexos de documento no chat: nomes exibidos na bolha (documentos) e o texto extraído
-- que serve de contexto ao modelo, sem ser mostrado na conversa (contexto).
alter table ia_mensagens add column documentos jsonb not null default '[]'::jsonb;
alter table ia_mensagens add column contexto text;
