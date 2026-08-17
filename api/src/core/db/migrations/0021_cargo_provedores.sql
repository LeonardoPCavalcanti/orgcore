-- Whitelist de provedores de IA por cargo. Sem linhas para um cargo = sem
-- restrição (todos os provedores). Com linhas = só os listados são permitidos.
-- provedor_id casa com os ids do catálogo em código (core/llm/catalogo.ts),
-- por isso sem FK para provedor.
create table cargo_provedores (
  cargo_id uuid not null references cargos(id) on delete cascade,
  provedor_id text not null,
  primary key (cargo_id, provedor_id)
);
