// Точка входа: Telegram, загрузка профиля, выбор стартового экрана.
import { tg, api, session, route, go, parseHash, applyTheme, homePath, html, screen } from './core.js';
import './onboard.js';
import './athlete.js';
import './coach.js';

screen('/', { view: () => html`<div class="content top"><div class="skeleton"></div></div>` });
screen('/start', { view: () => html`<div class="content top"><div class="skeleton"></div></div>` });

function fatal(text) {
  document.getElementById('app').innerHTML = `<div class="content top"><div class="empty">${text}</div></div>`;
}

async function boot() {
  applyTheme();
  tg?.onEvent?.('themeChanged', applyTheme);
  tg?.ready?.();
  tg?.expand?.();
  try { tg?.disableVerticalSwipes?.(); } catch { /* старые клиенты */ }
  if (!tg?.initData) return fatal('Откройте это приложение из Telegram — через бота.');
  try {
    session.me = await api('me');
  } catch (e) {
    return fatal(e.message);
  }
  const role = session.me.user.role;
  const { path } = parseHash();
  const allowed = role === 'coach' ? path.startsWith('/c/') : role === 'athlete' ? path.startsWith('/a/') : path.startsWith('/onboard');
  if (!role) go('/onboard', true);
  else if (role === 'athlete' && !session.me.athlete) go('/onboard/profile', true);
  else if (!allowed || path === '/' || path === '/start') go(homePath(), true);
  else route();
}
boot();
