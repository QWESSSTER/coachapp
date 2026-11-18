import { createClient } from 'npm:@supabase/supabase-js@2';

// Клиент с service role: RLS закрывает таблицы от браузера, функции работают в обход.
export const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export class Fail extends Error {}

/** Выполняет запрос Supabase и бросает ошибку, если она есть. */
// deno-lint-ignore no-explicit-any
export async function q<T = any>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;

/** Подтягивает пользователей и анкеты спортсменов по id и возвращает карту id → человек. */
export async function people(ids: number[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<number, Person>();
  if (!uniq.length) return map;
  const users: Row[] = await q(db.from('users').select('id, username, first_name, last_name, photo_url').in('id', uniq));
  const aths: Row[] = await q(db.from('athletes').select('*').in('user_id', uniq));
  const am = new Map(aths.map((a) => [a.user_id, a]));
  for (const u of users) map.set(u.id, toPerson(u, am.get(u.id) ?? null));
  return map;
}

export type Person = {
  id: number;
  name: string;
  initials: string;
  isParent: boolean;
  parentName: string | null;
  username: string | null;
  phone: string | null;
  birth_date: string | null;
  about: string | null;
};

export function toPerson(u: Row, a: Row | null): Person {
  const tgName = [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : 'Без имени');
  const own = a ? [a.first_name, a.last_name].filter(Boolean).join(' ') : '';
  const name = own || tgName;
  const initials = name.split(/\s+/).map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  return {
    id: u.id,
    name,
    initials,
    isParent: a?.kind === 'parent',
    parentName: a?.kind === 'parent' ? tgName : null,
    username: u.username ?? null,
    phone: a?.phone ?? null,
    birth_date: a?.birth_date ?? null,
    about: a?.about ?? null,
  };
}
