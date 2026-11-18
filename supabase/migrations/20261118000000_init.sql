-- Rink CRM: базовая схема.
-- Все таблицы закрыты RLS без политик: читать и писать может только service role
-- (edge-функции). Мини-приложение ходит в базу только через функцию api,
-- которая проверяет подпись Telegram.

create extension if not exists pgcrypto;

-- Справочник мест ---------------------------------------------------------
create table public.rinks (
  id        text primary key,
  name      text not null,
  short     text not null,
  color     text not null,
  is_online boolean not null default false,
  sort      int not null default 0
);

insert into public.rinks (id, name, short, color, is_online, sort) values
  ('zamok',   'ТЦ «Замок»',    'Замок',      '#0A6CFF', false, 1),
  ('sdushor', 'СДЮШОР',        'СДЮШОР',     '#F08300', false, 2),
  ('arena',   'Минская арена', 'Мин. арена', '#8E44EC', false, 3),
  ('online',  'Онлайн',        'Онлайн',     '#28A745', true,  4);

-- Пользователи -------------------------------------------------------------
create table public.users (
  id                 bigint primary key,            -- Telegram user id
  username           text,
  first_name         text,
  last_name          text,
  photo_url          text,
  role               text check (role in ('athlete', 'coach')),
  consent_at         timestamptz,
  pending_coach_code text,                          -- код тренера из ссылки, пока человек не зарегистрировался
  ics_token          text not null default encode(gen_random_bytes(12), 'hex'),
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz
);

-- Спортсмен или родитель. Для родителя поля описывают ребёнка.
create table public.athletes (
  user_id          bigint primary key references public.users(id) on delete cascade,
  kind             text not null default 'self' check (kind in ('self', 'parent')),
  first_name       text,
  last_name        text,
  birth_date       date,
  phone            text,
  about            text,
  reminder_minutes int default 120 check (reminder_minutes is null or reminder_minutes between 1 and 2880),
  current_coach_id bigint
);

create table public.coaches (
  user_id           bigint primary key references public.users(id) on delete cascade,
  display_name      text,
  specialization    text,
  about             text,
  experience        text,
  price_ice         numeric(10, 2),
  price_ofp         numeric(10, 2),
  price_online      numeric(10, 2),
  groups_enabled    boolean not null default false,
  confirm_mode      text not null default 'new' check (confirm_mode in ('all', 'new', 'auto')),
  free_cancel_hours int not null default 24 check (free_cancel_hours between 0 and 168),
  min_book_hours    int not null default 3 check (min_book_hours between 0 and 168),
  digest            boolean not null default true,
  invite_code       text not null unique default substr(md5(random()::text), 1, 8)
);

create table public.coach_reminders (
  id       bigserial primary key,
  coach_id bigint not null references public.coaches(user_id) on delete cascade,
  minutes  int not null check (minutes between 1 and 2880)
);

-- Сетка сеансов тренера на каждом месте
create table public.coach_rinks (
  coach_id        bigint not null references public.coaches(user_id) on delete cascade,
  rink_id         text not null references public.rinks(id),
  session_minutes int not null default 60 check (session_minutes between 15 and 180),
  start_offset    int not null default 0 check (start_offset in (0, 15, 30, 45)),
  primary key (coach_id, rink_id)
);

-- Недельный шаблон: в какой час и где тренер доступен. weekday: 0 = пн … 6 = вс
create table public.availability (
  coach_id bigint not null references public.coaches(user_id) on delete cascade,
  weekday  smallint not null check (weekday between 0 and 6),
  hour     smallint not null check (hour between 0 and 23),
  rink_id  text not null references public.rinks(id),
  primary key (coach_id, weekday, hour, rink_id)
);

create table public.coach_athletes (
  coach_id             bigint not null references public.coaches(user_id) on delete cascade,
  athlete_id           bigint not null references public.athletes(user_id) on delete cascade,
  created_at           timestamptz not null default now(),
  warned_at            timestamptz,
  blocked              boolean not null default false,
  regular_declines     int not null default 0,
  regular_snooze_until timestamptz,
  primary key (coach_id, athlete_id)
);

create table public.regulars (
  id            bigserial primary key,
  coach_id      bigint not null,
  athlete_id    bigint not null,
  weekday       smallint not null check (weekday between 0 and 6),
  minute_of_day int not null check (minute_of_day between 0 and 1439),
  rink_id       text not null references public.rinks(id),
  service       text not null check (service in ('ice', 'ofp', 'online')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  foreign key (coach_id, athlete_id) references public.coach_athletes (coach_id, athlete_id) on delete cascade
);

create table public.bookings (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             bigint not null references public.coaches(user_id) on delete cascade,
  athlete_id           bigint not null references public.athletes(user_id) on delete cascade,
  rink_id              text not null references public.rinks(id),
  service              text not null check (service in ('ice', 'ofp', 'online')),
  topic                text check (topic in ('ice', 'ofp')),
  format               text not null default 'solo' check (format in ('solo', 'group')),
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  status               text not null default 'pending'
                       check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'done', 'noshow')),
  cancelled_by         text check (cancelled_by in ('athlete', 'coach')),
  cancel_reason        text,
  late_cancel          boolean not null default false,
  athlete_confirmed_at timestamptz,
  reminder_minutes     int,
  comment              text,
  regular_id           bigint references public.regulars(id) on delete set null,
  created_at           timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index bookings_coach_time on public.bookings (coach_id, starts_at);
create index bookings_athlete_time on public.bookings (athlete_id, starts_at);
create index bookings_status_time on public.bookings (status, starts_at);

create table public.week_confirmations (
  coach_id     bigint not null references public.coaches(user_id) on delete cascade,
  week_start   date not null,
  confirmed_at timestamptz not null default now(),
  primary key (coach_id, week_start)
);

create table public.absences (
  id              bigserial primary key,
  coach_id        bigint not null references public.coaches(user_id) on delete cascade,
  kind            text not null check (kind in ('vacation', 'sick')),
  date_from       date not null,
  date_to         date not null,
  cancel_existing boolean not null default true,
  created_at      timestamptz not null default now(),
  check (date_to >= date_from)
);

create table public.elements (
  id         bigserial primary key,
  coach_id   bigint not null,
  athlete_id bigint not null,
  name       text not null,
  stage      smallint not null default 0 check (stage between 0 and 2),
  sort       int not null default 0,
  updated_at timestamptz not null default now(),
  foreign key (coach_id, athlete_id) references public.coach_athletes (coach_id, athlete_id) on delete cascade
);

create table public.notes (
  id         bigserial primary key,
  coach_id   bigint not null,
  athlete_id bigint not null,
  text       text not null,
  created_at timestamptz not null default now(),
  foreign key (coach_id, athlete_id) references public.coach_athletes (coach_id, athlete_id) on delete cascade
);

create table public.broadcasts (
  id         bigserial primary key,
  coach_id   bigint not null references public.coaches(user_id) on delete cascade,
  text       text not null,
  button     text check (button in ('book', 'ok')),
  sent_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Защита от повторной отправки уведомлений кроном
create table public.sent_log (
  key     text primary key,
  sent_at timestamptz not null default now()
);

-- RLS: включаем везде и не создаём политик — прямой доступ из браузера закрыт.
do $$
declare t text;
begin
  foreach t in array array['rinks','users','athletes','coaches','coach_reminders','coach_rinks','availability',
    'coach_athletes','regulars','bookings','week_confirmations','absences','elements','notes','broadcasts','sent_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
