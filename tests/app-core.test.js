import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogs, sampleState } from '../public/catalogs.js';
import {
  STORAGE_KEY,
  loadState,
  persistState,
  validateProject,
  validateSession,
  calculateMetrics,
  filterProjects,
  escapeHtml,
  upsertProject,
  removeProject,
  upsertSession,
  removeSession,
  validateAuthInput,
  normalizeStudentSignatures,
  summarizeStudentSignatures,
} from '../public/app-core.js';

const project = {
  id: 'project-1',
  modality: 'Trabajo de grado',
  title: 'Cartografía costera',
  students: ['student-1'],
  director: 'director-1',
  coDirector: '',
  faculty: 'Ingeniería',
  sessions: [],
};

const session = {
  id: 'session-1',
  date: '2026-09-24',
  duration: 2,
  activities: 'Revisión del marco teórico',
  commitments: 'Entregar correcciones',
  observations: '',
  studentSignature: '',
  directorSignature: '',
};

test('catalogs and sample state expose usable academic examples', () => {
  assert.deepEqual(catalogs.modalities, [
    'Trabajo de grado', 'Diplomado de profundización', 'Semillero',
  ]);
  assert.ok(catalogs.faculties.length > 1);
  assert.ok(catalogs.students.length > 1);
  assert.ok(catalogs.directors.length > 1);
  assert.ok(sampleState.projects.length >= 2);
  assert.ok(sampleState.projects.some((item) => item.sessions.length > 0));
});

test('stores one signature per student while keeping legacy fallback support', () => {
  const projectWithStudents = {
    ...project,
    students: ['student-1', 'student-2'],
  };
  const session = {
    id: 'session-1',
    date: '2026-09-24',
    duration: 2,
    activities: 'Revisión del marco teórico',
    commitments: 'Entregar correcciones',
    studentSignature: 'Firma antigua',
    studentSignatures: { 'student-1': 'Ana firma', 'student-2': 'Juan firma' },
  };
  assert.deepEqual(normalizeStudentSignatures(projectWithStudents, session), {
    'student-1': 'Ana firma',
    'student-2': 'Juan firma',
  });
  assert.equal(summarizeStudentSignatures(projectWithStudents, session), 'student-1: Ana firma | student-2: Juan firma');
  assert.deepEqual(normalizeStudentSignatures({ ...projectWithStudents, students: ['student-1'] }, { ...session, studentSignatures: {} }), {
    'student-1': 'Firma antigua',
  });
});

test('accepts a valid project', () => {
  assert.deepEqual(validateProject(project), { valid: true, errors: {} });
});

test('rejects an empty project title', () => {
  const result = validateProject({ ...project, title: '  ' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.title);
});

test('rejects a project without students', () => {
  const result = validateProject({ ...project, students: [] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.students);
});

test('rejects a modality outside the catalog', () => {
  const result = validateProject({ ...project, modality: 'Pasantía' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.modality);
});

test('rejects a student list without a usable identifier', () => {
  const result = validateProject({ ...project, students: [null] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.students);
});

test('requires the other mandatory project fields', () => {
  const result = validateProject({ ...project, modality: '', director: '', faculty: '' });
  assert.deepEqual(Object.keys(result.errors).sort(), ['director', 'faculty', 'modality']);
});

test('accepts a valid session with optional fields empty', () => {
  assert.deepEqual(validateSession(session), { valid: true, errors: {} });
});

for (const duration of [0, 24.5]) {
  test(`rejects session duration ${duration}`, () => {
    const result = validateSession({ ...session, duration });
    assert.equal(result.valid, false);
    assert.ok(result.errors.duration);
  });
}

test('rejects boolean duration while accepting a numeric form string', () => {
  assert.ok(validateSession({ ...session, duration: true }).errors.duration);
  assert.deepEqual(validateSession({ ...session, duration: '1.5' }), { valid: true, errors: {} });
});

test('requires date, activities and commitments for a session', () => {
  const result = validateSession({ ...session, date: '', activities: ' ', commitments: '' });
  assert.deepEqual(Object.keys(result.errors).sort(), ['activities', 'commitments', 'date']);
});

test('rejects a malformed calendar date', () => {
  const result = validateSession({ ...session, date: '2026-02-30' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.date);
});

test('counts projects, sessions and decimal hours', () => {
  const projects = [
    { ...project, sessions: [session, { ...session, id: 'session-2', duration: 1.5 }] },
    { ...project, id: 'project-2', sessions: [] },
  ];
  assert.deepEqual(calculateMetrics(projects), { projects: 2, sessions: 2, hours: 3.5 });
});

test('filters projects by modality and faculty together', () => {
  const projects = [
    project,
    { ...project, id: 'project-2', modality: 'Semillero' },
    { ...project, id: 'project-3', faculty: 'Educación' },
  ];
  assert.deepEqual(filterProjects(projects, { modality: 'Trabajo de grado', faculty: 'Ingeniería' }), [project]);
  assert.equal(filterProjects(projects, {}).length, 3);
});

test('loads a saved state using the versioned storage key', () => {
  const saved = { projects: [project] };
  const storage = { getItem(key) { assert.equal(key, STORAGE_KEY); return JSON.stringify(saved); } };
  assert.deepEqual(loadState(storage, sampleState), { state: saved, storageAvailable: true });
});

test('falls back to an independent copy on corrupt JSON or invalid shape', () => {
  for (const value of ['{broken', '{"projects":{}}']) {
    const result = loadState({ getItem: () => value }, sampleState);
    assert.equal(result.storageAvailable, true);
    assert.deepEqual(result.state, sampleState);
    assert.notStrictEqual(result.state, sampleState);
    assert.notStrictEqual(result.state.projects, sampleState.projects);
  }
});

test('rejects saved projects with unusable nested sessions before metrics run', () => {
  for (const invalidSession of [null, { id: 'session-broken', duration: 'oops' }]) {
    const saved = { projects: [{ ...project, sessions: [invalidSession] }] };
    const result = loadState({ getItem: () => JSON.stringify(saved) }, sampleState);
    assert.equal(result.storageAvailable, true);
    assert.deepEqual(result.state, sampleState);
    assert.notStrictEqual(result.state, sampleState);
    assert.doesNotThrow(() => calculateMetrics(result.state.projects));
  }
});

test('uses in-memory fallback and signals a temporary session when storage throws', () => {
  const result = loadState({ getItem() { throw new Error('blocked'); } }, sampleState);
  assert.equal(result.storageAvailable, false);
  assert.deepEqual(result.state, sampleState);
  assert.notStrictEqual(result.state, sampleState);
});

test('signals a temporary session when the storage adapter throws a syntax error', () => {
  const result = loadState({ getItem() { throw new SyntaxError('storage unavailable'); } }, sampleState);
  assert.equal(result.storageAvailable, false);
  assert.deepEqual(result.state, sampleState);
});

test('persists JSON successfully and reports failed writes', () => {
  let stored;
  const storage = { setItem(key, value) { stored = [key, value]; } };
  assert.equal(persistState(storage, { projects: [project] }), true);
  assert.deepEqual(stored, [STORAGE_KEY, JSON.stringify({ projects: [project] })]);
  assert.equal(persistState({ setItem() { throw new Error('quota'); } }, sampleState), false);
});

test('escapes script markup and both types of quotes', () => {
  assert.equal(escapeHtml('<script>"\'&</script>'), '&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;');
});

test('adds and updates projects without mutating the input', () => {
  const original = [project];
  const added = upsertProject(original, { ...project, id: 'project-2' });
  assert.equal(original.length, 1);
  assert.equal(added.length, 2);
  const updated = upsertProject(original, { ...project, title: 'Nuevo título' });
  assert.equal(updated[0].title, 'Nuevo título');
  assert.equal(original[0].title, 'Cartografía costera');
});

test('removes a project without mutating the input', () => {
  const original = [project, { ...project, id: 'project-2' }];
  assert.deepEqual(removeProject(original, 'project-1').map((item) => item.id), ['project-2']);
  assert.equal(original.length, 2);
});

test('adds and updates sessions without mutating the project', () => {
  const original = [{ ...project, sessions: [session] }];
  const added = upsertSession(original, project.id, { ...session, id: 'session-2' });
  assert.equal(added[0].sessions.length, 2);
  assert.equal(original[0].sessions.length, 1);
  const updated = upsertSession(original, project.id, { ...session, duration: 3 });
  assert.equal(updated[0].sessions[0].duration, 3);
  assert.equal(original[0].sessions[0].duration, 2);
});

test('removes a session without mutating the project', () => {
  const original = [{ ...project, sessions: [session] }];
  const result = removeSession(original, project.id, session.id);
  assert.deepEqual(result[0].sessions, []);
  assert.equal(original[0].sessions.length, 1);
});

test('validateAuthInput accepts valid credentials', () => {
  const result = validateAuthInput({ username: 'docente_carlos', password: 'password123' });
  assert.deepEqual(result, { valid: true, errors: {} });
});

test('validateAuthInput rejects empty or short username', () => {
  const emptyRes = validateAuthInput({ username: '   ', password: 'password123' });
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.errors.username);

  const shortRes = validateAuthInput({ username: 'ab', password: 'password123' });
  assert.equal(shortRes.valid, false);
  assert.match(shortRes.errors.username, /al menos 3 caracteres/i);
});

test('validateAuthInput rejects empty or short password', () => {
  const emptyRes = validateAuthInput({ username: 'docente', password: '' });
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.errors.password);

  const shortRes = validateAuthInput({ username: 'docente', password: '123' });
  assert.equal(shortRes.valid, false);
  assert.match(shortRes.errors.password, /al menos 4 caracteres/i);
});

