// Вызывается базой каждые 5 минут (см. supabase/cron.sql).
// Напоминания, утренняя сводка, запрос подтверждения недели, заморозка, автозакрытие прошедших занятий.
import { db, q, people, send, appButton, esc, L, type Row, bookingLine, personLine } from '../_shared/domain.ts';

const SECRET = Deno.env.get('CRON_SECRET') ?? '';

/** true, если ключ ещё не встречался (и сразу помечает его отправленным). */
async function once(key: string): Promise<boolean> {
  const { error } = await db.from('sent_log').insert({ key });
  return !error;
}

async function run() {
  const now = new Date();
  const nowIso = now.toISOString();
  const lp = L.localParts(now);
  const in48 = new Date(now.getTime() + 48 * 3600_000).toISOString();
  const soon: Row[] = await q(db.from('bookings').select('*').in('status', ['confirmed']).gt('starts_at', nowIso).lt('starts_at', in48));
  const ppl = await people(soon.map((b) => b.athlete_id));
  const stats = { confirm24: 0, athleteRem: 0, coachRem: 0, done: 0, digest: 0, week: 0, frozen: 0 };

  // 1. Подтверждение за 24 часа
  for (const b of soon) {
    const left = new Date(b.starts_at).getTime() - now.getTime();
    const leadTime = new Date(b.starts_at).getTime() - new Date(b.created_at).getTime();
    if (left <= 24 * 3600_000 && !b.athlete_confirmed_at && leadTime > 3 * 3600_000 && await once(`c24:${b.id}`)) {
      await send(b.athlete_id, `<b>Напоминание: занятие ${left > 12 * 3600_000 ? 'завтра' : 'сегодня'}</b>\n${esc(await bookingLine(b))}\nПодтвердите, пожалуйста, что придёте.`, [
        [{ text: 'Приду', callback_data: `att:${b.id}:yes` }, { text: 'Не смогу', callback_data: `att:${b.id}:no` }],
        [appButton('Перенести', `/a/book?coach=${b.coach_id}`)],
      ]);
      stats.confirm24++;
    }
  }

  // 2. Напоминание спортсмену (время выбирает сам спортсмен)
  for (const b of soon) {
    if (!b.reminder_minutes) continue;
    const left = new Date(b.starts_at).getTime() - now.getTime();
    if (left <= b.reminder_minutes * 60_000 && await once(`r:${b.id}`)) {
      await send(b.athlete_id, `<b>Скоро занятие</b> — в ${L.timeOf(b.starts_at)}\n${esc(await bookingLine(b))}`);
      stats.athleteRem++;
    }
  }

  // 3. Напоминания тренеру
  const coachIds = [...new Set(soon.map((b) => b.coach_id))];
  if (coachIds.length) {
    const rems: Row[] = await q(db.from('coach_reminders').select('*').in('coach_id', coachIds));
    for (const b of soon) {
      const left = new Date(b.starts_at).getTime() - now.getTime();
      for (const r of rems.filter((x) => x.coach_id === b.coach_id)) {
        if (left <= r.minutes * 60_000 && await once(`cr:${b.id}:${r.minutes}`)) {
          await send(b.coach_id, `<b>${L.reminderLabel(r.minutes).replace('за ', 'Через ')}</b>\n${esc(personLine(ppl.get(b.athlete_id)))}\n${esc(await bookingLine(b))}`);
          stats.coachRem++;
        }
      }
    }
  }

  // 4. Прошедшие подтверждённые занятия считаются состоявшимися (тренер может поменять на «не пришёл»)
  const doneRows: Row[] = await q(db.from('bookings').update({ status: 'done' }).eq('status', 'confirmed')
    .lt('ends_at', new Date(now.getTime() - 30 * 60_000).toISOString()).select('id'));
  stats.done = doneRows.length;

  const coaches: Row[] = await q(db.from('coaches').select('*'));
  const withHours: Row[] = await q(db.from('availability').select('coach_id'));
  const hasHours = new Set(withHours.map((r) => r.coach_id));

  // 5. Утренняя сводка в 08:00
  if (lp.hh >= 8 && lp.hh < 11) {
    for (const c of coaches.filter((c) => c.digest)) {
      const day: Row[] = await q(db.from('bookings').select('*').eq('coach_id', c.user_id).in('status', ['pending', 'confirmed'])
        .gte('starts_at', L.localToDate(lp.dateStr, 0).toISOString()).lt('starts_at', L.localToDate(L.addDays(lp.dateStr, 1), 0).toISOString()).order('starts_at'));
      if (!day.length || !(await once(`dg:${c.user_id}:${lp.dateStr}`))) continue;
      const pp = await people(day.map((b) => b.athlete_id));
      const lines = await Promise.all(day.map(async (b) => `${L.timeOf(b.starts_at)} — ${esc(pp.get(b.athlete_id)?.name ?? '')}, ${esc((await bookingLine(b)).split(' · ').slice(1).join(' · '))}${b.status === 'pending' ? ' (ждёт подтверждения)' : ''}`));
      await send(c.user_id, `<b>Расписание на сегодня</b>\n${lines.join('\n')}`, [[appButton('Открыть CRM', '/c/today')]]);
      stats.digest++;
    }
  }

  // 6. Воскресенье с 18:00 — подтвердите следующую неделю
  if (lp.weekday === 6 && lp.hh >= 18) {
    const ws = L.addDays(L.weekStartOf(lp.dateStr), 7);
    const done: Row[] = await q(db.from('week_confirmations').select('coach_id').eq('week_start', ws));
    const ok = new Set(done.map((r) => r.coach_id));
    for (const c of coaches) {
      if (!hasHours.has(c.user_id) || ok.has(c.user_id) || !(await once(`wk:${c.user_id}:${ws}`))) continue;
      await send(c.user_id, `<b>Подтвердите расписание на ${L.dateLabel(ws)} – ${L.dateLabel(L.addDays(ws, 6))}</b>\nДо понедельника, 12:00. Без подтверждения записи на неделю будут заморожены, а спортсмены увидят, что возможны изменения.`, [
        [{ text: 'Всё верно, подтверждаю', callback_data: `wk:${ws}` }],
        [appButton('Проверить расписание', `/c/week?ws=${ws}`)],
      ]);
      stats.week++;
    }
  }

  // 7. Понедельник с 12:00 — неделя не подтверждена, записи заморожены
  if (lp.weekday === 0 && lp.hh >= 12) {
    const ws = L.weekStartOf(lp.dateStr);
    const done: Row[] = await q(db.from('week_confirmations').select('coach_id').eq('week_start', ws));
    const ok = new Set(done.map((r) => r.coach_id));
    for (const c of coaches) {
      if (!hasHours.has(c.user_id) || ok.has(c.user_id) || !(await once(`fz:${c.user_id}:${ws}`))) continue;
      await send(c.user_id, `<b>Неделя не подтверждена</b>\nЗаписи на эту неделю заморожены: спортсмены видят, что возможны изменения. Подтвердите расписание, когда будете готовы.`,
        [[{ text: 'Подтвердить неделю', callback_data: `wk:${ws}` }], [appButton('Открыть', `/c/week?ws=${ws}`)]]);
      stats.frozen++;
    }
  }

  // чистим старые ключи
  await db.from('sent_log').delete().lt('sent_at', new Date(now.getTime() - 40 * 86400_000).toISOString());
  return stats;
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-cron-secret') !== SECRET) return new Response('forbidden', { status: 403 });
  try {
    return new Response(JSON.stringify(await run()), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('cron error', e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? JSON.stringify(e)) }), { status: 500 });
  }
});
