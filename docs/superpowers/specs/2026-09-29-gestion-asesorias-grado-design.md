# Borrador de diseño: Gestión de asesorías de proyectos de grado

**Fecha:** 2026-09-29  
**Estado:** Diseño aprobado en conversación; pendiente de revisión de la especificación antes de planificar la implementación.

## Objetivo

Crear un prototipo local para que docentes de la Universidad de San Buenaventura — Sede Cartagena de Indias puedan registrar proyectos de grado y hacer seguimiento de sus sesiones de asesoría.

La primera versión debe permitir:

1. Consultar un resumen de proyectos y tutorías registradas.
2. Crear, editar y eliminar proyectos.
3. Registrar estudiantes, director, co-director, modalidad y facultad.
4. Abrir un proyecto y consultar su bitácora de tutorías.
5. Crear y eliminar registros de tutoría.
6. Guardar los datos en el navegador para conservarlos durante la demostración.

## Alcance y supuestos

- Es una demostración rápida, de uso local y sin autenticación.
- La persistencia será mediante `localStorage`; no habrá base de datos ni API de negocio.
- Node.js servirá la aplicación localmente.
- Se incluirán datos iniciales de ejemplo para que el panel sea demostrable desde el primer inicio.
- La interfaz se construirá con HTML5, CSS3 y JavaScript sin framework de frontend.
- Las opciones de estudiantes, directores, co-directores y facultades serán catálogos locales editables en el código del prototipo.

Quedan fuera de esta versión: roles y permisos, firma digital, carga de documentos, notificaciones, reportes PDF, sincronización entre dispositivos, base de datos y despliegue público.

## Dirección de experiencia e interfaz

### Usuario y tarea principal

El usuario es un docente que necesita consultar rápidamente el estado de sus trabajos dirigidos, abrir un proyecto concreto y dejar evidencia de cada sesión de asesoría.

La acción focal de la interfaz será **registrar una nueva sesión de tutoría** dentro del contexto de un proyecto. El panel debe mantener visible el contexto del trabajo para evitar que el docente tenga que recordar o repetir datos.

### Exploración de dominio

- **Conceptos:** proyecto de grado, modalidad, dirección, co-dirección, tutoría, compromiso, seguimiento, firma.
- **Color del dominio:** azul institucional profundo, turquesa costero, marfil de formulario, arena clara y coral reservado para alertas o pendientes.
- **Firma visual:** una bitácora cronológica compacta donde cada tutoría destaca fecha, duración y compromisos, acompañada por una ficha persistente del proyecto.
- **Decisiones contra patrones genéricos:** no usar un panel de métricas intercambiables; priorizar contexto académico. No usar gradientes decorativos; reservar el color para navegación, estados y acciones. No usar una tabla única como pantalla completa; combinar resumen, ficha y bitácora.

### Estructura de vistas

#### 1. Panel general

- Encabezado con nombre de la aplicación y acción primaria “Nuevo proyecto”.
- Resumen de cantidad de proyectos, sesiones registradas y horas acompañadas.
- Lista de proyectos recientes con modalidad, facultad, director y última tutoría.
- Filtros por modalidad y facultad.

#### 2. Formulario de proyecto

Campos:

- Modalidad de grado: `Trabajo de grado`, `Diplomado de profundización`, `Semillero`.
- Título del trabajo de grado.
- Estudiantes: selector múltiple con opciones visibles de ejemplo.
- Director.
- Co-director: opcional.
- Facultad.

El formulario debe mostrar validaciones junto al campo y un mensaje de confirmación después de guardar.

#### 3. Detalle del proyecto

- Cabecera con título, modalidad, facultad y acciones de editar/eliminar.
- Ficha de participantes: estudiantes, director y co-director.
- Resumen de horas y número de tutorías.
- Sección “Bitácora de tutorías” con acción primaria “Registrar tutoría”.
- Tabla de tutorías en escritorio y tarjetas apiladas en móvil.

#### 4. Registro de tutoría

Campos:

- Fecha.
- Duración en horas.
- Actividades realizadas.
- Compromisos.
- Observaciones del director.
- Firma / nombre de estudiantes.
- Firma / nombre de director.

El registro se almacenará asociado al proyecto seleccionado y aparecerá inmediatamente en la bitácora.

## Modelo de datos local

```js
{
  projects: [
    {
      id: "project-uuid",
      modality: "Trabajo de grado",
      title: "Título del proyecto",
      students: ["student-1", "student-2"],
      director: "director-1",
      coDirector: "director-2",
      faculty: "Ingeniería",
      sessions: [
        {
          id: "session-uuid",
          date: "2026-09-24",
          duration: 2,
          activities: "Revisión del marco teórico",
          commitments: "Entregar ajustes antes de la próxima sesión",
          observations: "Avance satisfactorio",
          studentSignature: "Nombre del estudiante",
          directorSignature: "Nombre del director"
        }
      ],
      createdAt: "2026-09-24T10:00:00.000Z",
      updatedAt: "2026-09-24T10:00:00.000Z"
    }
  ]
}
```

El estado se guardará bajo una clave versionada, por ejemplo `usb-cartagena-asesorias-v1`. Si no existe, la aplicación cargará el conjunto de datos de ejemplo. Los catálogos locales vivirán en `catalogs.js`, separado del renderizado.

## Arquitectura propuesta

```text
Node.js server
  └─ sirve /public
      ├─ index.html       estructura semántica y vistas
      ├─ styles.css       tokens, layout, responsive y estados
      ├─ catalogs.js      modalidades, facultades, personas y datos de ejemplo
      └─ app.js           estado, renderizado, formularios y localStorage
```

- El servidor Node.js será mínimo y sólo tendrá la responsabilidad de entregar archivos estáticos y una ruta de fallback para `index.html`.
- El frontend mantendrá un único estado de aplicación y derivará los contadores, filtros y contenido de la bitácora a partir de `projects`.
- La navegación será una SPA pequeña basada en secciones y estado local, sin introducir un router de terceros.
- Los formularios usarán elementos nativos de HTML5 (`select`, `select multiple`, `input type="date"`, `input type="number"`, `textarea`) para conservar accesibilidad y reducir código.

## Sistema visual

- **Base de espaciado:** múltiplos de 4 px; zonas principales con 24–32 px de aire y controles compactos de 12–16 px.
- **Tipografía:** una sans serif de sistema para lectura rápida; jerarquía basada en peso y color además del tamaño.
- **Paleta:**
  - `--ink`: azul casi negro para texto principal.
  - `--navy`: azul profundo para navegación y acciones principales.
  - `--lagoon`: turquesa para foco, estados positivos y detalles de seguimiento.
  - `--paper`: marfil para el lienzo principal.
  - `--sand`: superficie secundaria de formularios y tarjetas.
  - `--coral`: alertas, validaciones y pendientes.
- **Profundidad:** superficies en capas con bordes suaves y sombras discretas; sin mezclar sombras dramáticas con bordes pesados.
- **Estados:** hover, foco visible, activo, deshabilitado, vacío y error para controles y vistas de datos.
- **Responsive:** en móvil, la navegación se convierte en una barra superior compacta, los formularios pasan a una columna y cada fila de tutoría se transforma en tarjeta con etiquetas.

## Flujo de datos e interacciones

1. Al cargar, el frontend lee el estado versionado de `localStorage` o inicializa datos de ejemplo.
2. El panel general calcula sus métricas y muestra los proyectos filtrados.
3. “Nuevo proyecto” abre la vista/formulario y guarda un nuevo objeto tras validar.
4. Al seleccionar un proyecto, la aplicación muestra su ficha y sesiones.
5. “Registrar tutoría” valida la fecha, duración y campos narrativos, agrega la sesión y actualiza `updatedAt`.
6. Editar reutiliza el mismo formulario con los valores existentes.
7. Eliminar proyecto o tutoría solicita confirmación antes de modificar el estado.
8. Toda mutación serializa el nuevo estado inmediatamente en `localStorage` y vuelve a renderizar la vista activa.

## Validación y manejo de errores

- Modalidad, título, al menos un estudiante, director y facultad son obligatorios.
- Fecha, duración, actividades y compromisos son obligatorios para una tutoría.
- La duración acepta números positivos, con un máximo razonable de 24 horas.
- Co-director, observaciones y nombres de firma pueden quedar vacíos cuando el docente aún no los ha diligenciado.
- Si `localStorage` no está disponible, la interfaz mostrará un aviso de sesión temporal y mantendrá los datos en memoria mientras la página esté abierta.
- Las confirmaciones de eliminación serán explícitas y accesibles mediante diálogo nativo o sección de confirmación.

## Verificación

La implementación se considerará lista para esta etapa cuando se compruebe:

- El servidor local entrega la aplicación sin errores.
- Se puede crear un proyecto con opciones de modalidad, facultad y estudiantes.
- El proyecto aparece en el panel y puede abrirse.
- Se puede registrar una tutoría y verla en la tabla o tarjetas.
- Editar y eliminar actualizan la interfaz y el almacenamiento local.
- Al recargar la página, los datos creados siguen disponibles en el mismo navegador.
- La interfaz mantiene legibilidad y no desborda a un ancho móvil.
- La consola del navegador no presenta errores de ejecución durante el flujo principal.
