-- Consumo real de tokens por provedor/dia (antes só contávamos requisições).
alter table provedor_uso add column tokens_usados integer not null default 0;
