-- Sistema visual de templates do carrossel. `estilo` guarda a escolha de
-- apresentação (editorial|minimalista|bold); `corpo`/`destaque` são o conteúdo
-- mais rico por slide (opcional), persistidos para re-render em outro estilo.
alter table carrosseis add column estilo text not null default 'editorial';
alter table slides add column corpo text;
alter table slides add column destaque text;
