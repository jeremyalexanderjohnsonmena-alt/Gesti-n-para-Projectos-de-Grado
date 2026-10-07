import { getSupabaseClient } from './user-store.js';

export function filterProjectsForStudent(records, username) {
  const projects = records.flatMap((record) => Array.isArray(record.projects) ? record.projects : []);
  return projects.filter((project) => Array.isArray(project.studentUsernames)
    && project.studentUsernames.some((studentUsername) =>
      String(studentUsername).toLowerCase() === username.toLowerCase()));
}

export function updateAssignedStudentSignature(records, {
  username,
  projectId,
  sessionId,
  studentId,
  signature,
}) {
  for (const record of records) {
    if (!Array.isArray(record.projects)) continue;
    const projectIndex = record.projects.findIndex((project) =>
      project.id === projectId
      && Array.isArray(project.studentUsernames)
      && project.studentUsernames.some((assignedUsername) =>
        String(assignedUsername).toLowerCase() === username.toLowerCase())
      && Array.isArray(project.students)
      && Array.isArray(project.sessions)
      && project.students.includes(studentId));
    if (projectIndex < 0) continue;

    const projects = record.projects.map((project, index) => {
      if (index !== projectIndex) return project;
      const sessionIndex = project.sessions.findIndex((session) => session.id === sessionId);
      if (sessionIndex < 0) return project;
      return {
        ...project,
        updatedAt: new Date().toISOString(),
        sessions: project.sessions.map((session, index) => index === sessionIndex
          ? {
            ...session,
            studentSignature: signature,
            studentSignatures: {
              ...(session.studentSignatures && typeof session.studentSignatures === 'object'
                ? session.studentSignatures : {}),
              [studentId]: signature,
            },
          }
          : session),
      };
    });

    if (projects[projectIndex] === record.projects[projectIndex]) return null;
    return { ownerUsername: record.username, projects };
  }
  return null;
}

export async function loadUserProjects(username) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('usuario_proyectos')
    .select('projects')
    .eq('username', username)
    .maybeSingle();

  if (error) throw error;
  return { initialized: Boolean(data), projects: data?.projects ?? [] };
}

export async function loadStudentProjects(username) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('usuario_proyectos')
    .select('projects');

  if (error) throw error;
  return filterProjectsForStudent(data, username);
}

export async function saveAssignedStudentSignature({
  username,
  projectId,
  sessionId,
  studentId,
  signature,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('usuario_proyectos')
    .select('username, projects');

  if (error) throw error;
  const update = updateAssignedStudentSignature(data, {
    username,
    projectId,
    sessionId,
    studentId,
    signature,
  });
  if (!update) return null;

  const { error: saveError } = await supabase
    .from('usuario_proyectos')
    .upsert({
      username: update.ownerUsername,
      projects: update.projects,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'username' });

  if (saveError) throw saveError;
  return true;
}

export async function saveUserProjects(username, projects) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('usuario_proyectos')
    .upsert({ username, projects, updated_at: new Date().toISOString() }, { onConflict: 'username' });

  if (error) throw error;
  return true;
}
