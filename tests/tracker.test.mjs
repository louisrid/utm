import test from 'node:test';
import assert from 'node:assert/strict';
import {isAuthorised, checkConfig} from '../netlify/lib/shared.mjs';
import {parseCode} from '../netlify/functions/go.mjs';

test('tracking code must be short and uppercase', () => {
  assert.equal(parseCode('a01-p01'), 'A01-P01');
  assert.equal(parseCode('A12-P103'), 'A12-P103');
  for (const input of ['', 'foo', 'A1-P1', 'A01-P0?x=1', '../../secret', 'A01/P01']) assert.equal(parseCode(input), null);
});
test('constant-time password matcher rejects missing or different secrets', () => {
  assert.ok(isAuthorised('a-long-secret', 'a-long-secret'));
  assert.equal(isAuthorised('bad', 'a-long-secret'), false);
  assert.equal(isAuthorised('', ''), false);
});
test('Apps Script API endpoint must be a Google script deployment', () => {
  assert.throws(() => checkConfig({APP_SCRIPT_URL:'https://example.com/x', APP_SCRIPT_TOKEN:'abc'}));
  assert.equal(checkConfig({APP_SCRIPT_URL:'https://script.google.com/macros/s/TEST/exec', APP_SCRIPT_TOKEN:'abc'}).token, 'abc');
});
