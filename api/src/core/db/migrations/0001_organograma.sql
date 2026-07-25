create type tipo_unidade as enum ('empresa', 'diretoria', 'departamento', 'equipe');

create table unidades (
  id      bigint generated always as identity primary key,
  pai_id  bigint references unidades(id),
  nome    text not null,
  tipo    tipo_unidade not null,
  caminho text not null default '',
  ativo   boolean not null default true,
  criado_em timestamptz not null default now()
);

create index idx_unidades_caminho on unidades (caminho text_pattern_ops);
create index idx_unidades_pai on unidades (pai_id);

-- Monta o caminho da própria linha a partir do caminho do pai.
create function atualizar_caminho_unidade() returns trigger as $$
declare
  caminho_pai text;
begin
  if new.pai_id is null then
    new.caminho := '/' || new.id || '/';
  else
    select caminho into caminho_pai from unidades where id = new.pai_id;
    if caminho_pai is null then
      raise exception 'unidade pai % nao encontrada', new.pai_id;
    end if;
    if caminho_pai like '%/' || new.id || '/%' then
      raise exception 'ciclo detectado no organograma';
    end if;
    new.caminho := caminho_pai || new.id || '/';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_caminho_unidade
  before insert or update of pai_id on unidades
  for each row execute function atualizar_caminho_unidade();

-- Dispara quando pai_id muda (o trigger BEFORE ja recalculou new.caminho a partir do
-- novo pai). Reescreve o caminho de toda a descendencia num unico UPDATE, localizando as
-- linhas pelo prefixo antigo. Esse UPDATE altera somente a coluna caminho, nunca pai_id,
-- entao ele nao pode reacionar este mesmo trigger (que so ouve "update of pai_id") —
-- nao ha recursao para proteger aqui.
create function propagar_caminho_unidade() returns trigger as $$
begin
  if new.caminho is distinct from old.caminho then
    update unidades
       set caminho = new.caminho || substring(caminho from length(old.caminho) + 1)
     where caminho like old.caminho || '_%'
       and id <> new.id;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger trg_propagar_caminho
  after update of pai_id on unidades
  for each row execute function propagar_caminho_unidade();
