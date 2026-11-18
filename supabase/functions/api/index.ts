// API мини-приложения. Каждый запрос: POST { action, initData, ...параметры }.
// Пользователь определяется только по подписанному Telegram initData.
import {
  db, q, people, send, appButton, esc, Fail, L, type Row,
  SERVICE_TITLE, SERVICE_SHORT, rinks, rinkName, inviteLink, coachRow, coachName, rinkCfg, availability, absences,
  coachBookings, weekStatus, confirmedWeeks, bookingLine, personLine, cancelByCoach, createRegularBookings, linkAthlete,
} from '../_shared/domain.ts';
import { verifyInitData, botToken, type TgUser } from '../_shared/telegram.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Ctx = { me: Row; body: Row; startParam: string | null };
type Handler = (c: Ctx) => Promise<unknown>;

const now = () => new Date();
const isoNow = () => new Date().toISOString();

// ---------------------------------------------------------------- helpers
async function touchUser(u: TgUser): Promise<Row> {
  await q(db.from('users').upsert({
    id: u.id, username: u.username ?? null, first_name: u.first_name ?? null, last_name: u.last_name ?? null,
    photo_url: u.photo_url ?? null, last_seen_at: isoNow(),
  }, { onConflict: 'id' }));
  return await q(db.from('users').select('*').eq('id', u.id).single());
}

function needCoach(me: Row) {
  if (me.role !== 'coach') throw new Fail('Доступно только тренеру');
}
async function needAthlete(me: Row): Promise<Row> {
  const a = await q(db.from('athletes').select('*').eq('user_id', me.id).maybeSingle());
  if (!a) throw new Fail('Сначала заполните анкету спортсмена');
  return a;
}
async function link(coachId: number, athleteId: number): Promise<Row> {
  const l = await q(db.from('coach_athletes').select('*').eq('coach_id', coachId).eq('athlete_id', athleteId).maybeSingle());
  if (!l) throw new Fail('Вы не записаны к этому тренеру. Попросите у него ссылку.');
  return l;
}
async function ownBooking(me: Row, id: string, as: 'coach' | 'athlete'): Promise<Row> {
  const b = await q(db.from('bookings').select('*').eq('id', id).maybeSingle());
  if (!b || (as === 'coach' ? b.coach_id : b.athlete_id) !== me.id) throw new Fail('Запись не найдена');
  return b;
}
function codeFrom(sp: string | null | undefined): string | null {
  if (!sp) return null;
  const m = /^c_([a-z0-9]{4,32})$/i.exec(sp);
  return m ? m[1] : null;
}
async function coachByCode(code: string | null): Promise<Row | null> {
  if (!code) return null;
  return await q(db.from('coaches').select('*').eq('invite_code', code).maybeSingle());
}

async function publicCoach(id: number) {
  const c = await coachRow(id);
  const u: Row = await q(db.from('users').select('username, photo_url, first_name, last_name').eq('id', id).single());
  const av = await availability(id);
  const all = await rinks();
  const used = new Set(av.map((a) => a.rink_id));
  return {
    id, name: await coachName(c), specialization: c.specialization ?? '', about: c.about ?? '', experience: c.experience ?? '',
    username: u.username, photo_url: u.photo_url,
    places: all.filter((r) => used.has(r.id)).map((r) => ({ id: r.id, name: r.name, short: r.short, color: r.color, online: r.is_online })),
    prices: { ice: c.price_ice, ofp: c.price_ofp, online: c.price_online },
    groups: c.groups_enabled,
  };
}

function bookingView(b: Row, rinkMap: Map<string, Row>, extra: Row = {}) {
  const r = rinkMap.get(b.rink_id);
  const p = L.localParts(new Date(b.starts_at));
  return {
    id: b.id, coach_id: b.coach_id, athlete_id: b.athlete_id, service: b.service, serviceTitle: SERVICE_TITLE[b.service],
    serviceShort: SERVICE_SHORT[b.service], topic: b.topic, format: b.format, rink: r ? { id: r.id, name: r.name, short: r.short, color: r.color } : null,
    starts_at: b.starts_at, ends_at: b.ends_at, date: p.dateStr, dayLabel: L.dayLabel(p.dateStr), time: L.hhmm(p.minuteOfDay),
    endTime: L.timeOf(b.ends_at), status: b.status, cancelled_by: b.cancelled_by, cancel_reason: b.cancel_reason,
    late_cancel: b.late_cancel, athlete_confirmed: !!b.athlete_confirmed_at, reminder_minutes: b.reminder_minutes,
    reminderLabel: L.reminderLabel(b.reminder_minutes), comment: b.comment, regular: !!b.regular_id, ...extra,
  };
}
async function rinkMap() {
  return new Map((await rinks()).map((r) => [r.id, r]));
}

async function lateCancels30(coachId: number, athleteId: number): Promise<number> {
  const rows: Row[] = await q(db.from('bookings').select('id').eq('coach_id', coachId).eq('athlete_id', athleteId)
    .eq('late_cancel', true).gte('starts_at', new Date(Date.now() - 30 * 86400_000).toISOString()));
  return rows.length;
}

/** Сеансы на дату для формы записи. */
async function computeSlots(coach: Row, dateStr: string, rinkId: string, wantGroup: boolean, athleteId: number | null, ignoreMinHours = false) {
  const [av, cfg, abs, books] = await Promise.all([
    availability(coach.user_id), rinkCfg(coach.user_id, rinkId), absences(coach.user_id, dateStr),
    coachBookings(coach.user_id, L.addDays(dateStr, -1), L.addDays(dateStr, 2)),
  ]);
  return L.slotsFor({
    dateStr, rinkId, avail: av, cfg, bookings: books, absences: abs, minBookHours: ignoreMinHours ? 0 : coach.min_book_hours,
    groupsEnabled: coach.groups_enabled, wantGroup, athleteId,
  });
}

// ---------------------------------------------------------------- общие
const actions: Record<string, Handler> = {};

actions.me = async ({ me, startParam }) => {
  const code = codeFrom(startParam);
  if (code && code !== me.pending_coach_code) {
    await q(db.from('users').update({ pending_coach_code: code }).eq('id', me.id));
    me.pending_coach_code = code;
  }
  const athlete = await q(db.from('athletes').select('*').eq('user_id', me.id).maybeSingle());
  const coach = await q(db.from('coaches').select('*').eq('user_id', me.id).maybeSingle());
  // спортсмен перешёл по новой ссылке — сразу привязываем
  if (athlete && me.role === 'athlete' && me.pending_coach_code) {
    const c = await coachByCode(me.pending_coach_code);
    if (c && c.user_id !== me.id) await linkAthlete(c, me.id);
    await q(db.from('users').update({ pending_coach_code: null }).eq('id', me.id));
    if (c) athlete.current_coach_id = c.user_id;
  }
  const inviter = !athlete ? await coachByCode(me.pending_coach_code) : null;
  return {
    user: { id: me.id, first_name: me.first_name, last_name: me.last_name, username: me.username, photo_url: me.photo_url, role: me.role, consent: !!me.consent_at },
    athlete, coach: coach ? { ...coach, name: await coachName(coach) } : null,
    inviter: inviter ? { id: inviter.user_id, name: await coachName(inviter) } : null,
  };
};

actions.register = async ({ me, body }) => {
  const role = body.role;
  if (role !== 'athlete' && role !== 'coach') throw new Fail('Выберите роль');
  if (!me.consent_at && !body.consent) throw new Fail('Нужно согласие на обработку персональных данных');
  await q(db.from('users').update({ role, consent_at: me.consent_at ?? isoNow() }).eq('id', me.id));
  if (role === 'coach') {
    const ex = await q(db.from('coaches').select('user_id').eq('user_id', me.id).maybeSingle());
    if (!ex) {
      await q(db.from('coaches').insert({ user_id: me.id, display_name: [me.first_name, me.last_name].filter(Boolean).join(' ') || null }));
      await q(db.from('coach_rinks').insert((await rinks()).map((r) => ({ coach_id: me.id, rink_id: r.id, session_minutes: r.is_online ? 60 : 45, start_offset: 0 }))));
    }
  } else {
    const ex = await q(db.from('athletes').select('user_id').eq('user_id', me.id).maybeSingle());
    if (!ex) await q(db.from('athletes').insert({ user_id: me.id, first_name: me.first_name, last_name: me.last_name }));
    const c = await coachByCode(me.pending_coach_code);
    if (c && c.user_id !== me.id) await linkAthlete(c, me.id);
    await q(db.from('users').update({ pending_coach_code: null }).eq('id', me.id));
  }
  return { role };
};

actions.saveAthlete = async ({ me, body }) => {
  await needAthlete(me);
  const kind = body.kind === 'parent' ? 'parent' : 'self';
  const bd = typeof body.birth_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birth_date) ? body.birth_date : null;
  const patch: Row = {
    kind, first_name: String(body.first_name ?? '').trim().slice(0, 60) || null, last_name: String(body.last_name ?? '').trim().slice(0, 60) || null,
    birth_date: bd, phone: String(body.phone ?? '').trim().slice(0, 32) || null, about: String(body.about ?? '').trim().slice(0, 1000) || null,
  };
  if ('reminder_minutes' in body) patch.reminder_minutes = body.reminder_minutes ? Math.max(1, Math.min(2880, Number(body.reminder_minutes))) : null;
  await q(db.from('athletes').update(patch).eq('user_id', me.id));
  return true;
};

actions.setDefaultReminder = async ({ me, body }) => {
  await needAthlete(me);
  const m = body.minutes ? Math.max(1, Math.min(2880, Number(body.minutes))) : null;
  await q(db.from('athletes').update({ reminder_minutes: m }).eq('user_id', me.id));
  return { reminderLabel: L.reminderLabel(m) };
};

actions.switchRole = async ({ me, body }) => actions.register({ me, body: { role: body.role, consent: true }, startParam: null });

actions.deleteAccount = async ({ me }) => {
  const future: Row[] = await q(db.from('bookings').select('*').or(`coach_id.eq.${me.id},athlete_id.eq.${me.id}`)
    .in('status', L.ACTIVE).gt('starts_at', isoNow()));
  for (const b of future) {
    const other = b.coach_id === me.id ? b.athlete_id : b.coach_id;
    await send(other, `<b>Занятие отменено</b>\n${esc(await bookingLine(b))}\nАккаунт ${b.coach_id === me.id ? 'тренера' : 'спортсмена'} удалён.`);
  }
  await q(db.from('users').delete().eq('id', me.id));
  return true;
};

// ---------------------------------------------------------------- спортсмен
async function currentCoachId(me: Row, a: Row, requested?: number): Promise<number | null> {
  const links: Row[] = await q(db.from('coach_athletes').select('coach_id').eq('athlete_id', me.id));
  const ids = links.map((l) => l.coach_id);
  if (requested && ids.includes(Number(requested))) {
    if (a.current_coach_id !== Number(requested)) await q(db.from('athletes').update({ current_coach_id: Number(requested) }).eq('user_id', me.id));
    return Number(requested);
  }
  if (a.current_coach_id && ids.includes(a.current_coach_id)) return a.current_coach_id;
  return ids[0] ?? null;
}

actions.athleteHome = async ({ me, body }) => {
  const a = await needAthlete(me);
  const coachId = await currentCoachId(me, a, body.coachId);
  const links: Row[] = await q(db.from('coach_athletes').select('coach_id').eq('athlete_id', me.id));
  const coaches = [];
  for (const l of links) coaches.push({ id: l.coach_id, name: await coachName(await coachRow(l.coach_id)) });
  if (!coachId) return { coach: null, coaches };
  const coach = await publicCoach(coachId);
  const today = L.todayStr();
  const abs = (await absences(coachId, today)).find((x) => x.date_from <= L.addDays(today, 30)) ?? null;
  const next: Row | null = await q(db.from('bookings').select('*').eq('athlete_id', me.id).eq('coach_id', coachId)
    .in('status', L.ACTIVE).gt('ends_at', isoNow()).order('starts_at').limit(1).maybeSingle());
  return {
    coach, coaches,
    absence: abs ? { kind: abs.kind, from: abs.date_from, to: abs.date_to, toLabel: L.dateLabel(abs.date_to), fromLabel: L.dateLabel(abs.date_from), active: abs.date_from <= today } : null,
    next: next ? bookingView(next, await rinkMap()) : null,
  };
};

actions.coachPublic = async ({ me, body }) => {
  await link(Number(body.coachId), me.id);
  return await publicCoach(Number(body.coachId));
};

actions.slots = async ({ me, body }) => {
  const coachId = Number(body.coachId);
  const forAthlete = me.role === 'coach' && coachId === me.id ? (body.athleteId ? Number(body.athleteId) : null) : me.id;
  if (!(me.role === 'coach' && coachId === me.id)) {
    const l = await link(coachId, me.id);
    if (l.blocked) throw new Fail('Тренер закрыл для вас запись.');
  }
  const coach = await coachRow(coachId);
  const service = ['ice', 'ofp', 'online'].includes(body.service) ? body.service : 'ice';
  const all = await rinks();
  const av = await availability(coachId);
  const used = new Set(av.map((x) => x.rink_id));
  const places = all.filter((r) => used.has(r.id) && (service === 'online' ? r.is_online : !r.is_online));
  const rinkId = places.find((p) => p.id === body.rinkId)?.id ?? places[0]?.id ?? null;
  const wantGroup = body.format === 'group' && coach.groups_enabled;
  const today = L.todayStr();
  const days = [];
  if (rinkId) {
    const [cfg, abs, books] = await Promise.all([rinkCfg(coachId, rinkId), absences(coachId, today), coachBookings(coachId, today, L.addDays(today, 15))]);
    for (let i = 0; i < 14; i++) {
      const d = L.addDays(today, i);
      const s = L.slotsFor({ dateStr: d, rinkId, avail: av, cfg, bookings: books, absences: abs, minBookHours: me.role === 'coach' ? 0 : coach.min_book_hours,
        groupsEnabled: coach.groups_enabled, wantGroup, athleteId: forAthlete });
      const [, , dd] = d.split('-').map(Number);
      days.push({ date: d, wd: L.WEEKDAY_SHORT[L.weekdayOf(d)], num: dd, available: s.some((x) => x.state === 'free' || x.state === 'group'), absent: !!L.inAbsence(d, abs) });
    }
  }
  const date = days.find((d) => d.date === body.date && d.available)?.date ?? days.find((d) => d.available)?.date ?? today;
  const slots = rinkId ? await computeSlots(coach, date, rinkId, wantGroup, forAthlete, me.role === 'coach') : [];
  const cfg = rinkId ? await rinkCfg(coachId, rinkId) : { session_minutes: 60, start_offset: 0 };
  const ws = weekStatus(await confirmedWeeks(coachId), date);
  return {
    service, serviceTitle: SERVICE_TITLE[service], price: coach[`price_${service}`], groups: coach.groups_enabled,
    places: places.map((r) => ({ id: r.id, name: r.name, short: r.short, color: r.color })), rinkId, date, dateLabel: L.dayLabel(date),
    days, slots, sessionMinutes: cfg.session_minutes, frozen: ws.frozen, month: monthTitle(date),
  };
};
function monthTitle(d: string) {
  const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const [y, m] = d.split('-').map(Number);
  return `${names[m - 1]} ${y}`;
}

actions.book = async ({ me, body }) => {
  const coachId = Number(body.coachId);
  const byCoach = me.role === 'coach' && coachId === me.id;
  const athleteId = byCoach ? Number(body.athleteId) : me.id;
  const l = await link(coachId, athleteId);
  if (!byCoach && l.blocked) throw new Fail('Тренер закрыл для вас запись.');
  const athlete: Row = await q(db.from('athletes').select('*').eq('user_id', athleteId).single());
  const coach = await coachRow(coachId);
  const service = ['ice', 'ofp', 'online'].includes(body.service) ? body.service : null;
  if (!service) throw new Fail('Выберите услугу');
  const rink = (await rinks()).find((r) => r.id === body.rinkId);
  if (!rink || rink.is_online !== (service === 'online')) throw new Fail('Выберите место');
  const start = new Date(body.startsAt);
  if (isNaN(start.getTime())) throw new Fail('Выберите время');
  const format = body.format === 'group' && coach.groups_enabled ? 'group' : 'solo';
  const dateStr = L.localParts(start).dateStr;
  const slots = await computeSlots(coach, dateStr, rink.id, format === 'group', athleteId, byCoach);
  const slot = slots.find((s) => s.starts_at === start.toISOString());
  if (!slot || !(slot.state === 'free' || slot.state === 'group')) throw new Fail('Это время уже занято. Выберите другое.');

  let status = 'pending';
  if (byCoach || coach.confirm_mode === 'auto') status = 'confirmed';
  else if (coach.confirm_mode === 'new') {
    const prev: Row[] = await q(db.from('bookings').select('id').eq('coach_id', coachId).eq('athlete_id', athleteId).in('status', ['confirmed', 'done']).limit(1));
    if (prev.length) status = 'confirmed';
  }
  const reminder = 'reminderMinutes' in body ? (body.reminderMinutes ? Math.max(1, Math.min(2880, Number(body.reminderMinutes))) : null) : athlete.reminder_minutes;
  const b: Row = await q(db.from('bookings').insert({
    coach_id: coachId, athlete_id: athleteId, rink_id: rink.id, service, format,
    topic: service === 'online' && (body.topic === 'ice' || body.topic === 'ofp') ? body.topic : null,
    starts_at: slot.starts_at, ends_at: slot.ends_at, status, reminder_minutes: reminder,
    comment: String(body.comment ?? '').trim().slice(0, 500) || null,
  }).select().single());

  const p = (await people([athleteId])).get(athleteId);
  const line = await bookingLine(b);
  const cname = await coachName(coach);
  if (byCoach) {
    await send(athleteId, `<b>Тренер записал вас на занятие</b>\n${esc(line)}\nТренер: ${esc(cname)}`, [[appButton('Мои записи', '/a/bookings')]]);
  } else if (status === 'pending') {
    await send(coachId, `<b>Новая заявка</b>${l.created_at > new Date(Date.now() - 30 * 86400_000).toISOString() ? ' · новый спортсмен' : ''}\n${esc(personLine(p))}\n${esc(line)}${b.comment ? `\nКомментарий: ${esc(b.comment)}` : ''}`,
      [[{ text: 'Подтвердить', callback_data: `dec:${b.id}:a` }, { text: 'Отклонить', callback_data: `dec:${b.id}:d` }], [appButton('Открыть запись', `/c/booking?id=${b.id}`)]]);
    await send(athleteId, `<b>Заявка отправлена</b>\n${esc(line)}\nТренер подтвердит её — пришлём сообщение.`);
  } else {
    await send(coachId, `<b>Новая запись</b>\n${esc(personLine(p))}\n${esc(line)}`, [[appButton('Открыть запись', `/c/booking?id=${b.id}`)]]);
    await send(athleteId, `<b>Вы записаны</b>\n${esc(line)}\nТренер: ${esc(cname)}`);
  }
  return bookingView(b, await rinkMap());
};

actions.myBookings = async ({ me, body }) => {
  const a = await needAthlete(me);
  const coachId = await currentCoachId(me, a, body.coachId);
  const rm = await rinkMap();
  const upcoming: Row[] = await q(db.from('bookings').select('*').eq('athlete_id', me.id).gt('ends_at', isoNow())
    .or('status.in.(pending,confirmed),and(status.eq.cancelled,cancelled_by.eq.coach)').order('starts_at').limit(50));
  const past: Row[] = await q(db.from('bookings').select('*').eq('athlete_id', me.id).lte('ends_at', isoNow())
    .in('status', ['done', 'noshow', 'cancelled', 'confirmed']).order('starts_at', { ascending: false }).limit(40));
  const coachNames = new Map<number, string>();
  for (const id of new Set([...upcoming, ...past].map((b) => b.coach_id))) coachNames.set(id, await coachName(await coachRow(id)));
  const coaches = new Map<number, Row>();
  const view = async (b: Row) => {
    if (!coaches.has(b.coach_id)) coaches.set(b.coach_id, await coachRow(b.coach_id));
    const c = coaches.get(b.coach_id)!;
    const late = new Date(b.starts_at).getTime() - Date.now() < c.free_cancel_hours * 3600_000;
    return bookingView(b, rm, { coachName: coachNames.get(b.coach_id), lateIfCancel: late, freeCancelHours: c.free_cancel_hours });
  };
  let offer = null;
  if (coachId) {
    const l = await link(coachId, me.id);
    if (l.regular_declines < 2 && (!l.regular_snooze_until || l.regular_snooze_until < isoNow())) {
      const recent: Row[] = await q(db.from('bookings').select('starts_at, ends_at, rink_id, service').eq('athlete_id', me.id).eq('coach_id', coachId)
        .in('status', ['confirmed', 'done']).gte('starts_at', new Date(Date.now() - 36 * 86400_000).toISOString()));
      const cand = L.regularCandidate(recent as L.PastLite[], 3);
      if (cand) {
        const ex: Row[] = await q(db.from('regulars').select('id').eq('coach_id', coachId).eq('athlete_id', me.id).eq('active', true)
          .eq('weekday', cand.weekday).eq('minute_of_day', cand.minute).eq('rink_id', cand.rink_id));
        if (!ex.length) offer = { ...cand, coachId, label: `по ${L.WEEKDAY_ACC[cand.weekday]} в ${L.hhmm(cand.minute)}`, place: rm.get(cand.rink_id)?.name };
      }
    }
  }
  const regulars: Row[] = await q(db.from('regulars').select('*').eq('athlete_id', me.id).eq('active', true));
  return {
    upcoming: await Promise.all(upcoming.map(view)), past: await Promise.all(past.map(view)), offer,
    regulars: regulars.map((r) => ({ id: r.id, label: `${L.WEEKDAY_SHORT[r.weekday]} ${L.hhmm(r.minute_of_day)}`, place: rm.get(r.rink_id)?.short })),
  };
};

actions.cancelBooking = async ({ me, body }) => {
  const b = await ownBooking(me, body.id, 'athlete');
  if (!L.ACTIVE.includes(b.status) || new Date(b.starts_at) < now()) throw new Fail('Эту запись уже нельзя отменить');
  const coach = await coachRow(b.coach_id);
  const late = b.status === 'confirmed' && new Date(b.starts_at).getTime() - Date.now() < coach.free_cancel_hours * 3600_000;
  await q(db.from('bookings').update({ status: 'cancelled', cancelled_by: 'athlete', late_cancel: late }).eq('id', b.id));
  const p = (await people([me.id])).get(me.id);
  await send(b.coach_id, `<b>Отмена${late ? ' (поздняя)' : ''}</b>\n${esc(personLine(p))}\n${esc(await bookingLine(b))}\nВремя снова свободно для записи.`);
  if (late) {
    const n = await lateCancels30(b.coach_id, me.id);
    const l = await link(b.coach_id, me.id);
    if (n >= 3 && (!l.warned_at || l.warned_at < new Date(Date.now() - 30 * 86400_000).toISOString())) {
      await send(b.coach_id, `<b>${n} поздние отмены за месяц</b>\n${esc(personLine(p))} отменяет позже чем за ${coach.free_cancel_hours} ч. Можно отправить вежливое предупреждение.`,
        [[{ text: 'Предупредить', callback_data: `warn:${me.id}` }], [appButton('Карточка спортсмена', `/c/client?id=${me.id}`)]]);
    }
  }
  return { late };
};

actions.setBookingReminder = async ({ me, body }) => {
  const b = await ownBooking(me, body.id, 'athlete');
  const m = body.minutes ? Math.max(1, Math.min(2880, Number(body.minutes))) : null;
  await q(db.from('bookings').update({ reminder_minutes: m }).eq('id', b.id));
  return { reminderLabel: L.reminderLabel(m) };
};

actions.regularDecision = async ({ me, body }) => {
  const coachId = Number(body.coachId);
  const l = await link(coachId, me.id);
  if (body.accept) {
    await q(db.from('regulars').insert({ coach_id: coachId, athlete_id: me.id, weekday: Number(body.weekday), minute_of_day: Number(body.minute), rink_id: body.rinkId, service: body.service }));
    const p = (await people([me.id])).get(me.id);
    await send(coachId, `<b>Постоянная запись</b>\n${esc(personLine(p))} — ${L.WEEKDAY_SHORT[Number(body.weekday)]} ${L.hhmm(Number(body.minute))}, ${esc(await rinkName(body.rinkId))}. Будет создаваться после подтверждения недели.`);
  } else {
    await q(db.from('coach_athletes').update({ regular_declines: l.regular_declines + 1, regular_snooze_until: new Date(Date.now() + 14 * 86400_000).toISOString() })
      .eq('coach_id', coachId).eq('athlete_id', me.id));
  }
  return true;
};

actions.stopRegular = async ({ me, body }) => {
  await q(db.from('regulars').update({ active: false }).eq('id', Number(body.id)).eq('athlete_id', me.id));
  return true;
};

actions.progress = async ({ me, body }) => {
  const a = await needAthlete(me);
  const coachId = await currentCoachId(me, a, body.coachId);
  const done: Row[] = await q(db.from('bookings').select('starts_at').eq('athlete_id', me.id).eq('status', 'done'));
  const ach = L.achievements(done);
  const els: Row[] = coachId ? await q(db.from('elements').select('*').eq('coach_id', coachId).eq('athlete_id', me.id).order('sort').order('id')) : [];
  const notes: Row[] = coachId ? await q(db.from('notes').select('*').eq('coach_id', coachId).eq('athlete_id', me.id).order('created_at', { ascending: false }).limit(3)) : [];
  return {
    ...ach, coachName: coachId ? await coachName(await coachRow(coachId)) : null,
    badges: ach.badges.map((b) => ({ ...b, atLabel: b.at ? L.dateLabel(L.localParts(new Date(b.at)).dateStr) : null })),
    elements: els.map((e) => ({ id: e.id, name: e.name, stage: e.stage })),
    notes: notes.map((n) => ({ text: n.text, dateLabel: L.dateLabel(L.localParts(new Date(n.created_at)).dateStr) })),
  };
};

actions.account = async ({ me }) => {
  const a = await needAthlete(me);
  const rm = await rinkMap();
  const past: Row[] = await q(db.from('bookings').select('*').eq('athlete_id', me.id).lte('ends_at', isoNow())
    .in('status', ['done', 'noshow', 'cancelled']).order('starts_at', { ascending: false }).limit(2));
  const doneCount: Row[] = await q(db.from('bookings').select('id').eq('athlete_id', me.id).eq('status', 'done'));
  const regulars: Row[] = await q(db.from('regulars').select('*').eq('athlete_id', me.id).eq('active', true));
  return {
    athlete: a, age: L.ageFrom(a.birth_date), reminderLabel: L.reminderLabel(a.reminder_minutes),
    tgName: [me.first_name, me.last_name].filter(Boolean).join(' '), username: me.username,
    past: past.map((b) => bookingView(b, rm)), doneCount: doneCount.length,
    regulars: regulars.map((r) => ({ id: r.id, label: `${L.WEEKDAY_SHORT[r.weekday]} ${L.hhmm(r.minute_of_day)}`, place: rm.get(r.rink_id)?.short })),
    icsUrl: icsUrl(me.ics_token),
  };
};

function icsUrl(token: string) {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/api?ics=${token}`;
}

// ---------------------------------------------------------------- тренер
actions.coachToday = async ({ me, body }) => {
  needCoach(me);
  const coach = await coachRow(me.id);
  const date = typeof body.date === 'string' ? body.date : L.todayStr();
  const rm = await rinkMap();
  const dayBooks = (await coachBookings(me.id, date, L.addDays(date, 1))).filter((b) => b.status !== 'declined' && !(b.status === 'cancelled' && b.cancelled_by === 'athlete' && !b.late_cancel));
  const pending: Row[] = await q(db.from('bookings').select('*').eq('coach_id', me.id).eq('status', 'pending').gt('starts_at', isoNow()).order('starts_at').limit(20));
  const ppl = await people([...dayBooks, ...pending].map((b) => b.athlete_id));
  const links: Row[] = await q(db.from('coach_athletes').select('athlete_id, created_at').eq('coach_id', me.id));
  const newIds = new Set(links.filter((l) => l.created_at > new Date(Date.now() - 30 * 86400_000).toISOString()).map((l) => l.athlete_id));
  // свободные сеансы на этот день по всем местам
  const av = await availability(me.id);
  let free = 0;
  const freeRows: Row[] = [];
  for (const rid of new Set(av.map((x) => x.rink_id))) {
    const s = await computeSlots(coach, date, rid, false, null, true);
    for (const x of s.filter((x) => x.state === 'free')) { free++; freeRows.push({ time: x.time, starts_at: x.starts_at, rink: rm.get(rid) }); }
  }
  const cw = await confirmedWeeks(me.id);
  const nowP = L.localParts(now());
  const thisWeek = weekStatus(cw, nowP.dateStr);
  const nextWs = L.addDays(thisWeek.weekStart, 7);
  let weekBanner = null;
  if (thisWeek.frozen) weekBanner = { weekStart: thisWeek.weekStart, frozen: true };
  else if (nowP.weekday === 6 && nowP.hh >= 18 && !cw.has(nextWs)) weekBanner = { weekStart: nextWs, frozen: false };
  else if (nowP.weekday === 0 && !thisWeek.confirmed) weekBanner = { weekStart: thisWeek.weekStart, frozen: false };
  const pv = (b: Row) => bookingView(b, rm, { person: ppl.get(b.athlete_id), personLine: personLine(ppl.get(b.athlete_id)), isNew: newIds.has(b.athlete_id) });
  return {
    date, dayLabel: L.dayLabel(date), isToday: date === L.todayStr(),
    weekdayName: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'][L.weekdayOf(date)],
    bookings: dayBooks.map(pv), pending: pending.map(pv), free, freeRows: freeRows.sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    weekBanner, absence: (await absences(me.id, date)).find((x) => x.date_from <= date) ?? null,
  };
};

actions.bookingDetail = async ({ me, body }) => {
  needCoach(me);
  const b = await ownBooking(me, body.id, 'coach');
  const p = (await people([b.athlete_id])).get(b.athlete_id);
  const total: Row[] = await q(db.from('bookings').select('id').eq('coach_id', me.id).eq('athlete_id', b.athlete_id).eq('status', 'done'));
  return { ...bookingView(b, await rinkMap(), { person: p, personLine: personLine(p), doneCount: total.length, past: new Date(b.starts_at) < now() }) };
};

actions.decide = async ({ me, body }) => {
  needCoach(me);
  const b = await ownBooking(me, body.id, 'coach');
  if (b.status !== 'pending') throw new Fail('Заявка уже обработана');
  const accept = !!body.accept;
  await q(db.from('bookings').update({ status: accept ? 'confirmed' : 'declined' }).eq('id', b.id));
  const line = await bookingLine(b);
  if (accept) await send(b.athlete_id, `<b>Запись подтверждена</b>\n${esc(line)}\nЖдём вас!`, [[appButton('Мои записи', '/a/bookings')]]);
  else await send(b.athlete_id, `<b>Тренер не сможет провести занятие в это время</b>\n${esc(line)}\nВыберите, пожалуйста, другое время.`, [[appButton('Выбрать время', `/a/book?coach=${me.id}`)]]);
  return { status: accept ? 'confirmed' : 'declined' };
};

actions.coachCancel = async ({ me, body }) => {
  needCoach(me);
  const b = await ownBooking(me, body.id, 'coach');
  if (!L.ACTIVE.includes(b.status)) throw new Fail('Запись уже не активна');
  await cancelByCoach(b, String(body.reason ?? '').slice(0, 200), await coachName(await coachRow(me.id)));
  return true;
};

actions.markBooking = async ({ me, body }) => {
  needCoach(me);
  const b = await ownBooking(me, body.id, 'coach');
  const st = ['done', 'noshow', 'confirmed'].includes(body.status) ? body.status : null;
  if (!st) throw new Fail('Неверный статус');
  await q(db.from('bookings').update({ status: st }).eq('id', b.id));
  return { status: st };
};

actions.clients = async ({ me }) => {
  needCoach(me);
  const links: Row[] = await q(db.from('coach_athletes').select('*').eq('coach_id', me.id).order('created_at', { ascending: false }));
  const ppl = await people(links.map((l) => l.athlete_id));
  const books: Row[] = await q(db.from('bookings').select('athlete_id, status, starts_at, late_cancel').eq('coach_id', me.id));
  const month = new Date(Date.now() - 30 * 86400_000).toISOString();
  return links.map((l) => {
    const mine = books.filter((b) => b.athlete_id === l.athlete_id);
    const last = mine.filter((b) => b.status === 'done').map((b) => b.starts_at).sort().pop() ?? null;
    return {
      id: l.athlete_id, person: ppl.get(l.athlete_id), line: personLine(ppl.get(l.athlete_id)), blocked: l.blocked,
      done: mine.filter((b) => b.status === 'done').length, late: mine.filter((b) => b.late_cancel && b.starts_at > month).length,
      lastLabel: last ? L.dateLabel(L.localParts(new Date(last)).dateStr) : null,
      activeMonth: mine.some((b) => b.starts_at > month && ['done', 'confirmed'].includes(b.status)),
    };
  });
};

actions.clientDetail = async ({ me, body }) => {
  needCoach(me);
  const id = Number(body.athleteId);
  const l = await link(me.id, id);
  const p = (await people([id])).get(id);
  const rm = await rinkMap();
  const books: Row[] = await q(db.from('bookings').select('*').eq('coach_id', me.id).eq('athlete_id', id).order('starts_at', { ascending: false }).limit(60));
  const regs: Row[] = await q(db.from('regulars').select('*').eq('coach_id', me.id).eq('athlete_id', id).eq('active', true));
  const els: Row[] = await q(db.from('elements').select('id').eq('coach_id', me.id).eq('athlete_id', id));
  const past = books.filter((b) => new Date(b.starts_at) < now() && b.status !== 'declined').slice(0, 3);
  const upcoming = books.filter((b) => L.ACTIVE.includes(b.status) && new Date(b.starts_at) > now()).reverse().slice(0, 3);
  return {
    id, person: p, line: personLine(p), age: L.ageFrom(p?.birth_date ?? null), since: L.dateLabel(L.localParts(new Date(l.created_at)).dateStr),
    done: books.filter((b) => b.status === 'done').length, late: await lateCancels30(me.id, id),
    warned: l.warned_at ? L.dateLabel(L.localParts(new Date(l.warned_at)).dateStr) : null, blocked: l.blocked,
    regulars: regs.map((r) => `${L.WEEKDAY_SHORT[r.weekday]} ${L.hhmm(r.minute_of_day)}`), elements: els.length,
    history: past.map((b) => bookingView(b, rm)), upcoming: upcoming.map((b) => bookingView(b, rm)),
  };
};

actions.warnAthlete = async ({ me, body }) => {
  needCoach(me);
  const id = Number(body.athleteId);
  await link(me.id, id);
  const coach = await coachRow(me.id);
  await send(id, `<b>Сообщение от тренера ${esc(await coachName(coach))}</b>\nЗа последний месяц несколько занятий отменено позже чем за ${coach.free_cancel_hours} ч. ` +
    `Пожалуйста, отменяйте заранее: это время могли бы занять другие спортсмены. При повторении запись к тренеру может быть закрыта.`);
  await q(db.from('coach_athletes').update({ warned_at: isoNow() }).eq('coach_id', me.id).eq('athlete_id', id));
  return true;
};

actions.setBlocked = async ({ me, body }) => {
  needCoach(me);
  const id = Number(body.athleteId);
  await link(me.id, id);
  const blocked = !!body.blocked;
  await q(db.from('coach_athletes').update({ blocked }).eq('coach_id', me.id).eq('athlete_id', id));
  if (blocked) {
    const future: Row[] = await q(db.from('bookings').select('*').eq('coach_id', me.id).eq('athlete_id', id).in('status', L.ACTIVE).gt('starts_at', isoNow()));
    for (const b of future) await q(db.from('bookings').update({ status: 'cancelled', cancelled_by: 'coach', cancel_reason: 'запись закрыта тренером' }).eq('id', b.id));
    await q(db.from('regulars').update({ active: false }).eq('coach_id', me.id).eq('athlete_id', id));
    await send(id, `Тренер ${esc(await coachName(await coachRow(me.id)))} закрыл для вас запись. Будущие занятия отменены.`);
  }
  return { blocked };
};

actions.goals = async ({ me, body }) => {
  needCoach(me);
  const id = Number(body.athleteId);
  await link(me.id, id);
  const els: Row[] = await q(db.from('elements').select('*').eq('coach_id', me.id).eq('athlete_id', id).order('sort').order('id'));
  const p = (await people([id])).get(id);
  return { person: p, elements: els.map((e) => ({ id: e.id, name: e.name, stage: e.stage })), today: L.dateLabel(L.todayStr()) };
};

actions.saveGoals = async ({ me, body }) => {
  needCoach(me);
  const id = Number(body.athleteId);
  await link(me.id, id);
  const STAGES = ['учим', 'получается', 'чисто'];
  const before: Row[] = await q(db.from('elements').select('*').eq('coach_id', me.id).eq('athlete_id', id));
  const bm = new Map(before.map((e) => [e.id, e]));
  const changes: string[] = [];
  const keep = new Set<number>();
  let sort = 0;
  for (const e of (body.elements ?? []) as Row[]) {
    const name = String(e.name ?? '').trim().slice(0, 80);
    if (!name) continue;
    const stage = Math.max(0, Math.min(2, Number(e.stage) || 0));
    const old = e.id ? bm.get(Number(e.id)) : null;
    if (old) {
      keep.add(old.id);
      if (old.stage !== stage || old.name !== name) {
        await q(db.from('elements').update({ name, stage, sort, updated_at: isoNow() }).eq('id', old.id));
        if (old.stage !== stage) changes.push(`${name}: ${STAGES[stage]}`);
      } else await q(db.from('elements').update({ sort }).eq('id', old.id));
    } else {
      await q(db.from('elements').insert({ coach_id: me.id, athlete_id: id, name, stage, sort }));
      changes.push(`${name}: ${STAGES[stage]} (новый элемент)`);
    }
    sort++;
  }
  const removed = before.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (removed.length) await q(db.from('elements').delete().in('id', removed));
  const note = String(body.note ?? '').trim().slice(0, 2000);
  if (note) await q(db.from('notes').insert({ coach_id: me.id, athlete_id: id, text: note }));
  if (note || changes.length) {
    await send(id, `<b>Тренер ${esc(await coachName(await coachRow(me.id)))}</b>${note ? `\n${esc(note)}` : ''}${changes.length ? `\n\n<b>Элементы</b>\n${changes.map((c) => '• ' + esc(c)).join('\n')}` : ''}`,
      [[appButton('Мой прогресс', '/a/progress')]]);
  }
  return { sent: !!(note || changes.length) };
};

actions.stats = async ({ me, body }) => {
  needCoach(me);
  const period = ['week', 'month', 'year'].includes(body.period) ? body.period : 'month';
  const today = L.todayStr();
  const [y, m] = today.split('-').map(Number);
  let from: string, prevFrom: string;
  if (period === 'week') { from = L.weekStartOf(today); prevFrom = L.addDays(from, -7); }
  else if (period === 'month') { from = `${y}-${String(m).padStart(2, '0')}-01`; prevFrom = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`; }
  else { from = `${y}-01-01`; prevFrom = `${y - 1}-01-01`; }
  const all = await coachBookings(me.id, prevFrom, L.addDays(today, 1));
  const ended = (b: Row) => new Date(b.ends_at) <= now();
  const fromIso = L.localToDate(from, 0).toISOString();
  const cur = all.filter((b) => b.starts_at >= fromIso && ended(b));
  const prev = all.filter((b) => b.starts_at < fromIso);
  const lessons = (xs: Row[]) => xs.filter((b) => b.status === 'done' || b.status === 'confirmed');
  const L1 = lessons(cur), L0 = lessons(prev);
  const iceH = Math.round(L1.filter((b) => b.service === 'ice').reduce((s, b) => s + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3600_000, 0));
  const cancels = cur.filter((b) => b.status === 'cancelled' || b.status === 'noshow');
  const late = cur.filter((b) => b.late_cancel).length;
  const denom = L1.length + cancels.length;
  const links: Row[] = await q(db.from('coach_athletes').select('created_at').eq('coach_id', me.id).gte('created_at', fromIso));
  const rs = await rinks();
  const byRink = rs.map((r) => ({ id: r.id, name: r.name, color: r.color, n: L1.filter((b) => b.rink_id === r.id).length }));
  const byDay = [0, 1, 2, 3, 4, 5, 6].map((d) => L1.filter((b) => L.localParts(new Date(b.starts_at)).weekday === d).length);
  const delta = L1.length - L0.length;
  return {
    period,
    kpis: [
      { label: 'Занятий', value: String(L1.length), delta: period === 'year' ? '' : `${delta >= 0 ? '+' : ''}${delta} к прошлому периоду`, good: delta >= 0 },
      { label: 'Часов на льду', value: String(iceH), delta: '', good: true },
      { label: 'Спортсменов', value: String(new Set(L1.map((b) => b.athlete_id)).size), delta: links.length ? `${links.length} ${L.plural(links.length, 'новый', 'новых', 'новых')}` : '', good: true },
      { label: 'Отмены', value: denom ? `${Math.round(cancels.length / denom * 100)}%` : '0%', delta: late ? `${late} ${L.plural(late, 'поздняя', 'поздние', 'поздних')}` : '', good: false },
    ],
    byRink, byDay,
  };
};

actions.coachProfile = async ({ me }) => {
  needCoach(me);
  const c = await coachRow(me.id);
  return { ...c, name: await coachName(c), invite: inviteLink(c.invite_code), username: me.username, icsUrl: icsUrl(me.ics_token) };
};

actions.saveCoachProfile = async ({ me, body }) => {
  needCoach(me);
  const num = (v: unknown) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Math.max(0, Number(v)));
  const patch: Row = {};
  for (const k of ['display_name', 'specialization', 'about', 'experience']) if (k in body) patch[k] = String(body[k] ?? '').trim().slice(0, k === 'about' ? 1500 : 120) || null;
  for (const k of ['price_ice', 'price_ofp', 'price_online']) if (k in body) patch[k] = num(body[k]);
  if ('groups_enabled' in body) patch.groups_enabled = !!body.groups_enabled;
  await q(db.from('coaches').update(patch).eq('user_id', me.id));
  return true;
};

actions.settings = async ({ me }) => {
  needCoach(me);
  const c = await coachRow(me.id);
  const rem: Row[] = await q(db.from('coach_reminders').select('*').eq('coach_id', me.id).order('minutes', { ascending: false }));
  const av = await availability(me.id);
  const cr: Row[] = await q(db.from('coach_rinks').select('*').eq('coach_id', me.id));
  const lens = [...new Set(cr.map((r) => r.session_minutes))].sort((a, b) => a - b);
  return {
    confirm_mode: c.confirm_mode, free_cancel_hours: c.free_cancel_hours, min_book_hours: c.min_book_hours, digest: c.digest,
    reminders: rem.map((r) => r.minutes), hours: new Set(av.map((a) => `${a.weekday}-${a.hour}`)).size,
    sessions: lens.length ? (lens.length > 1 ? `${lens[0]}–${lens[lens.length - 1]} мин` : `${lens[0]} мин`) : '—',
  };
};

actions.saveSettings = async ({ me, body }) => {
  needCoach(me);
  const patch: Row = {};
  if (['all', 'new', 'auto'].includes(body.confirm_mode)) patch.confirm_mode = body.confirm_mode;
  for (const k of ['free_cancel_hours', 'min_book_hours']) if (k in body) patch[k] = Math.max(0, Math.min(168, Math.round(Number(body[k]) || 0)));
  if ('digest' in body) patch.digest = !!body.digest;
  if (Object.keys(patch).length) await q(db.from('coaches').update(patch).eq('user_id', me.id));
  if (Array.isArray(body.reminders)) {
    await q(db.from('coach_reminders').delete().eq('coach_id', me.id));
    const mins = [...new Set((body.reminders as unknown[]).map(Number).filter((m) => m >= 1 && m <= 2880))].slice(0, 5);
    if (mins.length) await q(db.from('coach_reminders').insert(mins.map((m) => ({ coach_id: me.id, minutes: m }))));
  }
  return true;
};

actions.hours = async ({ me }) => {
  needCoach(me);
  return { cells: await availability(me.id), rinks: await rinks() };
};

actions.saveHours = async ({ me, body }) => {
  needCoach(me);
  const valid = new Set((await rinks()).map((r) => r.id));
  const seen = new Set<string>();
  const rows = ((body.cells ?? []) as Row[]).filter((c) => {
    const k = `${c.weekday}-${c.hour}-${c.rink_id}`;
    if (seen.has(k) || !valid.has(c.rink_id) || !(c.weekday >= 0 && c.weekday <= 6) || !(c.hour >= 0 && c.hour <= 23)) return false;
    seen.add(k);
    return true;
  }).map((c) => ({ coach_id: me.id, weekday: Number(c.weekday), hour: Number(c.hour), rink_id: c.rink_id }));
  await q(db.from('availability').delete().eq('coach_id', me.id));
  if (rows.length) await q(db.from('availability').insert(rows));
  return { hours: new Set(rows.map((r) => `${r.weekday}-${r.hour}`)).size };
};

actions.rinksCfg = async ({ me }) => {
  needCoach(me);
  const cr: Row[] = await q(db.from('coach_rinks').select('*').eq('coach_id', me.id));
  return (await rinks()).map((r) => {
    const c = cr.find((x) => x.rink_id === r.id);
    return { id: r.id, name: r.name, color: r.color, online: r.is_online, session_minutes: c?.session_minutes ?? 60, start_offset: c?.start_offset ?? 0 };
  });
};

actions.saveRinkCfg = async ({ me, body }) => {
  needCoach(me);
  const rows = ((body.items ?? []) as Row[]).map((r) => ({
    coach_id: me.id, rink_id: String(r.id), session_minutes: Math.max(15, Math.min(180, Math.round(Number(r.session_minutes) / 5) * 5)),
    start_offset: [0, 15, 30, 45].includes(Number(r.start_offset)) ? Number(r.start_offset) : 0,
  }));
  if (rows.length) await q(db.from('coach_rinks').upsert(rows, { onConflict: 'coach_id,rink_id' }));
  return true;
};

actions.week = async ({ me, body }) => {
  needCoach(me);
  const ws = typeof body.weekStart === 'string' ? L.weekStartOf(body.weekStart) : L.addDays(L.weekStartOf(L.todayStr()), 7);
  const av = await availability(me.id);
  const abs = await absences(me.id, ws);
  const books = (await coachBookings(me.id, ws, L.addDays(ws, 7))).filter((b) => L.ACTIVE.includes(b.status));
  const rm = await rinkMap();
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = L.addDays(ws, i);
    const absent = L.inAbsence(d, abs);
    const blocks = absent ? [] : L.dayBlocks(i, av).map((x) => ({ color: rm.get(x.rink_id)?.color, text: `${String(x.from).padStart(2, '0')}–${String(x.to).padStart(2, '0')} · ${rm.get(x.rink_id)?.short}` }));
    const n = books.filter((b) => L.localParts(new Date(b.starts_at)).dateStr === d).length;
    const [, , dd] = d.split('-').map(Number);
    return { date: d, name: `${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][i]} ${dd}`, blocks, absent: absent ? (absent.kind === 'sick' ? 'больничный' : 'отпуск') : null,
      count: n ? `${n} ${L.plural(n, 'запись', 'записи', 'записей')}` : (blocks.length ? 'нет записей' : 'выходной') };
  });
  const regs: Row[] = await q(db.from('regulars').select('*').eq('coach_id', me.id).eq('active', true));
  const ppl = await people(regs.map((r) => r.athlete_id));
  const confirmed = !!(await q(db.from('week_confirmations').select('week_start').eq('coach_id', me.id).eq('week_start', ws).maybeSingle()));
  return {
    weekStart: ws, title: `${L.dateLabel(ws)} – ${L.dateLabel(L.addDays(ws, 6))}`, deadline: `пн, ${L.dateLabel(ws)}, 12:00`,
    frozen: !confirmed && now() > L.localToDate(ws, 12 * 60), confirmed, days,
    regulars: regs.map((r) => `${ppl.get(r.athlete_id)?.name ?? 'Спортсмен'} — ${L.WEEKDAY_SHORT[r.weekday]} ${L.hhmm(r.minute_of_day)}`),
  };
};

actions.confirmWeek = async ({ me, body }) => {
  needCoach(me);
  const ws = L.weekStartOf(String(body.weekStart));
  await q(db.from('week_confirmations').upsert({ coach_id: me.id, week_start: ws }, { onConflict: 'coach_id,week_start' }));
  const created = await createRegularBookings(me.id, ws);
  return { created };
};

actions.absences = async ({ me }) => {
  needCoach(me);
  return (await absences(me.id, L.todayStr())).map((a) => ({ ...a, fromLabel: L.dateLabel(a.date_from), toLabel: L.dateLabel(a.date_to) }));
};

actions.absencePreview = async ({ me, body }) => {
  needCoach(me);
  const books = (await coachBookings(me.id, body.from, L.addDays(body.to, 1))).filter((b) => L.ACTIVE.includes(b.status) && new Date(b.starts_at) > now());
  return { count: books.length };
};

actions.saveAbsence = async ({ me, body }) => {
  needCoach(me);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(body.from) || !re.test(body.to) || body.to < body.from) throw new Fail('Проверьте даты');
  const kind = body.kind === 'sick' ? 'sick' : 'vacation';
  const cancelExisting = !!body.cancelExisting;
  await q(db.from('absences').insert({ coach_id: me.id, kind, date_from: body.from, date_to: body.to, cancel_existing: cancelExisting }));
  let cancelled = 0;
  if (cancelExisting) {
    const reason = `${kind === 'sick' ? 'тренер на больничном' : 'тренер в отпуске'} до ${L.dateLabel(body.to)}`;
    const name = await coachName(await coachRow(me.id));
    const books = (await coachBookings(me.id, body.from, L.addDays(body.to, 1))).filter((b) => L.ACTIVE.includes(b.status) && new Date(b.starts_at) > now());
    for (const b of books) { await cancelByCoach(b, reason, name); cancelled++; }
  }
  return { cancelled };
};

actions.deleteAbsence = async ({ me, body }) => {
  needCoach(me);
  await q(db.from('absences').delete().eq('id', Number(body.id)).eq('coach_id', me.id));
  return true;
};

async function audience(me: Row, a: Row): Promise<number[]> {
  const links: Row[] = await q(db.from('coach_athletes').select('athlete_id').eq('coach_id', me.id).eq('blocked', false));
  const ids = links.map((l) => l.athlete_id);
  if (a?.type === 'manual') return ids.filter((id) => (a.athleteIds ?? []).map(Number).includes(id));
  if (a?.type === 'month' || a?.type === 'rink') {
    const since = new Date(Date.now() - (a.type === 'month' ? 30 : 60) * 86400_000).toISOString();
    let qq = db.from('bookings').select('athlete_id, rink_id').eq('coach_id', me.id).gte('starts_at', since).in('status', ['confirmed', 'done', 'pending']);
    if (a.type === 'rink') qq = qq.in('rink_id', (a.rinks ?? []) as string[]);
    const rows: Row[] = await q(qq);
    const s = new Set(rows.map((r) => r.athlete_id));
    return ids.filter((id) => s.has(id));
  }
  return ids;
}

actions.broadcastPreview = async ({ me, body }) => {
  needCoach(me);
  return { count: (await audience(me, body.audience)).length };
};

actions.broadcast = async ({ me, body }) => {
  needCoach(me);
  const text = String(body.text ?? '').trim().slice(0, 3500);
  if (!text) throw new Fail('Напишите текст сообщения');
  const ids = await audience(me, body.audience);
  if (!ids.length) throw new Fail('Нет получателей');
  const button = body.button === 'book' || body.button === 'ok' ? body.button : null;
  const bc: Row = await q(db.from('broadcasts').insert({ coach_id: me.id, text, button }).select().single());
  const name = await coachName(await coachRow(me.id));
  const kb = button === 'book' ? [[appButton('Записаться', `/a/book?coach=${me.id}`)]] : button === 'ok' ? [[{ text: 'Подтверждаю', callback_data: `bc:${bc.id}` }]] : undefined;
  let sent = 0;
  for (const id of ids) {
    if (await send(id, `<b>${esc(name)}</b>\n${esc(text)}`, kb)) sent++;
    await new Promise((r) => setTimeout(r, 40)); // не упираемся в лимиты Telegram
  }
  await q(db.from('broadcasts').update({ sent_count: sent }).eq('id', bc.id));
  return { sent };
};

// ---------------------------------------------------------------- календарь .ics
async function ics(token: string): Promise<Response> {
  const u: Row | null = await q(db.from('users').select('id, role').eq('ics_token', token).maybeSingle());
  if (!u) return new Response('not found', { status: 404 });
  const col = u.role === 'coach' ? 'coach_id' : 'athlete_id';
  const books: Row[] = await q(db.from('bookings').select('*').eq(col, u.id).in('status', ['pending', 'confirmed', 'done'])
    .gte('starts_at', new Date(Date.now() - 30 * 86400_000).toISOString()).order('starts_at').limit(300));
  const ppl = u.role === 'coach' ? await people(books.map((b) => b.athlete_id)) : null;
  const rm = await rinkMap();
  const f = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escI = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//rink-crm//RU', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Тренировки'];
  for (const b of books) {
    const who = ppl ? ` — ${ppl.get(b.athlete_id)?.name ?? ''}` : '';
    lines.push('BEGIN:VEVENT', `UID:${b.id}@rink-crm`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(new Date(b.starts_at).toISOString())}`,
      `DTEND:${f(new Date(b.ends_at).toISOString())}`, `SUMMARY:${escI(SERVICE_SHORT[b.service] + who)}`, `LOCATION:${escI(rm.get(b.rink_id)?.name ?? '')}`,
      `STATUS:${b.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n'), { headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8' } });
}

// ---------------------------------------------------------------- вход
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('ics')) return await ics(url.searchParams.get('ics')!);
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: Row;
  try { body = await req.json(); } catch { return json({ error: 'Неверный запрос' }, 400); }
  const auth = await verifyInitData(String(body.initData ?? ''), botToken());
  if (!auth) return json({ error: 'Откройте приложение из Telegram' }, 401);
  const fn = actions[String(body.action)];
  if (!fn) return json({ error: 'Неизвестное действие' }, 400);
  try {
    const me = await touchUser(auth.user);
    return json({ ok: true, data: await fn({ me, body, startParam: auth.startParam ?? body.startParam ?? null }) });
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, 400);
    console.error(body.action, e);
    return json({ error: 'Что-то пошло не так. Попробуйте ещё раз.' }, 500);
  }
});
