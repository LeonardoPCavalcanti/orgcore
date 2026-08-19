-- Grade de pessoas de um slide (posts tipo "aprovados"): array de {dataUri, nome},
-- fotos idealmente já recortadas no cliente. jsonb para re-render fiel após edições.
alter table slides add column pessoas jsonb;
