import {callAppsScript} from '../lib/shared.mjs';

const BOT_UA = /bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|headless|curl|wget/i;
const CODE_RE = /^A\d{2,3}-P\d{2,4}$/;
const PRISM_BASE = 'https://prism-builder.com/';

export function parseCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

function destinationFor(code) {
  const [campaign, publisher] = code.split('-');
  const url = new URL(PRISM_BASE);
  url.searchParams.set('utm_source','X');
  url.searchParams.set('utm_medium','ART');
  url.searchParams.set('utm_campaign',campaign);
  url.searchParams.set('utm_content',publisher);
  return url.toString();
}

export async function handler(event) {
  const code = parseCode(event.queryStringParameters?.code);
  if (!code) return {statusCode:404, body:'Unknown tracking link'};
  const ua = String(event.headers?.['user-agent'] || event.headers?.['User-Agent'] || '').slice(0, 180);
  const isBot = BOT_UA.test(ua);
  const fallback = destinationFor(code);
  let logged = false;
  try {
    const result = await callAppsScript(isBot ? 'resolve' : 'hit', {code});
    const destination = new URL(result.destination);
    if (destination.protocol !== 'https:' || destination.hostname !== 'prism-builder.com') {
      throw new Error('Destination hostname not approved');
    }
    logged = !isBot;
  } catch (error) {
    // Fail open for the reader: a temporary Sheet outage must not cost a referral.
    // The visit will NOT be counted when logging fails; inspect Netlify function logs.
    console.error('tracking not recorded, falling back to safe Prism redirect:', code, error.message);
  }
  return {
    statusCode:302,
    headers: {
      'Location':fallback,
      'Cache-Control':'no-store',
      'Referrer-Policy':'no-referrer',
      'X-Tracking-Status':logged?'recorded':'unconfirmed'
    },
    body:''
  };
}
