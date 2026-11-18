// Вебхук Telegram-бота: /start (в том числе по ссылке тренера) и кнопки под сообщениями.
import { db, q, people, send, appButton, esc, L, type Row, coachRow, coachName, bookingLine, personLine, linkAthlete, createRegularBookings } from '../_shared/domain.ts';
import { tg } from '../_shared/telegram.ts';

const SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

async function upsertUser(from: Row) {
  await q(db.from('users').upsert({
    id: from.id, username: from.username ?? null, first_name: from.first_name ?? null, last_name: from.last_name ?? null, last_seen_at: new Date().toISOString(),
  }, { onConflict: 'id' }));
  return await q(db.from('users').select('*').eq('id', from.id).single());
}

async function onStart(msg: Row) {
  const me = await upsertUser(msg.from);
  const arg = String(msg.text ?? '').split(/\s+/)[1] ?? '';
  const m = /^c_([a-z0-9]{4,32})$/i.exec(arg);
  let coach: Row | null = null;
  if (m) {
    coach = await q(db.from('coaches').select('*').eq('invite_code', m[1]).maybeSingle());
    if (coach) {
      const ath = await q(db.from('athletes').select('user_id').eq('user_id', me.id).maybeSingle());
      if (ath && me.role === 'athlete') await linkAthlete(coach, me.id);
      else await q(db.from('users').update({ pending_coach_code: m[1] }).eq('id', me.id));
    }
  }
  const hello = coach
    ? `Здравствуйте! Тренер <b>${esc(await coachName(coach))}</b> приглашает вас записываться на занятия здесь.`
    : 'Здравствуйте! Здесь можно записываться на тренировки, получать напоминания и следить за прогрессом.';
  await send(me.id, `${hello}\n\nНажмите кнопку ниже, чтобы открыть приложение.`, [[appButton('Открыть приложение', coach ? `/start?c=${m![1]}` : '')]]);
}

async function answer(cb: Row, text: string, alert = false) {
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert: alert });
}
async function dropButtons(cb: Row, note?: string) {
  const msg = cb.message;
  if (!msg) return;
  if (note) {
    await tg('editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML', text: `${msg.text ? esc(msg.text) : ''}\n\n<i>${esc(note)}</i>` });
  } else {
    await tg('editMessageReplyMarkup', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } });
  }
}

async function onCallback(cb: Row) {
  const uid = cb.from.id as number;
  const [kind, id, arg] = String(cb.data ?? '').split(':');

  if (kind === 'att') { // спортсмен подтверждает, что придёт (за 24 ч)
    const b: Row | null = await q(db.from('bookings').select('*').eq('id', id).maybeSingle());
    if (!b || b.athlete_id !== uid) return answer(cb, 'Запись не найдена');
    if (!['pending', 'confirmed'].includes(b.status)) { await dropButtons(cb, 'Запись уже не активна'); return answer(cb, 'Запись уже не активна'); }
    if (arg === 'yes') {
      await q(db.from('bookings').update({ athlete_confirmed_at: new Date().toISOString() }).eq('id', b.id));
      await dropButtons(cb, 'Вы подтвердили, что придёте');
      return answer(cb, 'Отлично, ждём вас!');
    }
    const coach = await coachRow(b.coach_id);
    const late = new Date(b.starts_at).getTime() - Date.now() < coach.free_cancel_hours * 3600_000;
    await q(db.from('bookings').update({ status: 'cancelled', cancelled_by: 'athlete', late_cancel: late && b.status === 'confirmed' }).eq('id', b.id));
    const p = (await people([uid])).get(uid);
    await send(b.coach_id, `<b>Отмена${late ? ' (поздняя)' : ''}</b>\n${esc(personLine(p))}\n${esc(await bookingLine(b))}`);
    await dropButtons(cb, 'Запись отменена');
    return answer(cb, 'Запись отменена');
  }

  if (kind === 'dec') { // тренер принимает или отклоняет заявку
    const b: Row | null = await q(db.from('bookings').select('*').eq('id', id).maybeSingle());
    if (!b || b.coach_id !== uid) return answer(cb, 'Запись не найдена');
    if (b.status !== 'pending') { await dropButtons(cb, 'Заявка уже обработана'); return answer(cb, 'Заявка уже обработана'); }
    const accept = arg === 'a';
    await q(db.from('bookings').update({ status: accept ? 'confirmed' : 'declined' }).eq('id', b.id));
    const line = await bookingLine(b);
    if (accept) await send(b.athlete_id, `<b>Запись подтверждена</b>\n${esc(line)}\nЖдём вас!`, [[appButton('Мои записи', '/a/bookings')]]);
    else await send(b.athlete_id, `<b>Тренер не сможет провести занятие в это время</b>\n${esc(line)}\nВыберите, пожалуйста, другое время.`, [[appButton('Выбрать время', `/a/book?coach=${uid}`)]]);
    await dropButtons(cb, accept ? 'Вы подтвердили запись' : 'Вы отклонили заявку');
    return answer(cb, accept ? 'Подтверждено' : 'Отклонено');
  }

  if (kind === 'warn') { // тренер предупреждает о поздних отменах
    const athleteId = Number(id);
    const l = await q(db.from('coach_athletes').select('*').eq('coach_id', uid).eq('athlete_id', athleteId).maybeSingle());
    if (!l) return answer(cb, 'Спортсмен не найден');
    const coach = await coachRow(uid);
    await send(athleteId, `<b>Сообщение от тренера ${esc(await coachName(coach))}</b>\nЗа последний месяц несколько занятий отменено позже чем за ${coach.free_cancel_hours} ч. ` +
      'Пожалуйста, отменяйте заранее: это время могли бы занять другие спортсмены. При повторении запись к тренеру может быть закрыта.');
    await q(db.from('coach_athletes').update({ warned_at: new Date().toISOString() }).eq('coach_id', uid).eq('athlete_id', athleteId));
    await dropButtons(cb, 'Предупреждение отправлено');
    return answer(cb, 'Отправлено');
  }

  if (kind === 'bc') { // «Подтверждаю» под рассылкой
    const bc: Row | null = await q(db.from('broadcasts').select('*').eq('id', Number(id)).maybeSingle());
    if (!bc) return answer(cb, 'Сообщение устарело');
    const key = `bc:${bc.id}:${uid}`;
    const { error } = await db.from('sent_log').insert({ key });
    if (!error) {
      const p = (await people([uid])).get(uid);
      await send(bc.coach_id, `${esc(personLine(p))} подтвердил(а): «${esc(bc.text.slice(0, 80))}${bc.text.length > 80 ? '…' : ''}»`);
    }
    await dropButtons(cb, 'Вы подтвердили');
    return answer(cb, 'Тренер получил ваше подтверждение');
  }

  if (kind === 'wk') { // подтверждение недели прямо из чата
    const ws = L.weekStartOf(id);
    const c = await q(db.from('coaches').select('user_id').eq('user_id', uid).maybeSingle());
    if (!c) return answer(cb, 'Доступно только тренеру');
    await q(db.from('week_confirmations').upsert({ coach_id: uid, week_start: ws }, { onConflict: 'coach_id,week_start' }));
    const n = await createRegularBookings(uid, ws);
    await dropButtons(cb, `Неделя подтверждена${n ? `, создано постоянных записей: ${n}` : ''}`);
    return answer(cb, 'Неделя подтверждена');
  }

  return answer(cb, '');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  if (SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 });
  try {
    const upd = await req.json();
    if (upd.message?.text?.startsWith('/start')) await onStart(upd.message);
    else if (upd.callback_query) await onCallback(upd.callback_query);
    else if (upd.message?.chat?.type === 'private') {
      await send(upd.message.chat.id, 'Все действия — в приложении.', [[appButton('Открыть приложение')]]);
    }
  } catch (e) {
    console.error('bot error', e);
  }
  return new Response('ok'); // Telegram всегда получает 200, чтобы не повторять обновление
});
