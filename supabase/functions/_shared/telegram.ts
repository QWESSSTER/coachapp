// Работа с Telegram Bot API и проверка подписи мини-приложения.

// deno-lint-ignore no-explicit-any
const env = (k: string): string => ((globalThis as any).Deno?.env?.get(k) ?? '') as string;

export const botToken = () => env('TELEGRAM_BOT_TOKEN');
export const webAppUrl = () => env('WEBAPP_URL').replace(/\/+$/, '') + '/';
export const botUsername = () => env('BOT_USERNAME').replace(/^@/, '');

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// deno-lint-ignore no-explicit-any
export async function tg(method: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) console.warn(`telegram ${method} failed`, JSON.stringify(data).slice(0, 300));
  return data;
}

export type Button = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

/** Отправка сообщения. Ошибки (например, пользователь заблокировал бота) не прерывают работу. */
export async function send(chatId: number, html: string, buttons?: Button[][]): Promise<boolean> {
  try {
    const r = await tg('sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buttons && buttons.length ? { inline_keyboard: buttons } : undefined,
    });
    return !!r.ok;
  } catch (e) {
    console.warn('send failed', e);
    return false;
  }
}

/** Кнопка, открывающая мини-приложение на нужном экране (#/...). */
export function appButton(text: string, route = ''): Button {
  return { text, web_app: { url: webAppUrl() + (route ? `#${route}` : '') } };
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };

/**
 * Проверка initData по документации Telegram:
 * secret = HMAC_SHA256(key="WebAppData", data=bot_token); hash = HMAC_SHA256(key=secret, data=data_check_string).
 */
export async function verifyInitData(initData: string, token: string, maxAgeSec = 7 * 86400, now = Date.now()) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', k1, enc.encode(token));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', k2, enc.encode(dcs)));
  if (sig !== hash) return null;
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;
  const user = JSON.parse(params.get('user') ?? 'null') as TgUser | null;
  if (!user?.id) return null;
  return { user, startParam: params.get('start_param') };
}
