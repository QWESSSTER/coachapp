-- Запускается один раз вручную в Supabase → SQL Editor (см. README, шаг 4).
-- Замените PROJECT_REF и CRON_SECRET на свои значения перед запуском.
-- Каждые 5 минут база вызывает функцию cron: напоминания, утренняя сводка,
-- запрос подтверждения недели (вс 18:00) и заморозка (пн 12:00).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('rink-crm-tick')
where exists (select 1 from cron.job where jobname = 'rink-crm-tick');

select cron.schedule(
  'rink-crm-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://PROJECT_REF.supabase.co/functions/v1/cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'CRON_SECRET'),
    body    := '{}'::jsonb
  );
  $$
);
