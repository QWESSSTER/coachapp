// Общие операции с данными для api, bot и cron.
import { db, q, people, Fail, type Row, type Person } from './db.ts';
import { send, appButton, esc, botUsername } from './telegram.ts';
import * as L from './logic.ts';

export const SERVICE_TITLE: Record<string, string> = { ice: 'Ледовая тренировка', ofp: 'Сухая тренировка (ОФП)', online: 'Онлайн-занятие' };
export const SERVICE_SHORT: Record<string, string> = { ice: 'Лёд', ofp: 'ОФП', online: 'Онлайн' };
export const TOPIC: Record<string, string> = { ice: 'лёд', ofp: 'ОФП' };

let rinkCache: Row[] | null = null;
export async function rinks(): Promise<Row[]> {
  if (!rinkCache) rinkCache = await q(db.from('rinks').select('*').order('sort'));
  return rinkCache!;
}
export async function rinkName(id: string): Promise<string> {
  return (await rinks()).find((r) => r.id === id)?.name ?? id;
}

export function inviteLink(code: string): string {
  return `https://t.me/${botUsername()}?start=c_${code}`;
}

export async function coachRow(id: number): Promise<Row> {
  const c = await q(db.from('coaches').select('*').eq('user_id', id).maybeSingle());
  if (!c) throw new Fail('Тренер не найден');
  return c;
}

export async function coachName(c: Row): Promise<string> {
  if (c.display_name) return c.display_name;
  const u: Row | null = await q(db.from('users').select('first_name, last_name').eq('id', c.user_id).maybeSingle());
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'Тренер';
}

export async function rinkCfg(coachId: number, rinkId: string): Promise<L.RinkCfg> {
  const r: Row | null = await q(db.from('coach_rinks').select('*').eq('coach_id', coachId).eq('rink_id', rinkId).maybeSingle());
  return { session_minutes: r?.session_minutes ?? 60, start_offset: r?.start_offset ?? 0 };
}

export async function availability(coachId: number): Promise<L.Avail[]> {
  return await q(db.from('availability').select('weekday, hour, rink_id').eq('coach_id', coachId));
}

export async function absences(coachId: number, fromDate?: string): Promise<Row[]> {
  let qq = db.from('absences').select('*').eq('coach_id', coachId).order('date_from');
  if (fromDate) qq = qq.gte('date_to', fromDate);
  return await q(qq);
}

/** Активные и прошедшие брони тренера в окне дат (по минскому времени). */
export async function coachBookings(coachId: number, fromDate: string, toDateExcl: string): Promise<Row[]> {
  return await q(db.from('bookings').select('*').eq('coach_id', coachId)
    .gte('starts_at', L.localToDate(fromDate, 0).toISOString())
    .lt('starts_at', L.localToDate(toDateExcl, 0).toISOString())
    .order('starts_at'));
}

export function weekStatus(confirmedWeeks: Set<string>, dateStr: string, now = new Date()) {
  const ws = L.weekStartOf(dateStr);
  const confirmed = confirmedWeeks.has(ws);
  const deadline = L.localToDate(ws, 12 * 60);
  return { weekStart: ws, confirmed, frozen: !confirmed && now > deadline };
}

export async function confirmedWeeks(coachId: number): Promise<Set<string>> {
  const rows: Row[] = await q(db.from('week_confirmations').select('week_start').eq('coach_id', coachId)
    .gte('week_start', L.addDays(L.todayStr(), -14)));
  return new Set(rows.map((r) => r.week_start));
}

/** Короткое описание брони: «чт, 19 ноября, 14:00 · Лёд · ТЦ «Замок»». */
export async function bookingLine(b: Row): Promise<string> {
  const place = b.service === 'online' ? `онлайн${b.topic ? ', ' + TOPIC[b.topic] : ''}` : `${SERVICE_SHORT[b.service]} · ${await rinkName(b.rink_id)}`;
  return `${L.whenLabel(b.starts_at)} · ${place}${b.format === 'group' ? ' · мини-группа' : ''}`;
}

export function personLine(p: Person | undefined): string {
  if (!p) return 'Спортсмен';
  const age = L.ageFrom(p.birth_date);
  return `${p.name}${age !== null ? ', ' + age + ' ' + L.plural(age, 'год', 'года', 'лет') : ''}${p.isParent ? ` (родитель: ${p.parentName})` : ''}`;
}

/** Отменяет бронь тренером и пишет спортсмену. */
export async function cancelByCoach(b: Row, reason: string, coachDisplay: string) {
  await q(db.from('bookings').update({ status: 'cancelled', cancelled_by: 'coach', cancel_reason: reason }).eq('id', b.id));
  await send(b.athlete_id,
    `<b>Занятие отменено тренером</b>\n${esc(await bookingLine(b))}\nТренер: ${esc(coachDisplay)}${reason ? `\nПричина: ${esc(reason)}` : ''}\n\nПриносим извинения — выберите, пожалуйста, другое время.`,
    [[appButton('Выбрать другое время', `/a/book?coach=${b.coach_id}`)]]);
}

/** Создаёт постоянные записи на неделю после её подтверждения тренером. */
export async function createRegularBookings(coachId: number, weekStart: string): Promise<number> {
  const regs: Row[] = await q(db.from('regulars').select('*').eq('coach_id', coachId).eq('active', true));
  if (!regs.length) return 0;
  const abs = await absences(coachId, weekStart);
  const existing = await coachBookings(coachId, weekStart, L.addDays(weekStart, 7));
  const active = existing.filter((b) => L.ACTIVE.includes(b.status));
  const coach = await coachRow(coachId);
  const name = await coachName(coach);
  let created = 0;
  for (const r of regs) {
    const date = L.addDays(weekStart, r.weekday);
    if (L.inAbsence(date, abs)) continue;
    const cfg = await rinkCfg(coachId, r.rink_id);
    const s = L.localToDate(date, r.minute_of_day), e = new Date(s.getTime() + cfg.session_minutes * 60_000);
    if (s < new Date()) continue;
    if (active.some((b) => b.regular_id === r.id || (new Date(b.starts_at) < e && new Date(b.ends_at) > s))) continue;
    const row = await q(db.from('bookings').insert({
      coach_id: coachId, athlete_id: r.athlete_id, rink_id: r.rink_id, service: r.service, format: 'solo',
      starts_at: s.toISOString(), ends_at: e.toISOString(), status: 'confirmed', regular_id: r.id,
      reminder_minutes: (await q(db.from('athletes').select('reminder_minutes').eq('user_id', r.athlete_id).maybeSingle()))?.reminder_minutes ?? 120,
    }).select().single());
    active.push(row);
    created++;
    await send(r.athlete_id, `<b>Постоянная запись на неделю</b>\n${esc(await bookingLine(row))}\nТренер: ${esc(name)}`,
      [[appButton('Мои записи', '/a/bookings')]]);
  }
  return created;
}

export async function linkAthlete(coach: Row, athleteId: number) {
  const exists = await q(db.from('coach_athletes').select('coach_id').eq('coach_id', coach.user_id).eq('athlete_id', athleteId).maybeSingle());
  await q(db.from('athletes').update({ current_coach_id: coach.user_id }).eq('user_id', athleteId));
  if (exists) return false;
  await q(db.from('coach_athletes').insert({ coach_id: coach.user_id, athlete_id: athleteId }));
  const p = (await people([athleteId])).get(athleteId);
  await send(coach.user_id, `<b>Новый спортсмен по вашей ссылке</b>\n${esc(personLine(p))}`,
    [[appButton('Открыть карточку', `/c/client?id=${athleteId}`)]]);
  return true;
}

export { L, Fail, db, q, people, send, appButton, esc };
export type { Row, Person };
