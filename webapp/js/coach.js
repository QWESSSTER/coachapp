// Экраны тренера.
import {
  screen, html, raw, api, run, go, session, avatar, icon, chev, seg, sw, rinkDot, money, reminderLabel, reminderSheet,
  confirmBox, alertBox, sheet, closeOverlay, toast, haptic, openLink, plural, esc, colorFor,
} from './core.js';

const STATUS = { pending: ['Ждёт ответа', 'orange'], confirmed: ['Подтверждено', 'green'], done: ['Состоялось', 'grey'], noshow: ['Не пришёл', 'red'], cancelled: ['Отменено', 'red'], declined: ['Отклонено', 'red'] };
const pill = (b) => {
  if (b.status === 'confirmed' && b.athlete_confirmed) return html`<span class="pill green">Придёт</span>`;
  const [t, c] = STATUS[b.status] ?? [b.status, 'grey'];
  return html`<span class="pill ${c}">${b.status === 'cancelled' && b.late_cancel ? 'Поздняя отмена' : t}</span>`;
};
const place = (b) => (b.service === 'online' ? `Онлайн${b.topic ? ', ' + (b.topic === 'ice' ? 'лёд' : 'ОФП') : ''}` : `${b.serviceShort} · ${b.rink?.short ?? ''}`);
const personSub = (p) => (p?.isParent ? `родитель: ${p.parentName}` : '');

function stepper(name, value, unit, i = '') {
  return html`<div style="display:flex;align-items:center;background:var(--fill);border-radius:10px">
    <button class="link-btn" style="width:44px;height:36px;color:var(--text);font-size:20px" data-act="${name}" data-i="${i}" data-d="-1" aria-label="Меньше">−</button>
    <span style="min-width:64px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums">${value} ${unit}</span>
    <button class="link-btn" style="width:44px;height:36px;color:var(--text);font-size:20px" data-act="${name}" data-i="${i}" data-d="1" aria-label="Больше">+</button></div>`;
}

// ---------------------------------------------------------------- сегодня
screen('/c/today', {
  tab: 'coach:/c/today',
  load: (p) => api('coachToday', { date: p.date }),
  view(ctx) {
    const d = ctx.data;
    const items = [
      ...d.bookings.map((b) => ({ t: b.starts_at, b })),
      ...d.freeRows.map((f) => ({ t: f.starts_at, f })),
    ].sort((a, b) => a.t.localeCompare(b.t));
    return html`<div class="content top" style="gap:20px">
      <div class="head-row">
        <div><div class="eyebrow" style="display:flex;align-items:center;gap:4px">
          <button class="link-btn" style="height:28px;font-size:13px;color:var(--sec)" data-act="day" data-d="-1" aria-label="Предыдущий день">${raw(icon('back', 16, 2.6))}</button>
          ${d.weekdayName}, ${d.dayLabel.split(', ')[1]}
          <button class="link-btn" style="height:28px;font-size:13px;color:var(--sec);transform:scaleX(-1)" data-act="day" data-d="1" aria-label="Следующий день">${raw(icon('back', 16, 2.6))}</button></div>
          <h1 class="large-title">${d.isToday ? 'Сегодня' : d.dayLabel.split(', ')[1]}</h1></div>
        <div style="display:flex;gap:8px">
          <a class="icon-btn" href="#/c/broadcast" aria-label="Рассылка спортсменам">${raw(icon('megaphone', 22))}</a>
          <button class="icon-btn primary" data-act="add" aria-label="Записать спортсмена">${raw(icon('plus', 22, 2.4))}</button></div>
      </div>
      ${d.weekBanner ? html`<a class="banner orange" href="#/c/week?ws=${d.weekBanner.weekStart}" style="color:var(--text)">${raw(icon('clock', 22))}<span>${d.weekBanner.frozen
        ? html`<b>Неделя не подтверждена</b> — записи заморожены, спортсмены видят, что возможны изменения. Нажмите, чтобы подтвердить.`
        : html`<b>Подтвердите расписание недели</b> до понедельника, 12:00.`}</span></a>` : ''}
      ${d.absence ? html`<div class="banner blue">${raw(icon(d.absence.kind === 'sick' ? 'thermo' : 'plane', 20))}<span>${d.absence.kind === 'sick' ? 'Больничный' : 'Отпуск'} до ${d.absence.date_to.split('-').reverse().join('.')}. Запись на эти дни закрыта.</span></div>` : ''}
      <div class="tiles3">
        <div class="kpi"><span class="v" style="color:var(--acc)">${d.bookings.filter((b) => b.status === 'confirmed' || b.status === 'pending' || b.status === 'done').length}</span><span class="l">занятий</span></div>
        <div class="kpi"><span class="v" style="color:var(--green)">${d.free}</span><span class="l">свободно</span></div>
        <div class="kpi"><span class="v" style="color:var(--purple)">${d.pending.length}</span><span class="l">заявки</span></div>
      </div>
      ${d.pending.length ? html`<div class="group"><div class="label"><span>Новые заявки</span><span>${d.pending.length}</span></div>
        ${d.pending.map((b) => html`<div class="card pad" style="gap:14px">
          <a href="#/c/booking?id=${b.id}" style="display:flex;gap:12px;align-items:center;color:var(--text)">${avatar(b.person?.name, 44, null, colorFor(b.athlete_id))}
            <span class="row-main"><span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${b.person?.name}</b>${b.isNew ? html`<span class="pill purple" style="padding:2px 6px;font-size:11px">Новый</span>` : ''}${b.person?.isParent ? html`<span class="pill grey" style="padding:2px 6px;font-size:11px">родитель</span>` : ''}</span>
            <span class="sub" style="font-size:14px">${b.dayLabel} · ${b.time} · ${place(b)}${b.format === 'group' ? ' · группа' : ''}</span></span></a>
          <div class="btn-row"><button class="btn primary" data-act="decide" data-id="${b.id}" data-v="1">Подтвердить</button><button class="btn danger-soft" data-act="decide" data-id="${b.id}" data-v="0">Отклонить</button></div>
        </div>`)}</div>` : ''}
      <div class="group"><div class="label">Расписание</div>
        ${items.length ? html`<div class="list">${items.map((it) => it.b ? html`<a class="row" href="#/c/booking?id=${it.b.id}" style="color:var(--text)">
            <span class="row-icon" style="gap:12px"><b style="width:46px;font-size:15px">${it.b.time}</b>${rinkDot(it.b.rink?.color)}
            <span class="row-main"><span style="font-weight:600;font-size:15px">${it.b.person?.name}</span><span class="sub">${place(it.b)}${it.b.format === 'group' ? ' · группа' : ''}</span></span></span>${pill(it.b)}</a>`
          : html`<div class="row"><span class="row-icon" style="gap:12px"><span style="width:46px;font-size:15px;color:var(--sec);font-weight:600">${it.f.time}</span>${rinkDot('var(--sep)')}
            <span class="row-main"><span class="muted" style="font-size:15px">Свободный сеанс</span><span class="sub">${it.f.rink?.short ?? ''}</span></span></span></div>`)}</div>`
          : html`<div class="card empty" style="padding:20px">На этот день ничего нет. Время для записи задаётся в «Профиль → Настройки → Рабочие часы».</div>`}
      </div>
    </div>`;
  },
  acts: {
    day(ctx, el) {
      const [y, m, dd] = ctx.data.date.split('-').map(Number);
      const t = new Date(Date.UTC(y, m - 1, dd) + Number(el.dataset.d) * 86400000).toISOString().slice(0, 10);
      go(`/c/today?date=${t}`, true);
    },
    async decide(ctx, el) {
      const ok = el.dataset.v === '1';
      await run(() => api('decide', { id: el.dataset.id, accept: ok }), ok ? 'Запись подтверждена — спортсмен получил сообщение' : 'Заявка отклонена');
      ctx.reload();
    },
    async add() {
      const list = await run(() => api('clients'));
      if (!list.length) return toast('Пока нет спортсменов. Отправьте им ссылку из профиля.');
      const root = sheet(`<div class="sheet-head"><span></span><span class="title">Кого записать</span><button class="link-btn right" data-x="close">Закрыть</button></div>
        <div class="list" style="background:var(--fill)">${list.filter((c) => !c.blocked).map((c) => `<button class="row" data-id="${c.id}"><span>${esc(c.person?.name)}</span>${chev()}</button>`).join('')}</div>`);
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]')) return closeOverlay();
        const b = e.target.closest('[data-id]');
        if (b) { closeOverlay(); go(`/c/book?athlete=${b.dataset.id}`); }
      });
    },
  },
});

// ---------------------------------------------------------------- карточка записи
const REASONS = ['Болезнь', 'Срочные дела', 'Не подходит время', 'Другое'];
screen('/c/booking', {
  back: true, title: 'Запись', backTo: () => '/c/today',
  load: (p) => api('bookingDetail', { id: p.id }),
  view(ctx) {
    const b = ctx.data, p = b.person;
    const active = b.status === 'pending' || b.status === 'confirmed';
    return html`<div class="content">
      <div class="card pad" style="gap:16px">
        <a href="#/c/client?id=${b.athlete_id}" style="display:flex;gap:14px;align-items:center;color:var(--text)">${avatar(p?.name, 56, null, colorFor(b.athlete_id))}
          <span class="row-main" style="flex:1"><span style="font-size:19px;font-weight:600">${b.personLine.split(' (')[0]}</span>
          <span class="sub" style="font-size:14px">${[personSub(p), p?.username ? '@' + p.username : '', `${b.doneCount} ${plural(b.doneCount, 'занятие', 'занятия', 'занятий')}`].filter(Boolean).join(' · ')}</span></span>${chev()}</a>
        <div class="btn-row three">
          <button class="action-tile tint" data-act="__link" data-url="https://t.me/${p?.username ?? ''}" ${p?.username ? '' : 'disabled'}>${raw(icon('chat', 20))}Написать</button>
          <button class="action-tile tint" data-act="call" ${p?.phone ? '' : 'disabled'}>${raw(icon('phone', 20))}Позвонить</button>
          <a class="action-tile tint" href="#/c/book?athlete=${b.athlete_id}&service=${b.service}">${raw(icon('plus', 20))}Ещё запись</a>
        </div>
      </div>
      <div class="list">
        <div class="row"><span class="muted">Когда</span><span style="font-weight:500">${b.dayLabel}, ${b.time}–${b.endTime}</span></div>
        <div class="row"><span class="muted">Услуга</span><span style="font-weight:500">${place(b)}</span></div>
        <div class="row"><span class="muted">Формат</span><span style="font-weight:500">${b.format === 'group' ? 'Мини-группа' : 'Индивидуально'}${b.regular ? ' · постоянная' : ''}</span></div>
        <div class="row"><span class="muted">Статус</span>${pill(b)}</div>
        ${b.comment ? html`<div class="row"><span class="muted">Комментарий</span><span style="text-align:right">${b.comment}</span></div>` : ''}
        ${b.cancel_reason ? html`<div class="row"><span class="muted">Причина</span><span>${b.cancel_reason}</span></div>` : ''}
      </div>
      ${b.status === 'pending' ? html`<div class="card pad"><span style="font-size:15px;line-height:1.45">Подтвердите запись — бот сразу сообщит спортсмену.</span>
        <div class="btn-row"><button class="btn primary" data-act="decide" data-v="1">Подтвердить</button><button class="btn danger-soft" data-act="decide" data-v="0">Отклонить</button></div></div>` : ''}
      ${b.past && ['confirmed', 'done', 'noshow'].includes(b.status) ? html`<div class="group"><div class="label">Отметка о занятии</div>
        <div class="btn-row"><button class="btn ${b.status === 'done' ? 'ok-soft' : 'card-bg'}" data-act="mark" data-v="done">Состоялось</button>
        <button class="btn ${b.status === 'noshow' ? 'danger-soft' : 'card-bg'}" style="${b.status === 'noshow' ? 'background:var(--redT)' : ''}" data-act="mark" data-v="noshow">Не пришёл</button></div></div>` : ''}
      ${active && !b.past ? html`<button class="btn card-bg big" style="color:var(--red);font-weight:500" data-act="cancel">Отменить занятие</button>` : ''}
    </div>`;
  },
  acts: {
    call(ctx) { openLink(`tel:${ctx.data.person.phone.replace(/[^\d+]/g, '')}`); },
    async decide(ctx, el) { await run(() => api('decide', { id: ctx.data.id, accept: el.dataset.v === '1' }), 'Готово'); ctx.reload(); },
    async mark(ctx, el) { await run(() => api('markBooking', { id: ctx.data.id, status: el.dataset.v }), 'Отмечено'); ctx.reload(); },
    cancel(ctx) {
      let reason = REASONS[0];
      const root = sheet(`<div class="sheet-head"><button class="link-btn" data-x="close">Назад</button><span class="title">Отменить занятие</span><span></span></div>
        <div class="hint" style="padding:0">Спортсмен получит сообщение с причиной и предложением выбрать другое время.</div>
        <div class="chips">${REASONS.map((r, i) => `<button class="chip" style="background:var(--fill)" aria-pressed="${i === 0}" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>
        <button class="btn danger big" data-x="go">Отменить и уведомить</button>`);
      root.addEventListener('click', async (e) => {
        const r = e.target.closest('[data-r]');
        if (r) { reason = r.dataset.r; root.querySelectorAll('[data-r]').forEach((x) => { x.setAttribute('aria-pressed', String(x === r)); x.style.background = x === r ? '' : 'var(--fill)'; }); return; }
        const x = e.target.closest('[data-x]')?.dataset.x;
        if (x === 'close') closeOverlay();
        if (x === 'go') { closeOverlay(); await run(() => api('coachCancel', { id: ctx.data.id, reason: reason.toLowerCase() }), 'Занятие отменено, спортсмен уведомлён'); ctx.reload(); }
      });
    },
  },
});

// ---------------------------------------------------------------- клиенты
screen('/c/clients', {
  tab: 'coach:/c/clients',
  init(ctx) { ctx.state = { q: '' }; },
  load: () => api('clients'),
  view(ctx) {
    const qv = (ctx.state.q ?? '').toLowerCase();
    const list = ctx.data.filter((c) => !qv || c.line.toLowerCase().includes(qv));
    return html`<div class="content top" style="gap:16px">
      <h1 class="large-title">Клиенты</h1>
      <input class="field" type="search" placeholder="Поиск по имени" value="${ctx.state.q}" data-change="search" aria-label="Поиск">
      ${list.length ? html`<div class="list">${list.map((c) => html`<a class="row" href="#/c/client?id=${c.id}" style="color:var(--text)">
        <span class="row-icon">${avatar(c.person?.name, 40, null, colorFor(c.id))}<span class="row-main"><span style="font-weight:600">${c.person?.name}</span>
        <span class="sub">${[personSub(c.person), `${c.done} ${plural(c.done, 'занятие', 'занятия', 'занятий')}`, c.lastLabel ? `был ${c.lastLabel}` : ''].filter(Boolean).join(' · ')}</span></span></span>
        <span style="display:flex;gap:6px;align-items:center">${c.blocked ? html`<span class="pill red">закрыт</span>` : c.late >= 3 ? html`<span class="pill orange">${c.late} отмены</span>` : ''}${chev()}</span></a>`)}</div>`
        : html`<div class="empty">${ctx.data.length ? 'Никого не нашли.' : 'Здесь появятся спортсмены, которые перешли по вашей ссылке. Её можно взять в «Профиль → Ссылка и QR-код».'}</div>`}
    </div>`;
  },
  acts: { search(ctx, el) { ctx.state.q = el.value; ctx.render(); } },
});

screen('/c/client', {
  back: true, title: 'Спортсмен', backLabel: 'Клиенты', backTo: () => '/c/clients',
  load: (p) => api('clientDetail', { athleteId: p.id }),
  view(ctx) {
    const d = ctx.data, p = d.person;
    return html`<div class="content" style="gap:16px">
      <div class="card pad">
        <div style="display:flex;gap:14px;align-items:center">${avatar(p?.name, 56, null, colorFor(d.id))}
          <span class="row-main"><span style="font-size:19px;font-weight:600">${p?.name}${d.age !== null ? `, ${d.age} ${plural(d.age, 'год', 'года', 'лет')}` : ''}</span>
          <span class="sub" style="font-size:14px">с ${d.since} · ${d.done} ${plural(d.done, 'занятие', 'занятия', 'занятий')}</span></span></div>
        ${p?.isParent ? html`<div style="display:flex;align-items:center;gap:10px;background:var(--purpleT);border-radius:12px;padding:10px 12px">
          <span class="pill" style="background:#8E44EC;color:#fff;padding:2px 6px">Родитель</span><span style="font-size:14px;color:var(--purple)">${p.parentName}${p.username ? ` · @${p.username}` : ''} · пишет и записывает</span></div>` : ''}
        ${p?.about ? html`<div class="muted" style="font-size:14px;line-height:1.45;white-space:pre-line">${p.about}</div>` : ''}
        <div class="btn-row three">
          <button class="action-tile tint" data-act="__link" data-url="https://t.me/${p?.username ?? ''}" ${p?.username ? '' : 'disabled'}>${raw(icon('chat', 20))}Написать</button>
          <button class="action-tile tint" data-act="call" ${p?.phone ? '' : 'disabled'}>${raw(icon('phone', 20))}Позвонить</button>
          <a class="action-tile tint" href="#/c/book?athlete=${d.id}">${raw(icon('plus', 20))}Записать</a></div>
      </div>
      <div class="tiles3">
        <div class="kpi"><span class="v" style="color:var(--acc)">${d.done}</span><span class="l">занятий</span></div>
        <div class="kpi"><span class="v" style="color:var(--orange)">${d.late}</span><span class="l">поздние отмены</span></div>
        <div class="kpi"><span class="v" style="color:var(--green);font-size:${d.regulars.length ? 18 : 24}px">${d.regulars.length ? d.regulars[0] : '—'}</span><span class="l">постоянная</span></div>
      </div>
      ${d.blocked ? html`<div class="banner red" role="status" style="justify-content:space-between;align-items:center"><span>Запись к вам закрыта. Будущие занятия отменены.</span><button class="link-btn" style="color:var(--red);font-weight:600;font-size:15px" data-act="block" data-v="0">Открыть</button></div>`
        : d.late >= 3 && !d.warned ? html`<div class="card pad" style="background:var(--orangeT)">
          <b style="color:var(--orange)">${d.late} поздние отмены за месяц</b>
          <span style="font-size:14px;line-height:1.4">Можно отправить вежливое предупреждение: при повторе запись к вам будет закрыта.</span>
          <div class="btn-row"><button class="btn primary" data-act="warn">Предупредить</button><button class="btn card-bg" data-act="block" data-v="1">Закрыть запись</button></div></div>`
        : d.warned ? html`<div class="card pad"><span style="font-size:14px;line-height:1.4"><b>Предупреждение отправлено</b> ${d.warned}. Если поздние отмены продолжатся, можно закрыть запись.</span>
          <button class="btn danger-soft" style="background:var(--redT)" data-act="block" data-v="1">Закрыть запись ко мне</button></div>` : ''}
      <a class="card row" href="#/c/goals?id=${d.id}" style="padding:0 16px;color:var(--text)"><span class="row-icon"><span class="tile sm" style="background:#0A6CFF">${raw(icon('target', 17, 2.4))}</span>Элементы и заметка</span>
        <span class="val">${d.elements} ${plural(d.elements, 'элемент', 'элемента', 'элементов')}${chev()}</span></a>
      ${d.upcoming.length ? html`<div class="group"><div class="label">Ближайшие</div><div class="list">${d.upcoming.map(histRow)}</div></div>` : ''}
      ${d.history.length ? html`<div class="group"><div class="label">Последние занятия</div><div class="list">${d.history.map(histRow)}</div></div>` : ''}
      ${!d.blocked && !(d.late >= 3 && !d.warned) && !d.warned ? html`<button class="btn card-bg big" style="color:var(--red);font-weight:500" data-act="block" data-v="1">Закрыть запись ко мне</button>` : ''}
    </div>`;
  },
  acts: {
    call(ctx) { openLink(`tel:${ctx.data.person.phone.replace(/[^\d+]/g, '')}`); },
    async warn(ctx) { await run(() => api('warnAthlete', { athleteId: ctx.data.id }), 'Предупреждение отправлено'); ctx.reload(); },
    async block(ctx, el) {
      const on = el.dataset.v === '1';
      if (on && !(await confirmBox('Закрыть запись?', 'Спортсмен не сможет записываться к вам, будущие занятия отменятся.', 'Закрыть', true))) return;
      await run(() => api('setBlocked', { athleteId: ctx.data.id, blocked: on }), on ? 'Запись закрыта' : 'Запись снова открыта');
      ctx.reload();
    },
  },
});
function histRow(b) {
  return html`<a class="row" href="#/c/booking?id=${b.id}" style="color:var(--text)"><span class="row-icon" style="gap:12px">${rinkDot(b.rink?.color)}
    <span class="row-main"><b style="font-size:15px">${b.dayLabel} · ${b.time}</b><span class="sub">${place(b)}</span></span></span>${pill(b)}</a>`;
}

// ---------------------------------------------------------------- элементы
const STAGES = ['Учим', 'Получается', 'Чисто'];
const STAGE_BG = ['#F08300', '#0066D6', '#1E7B34'];
screen('/c/goals', {
  back: true, title: 'Элементы', backTo: (ctx) => `/c/client?id=${ctx.params.id}`,
  load: (p) => api('goals', { athleteId: p.id }),
  init(ctx) { ctx.state = { els: null, note: '', newName: '' }; },
  view(ctx) {
    const st = ctx.state;
    if (!st.els) st.els = ctx.data.elements.map((e) => ({ ...e }));
    return html`<div class="content" style="gap:16px">
      <div class="group"><div class="label">${ctx.data.person?.name ?? ''} · что учим</div>
        <div class="list">
          ${st.els.map((e, i) => html`<div style="display:flex;flex-direction:column;gap:8px;padding:12px 0;border-bottom:1px solid var(--sep)">
            <div style="display:flex;justify-content:space-between;align-items:center"><b>${e.name}</b>
              <button class="link-btn" style="height:28px;color:var(--sec)" data-act="del" data-i="${i}" aria-label="Удалить ${e.name}">${raw(icon('x', 18))}</button></div>
            <div class="seg" role="radiogroup" aria-label="Этап: ${e.name}" style="grid-template-columns:repeat(3,minmax(0,1fr));background:var(--fill)">${STAGES.map((s, k) =>
              html`<button role="radio" aria-checked="${String(e.stage === k)}" data-act="stage" data-i="${i}" data-k="${k}" style="${e.stage === k ? `background:${STAGE_BG[k]};color:#fff` : ''}">${s}</button>`)}</div></div>`)}
          <div class="row" style="border-bottom:0"><input class="left" data-bind="newName" value="${st.newName}" placeholder="Новый элемент, например «аксель»" aria-label="Новый элемент">
            <button class="link-btn" style="font-weight:600" data-act="add">Добавить</button></div>
        </div></div>
      <div class="group"><label class="label" for="gn">Заметка к занятию ${ctx.data.today}</label>
        <textarea id="gn" class="field" rows="4" data-bind="note" placeholder="Что прошли и что повторить дома">${st.note}</textarea>
        <div class="hint">Придёт спортсмену${ctx.data.person?.isParent ? ' и родителю' : ''} в бот вместе с изменениями этапов.</div></div>
    </div>`;
  },
  footer: () => html`<button class="btn primary big" data-act="save">Сохранить и отправить</button>`,
  acts: {
    stage(ctx, el) { haptic.tap(); ctx.state.els[Number(el.dataset.i)].stage = Number(el.dataset.k); ctx.render(); },
    del(ctx, el) { ctx.state.els.splice(Number(el.dataset.i), 1); ctx.render(); },
    add(ctx) { const n = ctx.state.newName.trim(); if (!n) return; ctx.state.els.push({ name: n, stage: 0 }); ctx.state.newName = ''; ctx.render(); },
    async save(ctx) {
      const st = ctx.state;
      if (st.newName.trim()) { st.els.push({ name: st.newName.trim(), stage: 0 }); st.newName = ''; }
      const r = await run(() => api('saveGoals', { athleteId: ctx.params.id, elements: st.els, note: st.note }));
      toast(r.sent ? 'Сохранено и отправлено' : 'Сохранено');
      st.els = null; st.note = '';
      ctx.reload();
    },
  },
});

// ---------------------------------------------------------------- статистика
screen('/c/stats', {
  tab: 'coach:/c/stats',
  init(ctx) { ctx.state = { period: 'month' }; },
  load: (p, ctx) => api('stats', { period: ctx.state.period }),
  view(ctx) {
    const d = ctx.data;
    const pmax = Math.max(1, ...d.byRink.map((r) => r.n));
    const dmax = Math.max(1, ...d.byDay);
    const top = d.byDay.indexOf(Math.max(...d.byDay));
    const dn = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const full = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
    return html`<div class="content top" style="gap:16px">
      <h1 class="large-title">Статистика</h1>
      <div class="seg" role="tablist" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']].map(([v, l]) =>
        html`<button role="tab" aria-selected="${String(ctx.state.period === v)}" data-act="period" data-v="${v}">${l}</button>`)}</div>
      <div class="kpis">${d.kpis.map((k) => html`<div class="kpi"><span class="l">${k.label}</span><span class="v">${k.value}</span><span class="d ${k.good ? '' : 'bad'}">${k.delta}</span></div>`)}</div>
      <div class="card pad"><b>Занятия по местам</b>${d.byRink.map((r) => html`<div class="bar-row"><span style="white-space:nowrap">${r.name}</span>
        <span class="bar"><span style="width:${Math.round((r.n / pmax) * 100)}%;background:${r.color}"></span></span><b style="text-align:right">${r.n}</b></div>`)}</div>
      <div class="card pad"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>По дням недели</b>
        ${Math.max(...d.byDay) ? html`<span class="muted" style="font-size:13px">больше всего — ${full[top]}</span>` : ''}</div>
        <div class="cols" role="img" aria-label="${dn.map((n, i) => `${n} ${d.byDay[i]}`).join(', ')}">${d.byDay.map((n, i) => html`<div><span style="font-weight:600;font-size:11px">${n || ''}</span>
          <span class="c ${i === top && n ? 'top' : ''}" style="height:${Math.max(4, Math.round((n / dmax) * 72))}px;${n ? '' : 'background:var(--fill)'}"></span>${dn[i]}</div>`)}</div></div>
    </div>`;
  },
  acts: { period(ctx, el) { ctx.state.period = el.dataset.v; ctx.reload(); } },
});

// ---------------------------------------------------------------- профиль тренера
screen('/c/profile', {
  tab: 'coach:/c/profile',
  load: () => api('coachProfile'),
  view(ctx) {
    const c = ctx.data;
    const first = ctx.params.first === '1';
    return html`<div class="content top" style="gap:16px">
      <div class="head-row"><h1 class="large-title">Профиль</h1><a class="icon-btn" href="#/c/settings" aria-label="Настройки">${raw(icon('gear', 22))}</a></div>
      ${first ? html`<div class="card pad" style="background:var(--tint)"><b style="color:var(--acc)">С чего начать</b>
        <span style="font-size:14px;line-height:1.5">1. Укажите имя и цены ниже.<br>2. Отметьте рабочие часы и катки: <a href="#/c/hours">открыть</a>.<br>3. Отправьте спортсменам ссылку или QR-код.</span></div>` : ''}
      <button class="card" style="border:0;padding:16px;display:flex;align-items:center;gap:14px;text-align:left" data-act="edit">
        ${avatar(c.name, 64, null, colorFor(c.user_id))}
        <span class="row-main" style="flex:1"><span style="font-size:20px;font-weight:600">${c.name}</span><span class="sub" style="font-size:14px">${c.specialization || 'Тренер · нажмите, чтобы рассказать о себе'}</span></span>${chev()}</button>
      <a href="#/c/share" style="background:var(--btn);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:14px;color:#fff">
        <span class="tile" style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.18)">${raw(icon('qr', 22))}</span>
        <span class="row-main" style="flex:1"><b>Ссылка и QR-код для записи</b><span style="font-size:13px;opacity:.9">Отправьте спортсменам — они попадут к вам</span></span>${raw(icon('chev', 16, 2.6))}</a>
      <div class="group"><div class="label">Цены за час</div><div class="list">
        ${[['price_ice', 'Лёд', '#0A6CFF'], ['price_ofp', 'ОФП', '#F08300'], ['price_online', 'Онлайн', '#28A745']].map(([k, l, col]) =>
          html`<button class="row" data-act="price" data-k="${k}" data-l="${l}"><span class="row-icon" style="gap:10px">${rinkDot(col)}${l}</span><span class="val acc">${money(c[k])}</span></button>`)}</div>
        <div class="hint">Если сеанс на катке короче часа, цена та же.</div></div>
      <div class="group"><div class="label">Мини-группы</div><div class="list">
        <div class="row"><span>Провожу мини-группы до 3 чел.</span>${sw('groups', c.groups_enabled, 'Провожу мини-группы')}</div>
        <div class="row" style="font-size:15px;${c.groups_enabled ? '' : 'color:var(--sec)'}"><span>Скидка каждому</span><span>2 чел. −10% · 3 чел. −20%</span></div></div></div>
    </div>`;
  },
  acts: {
    async groups(ctx) { await run(() => api('saveCoachProfile', { groups_enabled: !ctx.data.groups_enabled })); ctx.reload(); },
    price(ctx, el) {
      const k = el.dataset.k;
      const root = sheet(`<div class="sheet-head"><button class="link-btn" data-x="close">Отмена</button><span class="title">${esc(el.dataset.l)} — цена за час</span><button class="link-btn right" data-x="save">Готово</button></div>
        <input class="field" style="background:var(--fill);font-size:22px;text-align:center" type="number" inputmode="decimal" min="0" step="0.5" value="${esc(ctx.data[k] ?? '')}" placeholder="0" aria-label="Цена в BYN">
        <div class="hint center" style="padding:0">BYN. Оставьте пустым, если не указываете цену.</div>`);
      const inp = root.querySelector('input');
      setTimeout(() => inp.focus(), 50);
      root.addEventListener('click', async (e) => {
        const x = e.target.closest('[data-x]')?.dataset.x;
        if (x === 'close') closeOverlay();
        if (x === 'save') { closeOverlay(); await run(() => api('saveCoachProfile', { [k]: inp.value }), 'Цена сохранена'); ctx.reload(); }
      });
    },
    edit(ctx) {
      const c = ctx.data;
      const root = sheet(`<div class="sheet-head"><button class="link-btn" data-x="close">Отмена</button><span class="title">О себе</span><button class="link-btn right" data-x="save">Готово</button></div>
        <div class="list" style="background:var(--fill)">
          <div class="row"><label for="p1">Имя</label><input id="p1" value="${esc(c.display_name ?? '')}" placeholder="Как вас видят спортсмены"></div>
          <div class="row"><label for="p2">Специализация</label><input id="p2" value="${esc(c.specialization ?? '')}" placeholder="Фигурное катание"></div>
          <div class="row"><label for="p3">Опыт</label><input id="p3" value="${esc(c.experience ?? '')}" placeholder="10 лет"></div></div>
        <textarea id="p4" class="field" style="background:var(--fill)" rows="4" placeholder="Пара предложений: подход, с кем работаете">${esc(c.about ?? '')}</textarea>`);
      root.addEventListener('click', async (e) => {
        const x = e.target.closest('[data-x]')?.dataset.x;
        if (x === 'close') closeOverlay();
        if (x === 'save') {
          const v = (id) => root.querySelector(id).value;
          closeOverlay();
          await run(() => api('saveCoachProfile', { display_name: v('#p1'), specialization: v('#p2'), experience: v('#p3'), about: v('#p4') }), 'Сохранено');
          ctx.reload();
        }
      });
    },
  },
});

// ---------------------------------------------------------------- ссылка и QR
const THEMES = [['Синий', '#0A5FD1'], ['Фиолетовый', '#6B3FD1'], ['Бирюзовый', '#0E7C8C'], ['Графит', '#2C2C2E']];
function qrSvg(text, color) {
  if (!window.qrcode) return '<div class="muted" style="width:220px;height:220px;display:flex;align-items:center;justify-content:center">QR загружается…</div>';
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return `<svg role="img" aria-label="QR-код ссылки на запись" width="220" height="220" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${d}" fill="${color}"/></svg>`;
}
screen('/c/share', {
  load: () => api('coachProfile'),
  init(ctx) { ctx.state = { t: Number(localStorage.getItem('qrTheme') ?? 0) || 0 }; },
  view(ctx) {
    const c = ctx.data, [, col] = THEMES[ctx.state.t];
    return html`<div class="share-wrap" style="background:${col}">
      <div class="navbar" style="background:transparent"><button class="back" style="color:#fff" data-act="__back">${raw(icon('back', 22))}Профиль</button><div class="title">Запись ко мне</div><div></div></div>
      <div style="flex:1;padding:48px 32px 0;display:flex;flex-direction:column;align-items:center;gap:28px">
        <div class="qr-card" style="width:100%">${avatar(c.name, 80, null, colorFor(c.user_id))}
          ${raw(qrSvg(c.invite, col === '#2C2C2E' ? '#1C1C1E' : col))}
          <div class="center"><div style="font-size:22px;font-weight:700;color:${col === '#2C2C2E' ? 'var(--text)' : col}">${c.name}</div>
          <div class="muted" style="font-size:14px;margin-top:4px">Наведите камеру, чтобы записаться</div></div></div>
        <div role="radiogroup" aria-label="Цвет" style="display:flex;gap:14px">${THEMES.map(([n, cc], i) => html`<button class="swatch" role="radio" aria-checked="${String(i === ctx.state.t)}" aria-label="${n}" style="background:${cc}" data-act="theme" data-i="${i}"></button>`)}</div>
      </div>
      <div style="padding:12px 20px calc(24px + var(--safe-b));display:flex;flex-direction:column;gap:10px">
        <div style="height:48px;border-radius:14px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 16px">
          <span style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.invite.replace('https://', '')}</span>
          <button class="btn" style="height:36px;background:rgba(255,255,255,.22);color:#fff" data-act="copy">Копировать</button></div>
        <button class="btn big" style="background:#fff;color:${col}" data-act="share">Поделиться</button>
      </div></div>`;
  },
  mounted(ctx) { if (!window.qrcode) setTimeout(() => window.qrcode && ctx.render(), 600); },
  acts: {
    theme(ctx, el) { ctx.state.t = Number(el.dataset.i); localStorage.setItem('qrTheme', String(ctx.state.t)); ctx.render(); },
    async copy(ctx) { try { await navigator.clipboard.writeText(ctx.data.invite); toast('Ссылка скопирована'); } catch { toast(ctx.data.invite); } },
    share(ctx) { openLink(`https://t.me/share/url?url=${encodeURIComponent(ctx.data.invite)}&text=${encodeURIComponent('Запись на тренировки ко мне')}`); },
  },
  backTo: () => '/c/profile',
});

// ---------------------------------------------------------------- настройки
screen('/c/settings', {
  back: true, title: 'Настройки', backLabel: 'Профиль', backTo: () => '/c/profile',
  load: () => api('settings'),
  view(ctx) {
    const s = ctx.data;
    const modes = [['all', 'Все заявки'], ['new', 'Только новые клиенты'], ['auto', 'Не нужно — автоматически']];
    return html`<div class="content" style="gap:16px">
      <div class="group"><div class="label">Расписание</div><div class="list">
        <a class="row" href="#/c/hours" style="color:var(--text)"><span>Рабочие часы и катки</span><span class="val">${s.hours} ч${chev()}</span></a>
        <a class="row" href="#/c/rinks" style="color:var(--text)"><span>Сеансы на катках</span><span class="val">${s.sessions}${chev()}</span></a>
        <a class="row" href="#/c/rules" style="color:var(--text)"><span>Правила записи</span><span class="val">отмены, сроки${chev()}</span></a>
        <a class="row" href="#/c/vacation" style="color:var(--text)"><span>Отпуск или болезнь</span>${chev()}</a>
        <a class="row" href="#/c/week" style="color:var(--text)"><span>Подтвердить следующую неделю</span>${chev()}</a></div></div>
      <div class="group"><div class="label">Подтверждать заявки вручную</div>
        <div class="list" role="radiogroup">${modes.map(([v, l]) => html`<button class="row" role="radio" aria-checked="${String(s.confirm_mode === v)}" data-act="mode" data-v="${v}"><span>${l}</span>${s.confirm_mode === v ? raw(`<span style="color:var(--acc)">${icon('check', 20, 2.6)}</span>`) : ''}</button>`)}</div>
        <div class="hint">${s.confirm_mode === 'new' ? 'Первую запись нового спортсмена подтверждаете вы, дальше — сразу.' : s.confirm_mode === 'all' ? 'Каждая запись ждёт вашего ответа в боте.' : 'Все записи подтверждаются сразу, вы получаете уведомление.'}</div></div>
      <div class="group"><div class="label">Мои напоминания</div><div class="list">
        ${s.reminders.map((m, i) => html`<button class="row" data-act="rem" data-i="${i}"><span>Напомнить ${reminderLabel(m)}</span>${chev()}</button>`)}
        ${s.reminders.length < 5 ? html`<button class="row link" data-act="addRem">${raw(icon('plus', 18, 2.6))} Добавить напоминание</button>` : ''}
        <div class="row"><span>Утренняя сводка в 08:00</span>${sw('digest', s.digest, 'Утренняя сводка')}</div></div></div>
      <div class="list">
        <button class="row link" data-act="role">Сменить роль на «Спортсмен»</button>
        <button class="row danger" data-act="del">Удалить аккаунт тренера</button></div>
    </div>`;
  },
  acts: {
    async mode(ctx, el) { await run(() => api('saveSettings', { confirm_mode: el.dataset.v })); ctx.reload(); },
    async digest(ctx) { await run(() => api('saveSettings', { digest: !ctx.data.digest })); ctx.reload(); },
    rem(ctx, el) {
      const i = Number(el.dataset.i), list = [...ctx.data.reminders];
      reminderSheet('Напоминание', list[i], async (m) => { list[i] = m; await run(() => api('saveSettings', { reminders: list }), 'Сохранено'); ctx.reload(); },
        { allowNone: false, removeText: 'Удалить напоминание', onRemove: async () => { list.splice(i, 1); await run(() => api('saveSettings', { reminders: list }), 'Удалено'); ctx.reload(); } });
    },
    addRem(ctx) {
      reminderSheet('Новое напоминание', 60, async (m) => { await run(() => api('saveSettings', { reminders: [...ctx.data.reminders, m] }), 'Добавлено'); ctx.reload(); }, { allowNone: false });
    },
    role() {
      alertBox('Стать спортсменом?', 'Расписание и клиенты тренера сохранятся — можно будет вернуться.', [
        { text: 'Сменить роль', style: 'bold', onClick: async () => { await run(() => api('switchRole', { role: 'athlete' })); session.me = await api('me'); go('/onboard/profile', true); } },
        { text: 'Отмена' },
      ]);
    },
    del() {
      alertBox('Удалить аккаунт тренера?', 'Расписание, катки и клиенты будут удалены. Спортсмены получат уведомление об отмене будущих занятий.', [
        { text: 'Удалить', style: 'danger', onClick: async () => { await run(() => api('deleteAccount')); session.me = await api('me'); go('/onboard', true); } },
        { text: 'Отмена' },
      ]);
    },
  },
});

screen('/c/rules', {
  back: true, title: 'Правила записи', backTo: () => '/c/settings',
  load: () => api('settings'),
  view(ctx) {
    const s = ctx.data;
    return html`<div class="content">
      <div class="group"><div class="list">
        <div class="row"><span class="row-main"><span>Бесплатная отмена</span><span class="sub">позже — поздняя отмена</span></span>${stepper('cancelH', s.free_cancel_hours, 'ч')}</div>
        <div class="row"><span class="row-main"><span>Запись не позднее чем за</span><span class="sub">до начала сеанса</span></span>${stepper('minH', s.min_book_hours, 'ч')}</div></div>
        <div class="hint">После 3 поздних отмен за месяц бот предложит вам предупредить спортсмена.</div></div>
      <div class="group"><div class="label">Спортсменам</div><div class="list">
        <div class="row"><span>Подтверждение за 24 ч</span><span class="val">всегда</span></div>
        <div class="row"><span>Напоминание</span><span class="val">выбирают сами, по умолчанию за 2 ч</span></div></div></div>
    </div>`;
  },
  acts: {
    async cancelH(ctx, el) { const v = Math.max(0, ctx.data.free_cancel_hours + Number(el.dataset.d)); ctx.data.free_cancel_hours = v; ctx.render(); await api('saveSettings', { free_cancel_hours: v }).catch((e) => toast(e.message)); },
    async minH(ctx, el) { const v = Math.max(0, ctx.data.min_book_hours + Number(el.dataset.d)); ctx.data.min_book_hours = v; ctx.render(); await api('saveSettings', { min_book_hours: v }).catch((e) => toast(e.message)); },
  },
});

// ---------------------------------------------------------------- часы и катки
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 … 22:00
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
screen('/c/hours', {
  back: true, title: 'Часы и катки', backTo: () => '/c/settings',
  load: () => api('hours'),
  init(ctx) { ctx.state = { g: null, brush: 'zamok', dirty: false }; },
  view(ctx) {
    const st = ctx.state, d = ctx.data;
    if (!st.g) {
      st.g = DAYS.map(() => HOURS.map(() => []));
      for (const c of d.cells) { const hi = HOURS.indexOf(c.hour); if (hi >= 0) st.g[c.weekday][hi].push(c.rink_id); }
      st.extra = d.cells.filter((c) => HOURS.indexOf(c.hour) < 0); // часы вне сетки сохраняем как есть
    }
    const brushes = [...d.rinks.map((r) => ({ id: r.id, name: r.is_online ? 'Только онлайн' : r.name, color: r.color })), { id: 'x', name: 'Ластик — убрать всё', color: 'transparent' }];
    const per = Object.fromEntries(d.rinks.map((r) => [r.id, 0]));
    let total = 0;
    st.g.forEach((col) => col.forEach((v) => { if (v.length) total++; v.forEach((id) => per[id]++); }));
    const colorOf = Object.fromEntries(d.rinks.map((r) => [r.id, r.color]));
    return html`<div class="content" style="gap:14px">
      <div class="group"><div class="label">Где проходят занятия</div>
        <div class="choice-grid" role="radiogroup" style="grid-template-columns:repeat(2,minmax(0,1fr))">${brushes.map((b) => html`<button class="choice" role="radio" aria-checked="${String(st.brush === b.id)}" data-act="brush" data-v="${b.id}"
          style="justify-content:flex-start;${b.id === 'x' ? 'grid-column:span 2' : ''}"><span class="dot" style="width:12px;height:12px;border-radius:6px;background:${b.color};${b.id === 'x' ? 'border:2px solid var(--sec)' : ''}"></span>${b.name}</button>`)}</div>
        <div class="hint">Выберите место и проведите по клеткам. Ластик убирает всё, нажатие на день очищает весь день.</div></div>
      <div class="grid-card" id="grid">
        <div class="grid-row"><span></span>${DAYS.map((n, i) => html`<button class="dh ${st.g[i].some((v) => v.length) ? 'on' : ''}" data-act="clearDay" data-i="${i}" aria-label="Очистить ${n}">${n}</button>`)}</div>
        ${HOURS.map((h, hi) => html`<div class="grid-row"><span class="h">${String(h).padStart(2, '0')}:00</span>${DAYS.map((n, di) => {
          const v = st.g[di][hi];
          return html`<button class="cell" data-c="${di}-${hi}" aria-pressed="${String(v.length > 0)}" aria-label="${n}, ${h}:00 — ${v.length ? v.map((id) => d.rinks.find((r) => r.id === id)?.name).join(', ') : 'закрыто'}">${v.map((id) => html`<span style="background:${colorOf[id]}"></span>`)}</button>`;
        })}</div>`)}
      </div>
      <div style="padding:0 16px;display:flex;flex-direction:column;gap:4px"><b>Открыто ${total} ч в неделю</b>
        <span class="muted" style="font-size:13px">${d.rinks.map((r) => `${r.is_online ? 'онлайн' : r.short} ${per[r.id]} ч`).join(' · ')}</span></div>
      <div class="btn-row"><button class="btn tint" data-act="copyMon">Как в Пн — на будни</button><button class="btn card-bg" style="color:var(--red)" data-act="clearAll">Очистить</button></div>
    </div>`;
  },
  footer: (ctx) => html`<button class="btn primary big" data-act="save" ${ctx.state.dirty ? '' : 'disabled'}>Сохранить</button>`,
  mounted(ctx, root) {
    const grid = root.querySelector('#grid');
    if (!grid) return;
    let paint = null;
    const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.cell');
    const apply = (cell) => {
      if (!cell) return;
      const [di, hi] = cell.dataset.c.split('-').map(Number);
      const st = ctx.state, cur = st.g[di][hi];
      let next;
      if (st.brush === 'x') next = [];
      else if (paint) next = cur.includes(st.brush) ? cur : ctx.data.rinks.map((r) => r.id).filter((id) => id === st.brush || cur.includes(id));
      else next = cur.filter((id) => id !== st.brush);
      if (next.length === cur.length && next.every((x, i) => x === cur[i])) return;
      st.g[di][hi] = next;
      st.dirty = true;
      const colorOf = Object.fromEntries(ctx.data.rinks.map((r) => [r.id, r.color]));
      cell.innerHTML = next.map((id) => `<span style="background:${colorOf[id]}"></span>`).join('');
      cell.setAttribute('aria-pressed', String(next.length > 0));
      haptic.tap();
    };
    grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      e.preventDefault();
      try { grid.setPointerCapture(e.pointerId); } catch { /* старые браузеры */ }
      const [di, hi] = cell.dataset.c.split('-').map(Number);
      paint = ctx.state.brush === 'x' ? false : !ctx.state.g[di][hi].includes(ctx.state.brush);
      apply(cell);
    });
    grid.addEventListener('pointermove', (e) => { if (paint !== null) apply(cellAt(e.clientX, e.clientY)); });
    const stop = () => { if (paint !== null) { paint = null; ctx.render(); } };
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);
    grid.addEventListener('keydown', (e) => {
      const cell = e.target.closest('.cell');
      if (cell && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const [di, hi] = cell.dataset.c.split('-').map(Number);
        paint = ctx.state.brush === 'x' ? false : !ctx.state.g[di][hi].includes(ctx.state.brush);
        apply(cell); paint = null; ctx.render();
      }
    });
  },
  acts: {
    brush(ctx, el) { ctx.state.brush = el.dataset.v; ctx.render(); },
    clearDay(ctx, el) { ctx.state.g[Number(el.dataset.i)] = HOURS.map(() => []); ctx.state.dirty = true; ctx.render(); },
    copyMon(ctx) { ctx.state.g = ctx.state.g.map((col, i) => (i < 5 ? ctx.state.g[0].map((v) => [...v]) : col)); ctx.state.dirty = true; ctx.render(); },
    async clearAll(ctx) {
      if (!(await confirmBox('Очистить всю неделю?', 'Новые записи станут недоступны, пока вы не отметите время.', 'Очистить', true))) return;
      ctx.state.g = DAYS.map(() => HOURS.map(() => [])); ctx.state.dirty = true; ctx.render();
    },
    async save(ctx) {
      const cells = [...ctx.state.extra];
      ctx.state.g.forEach((col, di) => col.forEach((v, hi) => v.forEach((rink_id) => cells.push({ weekday: di, hour: HOURS[hi], rink_id }))));
      await run(() => api('saveHours', { cells }), 'Расписание сохранено');
      ctx.state.dirty = false; ctx.render();
    },
  },
});

screen('/c/rinks', {
  back: true, title: 'Сеансы', backTo: () => '/c/settings',
  load: () => api('rinksCfg'),
  init(ctx) { ctx.state = { dirty: false }; },
  view(ctx) {
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return html`<div class="content" style="gap:12px">
      <div class="hint">На каждом катке своя сетка сеансов. Спортсмены видят время записи по ней.</div>
      ${ctx.data.map((r, i) => {
        const ex = Array.from({ length: 4 }, (_, k) => fmt(9 * 60 + r.start_offset + k * r.session_minutes)).join(', ');
        return html`<div class="card pad">
          <div style="display:flex;align-items:center;gap:10px"><span class="dot" style="width:12px;height:12px;border-radius:6px;background:${r.color}"></span><b style="font-size:17px">${r.name}</b></div>
          <div style="display:flex;justify-content:space-between;align-items:center"><span>Длительность</span>${stepper('len', r.session_minutes, 'мин', i)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>Начало</span>
            <div class="seg" role="radiogroup" aria-label="Начало сеансов" style="grid-template-columns:repeat(4,minmax(0,1fr));width:196px">${[0, 15, 30, 45].map((m) =>
              html`<button role="radio" aria-checked="${String(r.start_offset === m)}" data-act="off" data-i="${i}" data-v="${m}" style="height:32px">:${String(m).padStart(2, '0')}</button>`)}</div></div>
          <span class="muted" style="font-size:13px;font-variant-numeric:tabular-nums">Например: ${ex}…</span></div>`;
      })}
    </div>`;
  },
  footer: (ctx) => html`<button class="btn primary big" data-act="save" ${ctx.state.dirty ? '' : 'disabled'}>Сохранить</button>`,
  acts: {
    len(ctx, el) { const r = ctx.data[Number(el.dataset.i)]; r.session_minutes = Math.max(15, Math.min(180, r.session_minutes + 5 * Number(el.dataset.d))); ctx.state.dirty = true; ctx.render(); },
    off(ctx, el) { ctx.data[Number(el.dataset.i)].start_offset = Number(el.dataset.v); ctx.state.dirty = true; ctx.render(); },
    async save(ctx) { await run(() => api('saveRinkCfg', { items: ctx.data }), 'Сохранено'); ctx.state.dirty = false; ctx.render(); },
  },
});

// ---------------------------------------------------------------- неделя
screen('/c/week', {
  back: true, title: 'Неделя', backTo: () => '/c/today',
  load: (p) => api('week', { weekStart: p.ws }),
  view(ctx) {
    const d = ctx.data;
    return html`<div class="content" style="gap:16px">
      <div style="padding:0 4px"><div class="eyebrow">${d.title}</div><div style="font-size:26px;font-weight:700">Проверьте расписание</div></div>
      ${d.confirmed ? html`<div class="banner green" role="status">${raw(icon('check', 22, 2.4))}<span>Неделя подтверждена. Спортсмены видят, что всё в силе.</span></div>`
        : html`<div class="banner orange">${raw(icon('clock', 22))}<span>${d.frozen ? html`<b>Записи заморожены</b> — подтвердите неделю, чтобы спортсмены видели, что всё в силе.` : html`Подтвердите до <b>${d.deadline}</b>. Иначе записи на неделю будут заморожены.`}</span></div>`}
      <div class="list">${d.days.map((x) => html`<div class="row" style="align-items:flex-start;padding:10px 0">
        <b style="width:52px;flex-shrink:0;${x.blocks.length ? '' : 'color:var(--sec)'}">${x.name}</b>
        <span style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:14px">${x.absent ? html`<span class="muted">${x.absent}</span>` : x.blocks.map((b) => html`<span style="display:flex;align-items:center;gap:6px">${rinkDot(b.color)}${b.text}</span>`)}</span>
        <span class="muted" style="font-size:13px;white-space:nowrap">${x.count}</span></div>`)}</div>
      ${d.regulars.length ? html`<div class="hint">Постоянные записи, которые создадутся: ${d.regulars.join('; ')}.</div>` : ''}
    </div>`;
  },
  footer: (ctx) => html`<div class="btn-row"><a class="btn tint big" href="#/c/hours">Изменить</a>
    <button class="btn primary big" data-act="confirm" ${ctx.data.confirmed ? 'disabled' : ''}>${ctx.data.confirmed ? 'Подтверждено' : 'Подтвердить'}</button></div>`,
  acts: {
    async confirm(ctx) {
      const r = await run(() => api('confirmWeek', { weekStart: ctx.data.weekStart }));
      toast(r.created ? `Подтверждено. Создано постоянных записей: ${r.created}` : 'Неделя подтверждена');
      ctx.reload();
    },
  },
});

// ---------------------------------------------------------------- отпуск
screen('/c/vacation', {
  back: true, title: 'Меня не будет', backTo: () => '/c/settings',
  load: () => api('absences'),
  init(ctx) {
    const t = new Date(Date.now() + 3 * 3600000);
    const iso = (d) => d.toISOString().slice(0, 10);
    ctx.state = { kind: 'vacation', from: iso(t), to: iso(new Date(t.getTime() + 7 * 86400000)), mode: 'cancel', count: null };
  },
  view(ctx) {
    const st = ctx.state;
    const toLabel = st.to ? new Date(st.to + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
    return html`<div class="content">
      ${ctx.data.length ? html`<div class="group"><div class="label">Запланировано</div><div class="list">${ctx.data.map((a) => html`<div class="row">
        <span class="row-main"><span>${a.kind === 'sick' ? 'Болезнь' : 'Отпуск'}</span><span class="sub">${a.fromLabel} – ${a.toLabel}</span></span>
        <button class="btn danger-soft" style="height:34px" data-act="delAbs" data-id="${a.id}">Убрать</button></div>`)}</div></div>` : ''}
      ${seg('kind', [['vacation', 'Отпуск'], ['sick', 'Болезнь']], st.kind)}
      <div class="group"><div class="label">Даты</div><div class="list">
        <div class="row"><label for="v1">С</label><input id="v1" type="date" value="${st.from}" data-change="date" data-k="from"></div>
        <div class="row"><label for="v2">По</label><input id="v2" type="date" value="${st.to}" data-change="date" data-k="to"></div></div></div>
      <div class="group"><div class="label">Записи на эти даты${st.count !== null ? ` · ${st.count}` : ''}</div>
        <div class="list" role="radiogroup">${[['cancel', 'Отменить и уведомить', 'Бот напишет каждому спортсмену'], ['close', 'Только закрыть новые', 'Существующие записи останутся']].map(([v, l, s]) =>
          html`<button class="row" role="radio" aria-checked="${String(st.mode === v)}" data-act="mode" data-v="${v}"><span class="row-main"><span>${l}</span><span class="sub">${s}</span></span>${st.mode === v ? raw(`<span style="color:var(--acc)">${icon('check', 20, 2.6)}</span>`) : ''}</button>`)}</div></div>
      <div class="group"><div class="label">Спортсмены увидят</div>
        <div class="card" style="padding:14px 16px;display:flex;gap:12px;align-items:center">
          <span class="tile" style="width:40px;height:40px;border-radius:10px;background:${st.kind === 'sick' ? '#E5333F' : '#0E8FA8'}">${raw(icon(st.kind === 'sick' ? 'thermo' : 'plane', 22))}</span>
          <span class="row-main"><b>Тренер ${st.kind === 'sick' ? 'на больничном' : 'в отпуске'} до ${toLabel}</b><span class="sub">На эти дни записаться нельзя</span></span></div></div>
    </div>`;
  },
  mounted(ctx) { if (ctx.state.count === null) refreshCount(ctx); },
  footer: (ctx) => html`<button class="btn primary big" data-act="save">${ctx.state.mode === 'cancel' && ctx.state.count ? `Сохранить и отменить ${ctx.state.count} ${plural(ctx.state.count, 'запись', 'записи', 'записей')}` : 'Сохранить'}</button>`,
  acts: {
    kind(ctx, el) { ctx.state.kind = el.dataset.v; ctx.render(); },
    mode(ctx, el) { ctx.state.mode = el.dataset.v; ctx.render(); },
    date(ctx, el) { ctx.state[el.dataset.k] = el.value; refreshCount(ctx); },
    async delAbs(ctx, el) { await run(() => api('deleteAbsence', { id: el.dataset.id }), 'Убрано'); ctx.reload(); },
    async save(ctx) {
      const st = ctx.state;
      if (!st.from || !st.to || st.to < st.from) return toast('Проверьте даты');
      const r = await run(() => api('saveAbsence', { kind: st.kind, from: st.from, to: st.to, cancelExisting: st.mode === 'cancel' }));
      toast(r.cancelled ? `Сохранено. Отменено записей: ${r.cancelled}` : 'Сохранено');
      st.count = null;
      ctx.reload();
    },
  },
});
async function refreshCount(ctx) {
  const st = ctx.state;
  if (!st.from || !st.to || st.to < st.from) { st.count = 0; return ctx.render(); }
  try { st.count = (await api('absencePreview', { from: st.from, to: st.to })).count; } catch { st.count = 0; }
  ctx.render();
}

// ---------------------------------------------------------------- рассылка
const TPL = {
  sched: 'На следующей неделе меняется расписание. Проверьте, пожалуйста, свои записи и при необходимости перезапишитесь.',
  hello: 'Поздравляю с праздником! Спасибо, что тренируетесь со мной.',
  none: '',
};
screen('/c/broadcast', {
  back: true, title: 'Рассылка', backTo: () => '/c/today',
  async load() { return { clients: await api('clients'), rinks: (await api('hours')).rinks }; },
  init(ctx) { ctx.state = { type: 'month', rinks: [], ids: [], tpl: 'none', text: '', button: 'none', count: null }; },
  view(ctx) {
    const st = ctx.state, d = ctx.data;
    const month = d.clients.filter((c) => c.activeMonth && !c.blocked).length;
    const tos = [['all', 'Всем', `${d.clients.filter((c) => !c.blocked).length} чел.`], ['month', 'За месяц', `были ${month} чел.`], ['rink', 'По катку', 'выбрать место'], ['manual', 'Вручную', 'отметить людей']];
    return html`<div class="content" style="gap:16px">
      <div class="group"><div class="label">Кому</div>
        <div class="choice-grid" role="radiogroup" style="grid-template-columns:repeat(2,minmax(0,1fr))">${tos.map(([v, l, s]) =>
          html`<button class="choice col" role="radio" aria-checked="${String(st.type === v)}" data-act="type" data-v="${v}"><span style="font-size:15px">${l}</span><span class="sub">${s}</span></button>`)}</div>
        ${st.type === 'rink' ? html`<div class="chips">${d.rinks.map((r) => html`<button class="chip soft" aria-pressed="${String(st.rinks.includes(r.id))}" data-act="rink" data-v="${r.id}">${rinkDot(r.color)}${r.short}</button>`)}</div>` : ''}
        ${st.type === 'manual' ? html`<div class="list">${d.clients.filter((c) => !c.blocked).map((c) => html`<label class="row" style="justify-content:flex-start;cursor:pointer">
          <input type="checkbox" class="check" data-change="pick" data-id="${c.id}" ${st.ids.includes(c.id) ? 'checked' : ''}><span>${c.person?.name}</span></label>`)}</div>` : ''}
      </div>
      <div class="group"><div class="label">Сообщение</div>
        <div class="chips">${[['sched', 'Изменение расписания'], ['hello', 'Поздравление'], ['none', 'Свой текст']].map(([v, l]) =>
          html`<button class="chip" style="height:32px;font-size:13px" aria-pressed="${String(st.tpl === v)}" data-act="tpl" data-v="${v}">${l}</button>`)}</div>
        <textarea class="field" rows="5" data-bind="text" aria-label="Текст рассылки" placeholder="Текст сообщения">${st.text}</textarea></div>
      <div class="group"><div class="label">Кнопка под сообщением</div>${seg('button', [['none', 'Без кнопки'], ['book', 'Записаться'], ['ok', 'Подтверждаю']], st.button)}</div>
    </div>`;
  },
  mounted(ctx) { if (ctx.state.count === null) previewCount(ctx); },
  footer(ctx) {
    const n = ctx.state.count;
    return html`<button class="btn primary big" data-act="send" ${n ? '' : 'disabled'}>${n === null ? 'Считаем получателей…' : `Отправить · ${n} ${plural(n, 'получатель', 'получателя', 'получателей')}`}</button>`;
  },
  acts: {
    type(ctx, el) { ctx.state.type = el.dataset.v; previewCount(ctx); },
    rink(ctx, el) { const s = ctx.state; s.rinks = s.rinks.includes(el.dataset.v) ? s.rinks.filter((x) => x !== el.dataset.v) : [...s.rinks, el.dataset.v]; previewCount(ctx); },
    pick(ctx, el) { const s = ctx.state, id = Number(el.dataset.id); s.ids = el.checked ? [...s.ids, id] : s.ids.filter((x) => x !== id); previewCount(ctx); },
    tpl(ctx, el) { ctx.state.tpl = el.dataset.v; ctx.state.text = TPL[el.dataset.v]; ctx.render(); },
    button(ctx, el) { ctx.state.button = el.dataset.v; ctx.render(); },
    async send(ctx) {
      const st = ctx.state;
      if (!st.text.trim()) return toast('Напишите текст сообщения');
      if (!(await confirmBox('Отправить рассылку?', `Получат ${st.count} ${plural(st.count, 'человек', 'человека', 'человек')}.`, 'Отправить'))) return;
      const r = await run(() => api('broadcast', { audience: { type: st.type, rinks: st.rinks, athleteIds: st.ids }, text: st.text, button: st.button === 'none' ? null : st.button }));
      toast(`Отправлено: ${r.sent}`);
      go('/c/today', true);
    },
  },
});
async function previewCount(ctx) {
  const st = ctx.state;
  try { st.count = (await api('broadcastPreview', { audience: { type: st.type, rinks: st.rinks, athleteIds: st.ids } })).count; } catch { st.count = 0; }
  ctx.render();
}
