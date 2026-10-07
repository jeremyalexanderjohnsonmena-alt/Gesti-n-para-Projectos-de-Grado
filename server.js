import 'dotenv/config';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import authenticateToken from './middleware/autenticacion_middleware.js';
import { registerUser, authenticateUser, listUsersByRole } from './user-store.js';
import {
  loadStudentProjects,
  loadUserProjects,
  saveAssignedStudentSignature,
  saveUserProjects,
} from './project-store.js';

export function createApp({ publicDir = resolve('public') } = {}) {
  const root = resolve(publicDir);
  const app = express();

  // Middlewares generales
  app.use(cors());
  app.use(express.json());

  // Middleware de seguridad contra Path Traversal
  app.use((req, res, next) => {
    let pathname;
    try {
      pathname = decodeURIComponent((req.url ?? '/').split(/[?#]/, 1)[0]);
    } catch {
      return res.status(400).send('Bad request');
    }

    if (
      !pathname.startsWith('/') ||
      pathname.includes('\0') ||
      pathname.replaceAll('\\', '/').split('/').includes('..')
    ) {
      return res.status(403).send('Forbidden');
    }

    const requestedPath = resolve(root, `.${pathname}`);
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) {
      return res.status(403).send('Forbidden');
    }

    next();
  });

  // ==========================================
  // RUTAS DE AUTENTICACIÓN
  // ==========================================

  // Endpoint para el registro de usuarios
  app.post('/registrar', async (req, res) => {
    try {
      const { username, password, role } = req.body || {};

      if (!username || !password) {
        return res.status(400).json({ error: 'El nombre de usuario y contraseña son requeridos' });
      }

      const result = await registerUser({ username, password, role });
      return res.status(201).json({
        message: 'Usuario registrado correctamente',
        user: { username: result.username, role: result.role },
      });
    } catch (error) {
      if (
        error.status === 400 ||
        error.message.includes('ya está registrado') ||
        error.message.includes('requeridos') ||
        error.message.includes('caracteres')
      ) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error durante el registro:', error);
      return res.status(500).json({ error: error.message || 'El registro de usuario falló' });
    }
  });

  // Endpoint para el login de usuarios
  app.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};

      if (!username || !password) {
        return res.status(400).json({ error: 'El nombre de usuario y contraseña son requeridos' });
      }

      const user = await authenticateUser({ username, password });
      if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas.' });
      }

      const secret = process.env.JWT_SECRET || 'super_secreto_asesorias_grado_token_key_2026';
      const token = jwt.sign({ username: user.username, role: user.role }, secret, { expiresIn: '2h' });

      return res.status(200).json({
        message: 'Inicio de sesión exitoso!',
        token,
        user: { username: user.username, role: user.role },
      });
    } catch (error) {
      console.error('Server error durante login:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // Endpoint para validar el token y obtener la información del usuario actual
  app.get('/usuario-actual', authenticateToken, (req, res) => {
    res.status(200).json({
      message: 'Token válido',
      user: req.user,
    });
  });

  // Endpoint o Ruta de ejemplo para un recurso protegido (según el script del usuario)
  app.get('/recurso-protegido', authenticateToken, (req, res) => {
    res.status(200).json({
      message: `Bienvenido al recurso protegido, ${req.user.username}!`,
      data: 'Esta información es sólo para usuarios autenticados',
    });
  });

  app.get('/api/projects', authenticateToken, async (req, res) => {
    if (!['docente', 'estudiante'].includes(req.user.role)) {
      return res.status(403).json({ error: 'El rol no tiene acceso a los proyectos.' });
    }

    try {
      if (req.user.role === 'estudiante') {
        const projects = await loadStudentProjects(req.user.username);
        if (projects === null) return res.status(200).json({ storage: 'local' });
        return res.status(200).json({ storage: 'supabase', initialized: true, projects });
      }
      const result = await loadUserProjects(req.user.username);
      if (!result) return res.status(200).json({ storage: 'local' });
      return res.status(200).json({ storage: 'supabase', ...result });
    } catch (error) {
      console.error('Error al cargar proyectos de Supabase:', error);
      return res.status(503).json({ error: 'No fue posible cargar los proyectos desde Supabase.' });
    }
  });

  app.put('/api/projects', authenticateToken, async (req, res) => {
    if (req.user.role !== 'docente') {
      return res.status(403).json({ error: 'Solo los docentes pueden administrar proyectos.' });
    }

    const { projects } = req.body || {};
    if (!Array.isArray(projects) || projects.some((project) =>
      !project || typeof project !== 'object' || Array.isArray(project)
      || typeof project.id !== 'string' || !Array.isArray(project.sessions)
      || ('studentUsernames' in project && (!Array.isArray(project.studentUsernames)
        || !project.studentUsernames.every((username) => typeof username === 'string'))))) {
      return res.status(400).json({ error: 'El formato de proyectos enviado no es válido.' });
    }

    try {
      const studentUsernames = new Set((await listUsersByRole('estudiante'))
        .map((student) => student.username.toLowerCase()));
      const unknownStudent = projects.some((project) =>
        (project.studentUsernames ?? []).some((username) => !studentUsernames.has(username.toLowerCase())));
      if (unknownStudent) {
        return res.status(400).json({ error: 'Todos los estudiantes asignados deben tener una cuenta registrada con rol estudiante.' });
      }

      const saved = await saveUserProjects(req.user.username, projects);
      if (!saved) {
        return res.status(503).json({ error: 'Supabase no está configurado para guardar proyectos.' });
      }
      return res.status(200).json({ message: 'Proyectos guardados correctamente.' });
    } catch (error) {
      console.error('Error al guardar proyectos en Supabase:', error);
      return res.status(503).json({ error: 'No fue posible guardar los proyectos en Supabase.' });
    }
  });

  app.put('/api/student-signature', authenticateToken, async (req, res) => {
    if (req.user.role !== 'estudiante') {
      return res.status(403).json({ error: 'Solo los estudiantes pueden registrar su firma de asistencia.' });
    }

    const { projectId, sessionId, studentId, signature } = req.body || {};
    if ([projectId, sessionId, studentId, signature].some((value) =>
      typeof value !== 'string' || !value.trim())
      || signature.trim().length > 200) {
      return res.status(400).json({ error: 'Los datos de la firma no son válidos.' });
    }

    try {
      const saved = await saveAssignedStudentSignature({
        username: req.user.username,
        projectId,
        sessionId,
        studentId,
        signature: signature.trim(),
      });
      if (saved === false) {
        return res.status(503).json({ error: 'Supabase es necesario para guardar la firma compartida.' });
      }
      if (saved === null) {
        return res.status(404).json({ error: 'La cuenta no está asignada a ese proyecto, estudiante o tutoría.' });
      }
      return res.status(200).json({ message: 'Firma guardada correctamente.' });
    } catch (error) {
      console.error('Error al guardar firma de asistencia:', error);
      return res.status(503).json({ error: 'No fue posible guardar la firma en Supabase.' });
    }
  });

  app.get('/api/student-accounts', authenticateToken, async (req, res) => {
    if (req.user.role !== 'docente') {
      return res.status(403).json({ error: 'Solo los docentes pueden consultar cuentas de estudiantes.' });
    }

    try {
      const students = await listUsersByRole('estudiante');
      return res.status(200).json({ students });
    } catch (error) {
      console.error('Error al cargar cuentas de estudiantes:', error);
      return res.status(503).json({ error: 'No fue posible cargar las cuentas de estudiantes.' });
    }
  });

  // ==========================================
  // SERVIR ARCHIVOS ESTÁTICOS Y SPA FALLBACK
  // ==========================================
  app.use(express.static(root));

  // SPA fallback para rutas no-API que soliciten páginas
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    res.sendFile(resolve(root, 'index.html'));
  });

  return app;
}

/**
 * Función compatible con la suite de pruebas existente
 */
export function createStaticServer({ publicDir }) {
  const app = createApp({ publicDir });
  return createServer(app);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
  const port = Number(process.env.PORT) || 3000;
  const app = createApp({ publicDir });

  app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
  });
}
