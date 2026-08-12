-- Variante "tabela" do anúncio (candidatos aprovados): grupos com título, colunas e
-- linhas de pares (ex.: Doutorado/Mestrado · Orientando/Orientador). É texto puro e
-- estruturado, então cabe num jsonb na própria linha do anúncio — não vale uma tabela
-- só para isso. Default '[]' preserva os anúncios já existentes (grade de pessoas).

alter table anuncios add column grupos jsonb not null default '[]';
