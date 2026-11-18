import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as L from '../supabase/functions/_shared/logic.ts';

test('minsk time conversion', () => {
  const d = L.localToDate('2026-11-19', 14 * 60);
  assert.equal(d.toISOString(), '2026-11-19T11:00:00.000Z');
  const p = L.localParts(d);
  assert.equal(p.dateStr, '2026-11-19'); assert.equal(p.weekday, 3); assert.equal(p.minuteOfDay, 840);
  assert.equal(L.weekStartOf('2026-11-22'), '2026-11-16');
  assert.equal(L.dayLabel('2026-11-19'), 'чт, 19 ноября');
});

test('session starts respect blocks, length and offset', () => {
  const avail = [9, 10, 11, 12, 16, 17, 18].map((h) => ({ weekday: 3, hour: h, rink_id: 'zamok' }));
  assert.deepEqual(L.sessionStarts('2026-11-19', 'zamok', avail, { session_minutes: 45, start_offset: 0 }).map(L.hhmm),
    ['09:00', '09:45', '10:30', '11:15', '12:00', '16:00', '16:45', '17:30', '18:15']);
  assert.deepEqual(L.sessionStarts('2026-11-19', 'zamok', avail, { session_minutes: 60, start_offset: 30 }).map(L.hhmm),
    ['09:30', '10:30', '11:30', '16:30', '17:30']);
});

test('slots: busy, group, mine, absence, min hours', () => {
  const avail = [9, 10, 11].map((h) => ({ weekday: 3, hour: h, rink_id: 'zamok' }));
  const cfg = { session_minutes: 60, start_offset: 0 };
  const b = (h: number, fmt: string, ath: number) => ({ athlete_id: ath, rink_id: 'zamok', format: fmt, status: 'confirmed',
    starts_at: L.localToDate('2026-11-19', h * 60).toISOString(), ends_at: L.localToDate('2026-11-19', h * 60 + 60).toISOString() });
  const base = { dateStr: '2026-11-19', rinkId: 'zamok', avail, cfg, absences: [], minBookHours: 3, groupsEnabled: true,
    athleteId: 7, now: new Date('2026-11-18T10:00:00Z'), bookings: [b(9, 'solo', 1), b(10, 'group', 2), b(11, 'solo', 7)] };
  assert.deepEqual(L.slotsFor({ ...base, wantGroup: true }).map((s) => s.state), ['busy', 'group', 'mine']);
  assert.deepEqual(L.slotsFor({ ...base, wantGroup: false }).map((s) => s.state), ['busy', 'busy', 'mine']);
  assert.equal(L.slotsFor({ ...base, wantGroup: true, absences: [{ date_from: '2026-11-19', date_to: '2026-11-20', kind: 'vacation' }] }).length, 0);
  assert.equal(L.slotsFor({ ...base, wantGroup: true, now: new Date('2026-11-19T04:30:00Z') }).length, 1); // 07:30 + 3 ч → только 11:00
});

test('labels and prices', () => {
  assert.equal(L.reminderLabel(120), 'за 2 часа');
  assert.equal(L.reminderLabel(21), 'за 21 минуту');
  assert.equal(L.reminderLabel(300), 'за 5 часов');
  assert.equal(L.priceFor(50, 2), 45); assert.equal(L.priceFor(50, 3), 40); assert.equal(L.priceFor(null, 1), null);
});

test('achievements and regular candidate', () => {
  const mk = (date: string, min: number) => ({ starts_at: L.localToDate(date, min).toISOString(), ends_at: L.localToDate(date, min + 60).toISOString(), rink_id: 'arena', service: 'ice' });
  const done = [mk('2026-10-31', 7 * 60), mk('2026-11-02', 17 * 60), mk('2026-11-09', 17 * 60), mk('2026-11-16', 17 * 60)];
  const a = L.achievements(done);
  assert.equal(a.count, 4); assert.equal(a.next, 10);
  assert.ok(a.badges.find((b) => b.id === 'early')!.got);
  assert.ok(a.badges.find((b) => b.id === 'halloween')!.got);
  const r = L.regularCandidate(done);
  assert.deepEqual(r && [r.weekday, r.minute, r.weeks], [0, 1020, 3]);
  const blocks = L.dayBlocks(0, [9, 10, 11, 16].map((h) => ({ weekday: 0, hour: h, rink_id: 'zamok' })));
  assert.deepEqual(blocks.map((x) => [x.from, x.to]), [[9, 12], [16, 17]]);
});
