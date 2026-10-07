# Gestión de asesorías de proyectos de grado

Aplicación web para organizar proyectos de grado, registrar bitácoras de tutorías académicas y autenticar docentes y usuarios mediante tokens JWT con soporte para Supabase y almacenamiento seguro local.

## Iniciar

Requiere Node.js. Para instalar dependencias e iniciar el servidor:

```sh
npm install
npm start
```

Abra [http://localhost:3000](http://localhost:3000) en el navegador. Para detener el servidor, use `Ctrl+C` en la terminal.

Para ejecutar la suite de pruebas automatizadas:

```sh
npm test
```

## Funciones Principales

- **Módulo de Autenticación (Login y Registro)**:
  - Registro de nuevos usuarios con cifrado seguro de contraseña mediante `bcryptjs` (salt de 10 rondas).
  - Inicio de sesión con generación de tokens `JWT` (`jsonwebtoken`) con expiración de 2 horas.
  - Almacenamiento seguro del token en el cliente (`localStorage`).
  - Navegación protegida: redirección automática a la vista de login para usuarios no autenticados.
  - Indicador de sesión activa en la cabecera y botón de **Cerrar sesión**.
  - Pestañas fluidas e interactivas para alternar entre "Iniciar Sesión" y "Registro de Usuario".
  - Sección de **Recurso Protegido** para probar en vivo la validación del encabezado `Authorization: Bearer <token>` contra el endpoint `GET /recurso-protegido`.
- **Panel General Académico**:
  - Seguimiento de proyectos recientes, filtros por modalidad y facultad, y métricas dinámicas de proyectos, tutorías y horas acumuladas.
- **Gestión de Proyectos**:
  - Crear y editar proyectos con modalidad, título, estudiantes, director, co-director y facultad.
- **Bitácora de Tutorías**:
  - Registrar y editar tutorías con fecha, duración de hasta 24 horas, actividades y compromisos obligatorios; observaciones y firmas opcionales.
  - Ficha de proyecto con resumen de participantes y totales de horas.

## Configuración de Entorno y Base de Datos (Supabase)

El sistema incluye soporte híbrido:

1. **Modo Local / Prototipo (por defecto)**:
   - Si no se configuran credenciales de Supabase en `.env`, las cuentas se guardan localmente en `./data/usuarios.json` (o memoria), y los proyectos se guardan en el navegador mediante `localStorage`.
   - Incluye un usuario inicial de prueba preconfigurado:
     - **Usuario**: `docente`
     - **Contraseña**: `docente123`
   - También puede registrar cualquier nuevo usuario directamente desde el formulario.

2. **Modo Supabase (base de datos en la nube)**:
   - En Supabase, abra **SQL Editor** y ejecute [`supabase/schema.sql`](./supabase/schema.sql). El script crea las tablas necesarias y restringe su acceso directo a las claves públicas.
   - Copie las credenciales del proyecto al archivo `.env` (basado en `.env.example`):
     ```env
     PORT=3000
     JWT_SECRET=tu_clave_secreta_jwt
     SUPABASE_URL=https://tu-proyecto.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
     ```
   - La clave `service_role` se utiliza únicamente en el servidor. No la agregue a `public/`, al frontend ni al control de versiones. Mantenga el archivo `.env` privado.
   - El registro y el inicio de sesión existentes siguen usando la API JWT del proyecto. Los proyectos y sus tutorías se guardan en `usuario_proyectos`; los docentes ven los propios y los estudiantes solo los proyectos que tengan asignada su cuenta.
   - Para compartir un proyecto, registra primero la cuenta con rol **Estudiante**. Al crear o editar el proyecto, selecciona la cuenta en **Cuentas de estudiantes** y guarda. Los proyectos existentes deben editarse y guardarse con las cuentas asignadas para que aparezcan al estudiante.
   - Al iniciar sesión por primera vez, si Supabase aún no tiene datos para esa cuenta, los proyectos válidos guardados en el navegador se migran a esa cuenta. Después, cada cambio se sincroniza con Supabase. Si no se configuran credenciales, se conserva el almacenamiento local.

## Endpoints de la API

| Método | Ruta | Descripción | Requiere Token |
| :--- | :--- | :--- | :--- |
| `POST` | `/registrar` | Registra un usuario (`username`, `password`) con hash bcrypt | No |
| `POST` | `/login` | Inicia sesión y retorna token JWT | No |
| `GET` | `/api/projects` | Obtiene los proyectos del usuario autenticado o informa que se usa modo local | Sí |
| `PUT` | `/api/projects` | Sincroniza los proyectos y sus tutorías del usuario autenticado con Supabase | Sí |
| `PUT` | `/api/student-signature` | Guarda solo la firma del estudiante en un proyecto y tutoría que tiene asignados | Sí |
| `GET` | `/usuario-actual` | Valida el token y obtiene el usuario autenticado | Sí (`Bearer <token>`) |
| `GET` | `/recurso-protegido` | Endpoint seguro protegido por middleware JWT | Sí (`Bearer <token>`) |
