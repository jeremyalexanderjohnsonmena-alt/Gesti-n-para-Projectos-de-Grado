import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const USERS_FILE_PATH = resolve('./data/usuarios.json');

// Memoria volátil de respaldo por si el entorno no permite escribir en disco
let inMemoryUsers = [
  {
    id: 'user-demo-1',
    username: 'docente',
    // Hash bcrypt para la contraseña "docente123"
    password: '$2a$10$vI0g7d3K7pM6uN0hSg4UfO2f7Wn8U7J.Qz3F8dE9s0P9yB5cK1dGe',
    createdAt: new Date().toISOString(),
  },
];

export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl && !serviceRoleKey) return null;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para usar Supabase.');
  }
  if (!supabaseUrl.startsWith('https://') || supabaseUrl.includes('tu-proyecto')) {
    throw new Error('SUPABASE_URL no es válida.');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function getLocalUsers() {
  try {
    if (!existsSync(USERS_FILE_PATH)) {
      return [...inMemoryUsers];
    }
    const raw = await readFile(USERS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [...inMemoryUsers];
  } catch {
    return [...inMemoryUsers];
  }
}

export async function listUsersByRole(role) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const users = await getLocalUsers();
    return users
      .filter((user) => user.role === role)
      .map((user) => ({ username: user.username }));
  }

  const { data, error } = await supabase
    .from('usuarios')
    .select('username')
    .eq('role', role)
    .order('username');

  if (error) throw error;
  return data;
}

export async function saveLocalUsers(users) {
  inMemoryUsers = users;
  try {
    await mkdir(resolve('./data'), { recursive: true });
    await writeFile(USERS_FILE_PATH, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.warn('No se pudo escribir usuarios en disco, usando memoria:', error.message);
    return false;
  }
}

/**
 * Registra un nuevo usuario hasheando la contraseña con bcrypt.
 * Si Supabase está disponible, intenta registrar allí; de lo contrario, usa el almacén local.
 */
export async function registerUser({ username, password, role = 'docente' }) {
  if (!username || !password) {
    throw new Error('El nombre de usuario y contraseña son requeridos');
  }

  const cleanUsername = String(username).trim();
  const cleanRole = ['estudiante', 'docente'].includes(String(role).trim())
    ? String(role).trim()
    : 'docente';

  if (cleanUsername.length < 3) {
    throw new Error('El nombre de usuario debe tener al menos 3 caracteres');
  }
  if (String(password).length < 4) {
    throw new Error('La contraseña debe tener al menos 4 caracteres');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const supabase = getSupabaseClient();
  if (supabase) {
    // Registro en Supabase
    const { data, error } = await supabase
      .from('usuarios')
      .insert([{ username: cleanUsername, password: hashedPassword, role: cleanRole }]);

    if (error) {
      console.error('Error durante el registro en Supabase:', error);
      throw new Error(error.message || 'El registro de usuario falló');
    }

    return { username: cleanUsername, role: cleanRole };
  }

  // Registro en almacenamiento local
  const users = await getLocalUsers();
  const existing = users.find(
    (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
  );

  if (existing) {
    const error = new Error('El nombre de usuario ya está registrado');
    error.status = 400;
    throw error;
  }

  const newUser = {
    id: crypto.randomUUID(),
    username: cleanUsername,
    password: hashedPassword,
    role: cleanRole,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  await saveLocalUsers(users);

  return { username: cleanUsername, role: cleanRole };
}

/**
 * Autentica un usuario verificando la contraseña con bcrypt.
 */
export async function authenticateUser({ username, password }) {
  if (!username || !password) {
    return null;
  }

  const cleanUsername = String(username).trim();
  const supabase = getSupabaseClient();

  let userRecord = null;

  if (supabase) {
    try {
      const { data: user, error } = await supabase
        .from('usuarios')
        .select('username, password, role')
        .eq('username', cleanUsername)
        .single();

      if (error) throw error;
      userRecord = user;
    } catch (error) {
      console.error('Error al consultar Supabase:', error);
      throw new Error('No fue posible validar las credenciales en Supabase.');
    }
  }

  if (!userRecord) {
    const localUsers = await getLocalUsers();
    userRecord = localUsers.find(
      (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
    );
  }

  if (!userRecord) {
    return null;
  }

  const isMatch = await bcrypt.compare(password, userRecord.password);
  if (!isMatch) {
    return null;
  }

  return { username: userRecord.username, role: userRecord.role ?? 'docente' };
}
