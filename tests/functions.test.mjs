import test from 'node:test';
import assert from 'node:assert/strict';
import {handler as go} from '../netlify/functions/go.mjs';
import {handler as dashboard} from '../netlify/functions/dashboard.mjs';

test('redirect function logs a human click and preserves capital UTMs', async () => {
  const originalFetch=globalThis.fetch;
  const previous={APP_SCRIPT_URL:process.env.APP_SCRIPT_URL, APP_SCRIPT_TOKEN:process.env.APP_SCRIPT_TOKEN};
  process.env.APP_SCRIPT_URL='https://script.google.com/macros/s/DEMO/exec';
  process.env.APP_SCRIPT_TOKEN='secret';
  let action='';
  globalThis.fetch=async url=>{
    const u=new URL(url);action=u.searchParams.get('action');
    assert.equal(u.searchParams.get('code'),'A01-P01');
    return {ok:true,json:async()=>({ok:true,destination:'https://prism-builder.com/?utm_source=X&utm_medium=ART&utm_campaign=A01&utm_content=P01'})};
  };
  try {
    const response=await go({queryStringParameters:{code:'a01-p01'},headers:{'user-agent':'Mozilla/5.0 TestBrowser'}});
    assert.equal(action,'hit');
    assert.equal(response.statusCode,302);
    assert.match(response.headers.Location,/utm_campaign=A01&utm_content=P01/);
  } finally {globalThis.fetch=originalFetch;Object.assign(process.env,previous);}
});

test('dashboard endpoint requires its own password', async () => {
  const old=process.env.DASHBOARD_KEY;
  process.env.DASHBOARD_KEY='private-key';
  try {
    const response=await dashboard({headers:{'x-dashboard-key':'not-the-key'}});
    assert.equal(response.statusCode,401);
  } finally {if(old===undefined)delete process.env.DASHBOARD_KEY;else process.env.DASHBOARD_KEY=old;}
});

test('redirect still reaches Prism when backend is unavailable', async () => {
  const previous={APP_SCRIPT_URL:process.env.APP_SCRIPT_URL,APP_SCRIPT_TOKEN:process.env.APP_SCRIPT_TOKEN};
  delete process.env.APP_SCRIPT_URL;
  delete process.env.APP_SCRIPT_TOKEN;
  const oldError=console.error;
  console.error=()=>{};
  try {
    const response=await go({queryStringParameters:{code:'A01-P02'},headers:{'user-agent':'Mozilla/5.0'}});
    assert.equal(response.statusCode,302);
    assert.equal(response.headers['X-Tracking-Status'],'unconfirmed');
    assert.equal(response.headers.Location,'https://prism-builder.com/?utm_source=X&utm_medium=ART&utm_campaign=A01&utm_content=P02');
  } finally {console.error=oldError;for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
