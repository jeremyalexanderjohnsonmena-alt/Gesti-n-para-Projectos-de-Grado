import { catalogs } from './catalogs.js';

export const STORAGE_KEY = 'usb-cartagena-asesorias-v1';

function fallback(fallbackState, storageAvailable) {
  return { state: structuredClone(fallbackState), storageAvailable };
}

function usableState(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Array.isArray(value.projects)
    && value.projects.every((project) => project && typeof project === 'object'
      && typeof project.id === 'string' && Array.isArray(project.sessions)
      && project.sessions.every((session) => session && typeof session === 'object'
        && !Array.isArray(session) && required(session.id) && validateSession(session).valid));
}

export function loadState(storage, fallbackState) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return fallback(fallbackState, false);
  }
  if (raw === null) return fallback(fallbackState, true);
  try {
    const state = JSON.parse(raw);
    return usableState(state) ? { state, storageAvailable: true } : fallback(fallbackState, true);
  } catch {
    return fallback(fallbackState, true);
  }
}

export function persistState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function required(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateProject(input) {
  const errors = {};
  if (!catalogs.modalities.includes(input?.modality)) errors.modality = 'Selecciona una modalidad válida.';
  if (!required(input?.title)) errors.title = 'Escribe un título.';
  if (!Array.isArray(input?.students) || input.students.length === 0
    || !input.students.every(required)) {
    errors.students = 'Selecciona al menos un estudiante.';
  }
  if (!required(input?.director)) errors.director = 'Selecciona un director.';
  if (!required(input?.faculty)) errors.faculty = 'Selecciona una facultad.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateSession(input) {
  const errors = {};
  if (!calendarDate(input?.date)) errors.date = 'Selecciona una fecha válida.';
  const duration = Number(input?.duration);
  if ((typeof input?.duration !== 'number' && typeof input?.duration !== 'string')
    || !Number.isFinite(duration) || duration <= 0 || duration > 24) {
    errors.duration = 'La duración debe ser mayor que 0 y máximo 24 horas.';
  }
  if (!required(input?.activities)) errors.activities = 'Describe las actividades.';
  if (!required(input?.commitments)) errors.commitments = 'Escribe los compromisos.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function calculateMetrics(projects) {
  return projects.reduce((metrics, project) => {
    metrics.projects += 1;
    metrics.sessions += project.sessions.length;
    metrics.hours += project.sessions.reduce((sum, session) => sum + Number(session.duration), 0);
    return metrics;
  }, { projects: 0, sessions: 0, hours: 0 });
}

export function filterProjects(projects, filters = {}) {
  return projects.filter((project) =>
    (!filters.modality || project.modality === filters.modality)
    && (!filters.faculty || project.faculty === filters.faculty));
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function upsertProject(projects, project) {
  const exists = projects.some((item) => item.id === project.id);
  return exists
    ? projects.map((item) => item.id === project.id ? project : item)
    : [...projects, project];
}

export function removeProject(projects, projectId) {
  return projects.filter((project) => project.id !== projectId);
}

export function upsertSession(projects, projectId, session) {
  return projects.map((project) => project.id === projectId
    ? { ...project, sessions: project.sessions.some((item) => item.id === session.id)
      ? project.sessions.map((item) => item.id === session.id ? session : item)
      : [...project.sessions, session] }
    : project);
}

export function removeSession(projects, projectId, sessionId) {
  return projects.map((project) => project.id === projectId
    ? { ...project, sessions: project.sessions.filter((session) => session.id !== sessionId) }
    : project);
}

export function normalizeStudentSignatures(project, session) {
  const studentIds = Array.isArray(project?.students) ? project.students : [];
  const raw = session && typeof session === 'object' && session.studentSignatures
    && typeof session.studentSignatures === 'object' && !Array.isArray(session.studentSignatures)
    ? session.studentSignatures : {};

  const normalized = {};
  for (const studentId of studentIds) {
    const value = raw[studentId];
    if (typeof value === 'string' && value.trim()) normalized[studentId] = value.trim();
  }

  if (Object.keys(normalized).length === 0 && studentIds.length === 1) {
    const legacySignature = typeof session?.studentSignature === 'string' ? session.studentSignature.trim() : '';
    if (legacySignature) normalized[studentIds[0]] = legacySignature;
  }

  return normalized;
}

export function summarizeStudentSignatures(project, session) {
  const projectStudents = Array.isArray(project?.students) ? project.students : [];
  const signatures = normalizeStudentSignatures(project, session);
  const parts = projectStudents
    .map((studentId) => {
      const signature = signatures[studentId];
      return signature ? `${studentId}: ${signature}` : null;
    })
    .filter(Boolean);

  if (parts.length > 0) return parts.join(' | ');

  const legacySignature = typeof session?.studentSignature === 'string' ? session.studentSignature.trim() : '';
  return legacySignature || 'Sin registrar';
}

export function validateAuthInput(input) {
  const errors = {};
  if (!required(input?.username)) {
    errors.username = 'El nombre de usuario es requerido.';
  } else if (input.username.trim().length < 3) {
    errors.username = 'El nombre de usuario debe tener al menos 3 caracteres.';
  }
  if (!required(input?.password)) {
    errors.password = 'La contraseña es requerida.';
  } else if (input.password.length < 4) {
    errors.password = 'La contraseña debe tener al menos 4 caracteres.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

