import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const indexSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('../server/security/access-token.js', import.meta.url), 'utf8');

test('server can bind to a configured host for LAN or tunnel access', () => {
  assert.match(indexSource, /const HOST = process\.env\.HOST \|\| '127\.0\.0\.1'/);
  assert.match(indexSource, /app\.listen\(PORT, HOST/);
});

test('external access can be protected by an access token gate', () => {
  assert.match(indexSource, /requireAccessToken/);
  assert.match(indexSource, /accessLoginRoute/);
  assert.match(accessSource, /C_OFFICE_ACCESS_TOKEN/);
  assert.match(accessSource, /authorization/);
  assert.match(accessSource, /c_office_access/);
  assert.match(accessSource, /timingSafeEqual/);
});
