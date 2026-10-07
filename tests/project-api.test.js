import assert from 'node:assert/strict';
import { request } from 'node:http';
import jwt from 'jsonwebtoken';
import { after, before, test } from 'node:test';
import { createApp } from '../server.js';
import { createServer } from 'node:http';

let server;
let port;
const jwtSecret = process.env.JWT_SECRET || 'super_secreto_asesorias_grado_token_key_2026';
const token = jwt.sign({ username: 'projects-api-test', role: 'docente' }, jwtSecret);
const studentToken = jwt.sign({ username: 'student-api-test', role: 'estudiante' }, jwtSecret);
const otherStudentToken = jwt.sign({ username: 'other-student', role: 'estudiante' }, jwtSecret);
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

before(async () => {
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
});

function send(method, path, body, authorization) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = request({
      port,
      path,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('project API requires a valid JWT', async () => {
  const response = await send('GET', '/api/projects');
  assert.equal(response.status, 401);
});

test('project API reports local storage when Supabase is not configured', async () => {
  const response = await send('GET', '/api/projects', undefined, token);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { storage: 'local' });
});

test('project API refuses writes when Supabase is not configured', async () => {
  const response = await send('PUT', '/api/projects', { projects: [] }, token);
  assert.equal(response.status, 503);
  assert.match(response.body.error, /supabase no está configurado/i);
});

test('student accounts and project writes are restricted to teachers', async () => {
  const accountsResponse = await send('GET', '/api/student-accounts', undefined, studentToken);
  assert.equal(accountsResponse.status, 403);

  const writeResponse = await send('PUT', '/api/projects', { projects: [] }, studentToken);
  assert.equal(writeResponse.status, 403);
});

test('student project access uses the authenticated student role', async () => {
  const response = await send('GET', '/api/projects', undefined, studentToken);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { storage: 'local' });
});

test('project API rejects malformed project state', async () => {
  const response = await send('PUT', '/api/projects', { projects: [{ id: 'broken' }] }, token);
  assert.equal(response.status, 400);
  assert.match(response.body.error, /formato de proyectos/i);
});

test('project API rejects invalid student account assignments', async () => {
  const response = await send('PUT', '/api/projects', {
    projects: [{ id: 'broken-assignment', sessions: [], studentUsernames: 'student-one' }],
  }, token);
  assert.equal(response.status, 400);
  assert.match(response.body.error, /formato de proyectos/i);
});

test('only a student can use the attendance-signature endpoint', async () => {
  const response = await send('PUT', '/api/student-signature', {
    projectId: 'project-a',
    sessionId: 'session-a',
    studentId: 'student-a',
    signature: 'Student Name',
  }, token);
  assert.equal(response.status, 403);
  assert.match(response.body.error, /solo los estudiantes/i);
});

test('attendance-signature endpoint validates required fields', async () => {
  const response = await send('PUT', '/api/student-signature', {
    projectId: 'project-a',
    sessionId: 'session-a',
    studentId: 'student-a',
    signature: '',
  }, studentToken);
  assert.equal(response.status, 400);
  assert.match(response.body.error, /firma no son válidos/i);
});

test('attendance-signature endpoint requires Supabase for shared signatures', async () => {
  const response = await send('PUT', '/api/student-signature', {
    projectId: 'project-a',
    sessionId: 'session-a',
    studentId: 'student-a',
    signature: 'Student Name',
  }, studentToken);
  assert.equal(response.status, 503);
  assert.match(response.body.error, /supabase es necesario/i);
});
