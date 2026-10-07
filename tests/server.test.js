import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../server.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let server;

before(async () => {
  server = createStaticServer({ publicDir });
  await new Promise((resolve) => server.listen(0, resolve));
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

function get(path) {
  return new Promise((resolve, reject) => {
    request({ port: server.address().port, path, method: 'GET' }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        contentType: response.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    }).on('error', reject).end();
  });
}

test('GET / serves the semantic HTML shell', async () => {
  const response = await get('/');
  assert.equal(response.status, 200);
  assert.match(response.contentType, /^text\/html/);
  for (const id of ['overview-view', 'project-form-view', 'project-detail-view']) {
    assert.match(response.body, new RegExp(`id="${id}"`));
  }
  for (const landmark of ['header', 'nav', 'main']) {
    assert.match(response.body, new RegExp(`<${landmark}[ >]`));
  }
});

test('unknown navigation route falls back to index.html', async () => {
  const response = await get('/projects/example');
  assert.equal(response.status, 200);
  assert.match(response.contentType, /^text\/html/);
  assert.match(response.body, /id="overview-view"/);
});

test('parent directory traversal is rejected', async () => {
  const response = await get('/..%2Fserver.js');
  assert.equal(response.status, 403);
  assert.doesNotMatch(response.body, /createStaticServer/);
});
