alter table anuncios add column entrada jsonb not null default '{}'::jsonb;
