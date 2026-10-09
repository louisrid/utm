import { timingSafeEqual } from 'node:crypto';

export function isAuthorised(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkConfig(env = process.env) {
  if (!env.APP_SCRIPT_URL || !env.APP_SCRIPT_TOKEN) throw new Error('Missing Apps Script environment variables');
  const parsed = new URL(env.APP_SCRIPT_URL);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com' || !parsed.pathname.includes('/macros/s/')) {
    throw new Error('Invalid Apps Script deployment URL');
  }
  return {url: parsed, token: env.APP_SCRIPT_TOKEN};
}

export async function callAppsScript(action, params = {}, env = process.env) {
  const {url, token} = checkConfig(env);
  url.searchParams.set('action', action);
  url.searchParams.set('token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const response = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {'Accept': 'application/json'},
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
  const body = await response.json();
  if (!body.ok) throw new Error(body.error || 'Apps Script error');
  return body;
}

export const json = (statusCode, object) => ({
  statusCode,
  headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
  body: JSON.stringify(object)
});
