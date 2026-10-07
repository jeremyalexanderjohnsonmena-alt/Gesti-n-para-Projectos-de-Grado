import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.js';
import { createServer } from 'node:http';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let server;
let port;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

before(async () => {
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const app = createApp({ publicDir });
  server = createServer(app);
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

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            });
          } catch {
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path, token = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = request(
      {
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            });
          } catch {
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('POST /registrar rejects missing fields', async () => {
  const res1 = await post('/registrar', { username: 'testuser' });
  assert.equal(res1.status, 400);
  assert.match(res1.body.error, /requeridos/i);

  const res2 = await post('/registrar', { password: 'secretpassword' });
  assert.equal(res2.status, 400);
  assert.match(res2.body.error, /requeridos/i);
});

test('POST /registrar successfully creates a new user', async () => {
  const uniqueUser = `tutor_${Date.now()}`;
  const res = await post('/registrar', {
    username: uniqueUser,
    password: 'password123',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.message, 'Usuario registrado correctamente');

  // Intentar registrar el mismo usuario de nuevo debe fallar
  const dupRes = await post('/registrar', {
    username: uniqueUser,
    password: 'password123',
  });
  assert.equal(dupRes.status, 400);
  assert.match(dupRes.body.error, /ya está registrado/i);
});

test('POST /login rejects invalid credentials', async () => {
  const resWrongPass = await post('/login', {
    username: 'docente',
    password: 'wrong_password',
  });
  assert.equal(resWrongPass.status, 401);
  assert.match(resWrongPass.body.error, /credenciales inválidas/i);

  const resUnknown = await post('/login', {
    username: 'non_existent_user_xyz',
    password: 'any_password',
  });
  assert.equal(resUnknown.status, 401);
  assert.match(resUnknown.body.error, /credenciales inválidas/i);
});

test('POST /login returns JWT token for valid credentials', async () => {
  const user = `login_test_${Date.now()}`;
  await post('/registrar', { username: user, password: 'password123' });

  const res = await post('/login', { username: user, password: 'password123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.message, 'Inicio de sesión exitoso!');
  assert.equal(res.body.user.username, user);
});

test('POST /login preserves the registered student role', async () => {
  const user = `student_login_${Date.now()}`;
  await post('/registrar', { username: user, password: 'password123', role: 'estudiante' });

  const res = await post('/login', { username: user, password: 'password123' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'estudiante');
});

test('GET /recurso-protegido requires valid JWT token', async () => {
  // Sin token
  const resNoToken = await get('/recurso-protegido');
  assert.equal(resNoToken.status, 401);
  assert.match(resNoToken.body.error, /token de autenticación requerido/i);

  // Con token inválido
  const resBadToken = await get('/recurso-protegido', 'token_invalido_xyz');
  assert.equal(resBadToken.status, 403);
  assert.match(resBadToken.body.error, /token inválido o expirado/i);

  // Con token válido
  const user = `token_test_${Date.now()}`;
  await post('/registrar', { username: user, password: 'password123' });
  const loginRes = await post('/login', { username: user, password: 'password123' });
  const token = loginRes.body.token;

  const resProtected = await get('/recurso-protegido', token);
  assert.equal(resProtected.status, 200);
  assert.match(resProtected.body.message, new RegExp(user));
  assert.equal(resProtected.body.data, 'Esta información es sólo para usuarios autenticados');
});

test('GET /usuario-actual returns current user for valid token', async () => {
  const user = `current_user_${Date.now()}`;
  await post('/registrar', { username: user, password: 'password123' });
  const loginRes = await post('/login', { username: user, password: 'password123' });

  const res = await get('/usuario-actual', loginRes.body.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, user);
});
