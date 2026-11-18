// Отрисовка всех экранов на тестовых данных в заглушке DOM: ловим ошибки шаблонов.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const el = () => ({ innerHTML: '', textContent: '', classList: { add() {}, remove() {} }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], firstElementChild: null });
globalThis.window = { addEventListener() {}, scrollTo() {} };
globalThis.document = { addEventListener() {}, getElementById: () => el(), documentElement: { dataset: {} }, elementFromPoint: () => null };
globalThis.location = { hash: '' };
globalThis.history = { length: 1, pushState() {}, replaceState() {}, back() {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.requestAnimationFrame = (f) => f();

const core = await import('../webapp/js/core.js');
await import('../webapp/js/onboard.js');
await import('../webapp/js/athlete.js');
const { draft } = await import('../webapp/js/athlete.js');
await import('../webapp/js/coach.js');

core.session.me = { user: { id: 1, first_name: 'Ольга', last_name: 'Пак', username: 'olga', role: 'athlete', consent: false }, athlete: { kind: 'parent', first_name: 'Маша' }, coach: null, inviter: { id: 2, name: 'Иван Ф' } };
const rink = { id: 'zamok', name: 'ТЦ «Замок»', short: 'Замок', color: '#0A6CFF' };
const person = { id: 5, name: 'Маша Пак', initials: 'МП', isParent: true, parentName: 'Ольга Пак', username: 'olga', phone: '+375291112233', birth_date: '2017-03-01', about: 'Катается 2 года' };
const bk = (o = {}) => ({ id: 'b1', coach_id: 2, athlete_id: 5, service: 'ice', serviceTitle: 'Ледовая тренировка', serviceShort: 'Лёд', topic: null, format: 'solo', rink, starts_at: '2026-11-19T11:00:00Z', ends_at: '2026-11-19T12:00:00Z',
  date: '2026-11-19', dayLabel: 'чт, 19 ноября', time: '14:00', endTime: '15:00', status: 'confirmed', cancelled_by: null, cancel_reason: null, late_cancel: false, athlete_confirmed: false,
  reminder_minutes: 120, reminderLabel: 'за 2 часа', comment: null, regular: false, person, personLine: 'Маша Пак, 9 лет (родитель: Ольга Пак)', isNew: true, coachName: 'Иван', lateIfCancel: false, freeCancelHours: 24, doneCount: 3, past: false, ...o });
const coachPub = { id: 2, name: 'Иван Фёдоров', specialization: 'Фигурное катание', about: 'Привет', experience: '10 лет', username: 'ivan', photo_url: null, places: [rink, { id: 'online', name: 'Онлайн', short: 'Онлайн', color: '#28A745', online: true }], prices: { ice: 50, ofp: null, online: 30 }, groups: true };
const slots = { service: 'ice', serviceTitle: 'Лёд', price: 50, groups: true, places: [rink, { ...rink, id: 'arena', short: 'Мин. арена' }], rinkId: 'zamok', date: '2026-11-19', dateLabel: 'чт, 19 ноября',
  days: Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(18 + i).padStart(2, '0')}`, wd: 'пн', num: 18 + i, available: i % 3 !== 0, absent: false })),
  slots: [{ starts_at: 'a', ends_at: 'b', time: '09:00', state: 'free', groupCount: 0 }, { starts_at: 'c', ends_at: 'd', time: '10:00', state: 'group', groupCount: 1 }, { starts_at: 'e', ends_at: 'f', time: '11:00', state: 'busy', groupCount: 1 }],
  sessionMinutes: 45, frozen: true, month: 'Ноябрь 2026' };
const DATA = {
  '/onboard': null,
  '/onboard/profile': { kind: 'parent', first_name: 'Маша' },
  '/a/profile-edit': { kind: 'self' },
  '/a/home': { coach: coachPub, coaches: [{ id: 2, name: 'Иван' }, { id: 3, name: 'Пётр' }], absence: null, next: bk({ status: 'pending' }) },
  '/a/coach': coachPub,
  '/a/book': slots, '/c/book': slots,
  '/a/confirm': { athlete: { first_name: 'Маша', reminder_minutes: 90 } }, '/c/confirm': { athlete: null },
  '/a/bookings': { upcoming: [bk(), bk({ id: 'b2', status: 'cancelled', cancelled_by: 'coach', cancel_reason: 'болезнь' })], past: [bk({ status: 'done' })], offer: { weekday: 0, minute: 1020, rink_id: 'arena', service: 'ice', weeks: 4, coachId: 2, label: 'по понедельникам в 17:00', place: 'Минская арена' }, regulars: [] },
  '/a/progress': { count: 14, next: 25, prev: 10, coachName: 'Иван', badges: [{ id: 'n10', title: '10 занятий', num: '10', text: 'x', got: true, at: '2026-11-02', atLabel: '2 ноября' }, { id: 'early', title: 'Ранняя пташка', text: 'y', got: false, at: null, atLabel: null }], elements: [{ id: 1, name: 'Аксель', stage: 1 }], notes: [{ text: 'Молодец', dateLabel: '16 ноября' }] },
  '/a/account': { athlete: { kind: 'parent', first_name: 'Маша', last_name: 'Пак', reminder_minutes: 120 }, age: 9, reminderLabel: 'за 2 часа', tgName: 'Ольга Пак', username: 'olga', past: [bk({ status: 'done' }), bk({ status: 'cancelled' })], doneCount: 14, regulars: [{ id: 1, label: 'пн 17:00', place: 'Мин. арена' }], icsUrl: 'https://x' },
  '/c/today': { date: '2026-11-18', dayLabel: 'ср, 18 ноября', isToday: true, weekdayName: 'Среда', bookings: [bk(), bk({ id: 'b3', status: 'pending' })], pending: [bk({ status: 'pending' })], free: 2, freeRows: [{ time: '12:00', starts_at: '2026-11-18T09:00:00Z', rink }], weekBanner: { weekStart: '2026-11-16', frozen: true }, absence: { kind: 'vacation', date_to: '2026-11-30' } },
  '/c/booking': bk({ status: 'pending', comment: 'Хочу аксель', past: false }),
  '/c/clients': [{ id: 5, person, line: 'Маша', blocked: false, done: 14, late: 3, lastLabel: '16 ноября', activeMonth: true }],
  '/c/client': { id: 5, person, line: 'Маша', age: 9, since: '12 сентября', done: 14, late: 3, warned: null, blocked: false, regulars: ['пн 17:00'], elements: 2, history: [bk({ status: 'done' })], upcoming: [bk()] },
  '/c/goals': { person, elements: [{ id: 1, name: 'Аксель', stage: 1 }], today: '18 ноября' },
  '/c/stats': { period: 'month', kpis: [{ label: 'Занятий', value: '46', delta: '+6', good: true }, { label: 'Отмены', value: '7%', delta: '', good: false }], byRink: [{ id: 'zamok', name: 'ТЦ «Замок»', color: '#0A6CFF', n: 18 }], byDay: [9, 7, 8, 6, 7, 9, 0] },
  '/c/profile': { user_id: 2, name: 'Иван', display_name: 'Иван', specialization: '', price_ice: 50, price_ofp: null, price_online: 30, groups_enabled: true, invite: 'https://t.me/bot?start=c_abc' },
  '/c/share': { user_id: 2, name: 'Иван', invite: 'https://t.me/bot?start=c_abc' },
  '/c/settings': { confirm_mode: 'new', free_cancel_hours: 24, min_book_hours: 3, digest: true, reminders: [30, 120], hours: 49, sessions: '45–60 мин' },
  '/c/rules': { confirm_mode: 'new', free_cancel_hours: 24, min_book_hours: 3, digest: true, reminders: [], hours: 0, sessions: '—' },
  '/c/hours': { cells: [{ weekday: 0, hour: 9, rink_id: 'zamok' }, { weekday: 0, hour: 9, rink_id: 'online' }, { weekday: 1, hour: 23, rink_id: 'zamok' }], rinks: [{ ...rink, is_online: false }, { id: 'online', name: 'Онлайн', short: 'Онлайн', color: '#28A745', is_online: true }] },
  '/c/rinks': [{ id: 'zamok', name: 'ТЦ «Замок»', color: '#0A6CFF', online: false, session_minutes: 45, start_offset: 15 }],
  '/c/week': { weekStart: '2026-11-23', title: '23 ноября – 29 ноября', deadline: 'пн, 23 ноября, 12:00', frozen: false, confirmed: false, days: [{ date: '2026-11-23', name: 'Пн 23', blocks: [{ color: '#0A6CFF', text: '09–13 · Замок' }], absent: null, count: '5 записей' }], regulars: ['Маша — пн 17:00'] },
  '/c/vacation': [{ id: 1, kind: 'vacation', fromLabel: '21 декабря', toLabel: '5 января' }],
  '/c/broadcast': { clients: [{ id: 5, person, blocked: false, activeMonth: true }], rinks: [{ ...rink, is_online: false }] },
};

test('every screen renders', () => {
  draft.v = { coachId: 2, service: 'online', rinkId: 'online', place: rink, startsAt: 'x', when: 'чт, 19 ноября, 14:00', format: 'group', price: 30, groupNow: true };
  const missing = [];
  for (const [path, spec] of core.routes) {
    if (path === '/' || path === '/start') continue;
    if (!(path in DATA)) { missing.push(path); continue; }
    const ctx = { spec, params: { id: '5', coach: '2', first: '1' }, data: DATA[path], state: {}, render() {}, reload() {}, go() {} };
    spec.init?.(ctx);
    const out = String(spec.view(ctx));
    assert.ok(out.length > 50, path);
    assert.ok(!/undefined|\[object Object\]|NaN/.test(out), `${path}: ${(out.match(/.{0,60}(undefined|\[object Object\]|NaN).{0,40}/) || [])[0]}`);
    if (spec.footer) String(spec.footer(ctx));
    if (typeof spec.title === 'function') spec.title(ctx);
  }
  assert.deepEqual(missing, []);
});
