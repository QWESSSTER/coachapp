// Ядро мини-приложения: Telegram, запросы к API, роутер, отрисовка, общие элементы.
import { API_URL } from '../config.js';

export const tg = window.Telegram?.WebApp ?? null;

// ---------- безопасный HTML ----------
export function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** Шаблон: значения экранируются, массивы склеиваются, raw() вставляется как есть. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += val(vals[i]);
  });
  return new Raw(out);
}
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
function val(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}

// ---------- API ----------
let initData = tg?.initData ?? '';
export function startParam() {
  const sp = tg?.initDataUnsafe?.start_param;
  if (sp) return sp;
  const m = /[?&]c=([a-z0-9]+)/i.exec(location.hash);
  return m ? `c_${m[1]}` : null;
}
export async function api(action, params = {}) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, initData, startParam: startParam(), ...params }),
    });
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка сервера');
  return data.data;
}

// ---------- тема и Telegram ----------
export function applyTheme() {
  const dark = tg ? tg.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const bg = dark ? '#000000' : '#F2F2F7';
  try { tg?.setHeaderColor?.(bg); tg?.setBackgroundColor?.(bg); tg?.setBottomBarColor?.(bg); } catch { /* старые клиенты */ }
}
export const haptic = {
  tap: () => { try { tg?.HapticFeedback?.selectionChanged(); } catch { /* нет */ } },
  ok: () => { try { tg?.HapticFeedback?.notificationOccurred('success'); } catch { /* нет */ } },
  err: () => { try { tg?.HapticFeedback?.notificationOccurred('error'); } catch { /* нет */ } },
};
export function openLink(url) {
  if (url.startsWith('https://t.me/')) tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, '_blank');
  else tg?.openLink ? tg.openLink(url) : window.open(url, '_blank');
}

// ---------- роутер и экраны ----------
export const routes = new Map();
export const session = { me: null };
let current = null;

/**
 * Экран: { load(params) → данные, view(ctx) → html, mounted?(ctx), acts: { имя(ctx, el, ev) } , tab?, back? }.
 * ctx = { params, data, state, render(), go() }.
 */
export function screen(path, spec) { routes.set(path, spec); }

export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, params: Object.fromEntries(new URLSearchParams(qs ?? '')) };
}
export function go(path, replace = false) {
  const h = '#' + path;
  if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
  route();
}
export function back(fallback) {
  if (history.length > 1 && current?.cameFromApp) history.back();
  else go(fallback ?? homePath(), true);
}
export function homePath() {
  return session.me?.user?.role === 'coach' ? '/c/today' : '/a/home';
}

let navId = 0;
export async function route() {
  const { path, params } = parseHash();
  const spec = routes.get(path) ?? routes.get('/');
  const id = ++navId;
  const ctx = {
    spec, params, data: null, state: {}, error: null, loading: true, cameFromApp: !!current,
    render: () => renderCtx(ctx), reload: () => loadCtx(ctx, id), go,
  };
  current = ctx;
  closeOverlay();
  window.scrollTo(0, 0);
  if (spec.init) spec.init(ctx);
  renderCtx(ctx);
  await loadCtx(ctx, id);
  // кнопка «назад» Telegram
  try {
    if (spec.back) { tg?.BackButton?.show(); } else { tg?.BackButton?.hide(); }
  } catch { /* нет */ }
}
async function loadCtx(ctx, id) {
  if (!ctx.spec.load) { ctx.loading = false; return renderCtx(ctx); }
  ctx.loading = true;
  try {
    const d = await ctx.spec.load(ctx.params, ctx);
    if (id !== navId) return;
    ctx.data = d;
    ctx.error = null;
  } catch (e) {
    if (id !== navId) return;
    ctx.error = e.message;
  }
  ctx.loading = false;
  renderCtx(ctx);
}

const app = () => document.getElementById('app');
function renderCtx(ctx) {
  if (ctx !== current) return;
  const s = ctx.spec;
  let body;
  if (ctx.loading && !ctx.data) body = html`<div class="content top">${[1, 2, 3].map(() => html`<div class="skeleton"></div>`)}</div>`;
  else if (ctx.error && !ctx.data) {
    body = html`<div class="content top"><div class="empty">${ctx.error}</div><button class="btn primary big" data-act="__retry">Повторить</button></div>`;
  } else body = s.view(ctx);
  const footer = ctx.data && s.footer ? String(s.footer(ctx) ?? '') : '';
  const cls = ['screen', s.tab ? 'has-tabs' : '', footer ? 'has-footer' : ''].join(' ');
  const title = typeof s.title === 'function' ? (ctx.data ? s.title(ctx) : '') : s.title;
  const nav = s.back ? navbar(title, s.backLabel, ctx.data ? s.navRight?.(ctx) : '') : '';
  app().innerHTML = `<div class="${cls}">${nav}${body}${footer ? `<div class="footer">${footer}</div>` : ''}${s.tab ? tabbar(s.tab) : ''}</div>`;
  if (s.mounted && ctx.data) s.mounted(ctx, app());
}

function navbar(title, backLabel = 'Назад', right = '') {
  return `<div class="navbar"><button class="back" data-act="__back">${icon('back', 22)}${esc(backLabel)}</button><div class="title">${esc(title ?? '')}</div><div class="right">${right ?? ''}</div></div>`;
}

// делегирование событий
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || !current) return;
  const name = el.dataset.act;
  if (name === '__back') return back(current.spec.backTo?.(current));
  if (name === '__retry') return current.reload();
  if (name === '__go') return go(el.dataset.to);
  if (name === '__link') return openLink(el.dataset.url);
  const fn = current.spec.acts?.[name] ?? overlayActs[name];
  if (fn) { ev.preventDefault(); fn(current, el, ev); }
});
document.addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-bind]');
  if (el && current) current.state[el.dataset.bind] = el.type === 'checkbox' ? el.checked : el.value;
});
document.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-change]');
  if (!el || !current) return;
  const fn = current.spec.acts?.[el.dataset.change];
  if (fn) fn(current, el, ev);
});
window.addEventListener('popstate', route);
tg?.BackButton?.onClick?.(() => current && back(current.spec.backTo?.(current)));

/** Выполняет действие с индикацией и сообщением об ошибке. */
export async function run(fn, okText) {
  try {
    const r = await fn();
    if (okText) toast(okText);
    haptic.ok();
    return r;
  } catch (e) {
    haptic.err();
    toast(e.message || 'Ошибка');
    throw e;
  }
}

let toastTimer;
export function toast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- оверлеи ----------
const overlayActs = {};
export function closeOverlay() { document.getElementById('overlay').innerHTML = ''; }

/** Алерт iOS: actions = [{ text, style: 'danger'|'bold', onClick }] */
export function alertBox(title, text, actions) {
  const ov = document.getElementById('overlay');
  ov.innerHTML = `<div class="dim middle"><div class="alert" role="alertdialog" aria-label="${esc(title)}"><div class="body"><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>${
    actions.map((a, i) => `<button data-ai="${i}" class="${a.style ?? ''}">${esc(a.text)}</button>`).join('')}</div></div>`;
  ov.querySelectorAll('[data-ai]').forEach((b) => b.addEventListener('click', () => {
    const a = actions[Number(b.dataset.ai)];
    closeOverlay();
    a.onClick?.();
  }));
}
export function confirmBox(title, text, okText, danger = false) {
  return new Promise((resolve) => alertBox(title, text, [
    { text: okText, style: danger ? 'danger' : 'bold', onClick: () => resolve(true) },
    { text: 'Отмена', onClick: () => resolve(false) },
  ]));
}

/** Нижняя шторка с произвольным содержимым. Возвращает корневой элемент. */
export function sheet(innerHtml, { onClose } = {}) {
  const ov = document.getElementById('overlay');
  ov.innerHTML = `<div class="dim bottom"><div class="sheet" role="dialog"><div class="grabber" aria-hidden="true"></div>${innerHtml}</div></div>`;
  const dim = ov.firstElementChild;
  dim.addEventListener('click', (e) => { if (e.target === dim) { closeOverlay(); onClose?.(); } });
  return dim.firstElementChild;
}

// ---------- склонения и форматы ----------
export function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}
export function reminderLabel(min) {
  if (!min) return 'не напоминать';
  if (min % 60 === 0) { const h = min / 60; return `за ${h} ${plural(h, 'час', 'часа', 'часов')}`; }
  return `за ${min} ${plural(min, 'минуту', 'минуты', 'минут')}`;
}
export function money(v) {
  if (v === null || v === undefined || v === '') return 'цена не указана';
  const n = Number(v);
  return `${n % 1 ? n.toFixed(2) : n} BYN`;
}
export function initials(name) {
  return String(name ?? '?').split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}
export function avatar(name, size = 56, photo = null, color = '#8E44EC') {
  const fs = Math.round(size * 0.36);
  return html`<div class="avatar" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${color}">${photo ? html`<img src="${photo}" alt="">` : initials(name)}</div>`;
}
const PALETTE = ['#8E44EC', '#E0306F', '#0A6CFF', '#F08300', '#0E8FA8', '#28A745', '#5856D6'];
export function colorFor(id) { return PALETTE[Math.abs(Number(id) || 0) % PALETTE.length]; }

// ---------- иконки ----------
const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flame: '<path d="M12 2c.8 3.6 4.9 5.6 4.9 10.6a4.9 4.9 0 01-9.8 0c0-2.4 1.3-3.9 2.3-4.9.2 1.8 1.2 2.8 2.2 2.9-.6-2.9.2-5.8.4-8.6z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .6 3.5 2.3 3.5 5.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  snow: '<path d="M12 2v20M4.9 6l14.2 12M19.1 6L4.9 18M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>',
  refresh: '<path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  megaphone: '<path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 8.5a4 4 0 010 7M18 6a7.5 7.5 0 010 12"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>',
  bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
  plane: '<path d="M2 16l20-6-4 8M2 16l6-1 3 5 2-6M14 9L8 4H5l4 6"/>',
  thermo: '<path d="M14 4v10.5a4 4 0 11-4 0V4a2 2 0 014 0zM12 14v3"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  sun: '<path d="M12 3v2M5.6 7.6l1.4 1.4M3 14h2M19 14h2M17 9l1.4-1.4M7 14a5 5 0 0110 0M3 18h18"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  pumpkin: '<path d="M12 6c-4.5 0-8 3-8 7s3.5 7 8 7 8-3 8-7-3.5-7-8-7zM12 6V3.5l2-1M9 12l1.5 1.5M15 12l-1.5 1.5M9 16.5c2 1 4 1 6 0"/>',
  card: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
export function icon(name, size = 20, sw = 2) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? ''}</svg>`;
}
export const chev = () => raw(`<span class="chev">${icon('chev', 16, 2.6)}</span>`);

// ---------- таббары ----------
const TABS = {
  athlete: [['/a/home', 'Главная', 'home'], ['/a/bookings', 'Записи', 'cal'], ['/a/progress', 'Прогресс', 'flame'], ['/a/account', 'Профиль', 'user']],
  coach: [['/c/today', 'Сегодня', 'clock'], ['/c/clients', 'Клиенты', 'users'], ['/c/stats', 'Статистика', 'stats'], ['/c/profile', 'Профиль', 'user']],
};
function tabbar(tab) {
  const [kind, active] = tab.split(':');
  const items = TABS[kind];
  return `<nav class="tabbar" aria-label="Разделы" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))">${items.map(([p, l, i]) =>
    `<a href="#${p}" ${p === active ? 'aria-current="page"' : ''}>${icon(i, 26)}${l}</a>`).join('')}</nav>`;
}

// ---------- переиспользуемые блоки ----------
export function seg(name, options, value, cols = options.length, extra = '') {
  return html`<div class="seg" role="radiogroup" style="grid-template-columns:repeat(${cols},minmax(0,1fr))" ${raw(extra)}>${options.map(([v, l]) =>
    html`<button type="button" role="radio" aria-checked="${String(String(v) === String(value))}" data-act="${name}" data-v="${v}">${l}</button>`)}</div>`;
}
export function sw(name, on, label) {
  return html`<button type="button" class="switch" role="switch" aria-checked="${String(!!on)}" aria-label="${label}" data-act="${name}"></button>`;
}
export function rinkDot(color) { return html`<span class="dot" style="background:${color}"></span>`; }

/**
 * Барабан выбора напоминания: число + единица (минуты / часы).
 * value — минуты. Вызывает onDone(minutes | null).
 */
export function reminderSheet(title, valueMin, onDone, { allowNone = true, removeText = null, onRemove = null } = {}) {
  let unit = valueMin && valueMin % 60 === 0 ? 'h' : 'm';
  let n = valueMin ? (unit === 'h' ? valueMin / 60 : valueMin) : 2;
  if (!valueMin) unit = 'h';
  const ROW = 36;
  const max = () => (unit === 'm' ? 59 : 48);
  const word = (u) => (u === 'm' ? plural(n, 'минута', 'минуты', 'минут') : plural(n, 'час', 'часа', 'часов'));
  const root = sheet(`
    <div class="sheet-head"><button class="link-btn" data-x="cancel">Отмена</button><span class="title">${esc(title)}</span><button class="link-btn right" data-x="done">Готово</button></div>
    <div class="center muted" data-x="preview"></div>
    <div class="wheel"><div class="band"></div>
      <div class="col num" role="listbox" aria-label="Сколько" tabindex="0"></div>
      <div class="col unit" role="listbox" aria-label="Единица" tabindex="0"></div>
    </div>
    ${allowNone ? '<button class="btn" data-x="none">Не напоминать</button>' : ''}
    ${removeText ? `<button class="btn danger-soft" data-x="remove">${esc(removeText)}</button>` : ''}`);
  const numCol = root.querySelector('.num'), unitCol = root.querySelector('.unit'), prev = root.querySelector('[data-x="preview"]');
  const paint = () => {
    numCol.querySelectorAll('.opt').forEach((o, i) => o.classList.toggle('on', i + 1 === n));
    unitCol.querySelectorAll('.opt').forEach((o) => { o.classList.toggle('on', o.dataset.u === unit); o.textContent = word(o.dataset.u); });
    prev.textContent = `${reminderLabel(unit === 'h' ? n * 60 : n).replace(/^за/, 'За')} до начала`;
  };
  const fillNums = () => {
    numCol.innerHTML = '<div class="pad"></div>' + Array.from({ length: max() }, (_, i) => `<div class="opt" role="option" data-n="${i + 1}">${i + 1}</div>`).join('') + '<div class="pad"></div>';
  };
  fillNums();
  unitCol.innerHTML = '<div class="pad"></div><div class="opt" role="option" data-u="m"></div><div class="opt" role="option" data-u="h"></div><div class="pad"></div>';
  requestAnimationFrame(() => { numCol.scrollTop = (n - 1) * ROW; unitCol.scrollTop = (unit === 'm' ? 0 : 1) * ROW; paint(); });
  let t1, t2;
  numCol.addEventListener('scroll', () => { clearTimeout(t1); t1 = setTimeout(() => { const v = Math.min(max(), Math.max(1, Math.round(numCol.scrollTop / ROW) + 1)); if (v !== n) { n = v; haptic.tap(); paint(); } }, 60); });
  unitCol.addEventListener('scroll', () => { clearTimeout(t2); t2 = setTimeout(() => {
    const u = Math.round(unitCol.scrollTop / ROW) === 0 ? 'm' : 'h';
    if (u !== unit) { unit = u; if (n > max()) n = max(); const top = numCol.scrollTop; fillNums(); numCol.scrollTop = Math.min(top, (n - 1) * ROW); haptic.tap(); paint(); }
  }, 60); });
  numCol.addEventListener('click', (e) => { const o = e.target.closest('.opt'); if (o) numCol.scrollTo({ top: (Number(o.dataset.n) - 1) * ROW, behavior: 'smooth' }); });
  unitCol.addEventListener('click', (e) => { const o = e.target.closest('.opt'); if (o) unitCol.scrollTo({ top: (o.dataset.u === 'm' ? 0 : 1) * ROW, behavior: 'smooth' }); });
  const key = (col, dir) => (e) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return; e.preventDefault(); col.scrollBy({ top: d * ROW * dir, behavior: 'smooth' });
  };
  numCol.addEventListener('keydown', key(numCol, 1));
  unitCol.addEventListener('keydown', key(unitCol, 1));
  root.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (x === 'cancel') closeOverlay();
    if (x === 'done') { closeOverlay(); onDone(unit === 'h' ? n * 60 : n); }
    if (x === 'none') { closeOverlay(); onDone(null); }
    if (x === 'remove') { closeOverlay(); onRemove?.(); }
  });
}
