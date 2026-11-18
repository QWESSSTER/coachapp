// Первый вход: выбор роли, согласие, анкета спортсмена/родителя.
import { screen, html, raw, api, run, go, session, avatar, icon, seg, tg, homePath } from './core.js';

screen('/onboard', {
  init(ctx) { ctx.state = { role: session.me?.user?.role ?? 'athlete', agree: !!session.me?.user?.consent }; },
  view(ctx) {
    const me = session.me.user;
    const inv = session.me.inviter;
    const st = ctx.state;
    const roles = [
      ['athlete', 'Спортсмен или родитель', 'Записываюсь на тренировки сам или записываю ребёнка', '#0A6CFF', 'user'],
      ['coach', 'Тренер', 'Веду расписание и даю спортсменам ссылку для записи', '#F08300', 'cal'],
    ];
    return html`<div class="content top" style="gap:28px">
      ${inv ? html`<div class="card" style="align-self:center;display:flex;align-items:center;gap:8px;border-radius:20px;padding:6px 14px 6px 6px">
        ${avatar(inv.name, 28)}<span style="font-size:14px">Приглашение от тренера <b>${inv.name}</b></span></div>` : ''}
      <div class="hero">
        ${avatar([me.first_name, me.last_name].join(' '), 88, me.photo_url, '#E0306F')}
        <div><h1 style="margin:0;font-size:28px;font-weight:700">Здравствуйте${me.first_name ? `, ${me.first_name}` : ''}!</h1>
        <div class="muted" style="font-size:15px;margin-top:6px">Вход через Telegram${me.username ? ` · @${me.username}` : ''}</div></div>
      </div>
      <div class="group">
        <div class="label">Кто вы?</div>
        <div role="radiogroup" aria-label="Роль" style="display:flex;flex-direction:column;gap:12px">
          ${roles.map(([id, t, sub, col, ic]) => html`<button type="button" role="radio" aria-checked="${String(st.role === id)}" data-act="role" data-v="${id}"
            class="card" style="border:2px solid ${st.role === id ? 'var(--acc)' : 'transparent'};border-radius:18px;padding:16px;display:flex;align-items:center;gap:14px;text-align:left">
            <span class="tile" style="width:48px;height:48px;border-radius:12px;background:${col}">${raw(icon(ic, 26))}</span>
            <span class="row-main" style="flex:1"><span style="font-size:18px;font-weight:600">${t}</span><span class="sub" style="font-size:14px">${sub}</span></span>
          </button>`)}
        </div>
      </div>
      ${me.consent ? '' : html`<label style="display:flex;gap:12px;align-items:flex-start;padding:0 4px">
        <input type="checkbox" class="check" data-change="agree" ${st.agree ? 'checked' : ''}>
        <span style="font-size:14px;line-height:1.4">Я согласен(на) на обработку персональных данных: имя, телефон, дата рождения и история занятий хранятся, чтобы тренер мог вести запись.</span>
      </label>`}
    </div>`;
  },
  footer(ctx) {
    const ok = ctx.state.agree || session.me.user.consent;
    return html`<div class="hint center">Имя и фото — из Telegram. Роль можно сменить в профиле.</div>
      <button class="btn primary big" data-act="next" ${ok ? '' : 'disabled'}>Продолжить</button>`;
  },
  acts: {
    role(ctx, el) { ctx.state.role = el.dataset.v; ctx.render(); },
    agree(ctx, el) { ctx.state.agree = el.checked; ctx.render(); },
    async next(ctx) {
      await run(() => api('register', { role: ctx.state.role, consent: true }));
      session.me = await api('me');
      go(ctx.state.role === 'coach' ? '/c/profile?first=1' : '/onboard/profile', true);
    },
  },
});

function profileScreen(path, opts) {
  screen(path, {
    back: opts.back, title: 'Анкета', backTo: () => opts.backTo ?? '/onboard',
    async load() { return (await api('me')).athlete; },
    init(ctx) { ctx.state = {}; },
    view(ctx) {
      const a = ctx.data ?? {};
      const st = ctx.state;
      if (st.kind === undefined) Object.assign(st, { kind: a.kind ?? 'self', first_name: a.first_name ?? '', last_name: a.last_name ?? '', birth_date: a.birth_date ?? '', phone: a.phone ?? '+375 ', about: a.about ?? '' });
      const parent = st.kind === 'parent';
      const me = session.me.user;
      return html`<div class="content ${opts.back ? '' : 'top'}">
        ${opts.back ? '' : html`<h1 class="large-title">Анкета</h1>`}
        <div class="group">
          <div class="label">Кто будет заниматься</div>
          ${seg('kind', [['self', 'Я спортсмен'], ['parent', 'Мой ребёнок']], st.kind)}
          ${parent ? html`<div class="hint">Вы — ${[me.first_name, me.last_name].filter(Boolean).join(' ')} (из Telegram). Тренер увидит, что пишет родитель, а занимается ребёнок.</div>` : ''}
        </div>
        <div class="group">
          <div class="label">${parent ? 'О ребёнке' : 'О вас'}</div>
          <div class="list">
            <div class="row"><label for="f1">Имя</label><input id="f1" class="left" style="text-align:right" data-bind="first_name" value="${st.first_name}" placeholder="Имя" autocomplete="given-name"></div>
            <div class="row"><label for="f2">Фамилия</label><input id="f2" data-bind="last_name" value="${st.last_name}" placeholder="Фамилия" autocomplete="family-name"></div>
            <div class="row"><label for="f3">Дата рождения</label><input id="f3" type="date" data-bind="birth_date" value="${st.birth_date}"></div>
            <div class="row"><label for="f4">${parent ? 'Ваш телефон' : 'Телефон'}</label><input id="f4" type="tel" inputmode="tel" data-bind="phone" value="${st.phone}" autocomplete="tel"></div>
          </div>
        </div>
        <div class="group">
          <label class="label" for="f5">${parent ? 'Коротко о ребёнке' : 'О себе'}</label>
          <textarea id="f5" class="field" rows="3" data-bind="about" placeholder="${parent ? 'Сколько катается, уровень, цели, что важно знать тренеру' : 'Сколько катаетесь, уровень, цели'}">${st.about}</textarea>
        </div>
      </div>`;
    },
    footer: () => html`<button class="btn primary big" data-act="save">${opts.saveText}</button>`,
    acts: {
      kind(ctx, el) { ctx.state.kind = el.dataset.v; ctx.render(); },
      async save(ctx) {
        const st = ctx.state;
        if (!st.first_name.trim()) { tg?.HapticFeedback?.notificationOccurred('error'); return run(() => Promise.reject(new Error('Укажите имя'))).catch(() => {}); }
        const phone = st.phone.replace(/\s+/g, ' ').trim();
        await run(() => api('saveAthlete', { ...st, phone: phone === '+375' ? '' : phone }), 'Сохранено');
        go(opts.after ?? homePath(), true);
      },
    },
  });
}
profileScreen('/onboard/profile', { back: false, saveText: 'Перейти к записи', after: '/a/home' });
profileScreen('/a/profile-edit', { back: true, backTo: '/a/account', saveText: 'Сохранить', after: '/a/account' });
