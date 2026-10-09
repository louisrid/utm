import {callAppsScript, isAuthorised, json} from '../lib/shared.mjs';

export async function handler(event) {
  const key = event.headers?.['x-dashboard-key'] || event.headers?.['X-Dashboard-Key'];
  if (!isAuthorised(key, '123')) return json(401, {ok:false, error:'Incorrect dashboard password'});
  try {
    const data = await callAppsScript('dashboard');
    return json(200, data);
  } catch (error) {
    console.error('dashboard fetch failed', error.message);
    return json(502, {ok:false, error:'Could not reach the connected Google Sheet. Check Apps Script deployment and Netlify settings.'});
  }
}
