-- В новых проектах Supabase таблицы в public не выдаются ролям Data API автоматически.
-- Доступ нужен только серверной роли (edge-функции). anon и authenticated остаются без прав.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
