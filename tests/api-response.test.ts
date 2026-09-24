import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/app/api';

const events: string[] = [];
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { setTimeout, clearTimeout, dispatchEvent: (event: Event) => { events.push(event.type); return true; } },
});
afterEach(() => { mock.restoreAll(); events.length = 0; });

function respond(body: string | null, status = 200, contentType = 'application/json; charset=utf-8') {
  return mock.method(globalThis, 'fetch', async () => new Response(body, { status, headers: { 'Content-Type': contentType } }));
}

for (const [name, getProfile, path] of [
  ['administrative', api.getCompanyProfile, '/api/users/admin/company-profile'],
  ['document', api.getDocumentCompanyProfile, '/api/users/company-profile'],
] as const) {
  test(`${name} profile accepts JSON null without masking authentication`, async () => {
    const fetchMock = respond('null');
    assert.equal(await getProfile(), null);
    assert.equal(fetchMock.mock.calls[0].arguments[0], path);
    assert.equal(fetchMock.mock.calls[0].arguments[1]?.credentials, 'include');
  });
}

test('existing company profile is preserved', async () => {
  const profile = { id: 7, tradeName: 'Empresa de teste', legalName: '' };
  respond(JSON.stringify(profile));
  assert.deepEqual(await api.getCompanyProfile(), profile);
});

for (const [name, body, status, contentType] of [
  ['empty response', '', 200, 'application/json'],
  ['malformed JSON', '{"secret":"do-not-log"', 200, 'application/json'],
  ['HTML gateway error', '<html>do-not-log</html>', 502, 'text/html'],
  ['no content', null, 204, 'application/json'],
] as const) {
  test(`${name} keeps safe HTTP diagnostics`, async () => {
    respond(body, status, contentType);
    await assert.rejects(api.getCompanyProfile(), (error: any) => {
      assert.equal(error.status, status);
      assert.equal(error.contentType, contentType);
      assert.equal(error.path, '/api/users/admin/company-profile');
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.equal(error.message.includes('do-not-log'), false);
      assert.equal('body' in error, false);
      return true;
    });
  });
}

test('401 preserves API error and signals session expiration', async () => {
  respond('{"error":"Sessão expirada"}', 401);
  await assert.rejects(api.getCompanyProfile(), { message: 'Sessão expirada', status: 401 });
  assert.deepEqual(events, ['qtecnico-session-expired']);
});

test('unsuccessful null JSON remains an HTTP error', async () => {
  respond('null', 403);
  await assert.rejects(api.getCompanyProfile(), { message: 'Erro na requisição', status: 403, body: null });
});
