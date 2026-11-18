// Экраны спортсмена (или родителя).
import {
  screen, html, raw, api, run, go, session, avatar, icon, chev, seg, rinkDot, money, reminderLabel, reminderSheet,
  confirmBox, alertBox, sheet, closeOverlay, toast, haptic, openLink, plural, esc, colorFor,
} from './core.js';

const SERVICES = [
  ['ice', 'Ледовая тренировка', 'На льду', '#0A6CFF', 'snow'],
  ['ofp', 'Сухая тренировка', 'На полу, ОФП', '#F08300', 'dumbbell'],
  ['online', 'Онлайн-занятие', 'Лёд или ОФП', '#28A745', 'video'],
];
const svc = (id) => SERVICES.find((s) => s[0] === id) ?? SERVICES[0];
const STATUS = {
  pending: ['Ждёт подтверждения тренера', 'orange'],
  confirmed: ['Подтверждено', 'green'],
  done: ['Состоялось', 'grey'],
  noshow: ['Пропущено', 'red'],
  declined: ['Отклонено', 'red'],
};
function statusPill(b) {
  if (b.status === 'cancelled') return html`<span class="pill red">${b.cancelled_by === 'coach' ? 'Отменено тренером' : 'Отменено'}</span>`;
  const [t, c] = STATUS[b.status] ?? [b.status, 'grey'];
  return html`<span class="pill ${c}">${t}</span>`;
}
function placeText(b) {
  if (b.service === 'online') return `Онлайн${b.topic ? ', ' + (b.topic === 'ice' ? 'лёд' : 'ОФП') : ''}`;
  return `${b.serviceShort} · ${b.rink?.name ?? ''}`;
}

// черновик записи между шагами «время» → «подтверждение»
export const draft = { v: null };

// ---------------------------------------------------------------- главная
screen('/a/home', {
  tab: 'athlete:/a/home',
  load: (p) => api('athleteHome', { coachId: p.coach }),
  view(ctx) {
    const d = ctx.data;
    if (!d.coach) {
      return html`<div class="content top"><h1 class="large-title">Запись</h1>
        <div class="card pad center" style="padding:28px 20px">
          <span class="tile lg" style="background:#0A6CFF;margin:0 auto">${raw(icon('qr', 24))}</span>
          <b style="font-size:18px">Попросите у тренера ссылку</b>
          <span class="muted" style="font-size:15px;line-height:1.45">Тренер отправит ссылку или QR-код. Откройте её — и здесь появится запись к нему.</span>
        </div></div>`;
    }
    const c = d.coach;
    return html`<div class="content top" style="gap:24px">
      ${d.coaches.length > 1 ? html`<div class="chips">${d.coaches.map((x) => html`<button class="chip soft" aria-pressed="${String(x.id === c.id)}" data-act="coach" data-id="${x.id}">${x.name}</button>`)}</div>` : ''}
      <a href="#/a/coach?id=${c.id}" class="card" style="padding:24px 20px 0;display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--text)">
        ${avatar(c.name, 88, c.photo_url, colorFor(c.id))}
        <div class="center"><div style="font-size:22px;font-weight:700">${c.name}</div>${c.specialization ? html`<div class="muted" style="font-size:15px;margin-top:4px">${c.specialization}</div>` : ''}</div>
        ${c.places.length ? html`<div class="chips" style="justify-content:center">${c.places.slice(0, 3).map((p) => html`<span class="pill blue" style="display:inline-flex;align-items:center;gap:6px">${rinkDot(p.color)}${p.short}</span>`)}</div>` : ''}
        <div style="align-self:stretch;border-top:1px solid var(--sep);height:48px;display:flex;align-items:center;justify-content:space-between;margin-top:8px">
          <span style="color:var(--acc);font-weight:500">О тренере</span>${chev()}</div>
      </a>
      ${d.absence ? html`<div class="group"><div class="label">Важно</div>
        <div class="card" style="padding:16px;display:flex;align-items:center;gap:14px" role="status">
          <span class="tile lg" style="background:${d.absence.kind === 'sick' ? '#E5333F' : '#0E8FA8'}">${raw(icon(d.absence.kind === 'sick' ? 'thermo' : 'plane', 22))}</span>
          <span class="row-main"><b>Тренер ${d.absence.kind === 'sick' ? 'на больничном' : 'в отпуске'} ${d.absence.active ? '' : `с ${d.absence.fromLabel} `}до ${d.absence.toLabel}</b>
          <span class="sub">На эти дни записаться нельзя</span></span></div></div>`
        : d.next ? html`<div class="group"><div class="label">Ближайшая запись</div>
        <a href="#/a/bookings" class="card" style="padding:16px;display:flex;align-items:center;gap:14px;color:var(--text)">
          <span class="tile lg" style="background:#E5333F;flex-direction:column;line-height:1"><span style="font-size:10px;font-weight:600;text-transform:uppercase">${d.next.dayLabel.split(',')[0]}</span><span style="font-size:18px;font-weight:700;padding-top:2px">${Number(d.next.date.slice(8))}</span></span>
          <span class="row-main" style="flex:1"><b>${d.next.time} · ${placeText(d.next)}</b>${statusPill(d.next)}</span>${chev()}</a></div>` : ''}
      <div class="group"><div class="label">Записаться</div>
        <div class="list">${SERVICES.map(([id, t, sub, col, ic]) => html`<a class="row" href="#/a/book?coach=${c.id}&service=${id}" style="color:var(--text)">
          <span class="row-icon"><span class="tile" style="background:${col}">${raw(icon(ic, 20))}</span>
          <span class="row-main"><span style="font-weight:500">${t}</span><span class="sub">${sub} · ${money(c.prices[id])} за час</span></span></span>${chev()}</a>`)}</div>
        ${c.groups ? html`<div class="hint">Можно заниматься в мини-группе до 3 человек: вдвоём −10%, втроём −20% каждому.</div>` : ''}
      </div>
    </div>`;
  },
  acts: { coach(ctx, el) { go(`/a/home?coach=${el.dataset.id}`, true); } },
});

// ---------------------------------------------------------------- профиль тренера
screen('/a/coach', {
  back: true, title: '', backTo: () => '/a/home',
  load: (p) => api('coachPublic', { coachId: p.id }),
  view(ctx) {
    const c = ctx.data;
    return html`<div class="content" style="gap:24px">
      <div class="hero">${avatar(c.name, 112, c.photo_url, colorFor(c.id))}
        <div><div style="font-size:26px;font-weight:700">${c.name}</div>${c.specialization ? html`<div class="muted" style="margin-top:4px">${c.specialization}</div>` : ''}</div></div>
      <div class="btn-row three">
        <a class="action-tile" href="#/a/book?coach=${c.id}">${raw(icon('cal', 22))}Записаться</a>
        <button class="action-tile" data-act="__link" data-url="https://t.me/${c.username ?? ''}" ${c.username ? '' : 'disabled'}>${raw(icon('chat', 22))}Написать</button>
        <button class="action-tile" data-act="share">${raw(icon('share', 22))}Поделиться</button>
      </div>
      ${c.about ? html`<div class="group"><div class="label">О себе</div><div class="card" style="padding:16px;line-height:1.5;white-space:pre-line">${c.about}</div></div>` : ''}
      <div class="list">
        <div class="row"><span class="row-icon"><span class="tile sm" style="background:#28A745">${raw(icon('video', 17))}</span>Формат</span><span class="val">${c.places.some((p) => p.online) ? (c.places.some((p) => !p.online) ? 'Онлайн и очно' : 'Онлайн') : 'Очно'}</span></div>
        <div class="row"><span class="row-icon"><span class="tile sm" style="background:#0A6CFF">${raw(icon('snow', 17))}</span>Где</span><span class="val">${c.places.filter((p) => !p.online).map((p) => p.short).join(', ') || '—'}</span></div>
        ${c.experience ? html`<div class="row"><span class="row-icon"><span class="tile sm" style="background:#F08300">${raw(icon('target', 17))}</span>Опыт</span><span class="val">${c.experience}</span></div>` : ''}
      </div>
    </div>`;
  },
  footer: (ctx) => html`<a class="btn primary big" href="#/a/book?coach=${ctx.data.id}">Записаться на занятие</a>`,
  acts: {
    share(ctx) {
      const text = `Запись к тренеру ${ctx.data.name}`;
      openLink(`https://t.me/share/url?url=${encodeURIComponent(location.href.split('#')[0])}&text=${encodeURIComponent(text)}`);
    },
  },
});

// ---------------------------------------------------------------- выбор времени
function bookScreen(path, forCoach) {
  screen(path, {
    back: true, title: 'Запись', backLabel: forCoach ? 'Назад' : 'Услуги',
    backTo: () => (forCoach ? '/c/today' : '/a/home'),
    init(ctx) {
      const p = ctx.params;
      ctx.state = { service: p.service ?? 'ice', rinkId: p.rink ?? null, date: p.date ?? null, format: 'solo', slot: null };
    },
    load(p, ctx) {
      const st = ctx.state;
      return api('slots', {
        coachId: forCoach ? session.me.user.id : p.coach, athleteId: forCoach ? p.athlete : undefined,
        service: st.service, rinkId: st.rinkId, date: st.date, format: st.format,
      });
    },
    view(ctx) {
      const d = ctx.data, st = ctx.state;
      st.rinkId = d.rinkId; st.date = d.date;
      const s = svc(d.service);
      return html`<div class="content" style="gap:16px">
        ${d.frozen ? html`<div class="banner orange" role="status">${raw(icon('warn', 20, 2.2))}<span>Тренер ещё не подтвердил расписание на эту неделю — возможны изменения. Заявку можно отправить.</span></div>` : ''}
        ${forCoach ? '' : html`<div class="seg" role="radiogroup" aria-label="Услуга" style="grid-template-columns:repeat(3,minmax(0,1fr))">${SERVICES.map(([id, , , , ]) =>
          html`<button type="button" role="radio" aria-checked="${String(id === d.service)}" data-act="service" data-v="${id}">${id === 'ice' ? 'Лёд' : id === 'ofp' ? 'ОФП' : 'Онлайн'}</button>`)}</div>`}
        ${forCoach ? html`${seg('service', [['ice', 'Лёд'], ['ofp', 'ОФП'], ['online', 'Онлайн']], d.service)}` : ''}
        <div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:14px">
          <span class="tile" style="background:${s[3]}">${raw(icon(s[4], 20))}</span>
          <span class="row-main"><b>${s[1]}</b><span class="sub">Сеанс ${d.sessionMinutes} мин · ${money(d.price)} за час</span></span></div>
        ${d.places.length > 1 ? html`<div class="group"><div class="label">${d.service === 'online' ? 'Формат' : 'Каток'}</div>
          <div class="choice-grid" role="radiogroup" style="grid-template-columns:repeat(${Math.min(3, d.places.length)},minmax(0,1fr))">${d.places.map((p) =>
            html`<button type="button" class="choice" role="radio" aria-checked="${String(p.id === d.rinkId)}" data-act="rink" data-v="${p.id}">${rinkDot(p.color)}${p.short}</button>`)}</div></div>` : ''}
        ${d.groups && !forCoach ? html`<div class="group"><div class="label">Формат</div>${seg('format', [['solo', 'Индивидуально'], ['group', 'Можно в группе']], st.format)}
          <div class="hint">${st.format === 'group' ? 'Видны сеансы, к которым можно присоединиться. Каждому дешевле: вдвоём −10%, втроём −20%.' : 'Занятие только с вами.'}</div></div>` : ''}
        ${!d.places.length ? html`<div class="empty">Тренер пока не открыл время для этой услуги.</div>` : html`
        <div class="card pad">
          <b style="font-size:17px">${d.month}</b>
          <div class="days">${d.days.slice(0, 7).map((x) => dayBtn(x, d.date))}</div>
          <div class="days">${d.days.slice(7, 14).map((x) => dayBtn(x, d.date))}</div>
        </div>
        <div class="group"><div class="label"><span>Сеансы · ${d.dateLabel}</span></div>
          ${d.slots.length ? html`<div class="slots">${d.slots.map((x) => {
            const dis = x.state === 'busy' || x.state === 'mine';
            const note = x.state === 'busy' ? 'занято' : x.state === 'mine' ? 'ваша запись' : x.state === 'group' ? `группа ${x.groupCount}/3` : 'свободно';
            return html`<button type="button" class="slot ${x.state === 'group' ? 'group' : ''}" aria-pressed="${String(st.slot?.starts_at === x.starts_at)}" ${dis ? 'disabled' : ''}
              data-act="slot" data-s="${x.starts_at}" data-e="${x.ends_at}" data-t="${x.time}" data-g="${x.state === 'group' ? 1 : 0}" aria-label="${x.time} — ${note}"><span class="t">${x.time}</span><span class="n">${note}</span></button>`;
          })}</div>` : html`<div class="empty" style="padding:16px">На этот день свободных сеансов нет.</div>`}
        </div>`}
      </div>`;
    },
    footer(ctx) {
      const st = ctx.state;
      return html`<button class="btn primary big" data-act="next" ${st.slot ? '' : 'disabled'}>${st.slot ? `Далее · ${ctx.data.dateLabel}, ${st.slot.time}` : 'Выберите сеанс'}</button>`;
    },
    acts: {
      service(ctx, el) { Object.assign(ctx.state, { service: el.dataset.v, rinkId: null, slot: null }); ctx.reload(); },
      rink(ctx, el) { Object.assign(ctx.state, { rinkId: el.dataset.v, slot: null }); ctx.reload(); },
      format(ctx, el) { Object.assign(ctx.state, { format: el.dataset.v, slot: null }); ctx.reload(); },
      day(ctx, el) { Object.assign(ctx.state, { date: el.dataset.v, slot: null }); ctx.reload(); },
      slot(ctx, el) { haptic.tap(); ctx.state.slot = { starts_at: el.dataset.s, ends_at: el.dataset.e, time: el.dataset.t, group: el.dataset.g === '1' }; ctx.render(); },
      next(ctx) {
        const d = ctx.data, st = ctx.state;
        draft.v = {
          coachId: forCoach ? session.me.user.id : ctx.params.coach, athleteId: forCoach ? ctx.params.athlete : null,
          service: d.service, rinkId: d.rinkId, place: d.places.find((p) => p.id === d.rinkId), startsAt: st.slot.starts_at,
          when: `${d.dateLabel}, ${st.slot.time}`, format: st.slot.group || st.format === 'group' ? 'group' : 'solo', price: d.price,
          groupNow: st.slot.group, replaceId: ctx.params.replace ?? null, groups: d.groups,
        };
        go(forCoach ? '/c/confirm' : '/a/confirm');
      },
    },
  });
}
function dayBtn(x, sel) {
  return html`<button type="button" class="day" data-act="day" data-v="${x.date}" aria-pressed="${String(x.date === sel)}" ${x.available ? '' : 'disabled'}
    aria-label="${x.wd} ${x.num}${x.available ? '' : x.absent ? ' — тренер отсутствует' : ' — нет сеансов'}"><span class="wd">${x.wd}</span><span class="num">${x.num}</span></button>`;
}
bookScreen('/a/book', false);
bookScreen('/c/book', true);

// ---------------------------------------------------------------- подтверждение
function confirmScreen(path, forCoach) {
  screen(path, {
    back: true, title: 'Подтверждение',
    backTo: () => (forCoach ? '/c/today' : '/a/home'),
    async load() {
      if (!draft.v) throw new Error('Выберите время заново');
      if (forCoach) return { athlete: null };
      return { athlete: (await api('me')).athlete };
    },
    init(ctx) { ctx.state = { topic: 'ice', comment: '', reminder: undefined }; },
    view(ctx) {
      const v = draft.v, st = ctx.state, a = ctx.data.athlete;
      if (st.reminder === undefined) st.reminder = a?.reminder_minutes ?? 120;
      const s = svc(v.service);
      const who = a ? [a.first_name, a.last_name].filter(Boolean).join(' ') : '';
      return html`<div class="content">
        <div class="list">
          <div class="row"><span class="row-icon"><span class="tile sm" style="background:${s[3]}">${raw(icon(s[4], 17))}</span><span class="muted">Услуга</span></span><span style="font-weight:500">${s[1]}</span></div>
          ${v.service !== 'online' ? html`<div class="row"><span class="row-icon"><span class="tile sm" style="background:${v.place?.color}">${raw(icon('snow', 17))}</span><span class="muted">Каток</span></span><span style="font-weight:500">${v.place?.name}</span></div>` : ''}
          <div class="row"><span class="row-icon"><span class="tile sm" style="background:#E5333F">${raw(icon('cal', 17))}</span><span class="muted">Когда</span></span><span style="font-weight:500">${v.when}</span></div>
          <div class="row"><span class="row-icon"><span class="tile sm" style="background:#F08300">${raw(icon('card', 17))}</span><span class="muted">Стоимость</span></span><span style="font-weight:600">${money(v.price)}${v.format === 'group' ? ', в группе −10–20%' : ''}</span></div>
        </div>
        ${v.service === 'online' ? html`<div class="group"><div class="label">О чём занятие</div>${seg('topic', [['ice', 'Лёд'], ['ofp', 'ОФП']], st.topic)}</div>` : ''}
        ${v.format === 'group' ? html`<div class="banner blue">${raw(icon('users', 20))}<span>${v.groupNow ? 'Вы присоединяетесь к мини-группе.' : 'К вам смогут присоединиться ещё 1–2 спортсмена.'} Каждому дешевле: вдвоём −10%, втроём −20%.</span></div>` : ''}
        ${forCoach ? '' : html`<a class="card row" href="#/a/profile-edit" style="padding:0 16px;color:var(--text)"><span>Занимается</span><span class="val">${who || 'заполните анкету'}${chev()}</span></a>`}
        <div class="group"><label class="label" for="cm">Комментарий</label>
          <input id="cm" class="field" data-bind="comment" value="${st.comment}" placeholder="${forCoach ? 'Заметка к записи' : 'Необязательно'}"></div>
        ${forCoach ? '' : html`<div class="group">
          <button class="card row" style="padding:0 16px;border:0" data-act="rem"><span>Напомнить о занятии</span><span class="val acc">${reminderLabel(st.reminder)}${chev()}</span></button>
          <div class="hint">Сначала тренер подтвердит заявку. За 24 часа бот обязательно попросит подтвердить, что вы придёте.</div></div>`}
      </div>`;
    },
    footer: () => html`<button class="btn primary big" data-act="send">${forCoach ? 'Записать' : 'Отправить заявку'}</button>`,
    acts: {
      topic(ctx, el) { ctx.state.topic = el.dataset.v; ctx.render(); },
      rem(ctx) { reminderSheet('Напомнить', ctx.state.reminder, (m) => { ctx.state.reminder = m; ctx.render(); }); },
      async send(ctx) {
        const v = draft.v, st = ctx.state;
        const b = await run(() => api('book', {
          coachId: v.coachId, athleteId: v.athleteId ?? undefined, service: v.service, rinkId: v.rinkId, startsAt: v.startsAt, format: v.format,
          topic: v.service === 'online' ? st.topic : null, comment: st.comment, ...(forCoach ? {} : { reminderMinutes: st.reminder }),
        }));
        if (v.replaceId) await api('cancelBooking', { id: v.replaceId }).catch(() => {});
        draft.v = null;
        toast(forCoach ? 'Спортсмен записан' : b.status === 'pending' ? 'Заявка отправлена тренеру' : 'Вы записаны');
        go(forCoach ? '/c/today' : '/a/bookings', true);
      },
    },
  });
}
confirmScreen('/a/confirm', false);
confirmScreen('/c/confirm', true);

// ---------------------------------------------------------------- мои записи
screen('/a/bookings', {
  tab: 'athlete:/a/bookings',
  init(ctx) { ctx.state = { tab: 'up' }; },
  load: () => api('myBookings'),
  view(ctx) {
    const d = ctx.data, up = ctx.state.tab === 'up';
    const list = up ? d.upcoming : d.past;
    return html`<div class="content top" style="gap:16px">
      <h1 class="large-title">Мои записи</h1>
      <div class="seg" role="tablist" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <button role="tab" aria-selected="${String(up)}" data-act="tab" data-v="up">Предстоящие</button>
        <button role="tab" aria-selected="${String(!up)}" data-act="tab" data-v="past">Прошедшие</button></div>
      ${up && d.offer ? html`<div class="card pad">
        <div style="display:flex;gap:12px;align-items:flex-start"><span class="tile" style="background:#28A745">${raw(icon('refresh', 20, 2.2))}</span>
        <span style="font-size:14px;line-height:1.4">Вы ходите <b>${d.offer.label}</b>${d.offer.place ? ` (${d.offer.place})` : ''} уже ${d.offer.weeks} ${plural(d.offer.weeks, 'неделю', 'недели', 'недель')}. Бронировать это время автоматически?</span></div>
        <div class="btn-row"><button class="btn primary" data-act="offer" data-v="1">Да, бронировать</button><button class="btn" data-act="offer" data-v="0">Не сейчас</button></div></div>` : ''}
      ${list.length ? list.map((b) => bookingCard(b, up)) : html`<div class="empty">${up ? 'Пока нет записей. Выберите время на главной.' : 'Здесь появятся прошедшие занятия.'}</div>`}
    </div>`;
  },
  acts: {
    tab(ctx, el) { ctx.state.tab = el.dataset.v; ctx.render(); },
    async offer(ctx, el) {
      const o = ctx.data.offer;
      await run(() => api('regularDecision', { accept: el.dataset.v === '1', coachId: o.coachId, weekday: o.weekday, minute: o.minute, rinkId: o.rink_id, service: o.service }),
        el.dataset.v === '1' ? 'Постоянная запись включена' : null);
      ctx.reload();
    },
    async cancel(ctx, el) {
      const b = ctx.data.upcoming.find((x) => x.id === el.dataset.id);
      const late = b.lateIfCancel && b.status === 'confirmed';
      const ok = await confirmBox('Отменить запись?', late ? `До занятия меньше ${b.freeCancelHours} ч — это поздняя отмена, тренер её увидит.` : 'Время освободится для других.', 'Отменить запись', true);
      if (!ok) return;
      await run(() => api('cancelBooking', { id: b.id }), 'Запись отменена');
      ctx.reload();
    },
    move(ctx, el) {
      const b = ctx.data.upcoming.find((x) => x.id === el.dataset.id);
      go(`/a/book?coach=${b.coach_id}&service=${b.service}&rink=${b.rink?.id ?? ''}&replace=${b.id}`);
    },
    rem(ctx, el) {
      const b = ctx.data.upcoming.find((x) => x.id === el.dataset.id);
      reminderSheet('Напомнить', b.reminder_minutes, async (m) => {
        await run(() => api('setBookingReminder', { id: b.id, minutes: m }), 'Напоминание обновлено');
        ctx.reload();
      });
    },
  },
});
function bookingCard(b, up) {
  const active = up && (b.status === 'pending' || b.status === 'confirmed');
  const cancelledByCoach = b.status === 'cancelled' && b.cancelled_by === 'coach';
  return html`<div class="card pad">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">${statusPill(b)}${b.regular ? html`<span class="pill blue">постоянная</span>` : ''}</div>
    <div class="row-main"><span style="font-size:18px;font-weight:600;${b.status === 'cancelled' ? 'text-decoration:line-through;color:var(--sec)' : ''}">${b.dayLabel} · ${b.time}</span>
      <span class="sub" style="font-size:15px">${placeText(b)}${b.format === 'group' ? ' · мини-группа' : ''}${b.coachName ? ` · ${b.coachName}` : ''}</span>
      ${cancelledByCoach && b.cancel_reason ? html`<span class="sub" style="font-size:14px;margin-top:4px">Причина: ${b.cancel_reason}</span>` : ''}</div>
    ${active ? html`<div class="btn-row"><button class="btn tint" data-act="move" data-id="${b.id}">Перенести</button><button class="btn danger-soft" data-act="cancel" data-id="${b.id}">Отменить</button></div>
      <button class="row" style="border-top:1px solid var(--sep);border-bottom:0;padding:12px 0 0;min-height:0" data-act="rem" data-id="${b.id}"><span>Напомнить</span><span class="val acc">${b.reminderLabel}${chev()}</span></button>` : ''}
    ${cancelledByCoach ? html`<a class="btn tint" href="#/a/book?coach=${b.coach_id}&service=${b.service}">Выбрать другое время</a>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- прогресс
const BADGE_ICON = { early: 'sun', night: 'moon', halloween: 'pumpkin', newyear: 'snow' };
const BADGE_COLOR = { n10: '#F08300', n25: '#F08300', n50: '#E5333F', n100: '#8E44EC', early: '#0A6CFF', night: '#5856D6', halloween: '#E07B00', newyear: '#E5333F' };
screen('/a/progress', {
  tab: 'athlete:/a/progress',
  init(ctx) { ctx.state = { sel: null }; },
  load: () => api('progress'),
  view(ctx) {
    const d = ctx.data;
    const sel = d.badges.find((b) => b.id === ctx.state.sel) ?? d.badges.find((b) => b.got) ?? d.badges[0];
    const pct = d.next ? Math.round(((d.count - d.prev) / (d.next - d.prev)) * 100) : 100;
    const stages = ['Учим', 'Получается', 'Чисто'], sc = ['orange', 'blue', 'green'], bar = ['#F08300', '#0A6CFF', '#28A745'];
    return html`<div class="content top" style="gap:16px">
      <h1 class="large-title">Прогресс</h1>
      <div class="card pad" style="gap:14px;border-radius:20px">
        <div style="display:flex;align-items:center;gap:14px">
          <span class="tile" style="width:60px;height:60px;border-radius:18px;background:#F08300">${raw(icon('flame', 34))}</span>
          <span class="row-main"><span style="font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.05">${d.count}</span>
          <span class="sub" style="font-size:14px">${plural(d.count, 'занятие', 'занятия', 'занятий')}${d.coachName ? ` · тренер ${d.coachName}` : ''}</span></span></div>
        ${d.next ? html`<div class="group" style="gap:6px"><div class="progress" role="progressbar" aria-valuenow="${d.count}" aria-valuemin="${d.prev}" aria-valuemax="${d.next}"><div style="width:${pct}%"></div></div>
          <span class="muted" style="font-size:13px">Ещё ${d.next - d.count} до огонька «${d.next}»</span></div>` : html`<span class="muted">Все огоньки собраны!</span>`}
      </div>
      <div class="group"><div class="label"><span>Ачивки</span><span>${d.badges.filter((b) => b.got).length} из ${d.badges.length}</span></div>
        <div class="card" style="padding:14px 8px 10px;display:flex;flex-direction:column;gap:10px">
          <div class="badges">${d.badges.map((b) => html`<button class="badge ${b.got ? 'got' : ''}" data-act="badge" data-id="${b.id}" aria-pressed="${String(b.id === sel.id)}" aria-label="${b.title}${b.got ? ' — получено' : ''}">
            <span class="b" style="${b.got ? `background:${BADGE_COLOR[b.id]};color:#fff` : ''}">${b.num ? b.num : raw(icon(BADGE_ICON[b.id], 26))}</span><span class="t">${b.title}</span></button>`)}</div>
          <div style="margin:0 8px;padding-top:10px;border-top:1px solid var(--sep);font-size:13px;line-height:1.4;color:var(--sec)">${sel.title}: ${sel.text}${sel.got && sel.atLabel ? ` Получено ${sel.atLabel}.` : ''}</div>
        </div></div>
      <div class="group"><div class="label">Элементы от тренера</div>
        ${d.elements.length ? html`<div class="list">${d.elements.map((e) => html`<div class="row"><span>${e.name}</span>
          <span style="display:flex;align-items:center;gap:8px"><span class="stagebar" aria-hidden="true">${[0, 1, 2].map((i) => html`<span style="${i <= e.stage ? `background:${bar[e.stage]}` : ''}"></span>`)}</span>
          <span class="pill ${sc[e.stage]}" style="min-width:84px;text-align:center">${stages[e.stage]}</span></span></div>`)}</div>`
          : html`<div class="card empty" style="padding:20px">Тренер ещё не добавил элементы.</div>`}</div>
      ${d.notes.length ? html`<div class="group"><div class="label">Заметки тренера</div>${d.notes.map((n) => html`<div class="card pad" style="gap:4px"><span class="muted" style="font-size:13px">${n.dateLabel}</span><span style="white-space:pre-line">${n.text}</span></div>`)}</div>` : ''}
    </div>`;
  },
  acts: { badge(ctx, el) { haptic.tap(); ctx.state.sel = el.dataset.id; ctx.render(); } },
});

// ---------------------------------------------------------------- профиль спортсмена
screen('/a/account', {
  tab: 'athlete:/a/account',
  load: () => api('account'),
  view(ctx) {
    const d = ctx.data, a = d.athlete;
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || d.tgName;
    return html`<div class="content top" style="gap:16px">
      <h1 class="large-title">Профиль</h1>
      <a href="#/a/profile-edit" class="card" style="padding:16px;display:flex;align-items:center;gap:14px;color:var(--text)">
        ${avatar(name, 60, null, '#E0306F')}
        <span class="row-main" style="flex:1"><span style="font-size:19px;font-weight:600">${name}${d.age !== null ? `, ${d.age} ${plural(d.age, 'год', 'года', 'лет')}` : ''}</span>
          <span class="sub" style="display:flex;align-items:center;gap:6px">${a.kind === 'parent' ? html`<span class="pill purple" style="padding:2px 6px;font-size:11px">Родитель</span>${d.tgName}` : 'Спортсмен'}${d.username ? ` · @${d.username}` : ''}</span></span>${chev()}</a>
      <div class="group"><div class="label">Запись</div><div class="list">
        <button class="row" data-act="rem"><span>Напоминать о занятии</span><span class="val acc">${d.reminderLabel}${chev()}</span></button>
        ${d.regulars.map((r) => html`<div class="row"><span class="row-main"><span>Постоянная запись</span><span class="sub">${r.label} · ${r.place}</span></span><button class="btn danger-soft" style="height:34px" data-act="stopReg" data-id="${r.id}">Отключить</button></div>`)}
        <button class="row" data-act="ics"><span>Добавить в календарь телефона</span>${chev()}</button>
      </div></div>
      <div class="group"><div class="label"><span>Прошедшие занятия</span><span>${d.doneCount}</span></div><div class="list">
        ${d.past.map((b) => html`<div class="row"><span class="row-icon">${rinkDot(b.rink?.color)}<span class="row-main"><b style="font-size:15px">${b.dayLabel} · ${b.time}</b><span class="sub">${placeText(b)}</span></span></span>
          <span class="muted" style="font-size:13px;${b.status === 'cancelled' ? 'color:var(--red)' : ''}">${b.status === 'done' ? 'Состоялось' : b.status === 'noshow' ? 'Пропуск' : 'Отменено'}</span></div>`)}
        <a class="row link" href="#/a/bookings">Все занятия${chev()}</a></div></div>
      <div class="list">
        <button class="row link" data-act="role">Сменить роль на «Тренер»</button>
        <button class="row danger" data-act="del">Удалить аккаунт</button></div>
    </div>`;
  },
  acts: {
    rem(ctx) {
      reminderSheet('Напоминать', ctx.data.athlete.reminder_minutes, async (m) => {
        await run(() => api('setDefaultReminder', { minutes: m }), 'Сохранено');
        ctx.reload();
      });
    },
    async stopReg(ctx, el) {
      if (!(await confirmBox('Отключить постоянную запись?', 'Уже созданные записи останутся.', 'Отключить', true))) return;
      await run(() => api('stopRegular', { id: el.dataset.id }), 'Отключено');
      ctx.reload();
    },
    ics(ctx) {
      const url = ctx.data.icsUrl;
      const root = sheet(`<div class="sheet-head"><span></span><span class="title">Календарь телефона</span><button class="link-btn right" data-x="close">Готово</button></div>
        <div class="hint" style="padding:0">Ссылка-подписка: занятия сами появятся в календаре и будут обновляться.<br><br>
        <b>iPhone:</b> Настройки → Календарь → Учётные записи → Добавить → Другое → Подписной календарь, вставьте ссылку.<br>
        <b>Android:</b> откройте Google Календарь на компьютере → «Другие календари» → «Добавить по URL».</div>
        <input class="field" readonly value="${esc(url)}" style="background:var(--fill);font-size:13px">
        <button class="btn primary big" data-x="copy">Скопировать ссылку</button>`);
      root.addEventListener('click', async (e) => {
        const x = e.target.closest('[data-x]')?.dataset.x;
        if (x === 'close') closeOverlay();
        if (x === 'copy') { try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { root.querySelector('input').select(); toast('Выделите и скопируйте ссылку'); } }
      });
    },
    role() {
      alertBox('Стать тренером?', 'История занятий сохранится. Вы сможете настроить расписание и получить ссылку для записи.', [
        { text: 'Сменить роль', style: 'bold', onClick: async () => { await run(() => api('switchRole', { role: 'coach' })); session.me = await api('me'); go('/c/profile?first=1', true); } },
        { text: 'Отмена' },
      ]);
    },
    del() {
      alertBox('Удалить аккаунт?', 'Данные и история занятий будут удалены, будущие записи отменены. Потом можно зарегистрироваться заново.', [
        { text: 'Удалить', style: 'danger', onClick: async () => { await run(() => api('deleteAccount')); session.me = await api('me'); go('/onboard', true); } },
        { text: 'Отмена' },
      ]);
    },
  },
});
