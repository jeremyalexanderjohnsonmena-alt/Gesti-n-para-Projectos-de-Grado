import { catalogs, sampleState } from './catalogs.js';
import {
  STORAGE_KEY,
  calculateMetrics,
  escapeHtml,
  filterProjects,
  loadState,
  persistState,
  removeProject,
  removeSession,
  upsertProject,
  upsertSession,
  validateProject,
  validateSession,
  validateAuthInput,
  normalizeStudentSignatures,
  summarizeStudentSignatures,
} from './app-core.js';

const storage = {
  getItem(key) { return window.localStorage.getItem(key); },
  setItem(key, value) { window.localStorage.setItem(key, value); },
};
const loaded = loadState(storage, sampleState);
const state = {
  projects: loaded.state.projects,
  view: 'overview',
  selectedProjectId: null,
  filters: { modality: '', faculty: '' },
  notice: '',
  user: null,
  authTab: 'login',
  selectedRole: null,
};
let storageAvailable = loaded.storageAvailable;
let projectStorageMode = 'local';
let editingProjectId = null;
let editingSessionId = null;
let formReturnView = 'overview';

const byId = (id) => document.getElementById(id);
const projectForm = byId('project-form');
const projectFields = ['modality', 'title', 'students', 'director', 'faculty'];
const sessionForm = byId('session-form');
const sessionFields = ['date', 'duration', 'activities', 'commitments'];

function addOptions(selectId, items, getValue = (item) => item, getLabel = (item) => item) {
  const select = byId(selectId);
  for (const item of items) select.add(new Option(getLabel(item), getValue(item)));
}

function populateCatalogs() {
  for (const id of ['filter-modality', 'project-modality']) addOptions(id, catalogs.modalities);
  for (const id of ['filter-faculty', 'project-faculty']) addOptions(id, catalogs.faculties);
  addOptions('project-students', catalogs.students, (person) => person.id, (person) => person.name);
  for (const id of ['project-director', 'project-co-director']) {
    addOptions(id, catalogs.directors, (person) => person.id, (person) => person.name);
  }
}

function personName(collection, id) {
  return collection.find((person) => person.id === id)?.name ?? id ?? '';
}

function formatStudentSignatures(project, session) {
  const signatures = normalizeStudentSignatures(project, session);
  const labels = (Array.isArray(project?.students) ? project.students : [])
    .map((studentId) => {
      const signature = signatures[studentId];
      return signature ? `${personName(catalogs.students, studentId)}: ${signature}` : null;
    })
    .filter(Boolean);

  if (labels.length > 0) return labels.join(' | ');
  return summarizeStudentSignatures(project, session);
}

function lastSessionDate(project) {
  return project.sessions.reduce((latest, session) =>
    session.date > latest ? session.date : latest, '');
}

function renderNotices() {
  const messages = [];
  if (!storageAvailable) messages.push('Sesión temporal: los cambios se perderán al cerrar o recargar esta página.');
  if (state.user?.role === 'estudiante' && projectStorageMode === 'local') {
    messages.push('La consulta de proyectos asignados a estudiantes requiere conectar Supabase.');
  }
  if (state.notice) messages.push(state.notice);
  byId('notice-area').textContent = messages.join(' ');
}

async function requestProjects(token, method = 'GET', projects) {
  const options = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  };
  if (method === 'PUT') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ projects });
  }

  const response = await fetch(`${API_URL}/api/projects`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No fue posible sincronizar los proyectos.');
  return data;
}

async function activateProjectStorage(token) {
  const result = await requestProjects(token);
  if (result.storage === 'local') {
    projectStorageMode = 'local';
    const localState = loadState(storage, sampleState);
    state.projects = state.user?.role === 'estudiante' ? [] : localState.state.projects;
    storageAvailable = localState.storageAvailable;
    if (state.user?.role === 'docente') await loadStudentAccounts(token);
    return;
  }

  let localProjects = null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.projects) && parsed.projects.every((project) =>
        project && typeof project.id === 'string' && Array.isArray(project.sessions))) {
        localProjects = parsed.projects;
      }
    }
  } catch (error) {
    console.warn('No se pudieron leer los proyectos locales para migrarlos:', error);
  }

  if (result.initialized) {
    state.projects = result.projects;
  } else if (localProjects?.length) {
    await requestProjects(token, 'PUT', localProjects);
    state.projects = localProjects;
    state.notice = 'Los proyectos guardados en este navegador se migraron a Supabase.';
  } else {
    state.projects = [];
  }
  projectStorageMode = 'supabase';
  storageAvailable = true;
  if (state.user?.role === 'docente') await loadStudentAccounts(token);
}

async function loadStudentAccounts(token) {
  const response = await fetch(`${API_URL}/api/student-accounts`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No fue posible cargar las cuentas de estudiantes.');

  const select = byId('project-student-accounts');
  select.replaceChildren();
  for (const student of data.students) {
    select.add(new Option(student.username, student.username));
  }
}

async function persistProjects(previousProjects) {
  if (projectStorageMode === 'supabase') {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('La sesión expiró. Inicia sesión para guardar los cambios.');
      await requestProjects(token, 'PUT', state.projects);
      storageAvailable = true;
      return true;
    } catch (error) {
      console.error('Error al sincronizar proyectos:', error);
      state.projects = previousProjects;
      state.notice = error.message;
      renderApp();
      return false;
    }
  }

  if (projectStorageMode === 'unavailable') {
    state.projects = previousProjects;
    state.notice = 'No se pudieron cargar los datos de Supabase; vuelve a iniciar sesión para reintentar.';
    renderApp();
    return false;
  }

  storageAvailable = persistState(storage, { projects: state.projects });
  return true;
}

function renderOverview() {
  const metrics = calculateMetrics(state.projects);
  byId('metric-projects').textContent = String(metrics.projects);
  byId('metric-sessions').textContent = String(metrics.sessions);
  byId('metric-hours').textContent = String(metrics.hours);
  byId('filter-modality').value = state.filters.modality;
  byId('filter-faculty').value = state.filters.faculty;

  const projects = filterProjects(state.projects, state.filters)
    .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));
  byId('project-count-label').textContent = `${projects.length} ${projects.length === 1 ? 'proyecto' : 'proyectos'}`;
  const empty = byId('projects-empty');
  empty.hidden = projects.length !== 0;
  empty.querySelector('h4').textContent = state.projects.length === 0
    ? 'Aún no hay proyectos para mostrar' : 'No hay proyectos con estos filtros';
  empty.querySelector('p').textContent = state.projects.length === 0
    ? 'Cuando registre un proyecto, aparecerá aquí con su modalidad, facultad, director y última tutoría.'
    : 'Pruebe con otra modalidad o facultad.';

  const cards = projects.map((project) => {
    const card = document.createElement('article');
    card.className = 'project-card';
    const lastDate = lastSessionDate(project);
    card.innerHTML = `
      <p class="project-modality">${escapeHtml(project.modality)}</p>
      <h4><button class="project-link" type="button" data-project-id="${escapeHtml(project.id)}">${escapeHtml(project.title)}</button></h4>
      <p class="project-meta">${escapeHtml(project.faculty)} · ${escapeHtml(personName(catalogs.directors, project.director))}</p>
      <p class="project-last-session">${lastDate ? `Última tutoría: ${escapeHtml(lastDate)}` : 'Sin tutorías registradas'}</p>`;
    return card;
  });
  byId('project-list').replaceChildren(empty, ...cards);
}

function formatReportHours(value) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function generateProjectReport(project) {
  if (!project) return;

  const sessions = [...project.sessions].sort((left, right) => right.date.localeCompare(left.date));
  const students = (Array.isArray(project.students) ? project.students : [])
    .map((studentId) => personName(catalogs.students, studentId))
    .filter(Boolean)
    .join(', ') || 'No registrados';
  const totalHours = sessions.reduce((sum, session) => sum + Number(session.duration || 0), 0);

  const sessionRows = sessions.map((session) => `
    <tr>
      <td>${escapeHtml(session.date || 'Sin fecha')}</td>
      <td>${escapeHtml(formatReportHours(session.duration || 0))} h</td>
      <td>${escapeHtml(session.activities || 'Sin registrar')}</td>
      <td>${escapeHtml(session.commitments || 'Sin registrar')}</td>
      <td>${escapeHtml(session.studentSignature || 'Sin registrar')}</td>
      <td>${escapeHtml(session.directorSignature || 'Sin registrar')}</td>
    </tr>
  `).join('');

  const reportWindow = window.open('', '_blank', 'width=900,height=900');
  if (!reportWindow) {
    state.notice = 'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.';
    renderApp();
    return;
  }

  const fechaActual = new Date().toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  reportWindow.document.write(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Informe de tutorías - ${escapeHtml(project.title || 'Proyecto')}</title>
        <style>
        :root { color-scheme: light; }
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          color: #111;
          background: white;
          padding: 24px;
        }
        .report-header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 20px; }
        .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #ff6600; font-weight: 700; margin: 0 0 8px; }
        h1 { margin: 0 0 8px; font-size: 28px; }
        .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; font-size: 14px; margin-top: 16px; }
        .meta div { padding: 6px 0; border-top: 1px solid #e5e5e5; }
        .meta strong { display: block; font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        th, td { border: 1px solid #d9d9d9; padding: 10px 8px; text-align: left; vertical-align: top; font-size: 12px; }
        th { background: #f4f4f4; }
        .summary { display: flex; justify-content: space-between; gap: 20px; margin-top: 20px; padding: 16px; background: #fff3eb; border: 1px solid rgba(255, 102, 0, 0.25); border-radius: 8px; font-size: 14px; }
        .place-date { margin-top: 18px; font-size: 13px; color: #333; }
        .signature-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 30px; }
        .signature-block { border-top: 2px solid #111; padding-top: 10px; font-size: 12px; }
        .signature-block strong { display: block; margin-bottom: 24px; }
        .signature-line { height: 30px; }
        @page { size: A4 portrait; margin: 18mm; }
        @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <header class="report-header">
        <p class="eyebrow">Universidad de San Buenaventura · Cartagena</p>
        <h1>Informe final de tutorías</h1>
        <div class="meta">
          <div><strong>Proyecto</strong>${escapeHtml(project.title || 'Sin título')}</div>
          <div><strong>Modalidad</strong>${escapeHtml(project.modality || 'Sin modalidad')}</div>
          <div><strong>Facultad</strong>${escapeHtml(project.faculty || 'Sin facultad')}</div>
          <div><strong>Director</strong>${escapeHtml(personName(catalogs.directors, project.director) || 'Sin director')}</div>
          <div><strong>Co-director</strong>${escapeHtml(project.coDirector ? personName(catalogs.directors, project.coDirector) : 'No registrado')}</div>
          <div><strong>Estudiantes</strong>${escapeHtml(students)}</div>
        </div>
        </header>

        <div class="summary">
        <div><strong>Tutorías registradas:</strong> ${sessions.length}</div>
        <div><strong>Total de horas:</strong> ${escapeHtml(formatReportHours(totalHours))} h</div>
        </div>

        <p class="place-date">Cartagena, ${escapeHtml(fechaActual)}.</p>

        <p style="margin-top: 18px; font-size: 13px; line-height: 1.6; text-align: justify;">
        El presente informe final se deja como acta de constancia de las tutorías realizadas por los estudiantes junto con su codirector, en las cuales se brindó acompañamiento y orientación durante el desarrollo del proyecto.
        </p>

        <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Horas</th>
            <th>Actividades</th>
            <th>Compromisos</th>
            <th>Firma estudiantes</th>
            <th>Firma director</th>
          </tr>
        </thead>
        <tbody>
          ${sessionRows || '<tr><td colspan="6">No hay tutorías registradas.</td></tr>'}
        </tbody>
        </table>

        <div class="signature-row">
        <div class="signature-block">
          <strong>Director / Co-director</strong>
          <div class="signature-line"></div>
          <div>${escapeHtml(personName(catalogs.directors, project.director) || 'Nombre del director')}</div>
        </div>
        <div class="signature-block">
          <strong>Estudiantes</strong>
          <div class="signature-line"></div>
          <div>${escapeHtml(students || 'Nombres de los estudiantes')}</div>
        </div>
        </div>
      </body>
    </html>`);

  reportWindow.document.close();
  setTimeout(() => {
    reportWindow.focus();
    reportWindow.print();
  }, 250);
}

function renderProjectDetail(projectId = state.selectedProjectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  byId('project-detail-title').textContent = project.title ?? 'Proyecto sin título';
  byId('project-detail-meta').textContent = `${project.modality ?? ''} · ${project.faculty ?? ''}`;
  byId('detail-students').textContent = (Array.isArray(project.students) ? project.students : [])
    .map((id) => personName(catalogs.students, id)).join(', ');
  byId('detail-director').textContent = personName(catalogs.directors, project.director);
  byId('detail-co-director').textContent = project.coDirector
    ? personName(catalogs.directors, project.coDirector) : 'No registrado';
  const metrics = calculateMetrics([project]);
  byId('detail-session-count').textContent = String(metrics.sessions);
  byId('detail-hours').textContent = String(metrics.hours);
  const esEstudiante = state.user?.role === 'estudiante';
  const editProjBtn = byId('edit-project-button');
  const deleteProjBtn = byId('delete-project-button');
  const newSessionBtn = byId('new-session-button');
  if (editProjBtn) editProjBtn.hidden = esEstudiante;
  if (deleteProjBtn) deleteProjBtn.hidden = esEstudiante;
  if (newSessionBtn) newSessionBtn.hidden = esEstudiante;
  const sessions = [...project.sessions].sort((left, right) => right.date.localeCompare(left.date));
  const rows = sessions.map((session) => {
    const row = document.createElement('tr');
    row.className = 'session-card';

    const actionsHtml = esEstudiante
      ? `<td data-label="Acciones"><div class="session-actions">
           <button class="button ${session.studentSignature ? 'button-quiet' : 'button-primary'} button-sm session-action"
             type="button" data-session-action="sign" data-session-id="${escapeHtml(session.id)}"
             aria-label="Firmar tutoría del ${escapeHtml(session.date)}">
             ${session.studentSignature ? '✓ Editar mi firma' : '✍ Firmar'}
           </button>
         </div></td>`
      : `<td data-label="Acciones"><div class="session-actions">
           <button class="button button-quiet session-action" type="button"
             data-session-action="edit" data-session-id="${escapeHtml(session.id)}"
             aria-label="Editar tutoría del ${escapeHtml(session.date)}">Editar</button>
           <button class="button button-danger session-action" type="button"
             data-session-action="delete" data-session-id="${escapeHtml(session.id)}"
             aria-label="Eliminar tutoría del ${escapeHtml(session.date)}">Eliminar</button>
         </div></td>`;

    row.innerHTML = `
      <td data-label="Fecha"><time datetime="${escapeHtml(session.date)}">${escapeHtml(session.date)}</time></td>
      <td data-label="Duración">${escapeHtml(session.duration)} h</td>
      <td data-label="Actividades"><div class="session-cell-content"><p class="session-main-text">${escapeHtml(session.activities)}</p><p class="session-secondary"><strong>Observaciones:</strong> ${escapeHtml(session.observations || 'Sin observaciones')}</p></div></td>
      <td data-label="Compromisos"><div class="session-cell-content"><p class="session-main-text">${escapeHtml(session.commitments)}</p><p class="session-secondary"><strong>Firma de estudiantes:</strong> ${escapeHtml(formatStudentSignatures(project, session))}</p><p class="session-secondary"><strong>Firma de director:</strong> ${escapeHtml(session.directorSignature || 'Sin registrar')}</p></div></td>
      ${actionsHtml}`;
    return row;
  });
  if (rows.length === 0) {
    const empty = document.createElement('tr');
    empty.className = 'session-empty-row';
    empty.innerHTML = '<td colspan="5">Aún no hay tutorías registradas para este proyecto.</td>';
    rows.push(empty);
  }
  byId('session-list').replaceChildren(...rows);
}

function renderApp() {
  const isAuthenticated = Boolean(state.user && localStorage.getItem('token'));
  const userBadge = byId('user-badge');
  const newProjectBtn = byId('new-project-button');
  const navProjectFormBtn = byId('nav-project-form');
  const esEstudianteGlobal = isAuthenticated && state.user?.role === 'estudiante';

  if (userBadge) userBadge.hidden = !isAuthenticated;
  if (newProjectBtn) newProjectBtn.hidden = !isAuthenticated || esEstudianteGlobal;
  if (navProjectFormBtn) navProjectFormBtn.hidden = esEstudianteGlobal;

  if (isAuthenticated && state.user?.username) {
    const nameEl = byId('user-display-name');
    if (nameEl) nameEl.textContent = state.user.username;
    const roleEl = byId('user-badge')?.querySelector('.user-badge-role');
    if (roleEl) {
      const roleLabel = state.user.role === 'estudiante' ? 'Estudiante'
        : state.user.role === 'docente' ? 'Docente / Director'
        : 'Sesión activa';
      roleEl.textContent = roleLabel;
    }
  }

  if (state.view === 'detail' && !state.projects.some((item) => item.id === state.selectedProjectId)) {
    state.view = 'overview';
  }

  const views = {
    overview: 'overview-view',
    form: 'project-form-view',
    detail: 'project-detail-view',
    auth: 'auth-view',
  };
  for (const [name, id] of Object.entries(views)) {
    const el = byId(id);
    if (el) el.hidden = state.view !== name;
  }

  for (const [id, active] of [
    ['nav-overview', state.view === 'overview' || state.view === 'detail'],
    ['nav-project-form', state.view === 'form'],
    ['nav-auth', state.view === 'auth'],
  ]) {
    const button = byId(id);
    if (button) {
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  const navAuth = byId('nav-auth');
  if (navAuth) {
    navAuth.textContent = isAuthenticated
      ? `Mi cuenta (${state.user.username})`
      : 'Iniciar sesión / Registro';
  }

  renderNotices();
  if (state.view === 'overview') renderOverview();
  if (state.view === 'detail') renderProjectDetail();
}

function showView(viewName) {
  if (!['overview', 'form', 'detail', 'auth'].includes(viewName)) return;

  const isAuthenticated = Boolean(state.user && localStorage.getItem('token'));
  if (!isAuthenticated && viewName !== 'auth') {
    state.view = 'auth';
    state.notice = 'Por favor, inicie sesión o regístrese para acceder a la gestión de asesorías.';
    byId('error-area').textContent = '';
    renderApp();
    return;
  }

  state.view = viewName;
  byId('error-area').textContent = '';
  renderApp();
}

function selectProject(projectId) {
  if (!state.projects.some((project) => project.id === projectId)) return;
  closeSessionForm();
  state.selectedProjectId = projectId;
  showView('detail');
}

function clearSessionErrors() {
  for (const field of sessionFields) {
    byId(`session-${field}`).removeAttribute('aria-invalid');
    byId(`session-${field}-error`).textContent = '';
  }
  byId('error-area').textContent = '';
}

function closeSessionForm() {
  editingSessionId = null;
  sessionForm.reset();
  clearSessionErrors();
  byId('session-form-section').hidden = true;
  byId('new-session-button').setAttribute('aria-expanded', 'false');
}

function openSessionForm(sessionId = null) {
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  if (!project) return;
  const session = project.sessions.find((item) => item.id === sessionId);
  if (sessionId && !session) return;
  closeSessionForm();
  editingSessionId = session?.id ?? null;
  if (session) {
    for (const field of ['date', 'duration', 'activities', 'commitments', 'observations', 'studentSignature', 'directorSignature']) {
      byId(`session-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`).value = session[field] ?? '';
    }
  }
  byId('session-form-title').textContent = session ? 'Editar tutoría' : 'Registrar tutoría';
  byId('session-form-eyebrow').textContent = session ? 'Editar entrada' : 'Nueva entrada';
  byId('session-form-section').hidden = false;
  byId('new-session-button').setAttribute('aria-expanded', 'true');
  byId('session-date').focus();
}

function focusSessionLog() {
  byId('session-log-title').focus();
}

async function handleSessionSubmit(event, projectId) {
  event.preventDefault();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || state.selectedProjectId !== projectId) return;
  clearSessionErrors();
  const input = {
    date: byId('session-date').value,
    duration: byId('session-duration').value,
    activities: byId('session-activities').value.trim(),
    commitments: byId('session-commitments').value.trim(),
    observations: byId('session-observations').value.trim(),
    studentSignature: byId('session-student-signature').value.trim(),
    directorSignature: byId('session-director-signature').value.trim(),
  };
  const { errors } = validateSession(input);
  if (Object.keys(errors).length > 0) {
    for (const [field, message] of Object.entries(errors)) {
      byId(`session-${field}`).setAttribute('aria-invalid', 'true');
      byId(`session-${field}-error`).textContent = message;
    }
    byId('error-area').textContent = 'Revise los campos señalados de la tutoría.';
    byId(`session-${Object.keys(errors)[0]}`).focus();
    return;
  }
  const session = {
    ...input,
    id: editingSessionId ?? crypto.randomUUID(),
    duration: Number(input.duration),
  };
  const updatedAt = new Date().toISOString();
  const previousProjects = state.projects;
  state.projects = upsertSession(state.projects, projectId, session)
    .map((item) => item.id === projectId ? { ...item, updatedAt } : item);
  state.notice = editingSessionId ? 'Tutoría actualizada correctamente.' : 'Tutoría registrada correctamente.';
  if (!await persistProjects(previousProjects)) return;
  closeSessionForm();
  renderApp();
  focusSessionLog();
}

async function handleSessionDelete(projectId, sessionId) {
  const project = state.projects.find((item) => item.id === projectId);
  const session = project?.sessions.find((item) => item.id === sessionId);
  if (!session || state.selectedProjectId !== projectId
    || !window.confirm(`¿Eliminar la tutoría del ${session.date}?`)) return;
  const previousProjects = state.projects;
  state.projects = removeSession(state.projects, projectId, sessionId)
    .map((item) => item.id === projectId ? { ...item, updatedAt: new Date().toISOString() } : item);
  state.notice = 'Tutoría eliminada correctamente.';
  if (!await persistProjects(previousProjects)) return;
  if (editingSessionId === sessionId) closeSessionForm();
  renderApp();
  focusSessionLog();
}

function clearProjectErrors() {
  for (const field of [...projectFields, 'student-accounts']) {
    byId(`project-${field}`).removeAttribute('aria-invalid');
    byId(`project-${field}-error`).textContent = '';
  }
  byId('error-area').textContent = '';
}

function preserveHistoricalOption(selectId, value) {
  if (typeof value !== 'string' || !value.trim()) return;
  const select = byId(selectId);
  if (Array.from(select.options).some((option) => option.value === value)) return;
  const option = new Option(`Valor anterior (fuera del catálogo): ${value}`, value);
  option.dataset.historical = 'true';
  select.add(option);
}

function openProjectForm(projectId = null) {
  const project = state.projects.find((item) => item.id === projectId);
  formReturnView = state.view === 'detail' ? 'detail' : 'overview';
  editingProjectId = project?.id ?? null;
  projectForm.querySelectorAll('option[data-historical]').forEach((option) => option.remove());
  projectForm.reset();
  clearProjectErrors();
  byId('project-form-title').textContent = project ? 'Editar proyecto' : 'Nuevo proyecto';
  if (project) {
    for (const [selectId, value] of [
      ['project-modality', project.modality],
      ['project-faculty', project.faculty],
      ['project-director', project.director],
      ['project-co-director', project.coDirector],
    ]) preserveHistoricalOption(selectId, value);
    if (Array.isArray(project.students)) {
      for (const studentId of project.students) preserveHistoricalOption('project-students', studentId);
    }
    for (const field of ['modality', 'title', 'director', 'coDirector', 'faculty']) {
      byId(`project-${field === 'coDirector' ? 'co-director' : field}`).value = project[field];
    }
    for (const option of byId('project-students').options) {
      option.selected = Array.isArray(project.students) && project.students.includes(option.value);
    }
    for (const option of byId('project-student-accounts').options) {
      option.selected = Array.isArray(project.studentUsernames)
        && project.studentUsernames.some((username) =>
          username.toLowerCase() === option.value.toLowerCase());
    }
  }
  showView('form');
  byId('project-modality').focus();
}

async function handleProjectSubmit(event) {
  event.preventDefault();
  clearProjectErrors();
  const input = {
    modality: byId('project-modality').value,
    title: byId('project-title').value.trim(),
    students: Array.from(byId('project-students').selectedOptions, (option) => option.value),
    studentUsernames: Array.from(byId('project-student-accounts').selectedOptions, (option) => option.value),
    director: byId('project-director').value,
    coDirector: byId('project-co-director').value,
    faculty: byId('project-faculty').value,
  };
  const existing = state.projects.find((item) => item.id === editingProjectId);
  const { errors } = validateProject(input);
  if (input.studentUsernames.length === 0) {
    errors['student-accounts'] = 'Selecciona al menos una cuenta de estudiante para compartir el proyecto.';
  }
  if (existing && input.modality && input.modality === existing.modality) delete errors.modality;
  if (Object.keys(errors).length > 0) {
    for (const [field, message] of Object.entries(errors)) {
      byId(`project-${field}`).setAttribute('aria-invalid', 'true');
      byId(`project-${field}-error`).textContent = message;
    }
    byId('error-area').textContent = 'Revise los campos señalados.';
    byId(`project-${Object.keys(errors)[0]}`).focus();
    return;
  }

  const now = new Date().toISOString();
  const project = {
    ...existing,
    ...input,
    id: existing?.id ?? crypto.randomUUID(),
    sessions: existing?.sessions ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const previousProjects = state.projects;
  state.projects = upsertProject(state.projects, project);
  state.notice = existing ? 'Proyecto actualizado correctamente.' : 'Proyecto creado correctamente.';
  if (!await persistProjects(previousProjects)) return;
  state.selectedProjectId = project.id;
  state.filters = { modality: '', faculty: '' };
  editingProjectId = null;
  showView('overview');
}

function handleProjectEdit(projectId) {
  if (!state.projects.some((item) => item.id === projectId)) return;
  state.selectedProjectId = projectId;
  openProjectForm(projectId);
}

async function handleProjectDelete(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || !window.confirm(`¿Eliminar el proyecto «${project.title}» y todas sus tutorías?`)) return;
  const previousProjects = state.projects;
  state.projects = removeProject(state.projects, projectId);
  state.notice = 'Proyecto eliminado correctamente.';
  if (!await persistProjects(previousProjects)) return;
  state.selectedProjectId = null;
  showView('overview');
}

function applyFilters() {
  state.filters = {
    modality: byId('filter-modality').value,
    faculty: byId('filter-faculty').value,
  };
  renderApp();
}

populateCatalogs();
byId('new-project-button').addEventListener('click', () => openProjectForm());
byId('nav-project-form').addEventListener('click', () => openProjectForm());
byId('nav-overview').addEventListener('click', () => showView('overview'));
byId('project-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-project-id]');
  if (button) selectProject(button.dataset.projectId);
});
byId('project-filters').addEventListener('change', applyFilters);
byId('project-filters').addEventListener('submit', (event) => event.preventDefault());
projectForm.addEventListener('submit', (event) => { void handleProjectSubmit(event); });
byId('cancel-project-button').addEventListener('click', () => {
  editingProjectId = null;
  clearProjectErrors();
  showView(formReturnView);
});
byId('print-report-button').addEventListener('click', () => {
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  generateProjectReport(project);
});
byId('edit-project-button').addEventListener('click', () => handleProjectEdit(state.selectedProjectId));
byId('delete-project-button').addEventListener('click', () => handleProjectDelete(state.selectedProjectId));
byId('new-session-button').addEventListener('click', () => openSessionForm());
byId('session-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-session-action]');
  if (!button) return;
  if (button.dataset.sessionAction === 'edit') openSessionForm(button.dataset.sessionId);
  if (button.dataset.sessionAction === 'delete') handleSessionDelete(state.selectedProjectId, button.dataset.sessionId);
  if (button.dataset.sessionAction === 'sign') openStudentSignatureForm(button.dataset.sessionId);
});
sessionForm.addEventListener('submit', (event) => { void handleSessionSubmit(event, state.selectedProjectId); });
byId('cancel-session-button').addEventListener('click', () => {
  closeSessionForm();
  focusSessionLog();
});

let signingSessionId = null;

function closeStudentSignatureForm() {
  signingSessionId = null;
  const section = byId('student-signature-section');
  const form = byId('student-signature-form');
  if (section) section.hidden = true;
  if (form) form.reset();
  byId('sig-student-error').textContent = '';
  focusSessionLog();
}

function openStudentSignatureForm(sessionId) {
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  if (!project) return;
  const session = project.sessions.find((item) => item.id === sessionId);
  if (!session) return;

  signingSessionId = sessionId;

  const studentSelect = byId('sig-student-id');
  const studentNames = Array.isArray(project.students) ? project.students : [];
  if (studentSelect) {
    studentSelect.innerHTML = studentNames.map((studentId) =>
      `<option value="${escapeHtml(studentId)}">${escapeHtml(personName(catalogs.students, studentId))}</option>`
    ).join('');
    const signatures = normalizeStudentSignatures(project, session);
    const firstStudent = studentNames[0] ?? '';
    const currentStudent = studentNames.find((studentId) => signatures[studentId]) ?? firstStudent;
    studentSelect.value = currentStudent;
  }

  const input = byId('sig-student-name');
  const selectedStudentId = studentSelect?.value ?? studentNames[0] ?? '';
  const signatureValue = selectedStudentId ? normalizeStudentSignatures(project, session)[selectedStudentId] ?? '' : session.studentSignature ?? '';
  if (input) input.value = signatureValue;

  byId('sig-student-error').textContent = '';
  byId('student-signature-section').hidden = false;
  byId('sig-student-name')?.focus();
}

byId('sig-student-id')?.addEventListener('change', () => {
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const session = project?.sessions.find((item) => item.id === signingSessionId);
  if (!project || !session) return;
  const studentId = byId('sig-student-id')?.value ?? '';
  const signatures = normalizeStudentSignatures(project, session);
  byId('sig-student-name').value = signatures[studentId] ?? '';
});

const studentSignatureForm = byId('student-signature-form');
if (studentSignatureForm) {
  studentSignatureForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firma = (byId('sig-student-name')?.value ?? '').trim();
    const errorEl = byId('sig-student-error');

    if (!firma) {
      if (errorEl) errorEl.textContent = 'Debe ingresar su nombre o firma.';
      byId('sig-student-name')?.focus();
      return;
    }
    if (errorEl) errorEl.textContent = '';

    const project = state.projects.find((item) => item.id === state.selectedProjectId);
    if (!project || !signingSessionId) return;

    const selectedStudentId = byId('sig-student-id')?.value || project.students?.[0] || '';
    const currentSignatures = normalizeStudentSignatures(project, project.sessions.find((item) => item.id === signingSessionId));
    const nextSignatures = { ...currentSignatures, [selectedStudentId]: firma };
    const combinedSignature = (Array.isArray(project.students) ? project.students : [])
      .map((studentId) => nextSignatures[studentId] ? `${personName(catalogs.students, studentId)}: ${nextSignatures[studentId]}` : null)
      .filter(Boolean)
      .join(' | ');

    const nextProjects = state.projects.map((proj) => {
      if (proj.id !== state.selectedProjectId) return proj;
      return {
        ...proj,
        updatedAt: new Date().toISOString(),
        sessions: proj.sessions.map((s) =>
          s.id === signingSessionId ? {
            ...s,
            studentSignature: combinedSignature || firma,
            studentSignatures: nextSignatures,
          } : s
        ),
      };
    });

    try {
      if (projectStorageMode !== 'supabase') {
        throw new Error('La firma compartida requiere Supabase. Verifica la conexión e inicia sesión de nuevo.');
      }
      const response = await fetch(`${API_URL}/api/student-signature`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          sessionId: signingSessionId,
          studentId: selectedStudentId,
          signature: firma,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No fue posible guardar la firma.');
    } catch (error) {
      console.error('Error al guardar la firma del estudiante:', error);
      if (errorEl) errorEl.textContent = error.message;
      return;
    }

    state.projects = nextProjects;
    state.notice = '¡Firma registrada correctamente!';
    closeStudentSignatureForm();
    renderApp();
  });
}

byId('cancel-signature-button')?.addEventListener('click', closeStudentSignatureForm);

const ROLE_LABELS = {
  estudiante: {
    eyebrow: 'Portal de acceso · Estudiante',
    title: 'Ingreso y Registro',
    desc: 'Ingrese con su cuenta de estudiante para consultar sus proyectos de grado.',
  },
  docente: {
    eyebrow: 'Portal de acceso · Docente / Director',
    title: 'Ingreso y Registro',
    desc: 'Identifíquese para gestionar los proyectos de grado y bitácoras de tutoría.',
  },
};

function selectRole(role) {
  state.selectedRole = role;
  byId('role-estudiante')?.setAttribute('aria-pressed', String(role === 'estudiante'));
  byId('role-docente')?.setAttribute('aria-pressed', String(role === 'docente'));
  byId('role-selection-step').hidden = true;
  byId('auth-forms-step').hidden = false;
  const labels = ROLE_LABELS[role] ?? ROLE_LABELS.docente;
  const eyebrowEl = byId('auth-role-eyebrow');
  const titleEl = byId('auth-forms-title');
  const descEl = byId('auth-role-desc');
  if (eyebrowEl) eyebrowEl.textContent = labels.eyebrow;
  if (titleEl) titleEl.textContent = labels.title;
  if (descEl) descEl.textContent = labels.desc;

  const regRoleInput = byId('reg-role');
  if (regRoleInput) regRoleInput.value = role;

  switchAuthTab('login');

  byId('log-username')?.focus();
}

function backToRoleSelection() {
  state.selectedRole = null;
  byId('auth-forms-step').hidden = true;
  byId('role-selection-step').hidden = false;
  byId('role-estudiante')?.setAttribute('aria-pressed', 'false');
  byId('role-docente')?.setAttribute('aria-pressed', 'false');
  clearAuthMessage();
  byId('role-estudiante')?.focus();
}

// Listeners de las tarjetas de rol
byId('role-estudiante')?.addEventListener('click', () => selectRole('estudiante'));
byId('role-docente')?.addEventListener('click', () => selectRole('docente'));
byId('btn-back-role')?.addEventListener('click', backToRoleSelection);

const API_URL = window.location.origin;

function setAuthMessage(text, type = 'info') {
  const el = byId('mensaje');
  if (!el) return;
  el.textContent = text;
  el.className = `auth-status-message is-${type}`;
}

function clearAuthMessage() {
  const el = byId('mensaje');
  if (!el) return;
  el.textContent = '';
  el.className = 'auth-status-message';
}

function setProtectedMessage(text, type = 'info') {
  const el = byId('mensaje-protegido') || byId('mensaje');
  if (!el) return;
  el.textContent = text;
  el.className = `auth-status-message is-${type}`;
}

function switchAuthTab(tab) {
  state.authTab = tab;
  const isLogin = tab === 'login';

  const tabLogin = byId('tab-login');
  const tabReg = byId('tab-registro');
  const loginSection = byId('login');
  const regSection = byId('registro');

  if (tabLogin) {
    tabLogin.classList.toggle('is-active', isLogin);
    tabLogin.setAttribute('aria-selected', String(isLogin));
  }
  if (tabReg) {
    tabReg.classList.toggle('is-active', !isLogin);
    tabReg.setAttribute('aria-selected', String(!isLogin));
  }
  if (loginSection) loginSection.hidden = !isLogin;
  if (regSection) regSection.hidden = isLogin;

  clearAuthMessage();

  const toFocus = isLogin
    ? (byId('log-username') || byId('login-username'))
    : byId('reg-username');
  if (toFocus) toFocus.focus();
}

const registerForm = byId('formulario-registro');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthMessage();

    const username = (byId('reg-username')?.value ?? '').trim();
    const password = byId('reg-password')?.value ?? '';
    const role = state.selectedRole ?? 'docente';

    const validation = validateAuthInput({ username, password });
    if (!validation.valid) {
      setAuthMessage(validation.errors.username || validation.errors.password, 'error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/registrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, role }),
      });

      const data = await res.json();
      if (res.ok) {
        setAuthMessage(data.message || 'Usuario registrado correctamente', 'success');
        registerForm.reset();
        const regRoleInput = byId('reg-role');
        if (regRoleInput) regRoleInput.value = role;
        const loginUserInput = byId('log-username') || byId('login-username');
        if (loginUserInput) loginUserInput.value = username;

        setTimeout(() => {
          switchAuthTab('login');
          const loginPassInput = byId('log-password') || byId('login-password');
          if (loginPassInput) loginPassInput.focus();
        }, 1200);
      } else {
        setAuthMessage(data.error || 'El registro de usuario falló', 'error');
      }
    } catch (error) {
      console.error('Error durante el registro:', error);
      setAuthMessage('Error de red o servidor no disponible', 'error');
    }
  });
}

const loginForm = byId('formulario-login');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthMessage();

    const usernameInput = byId('log-username') || byId('login-username');
    const passwordInput = byId('log-password') || byId('login-password');
    const username = (usernameInput?.value ?? '').trim();
    const password = passwordInput?.value ?? '';

    const validation = validateAuthInput({ username, password });
    if (!validation.valid) {
      setAuthMessage(validation.errors.username || validation.errors.password, 'error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user || { username }));
        state.user = data.user || { username };
        setAuthMessage(data.message || '¡Inicio de sesión exitoso!', 'success');
        state.notice = `¡Bienvenido/a, ${state.user.username}!`;

        loginForm.reset();
        try {
          await activateProjectStorage(data.token);
        } catch (error) {
          console.error('No fue posible activar el almacenamiento de proyectos:', error);
          projectStorageMode = 'unavailable';
          state.projects = [];
          state.notice = error.message;
          setAuthMessage(error.message, 'error');
        }
        setTimeout(() => {
          showView('overview');
        }, 400);
      } else {
        setAuthMessage(data.error || 'Credenciales inválidas.', 'error');
      }
    } catch (error) {
      console.error('Error durante el login:', error);
      setAuthMessage('Error de red o servidor no disponible', 'error');
    }
  });
}

const botonAccesoProtegido = byId('acceso-protegido');
if (botonAccesoProtegido) {
  botonAccesoProtegido.addEventListener('click', async () => {
    const token = localStorage.getItem('token');

    if (!token) {
      setProtectedMessage('Tu debes iniciar sesión para acceder a este recurso', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/recurso-protegido`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (res.ok) {
        setProtectedMessage(`${data.message} ${data.data}`, 'success');
      } else {
        setProtectedMessage(data.error || 'Acceso fallido al recurso protegido', 'error');
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          state.user = null;
          renderApp();
        }
      }
    } catch (error) {
      console.error('Error al acceder al recurso protegido:', error);
      setProtectedMessage('Error de red o servidor no disponible', 'error');
    }
  });
}

const logoutBtn = byId('logout-button');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    state.user = null;
    state.selectedRole = null;
    state.notice = 'Has cerrado sesión exitosamente.';
    // Volver a la selección de rol
    backToRoleSelection();
    showView('auth');
    setAuthMessage('Sesión cerrada con éxito.', 'info');
  });
}

byId('tab-login')?.addEventListener('click', () => switchAuthTab('login'));
byId('tab-registro')?.addEventListener('click', () => switchAuthTab('registro'));
byId('switch-to-register')?.addEventListener('click', () => switchAuthTab('registro'));
byId('switch-to-login')?.addEventListener('click', () => switchAuthTab('login'));
byId('nav-auth')?.addEventListener('click', () => {
  // Si no hay rol seleccionado, mostrar la selección de rol primero
  if (!state.selectedRole) {
    backToRoleSelection();
  }
  showView('auth');
});

// 6. Verificación de sesión al iniciar la aplicación
async function initSession() {
  const token = localStorage.getItem('token');
  const storedUserRaw = localStorage.getItem('user');
  let storedUser = null;
  try {
    storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
  } catch {}

  if (!token) {
    state.view = 'auth';
    renderApp();
    return;
  }

  try {
    const res = await fetch(`${API_URL}/usuario-actual`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      state.user = data.user || storedUser || { username: 'Docente' };
      try {
        await activateProjectStorage(token);
      } catch (error) {
        console.error('No fue posible cargar los proyectos del usuario:', error);
        projectStorageMode = 'unavailable';
        state.projects = [];
        state.notice = error.message;
      }
      state.view = 'overview';
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      state.user = null;
      state.view = 'auth';
      setAuthMessage('Su sesión anterior expiró. Por favor ingrese de nuevo.', 'info');
    }
  } catch (error) {
    if (storedUser) {
      state.user = storedUser;
      projectStorageMode = 'unavailable';
      state.projects = [];
      state.notice = 'No fue posible validar la sesión con el servidor. Recarga la página para reintentar.';
      state.view = 'overview';
    } else {
      state.view = 'auth';
    }
  }

  renderApp();
}

initSession();
