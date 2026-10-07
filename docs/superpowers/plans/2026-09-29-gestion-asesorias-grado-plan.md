# Gestión de asesorías de proyectos de grado — Implementation Plan

> **Para agentes de implementación:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un prototipo local para registrar proyectos de grado y administrar la bitácora de sus sesiones de asesoría.

**Architecture:** Aplicación SPA pequeña en HTML5, CSS3 y JavaScript modular, servida por un servidor Node.js sin dependencias externas. `catalogs.js` contiene catálogos y datos iniciales; `app-core.js` concentra validación y transformaciones puras; `app.js` conecta el estado con el DOM y `localStorage`.

**Tech Stack:** Node.js integrado (`http`, `fs`, `path`), HTML5 semántico, CSS3 con variables, JavaScript ES modules, `localStorage`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-29-gestion-asesorias-grado-design.md`

## Global Constraints

- La persistencia será mediante `localStorage`; no habrá base de datos ni API de negocio.
- La interfaz se construirá con HTML5, CSS3 y JavaScript sin framework de frontend.
- Las opciones de estudiantes, directores, co-directores y facultades serán catálogos locales editables en el código del prototipo.
- La clave de almacenamiento será `usb-cartagena-asesorias-v1`.
- Las modalidades serán exactamente `Trabajo de grado`, `Diplomado de profundización` y `Semillero`.
- La duración de una tutoría aceptará números positivos hasta un máximo de 24 horas.
- El formulario de proyecto exige modalidad, título, al menos un estudiante, director y facultad.
- El formulario de tutoría exige fecha, duración, actividades y compromisos.
- Co-director, observaciones y nombres de firma pueden quedar vacíos.
- El diseño debe conservar legibilidad en móvil y convertir las filas de tutoría en tarjetas apiladas.
- No se incluirán autenticación, firma digital, carga de documentos, notificaciones, reportes PDF, sincronización entre dispositivos ni despliegue público.

## Review Focus

- **Estado inexistente, corrupto o `localStorage` no disponible:** la aplicación debe recuperar datos de ejemplo o trabajar en memoria y mostrar un aviso comprensible; las pruebas vivirán en `tests/app-core.test.js`.
- **Proyecto sin estudiantes o con campos obligatorios vacíos:** la validación debe devolver errores por campo sin crear registros; las pruebas vivirán en `tests/app-core.test.js`.
- **Duración inválida o superior a 24 horas:** la tutoría no debe guardarse; las pruebas vivirán en `tests/app-core.test.js`.
- **Texto ingresado por el docente con HTML o caracteres especiales:** la tabla y las tarjetas deben mostrar texto escapado, nunca interpretarlo como markup; la prueba vivirá en `tests/app-core.test.js`.
- **Eliminación accidental y ancho móvil reducido:** la interfaz debe pedir confirmación y no generar desbordamiento horizontal; la verificación será manual en el flujo de UI y en un viewport móvil.

### Task 1: Bootstrap del servidor y shell semántico

**Files:**
- Create: `package.json`
- Create: `server.js`
- Create: `public/index.html`
- Create: `tests/server.test.js`

**Interfaces:**
- Produces `createStaticServer({ publicDir }) -> http.Server` desde `server.js` para que las pruebas puedan levantar el servidor en un puerto efímero.
- Produces `npm start` para servir `public/` en `http://localhost:3000`.
- Produces un HTML con landmarks `header`, `nav`, `main` y secciones vacías con IDs `overview-view`, `project-form-view` y `project-detail-view` que `app.js` conectará después.

- [ ] **Step 1: Escribir las pruebas de servidor que fallen**

  En `tests/server.test.js`, importa `createStaticServer`, levanta el servidor en `port: 0` y comprueba que `GET /` devuelve `200` con `text/html`, que el cuerpo contiene `overview-view`, y que una ruta desconocida devuelve `index.html` para permitir la navegación de la SPA.

- [ ] **Step 2: Ejecutar las pruebas para confirmar el fallo**

  Ejecutar: `node --test tests/server.test.js`

  Esperado: fallo porque todavía no existen `server.js` ni el servidor estático.

- [ ] **Step 3: Implementar el servidor y el shell mínimo**

  Crear `package.json` con `"type": "module"`, scripts `"start": "node server.js"` y `"test": "node --test tests"`. Implementar `createStaticServer({ publicDir })` usando `http.createServer`, resolver MIME types para HTML, CSS, JavaScript, SVG e imágenes, impedir salir de `publicDir` con rutas `..` y usar `index.html` como fallback. En `public/index.html`, crear el armazón semántico y cargar `styles.css`, `catalogs.js` y `app.js` como módulos.

- [ ] **Step 4: Ejecutar las pruebas para confirmar que pasan**

  Ejecutar: `node --test tests/server.test.js`

  Esperado: todas las pruebas pasan.

- [ ] **Step 5: Hacer un commit**

  Ejecutar: `git add package.json server.js public/index.html tests/server.test.js && git commit -m "feat: bootstrap local prototype server"`

### Task 2: Catálogos, estado y reglas de validación

**Files:**
- Create: `public/catalogs.js`
- Create: `public/app-core.js`
- Create: `tests/app-core.test.js`

**Interfaces:**
- `public/catalogs.js` exporta `catalogs` con `modalities`, `faculties`, `students` y `directors`, además de `sampleState`.
- `public/app-core.js` exporta `STORAGE_KEY`, `loadState(storage, fallbackState) -> { state, storageAvailable }`, `persistState(storage, state) -> boolean`, `validateProject(input)`, `validateSession(input)`, `calculateMetrics(projects)`, `filterProjects(projects, filters)`, `escapeHtml(value)` y las operaciones inmutables `upsertProject(projects, project)`, `removeProject(projects, projectId)`, `upsertSession(projects, projectId, session)`, `removeSession(projects, projectId, sessionId)`.
- Cada validación devuelve `{ valid: boolean, errors: Record<string, string> }`.

- [ ] **Step 1: Escribir pruebas unitarias que fallen**

  En `tests/app-core.test.js`, cubre: proyecto válido; título vacío; lista de estudiantes vacía; sesión válida; duración `0` y `24.5` inválidas; métricas de proyectos y horas; filtro por modalidad/facultad; fallback ante JSON corrupto; memoria cuando el almacenamiento lanza; persistencia exitosa; y escape de `<script>` y comillas.

- [ ] **Step 2: Ejecutar las pruebas para confirmar el fallo**

  Ejecutar: `node --test tests/app-core.test.js`

  Esperado: fallos porque los módulos todavía no existen.

- [ ] **Step 3: Implementar catálogos y funciones puras**

  Definir catálogos realistas de demostración con varias facultades y personas, y un `sampleState` con al menos dos proyectos y sesiones. Mantener `loadState` tolerante a errores: validar la forma básica, devolver una copia del fallback cuando el JSON no sea utilizable y marcar en el estado de la aplicación si se debe mostrar aviso de sesión temporal. Mantener todas las operaciones sin mutar el arreglo recibido.

- [ ] **Step 4: Ejecutar las pruebas para confirmar que pasan**

  Ejecutar: `node --test tests/app-core.test.js`

  Esperado: todas las pruebas pasan.

- [ ] **Step 5: Hacer un commit**

  Ejecutar: `git add public/catalogs.js public/app-core.js tests/app-core.test.js && git commit -m "feat: add local academic project state"`

### Task 3: Sistema visual y estructura de las vistas

**Files:**
- Modify: `public/index.html`
- Create: `public/styles.css`

**Interfaces:**
- `index.html` ofrece la estructura que `app.js` renderizará: navegación, encabezado de vista, tarjetas de métricas, filtros, lista de proyectos, formulario de proyecto, detalle del proyecto, formulario de tutoría y contenedores de avisos.
- `styles.css` define los tokens `--ink`, `--navy`, `--lagoon`, `--paper`, `--sand` y `--coral`, además de estados de foco, error, vacío y responsive.

- [ ] **Step 1: Crear la estructura HTML completa con contenido de estado**

  Añadir labels asociados, `aria-live` para avisos, botones nativos, `select` múltiple para estudiantes, `input type="date"`, `input type="number"` y tablas con encabezados claros. Dejar un estado vacío visible hasta que `app.js` lo sustituya.

- [ ] **Step 2: Aplicar el sistema visual en CSS**

  Usar una escala de espaciado basada en 4 px, superficies marfil/arena, azul profundo para acciones y turquesa para seguimiento. Mantener una estrategia de profundidad con bordes suaves y sombras discretas. Diseñar el panel en dos columnas para escritorio y una columna para móvil; convertir `.session-table` en tarjetas mediante `data-label` y reglas responsive.

- [ ] **Step 3: Verificar que el shell y los assets entregan correctamente**

  Ejecutar: `npm start` y comprobar `GET /`, `GET /styles.css` y `GET /catalogs.js` desde el navegador o con una herramienta HTTP. La revisión visual interactiva se hará después de conectar `app.js` en las tareas 4 y 5.

  Esperado: el documento y los assets existentes responden correctamente; no se considera terminado el flujo visual hasta la verificación de escritorio y móvil de las tareas 4 y 5.

- [ ] **Step 4: Hacer un commit**

  Ejecutar: `git add public/index.html public/styles.css && git commit -m "feat: add academic workspace visual shell"`

### Task 4: Panel general y CRUD de proyectos

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`

**Interfaces:**
- `app.js` mantiene un estado `{ projects, view, selectedProjectId, filters, notice }`.
- `renderApp()` pinta la vista activa y los contadores derivados.
- `showView(viewName)`, `selectProject(projectId)`, `handleProjectSubmit(event)`, `handleProjectEdit(projectId)`, `handleProjectDelete(projectId)` y `applyFilters()` son las funciones de interacción principales.
- El estado se persiste con `persistState` después de cada mutación.

- [ ] **Step 1: Conectar la carga inicial y el renderizado del panel**

  Importar `catalogs`, `sampleState` y las funciones de `app-core.js`; inicializar desde `loadState`; renderizar métricas, tarjetas de proyectos, filtros y estado vacío. Mostrar el aviso de sesión temporal cuando el adaptador de almacenamiento no esté disponible.

- [ ] **Step 2: Conectar navegación y filtros**

  Implementar navegación entre panel, formulario y detalle; filtrar por modalidad y facultad; conservar `selectedProjectId` al volver desde el formulario; usar texto escapado en títulos, personas y etiquetas.

- [ ] **Step 3: Implementar creación y edición de proyectos**

  Mapear el formulario a `{ modality, title, students, director, coDirector, faculty }`, mostrar errores por campo, generar IDs y timestamps, y volver al panel con una notificación de éxito después de guardar.

- [ ] **Step 4: Implementar eliminación protegida**

  Pedir confirmación nativa antes de eliminar; retirar el proyecto y sus sesiones; seleccionar el panel como vista siguiente y persistir el resultado.

- [ ] **Step 5: Ejecutar el flujo manual del panel**

  Verificar: carga de ejemplos, filtro por modalidad/facultad, creación, edición, cancelación, eliminación y persistencia después de recargar.

- [ ] **Step 6: Hacer un commit**

  Ejecutar: `git add public/app.js public/index.html public/styles.css && git commit -m "feat: add project dashboard and CRUD"`

### Task 5: Detalle del proyecto y bitácora de tutorías

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`

**Interfaces:**
- `renderProjectDetail(projectId)` muestra ficha académica, participantes, métricas del proyecto y la lista de sesiones.
- `handleSessionSubmit(event, projectId)` crea o actualiza una sesión con los campos del modelo.
- `handleSessionDelete(projectId, sessionId)` elimina una sesión después de confirmación.
- La bitácora usa las clases `.session-table`, `.session-card` o equivalentes definidas en `styles.css` para escritorio y móvil.

- [ ] **Step 1: Renderizar la ficha y la bitácora existente**

  Mostrar modalidad, título, facultad, estudiantes, director, co-director, horas acumuladas y número de tutorías. Ordenar sesiones por fecha descendente y renderizar cada campo de forma escapada.

- [ ] **Step 2: Implementar alta de tutorías**

  Abrir el formulario contextual desde el detalle, validar fecha, duración, actividades y compromisos, registrar nombres de firma como texto, actualizar `updatedAt`, persistir y devolver el foco al encabezado de la bitácora.

- [ ] **Step 3: Implementar eliminación de tutorías**

  Añadir una acción accesible por fila/tarjeta, pedir confirmación, actualizar métricas y mostrar aviso de éxito sin perder el proyecto seleccionado.

- [ ] **Step 4: Verificar el flujo completo de bitácora**

  Verificar: abrir proyecto, registrar sesión, consultar valores en tabla, comprobar tarjetas en móvil, eliminar sesión y conservar todo después de recargar.

- [ ] **Step 5: Hacer un commit**

  Ejecutar: `git add public/app.js public/index.html public/styles.css && git commit -m "feat: add tutoring session log"`

### Task 6: Verificación final y documentación de uso

**Files:**
- Create: `README.md`
- Modify: `public/app.js` (only for fixes found during verification)
- Modify: `public/styles.css` (only for fixes found during verification)
- Modify: `public/index.html` (only for fixes found during verification)

- [ ] **Step 1: Ejecutar la suite automatizada completa**

  Ejecutar: `npm test`

  Esperado: todas las pruebas de servidor y lógica pasan sin errores.

- [ ] **Step 2: Ejecutar validaciones sintácticas**

  Ejecutar: `node --check server.js`, `node --check public/catalogs.js`, `node --check public/app-core.js` y `node --check public/app.js`.

  Esperado: los cuatro comandos terminan correctamente.

- [ ] **Step 3: Hacer la revisión visual y funcional final**

  Con `npm start`, verificar el flujo de demostración en escritorio y móvil: cargar ejemplos, crear proyecto, registrar tutoría, editar, eliminar y recargar. Revisar foco visible, mensajes de error, confirmaciones, tablas/tarjetas y ausencia de errores en consola.

- [ ] **Step 4: Documentar cómo ejecutar y reiniciar la demo**

  En `README.md`, explicar que no se requieren dependencias externas, `npm start`, la URL local, los campos disponibles, el guardado en el navegador y cómo borrar los datos desde las herramientas del navegador.

- [ ] **Step 5: Hacer un commit final**

  Ejecutar: `git add README.md public/app.js public/styles.css public/index.html && git commit -m "docs: verify and document local prototype"`
