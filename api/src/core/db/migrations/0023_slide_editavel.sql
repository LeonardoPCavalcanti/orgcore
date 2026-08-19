-- Persistir o suficiente para RE-RENDERIZAR um slide após edição de texto sem
-- perder a arte: os logos de parceiros (por carrossel) e a foto tratada + flag
-- de recorte (por slide). Antes só o PNG final era guardado.
alter table carrosseis add column logos text[];
alter table slides add column foto text;
alter table slides add column foto_recortada boolean not null default false;
