// Чистая логика без обращения к базе: время (Минск, UTC+3 без перехода на летнее),
// генерация сеансов, цены, ачивки. Используется функциями api и cron, покрыта тестами.

export const TZ_OFFSET_MIN = 180; // Europe/Minsk
const MS_MIN = 60_000;
const MS_DAY = 86_400_000;

export type Avail = { weekday: number; hour: number; rink_id: string };
export type RinkCfg = { session_minutes: number; start_offset: number };
export type BookingLite = {
  id?: string;
  athlete_id: number;
  rink_id: string;
  starts_at: string;
  ends_at: string;
  format: string;
  status: string;
};
export type Absence = { date_from: string; date_to: string; kind: string };

// ---------- время ----------
/** Локальные (минские) части даты для момента времени. weekday: 0 = пн. */
export function localParts(d: Date) {
  const l = new Date(d.getTime() + TZ_OFFSET_MIN * MS_MIN);
  return {
    y: l.getUTCFullYear(),
    m: l.getUTCMonth() + 1,
    d: l.getUTCDate(),
    hh: l.getUTCHours(),
    mm: l.getUTCMinutes(),
    weekday: (l.getUTCDay() + 6) % 7,
    minuteOfDay: l.getUTCHours() * 60 + l.getUTCMinutes(),
    dateStr: l.toISOString().slice(0, 10),
  };
}

/** Момент времени по минской дате "YYYY-MM-DD" и минуте от полуночи. */
export function localToDate(dateStr: string, minuteOfDay: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minuteOfDay) - TZ_OFFSET_MIN * MS_MIN);
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * MS_DAY).toISOString().slice(0, 10);
}

export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Понедельник недели, в которую входит дата. */
export function weekStartOf(dateStr: string): string {
  return addDays(dateStr, -weekdayOf(dateStr));
}

export function todayStr(now = new Date()): string {
  return localParts(now).dateStr;
}

export function hhmm(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60), m = minuteOfDay % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

export function timeOf(iso: string): string {
  return hhmm(localParts(new Date(iso)).minuteOfDay);
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** «чт, 19 ноября» */
export function dayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${WD_SHORT[weekdayOf(dateStr)]}, ${d} ${MONTHS_GEN[m - 1]}`;
}

/** «19 ноября» */
export function dateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

/** «чт, 19 ноября, 14:00» для момента времени */
export function whenLabel(iso: string): string {
  const p = localParts(new Date(iso));
  return `${dayLabel(p.dateStr)}, ${hhmm(p.minuteOfDay)}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}

/** «за 2 часа», «за 30 минут» */
export function reminderLabel(minutes: number | null): string {
  if (!minutes) return 'не напоминать';
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `за ${h} ${plural(h, 'час', 'часа', 'часов')}`;
  }
  return `за ${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')}`;
}

export function ageFrom(birth: string | null, now = new Date()): number | null {
  if (!birth) return null;
  const [y, m, d] = birth.split('-').map(Number);
  const t = localParts(now);
  let age = t.y - y;
  if (t.m < m || (t.m === m && t.d < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}

// ---------- сеансы ----------
export const ACTIVE = ['pending', 'confirmed'];

export function inAbsence(dateStr: string, absences: Absence[]): Absence | null {
  return absences.find((a) => a.date_from <= dateStr && dateStr <= a.date_to) ?? null;
}

/** Сеансы одного места на одну дату по недельному шаблону и сетке места (минуты от полуночи). */
export function sessionStarts(dateStr: string, rinkId: string, avail: Avail[], cfg: RinkCfg): number[] {
  const wd = weekdayOf(dateStr);
  const hours = avail.filter((a) => a.weekday === wd && a.rink_id === rinkId).map((a) => a.hour).sort((a, b) => a - b);
  const out: number[] = [];
  let i = 0;
  while (i < hours.length) {
    let j = i;
    while (j + 1 < hours.length && hours[j + 1] === hours[j] + 1) j++;
    const blockStart = hours[i] * 60, blockEnd = (hours[j] + 1) * 60;
    for (let t = blockStart + cfg.start_offset; t + cfg.session_minutes <= blockEnd; t += cfg.session_minutes) out.push(t);
    i = j + 1;
  }
  return out;
}

export type SlotState = 'free' | 'group' | 'busy' | 'mine';
export type Slot = { starts_at: string; ends_at: string; time: string; state: SlotState; groupCount: number };

export function slotsFor(opts: {
  dateStr: string;
  rinkId: string;
  avail: Avail[];
  cfg: RinkCfg;
  bookings: BookingLite[];
  absences: Absence[];
  minBookHours: number;
  groupsEnabled: boolean;
  wantGroup: boolean;
  athleteId: number | null;
  now?: Date;
}): Slot[] {
  const now = opts.now ?? new Date();
  if (inAbsence(opts.dateStr, opts.absences)) return [];
  const minStart = now.getTime() + opts.minBookHours * 3_600_000;
  const active = opts.bookings.filter((b) => ACTIVE.includes(b.status));
  const res: Slot[] = [];
  for (const t of sessionStarts(opts.dateStr, opts.rinkId, opts.avail, opts.cfg)) {
    const s = localToDate(opts.dateStr, t), e = new Date(s.getTime() + opts.cfg.session_minutes * MS_MIN);
    if (s.getTime() < minStart) continue;
    const overlap = active.filter((b) => new Date(b.starts_at) < e && new Date(b.ends_at) > s);
    let state: SlotState = 'free';
    let groupCount = 0;
    if (overlap.some((b) => opts.athleteId !== null && b.athlete_id === opts.athleteId)) state = 'mine';
    else if (overlap.length) {
      const sameGroup = overlap.every((b) => b.format === 'group' && b.rink_id === opts.rinkId &&
        new Date(b.starts_at).getTime() === s.getTime());
      groupCount = overlap.length;
      state = sameGroup && opts.groupsEnabled && overlap.length < 3 && opts.wantGroup ? 'group' : 'busy';
    }
    res.push({ starts_at: s.toISOString(), ends_at: e.toISOString(), time: hhmm(t), state, groupCount });
  }
  return res;
}

// ---------- цены ----------
export function groupDiscount(people: number): number {
  return people >= 3 ? 0.2 : people === 2 ? 0.1 : 0;
}

export function priceFor(base: number | null, people: number): number | null {
  if (base === null || base === undefined) return null;
  return Math.round(Number(base) * (1 - groupDiscount(people)) * 100) / 100;
}

// ---------- ачивки ----------
export type Badge = { id: string; title: string; text: string; got: boolean; at: string | null; num?: string };

export function achievements(done: { starts_at: string }[]) {
  const sorted = [...done].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const count = sorted.length;
  const nth = (n: number) => (sorted[n - 1] ? sorted[n - 1].starts_at : null);
  const first = (f: (p: ReturnType<typeof localParts>) => boolean) => {
    const b = sorted.find((x) => f(localParts(new Date(x.starts_at))));
    return b ? b.starts_at : null;
  };
  const list: Badge[] = [];
  for (const n of [10, 25, 50, 100]) {
    list.push({ id: `n${n}`, title: `${n} занятий`, num: String(n), text: `Нужно ${n} ${plural(n, 'занятие', 'занятия', 'занятий')}.`, got: count >= n, at: nth(n) });
  }
  const early = first((p) => p.minuteOfDay < 7 * 60 + 30);
  const night = first((p) => p.minuteOfDay >= 22 * 60);
  const hall = first((p) => p.m === 10 && p.d === 31);
  const ny = first((p) => p.m === 12 && p.d === 31);
  list.push({ id: 'early', title: 'Ранняя пташка', text: 'Занятие, которое начинается до 7:30 утра.', got: !!early, at: early });
  list.push({ id: 'night', title: 'Ночной лёд', text: 'Занятие, которое начинается в 22:00 или позже.', got: !!night, at: night });
  list.push({ id: 'halloween', title: 'Хэллоуин', text: 'Тренировка 31 октября.', got: !!hall, at: hall });
  list.push({ id: 'newyear', title: 'Новогодний лёд', text: 'Тренировка 31 декабря.', got: !!ny, at: ny });
  const next = [10, 25, 50, 100].find((n) => n > count) ?? null;
  const prev = [0, 10, 25, 50, 100].filter((n) => n <= count).pop() ?? 0;
  return { count, next, prev, badges: list };
}

// ---------- регулярные записи ----------
export type PastLite = { starts_at: string; ends_at: string; rink_id: string; service: string };

/** Ищет повторяющееся время: одно и то же место, день недели и время минимум в `minWeeks` разных неделях. */
export function regularCandidate(past: PastLite[], minWeeks = 3) {
  const groups = new Map<string, { weeks: Set<string>; sample: PastLite; weekday: number; minute: number }>();
  for (const b of past) {
    const p = localParts(new Date(b.starts_at));
    const key = `${p.weekday}|${p.minuteOfDay}|${b.rink_id}|${b.service}`;
    const g = groups.get(key) ?? { weeks: new Set<string>(), sample: b, weekday: p.weekday, minute: p.minuteOfDay };
    g.weeks.add(weekStartOf(p.dateStr));
    groups.set(key, g);
  }
  let best: { weekday: number; minute: number; rink_id: string; service: string; weeks: number } | null = null;
  for (const g of groups.values()) {
    if (g.weeks.size >= minWeeks && (!best || g.weeks.size > best.weeks)) {
      best = { weekday: g.weekday, minute: g.minute, rink_id: g.sample.rink_id, service: g.sample.service, weeks: g.weeks.size };
    }
  }
  return best;
}

export const WEEKDAY_ACC = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
export const WEEKDAY_SHORT = WD_SHORT;

/** Склеивает часы шаблона в интервалы по местам: «09–13 · Замок». */
export function dayBlocks(weekday: number, avail: Avail[]) {
  const byRink = new Map<string, number[]>();
  for (const a of avail) if (a.weekday === weekday) byRink.set(a.rink_id, [...(byRink.get(a.rink_id) ?? []), a.hour]);
  const out: { rink_id: string; from: number; to: number }[] = [];
  for (const [rink, hrs] of byRink) {
    hrs.sort((a, b) => a - b);
    let i = 0;
    while (i < hrs.length) {
      let j = i;
      while (j + 1 < hrs.length && hrs[j + 1] === hrs[j] + 1) j++;
      out.push({ rink_id: rink, from: hrs[i], to: hrs[j] + 1 });
      i = j + 1;
    }
  }
  return out.sort((a, b) => a.from - b.from);
}
