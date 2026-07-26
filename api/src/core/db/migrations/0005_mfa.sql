create table codigos_recuperacao (
  id          uuid primary key,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  codigo_hash text not null,
  usado_em    timestamptz
);

create index idx_codigos_usuario on codigos_recuperacao (usuario_id);

-- Guarda o último passo de tempo TOTP (RFC 6238) aceito para o usuário, para
-- recusar reapresentação do mesmo código dentro da mesma janela de 30s.
alter table usuarios add column mfa_ultimo_passo bigint;
