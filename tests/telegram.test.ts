import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { verifyInitData, esc } from '../supabase/functions/_shared/telegram.ts';

function sign(fields: Record<string, string>, token: string) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('verifyInitData accepts valid and rejects tampered data', async () => {
  const token = '123:ABC';
  const now = 1_800_000_000_000;
  const fields = { auth_date: String(now / 1000 - 60), query_id: 'x', user: JSON.stringify({ id: 42, first_name: 'Аня' }), start_param: 'c_abc' };
  const ok = await verifyInitData(sign(fields, token), token, 86400, now);
  assert.equal(ok?.user.id, 42); assert.equal(ok?.startParam, 'c_abc');
  assert.equal(await verifyInitData(sign(fields, token).replace('42', '43'), token, 86400, now), null);
  assert.equal(await verifyInitData(sign(fields, 'other'), token, 86400, now), null);
  assert.equal(await verifyInitData(sign({ ...fields, auth_date: String(now / 1000 - 90000) }, token), token, 86400, now), null);
  assert.equal(esc('<b>&'), '&lt;b&gt;&amp;');
});
