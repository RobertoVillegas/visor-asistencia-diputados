# Code Quality Backlog

Este documento reúne los principales problemas de diseño, mantenibilidad y deuda técnica detectados en la app, junto con una ruta de corrección priorizada.

Objetivo: llevar el proyecto a un estado publicable, mantenible y fácil de extender sin seguir acumulando complejidad accidental.

## Criterios

- Priorizar primero lo que baja riesgo de regresión.
- Después separar responsabilidades.
- Luego fortalecer tipos y contratos.
- Finalmente endurecer reglas de lint y automatización.

## Resumen Ejecutivo

Los smells más relevantes hoy son:

1. `apps/api/src/modules/attendance/service.ts` es un God file.
2. `apps/web/src/routes/admin.tsx` y `apps/web/src/routes/index.tsx` concentran demasiada lógica.
3. Existen contratos débiles entre backend y frontend usando `Record<string, unknown>`.
4. Hay mezcla de lógica de dominio, fetch y rendering en páginas del frontend.
5. Parte de la calidad actual depende de relajar reglas de lint en vez de refactor estructural.

## Prioridad P0

### 1. Romper el God file de attendance

Archivo afectado:

- `apps/api/src/modules/attendance/service.ts`

Problema:

- Mezcla crawling, parsing, ingestión, reconciliación, analytics, people unification, endpoints admin y utilidades.
- El archivo ya es demasiado grande para razonar cambios con seguridad.
- Cualquier ajuste pequeño obliga a tocar zonas no relacionadas.

Fix esperado:

- Extraer módulos separados:
  - `attendance/ingest-service.ts`
  - `attendance/analytics-service.ts`
  - `attendance/people-service.ts`
  - `attendance/quality-service.ts`
  - `attendance/admin-service.ts`
  - `attendance/shared.ts` para utilidades puras

Definición de terminado:

- Ningún archivo de servicio de dominio debe superar aproximadamente 500-700 líneas.
- Cada módulo debe tener una responsabilidad clara.
- Las funciones puras deben salir del archivo principal.

### 2. Separar la orquestación del rendering en el dashboard

Archivo afectado:

- `apps/web/src/routes/index.tsx`

Problema:

- La ruta contiene fetch, cálculo de derived state, configuración de charts, copy, filtros y layout.
- Esto vuelve frágil cualquier cambio visual o de negocio.

Fix esperado:

- Extraer:
  - `useDashboardData`
  - `useTrendSeriesState`
  - `dashboard-chart-utils.ts`
  - componentes visuales por sección:
    - `dashboard-header.tsx`
    - `dashboard-metrics.tsx`
    - `dashboard-party-chart.tsx`
    - `dashboard-trend-chart.tsx`
    - `dashboard-legislators-panel.tsx`

Definición de terminado:

- La ruta debe quedarse como composición de hooks y secciones.
- Los cálculos de tendencias y datasets no deben vivir inline en la página.

### 3. Separar la lógica del panel admin

Archivo afectado:

- `apps/web/src/routes/admin.tsx`

Problema:

- Mezcla autenticación, carga de periodos, carga de jobs, edición de perfiles, anomalías y limpieza de grupos.
- Tiene demasiados `useState`, `useEffect` y flujos mutando estado local.

Fix esperado:

- Extraer:
  - `useAdminSession`
  - `useAdminPeriods`
  - `useAdminAudit`
  - `useAdminPeopleProfiles`
  - `admin-auth-section.tsx`
  - `admin-periods-section.tsx`
  - `admin-jobs-section.tsx`
  - `admin-quality-section.tsx`
  - `admin-people-section.tsx`

Definición de terminado:

- La página admin debe quedar como layout de secciones.
- Cada concern debe tener su propio hook y componente.

## Prioridad P1

### 4. Tipar de forma estricta los payloads de jobs

Archivos afectados:

- `apps/api/src/modules/jobs/service.ts`
- `apps/api/src/index.ts`

Problema:

- Hoy hay casts a `Record<string, unknown>`.
- Eso oculta contratos débiles entre cola, persistencia y ejecución.

Fix esperado:

- Definir tipos serializables concretos:
  - `ProcessPeriodJobPayload`
  - `ProcessAllPeriodsJobPayload`
- Si la tabla requiere JSON genérico, crear mapper explícito:
  - `serializeJobPayload`
  - `deserializeJobPayload`

Definición de terminado:

- No usar `payload as Record<string, unknown>`.
- Cada tipo de job debe tener contrato explícito.

### 5. Eliminar `Record<string, unknown>` de respuestas API públicas

Archivos afectados:

- `apps/web/src/lib/api.ts`
- `apps/api/src/index.ts`
- servicios admin/inspection

Problema:

- El frontend consume shapes ambiguas.
- Las pantallas dependen de campos implícitos en vez de tipos concretos.

Fix esperado:

- Crear tipos dedicados para:
  - inspección de sesión
  - snapshots
  - parse runs
  - attendance preview
  - anomalies
  - reconciliation details

Definición de terminado:

- `api.ts` no debe usar `Record<string, unknown>` para respuestas conocidas.
- El backend debe devolver estructuras tipadas de forma explícita.

### 6. Mover lógica de selección de persona/legislatura a un módulo claro

Archivos afectados:

- `apps/api/src/modules/attendance/service.ts`
- `apps/web/src/routes/people.$personId.tsx`
- `apps/web/src/routes/legislators.$legislatorId.tsx`

Problema:

- La lógica de “persona canónica” ya existe, pero todavía está repartida.
- Conviene consolidarla antes de agregar más features como listas por sesión.

Fix esperado:

- Backend:
  - `resolvePersonByLegislature`
  - `resolveCurrentLegislatorForPerson`
  - `listPersonLegislatures`
- Frontend:
  - `usePersonProfile`
  - `usePersonLegislatureSelection`

Definición de terminado:

- La navegación pública debe depender de `personId`.
- La legislatura activa debe ser un detalle de contexto, no la identidad principal.

### 7. Diseñar y construir la vista de lista de asistencia por sesión

Problema:

- Hoy el producto muestra analítica sobre listas, pero no la lista misma dentro de la app.
- El usuario todavía depende de la fuente oficial para ver el documento base.

Fix esperado:

- Nueva vista pública por sesión con:
  - metadata de sesión
  - lista de asistencia renderizada
  - grupo parlamentario
  - estatus normalizado
  - estatus original
  - fuente oficial
  - opcional: diferencias conciliadas

Archivos nuevos sugeridos:

- `apps/web/src/routes/sessions.$sessionId.tsx`
- `apps/api/src/modules/attendance/session-detail-service.ts`

Definición de terminado:

- Desde dashboard, perfil y admin debe poder abrirse la lista de una sesión sin salir de la app.

## Prioridad P2

### 8. Extraer utilidades puras de charts y métricas

Archivo afectado:

- `apps/web/src/routes/index.tsx`

Problema:

- Las transformaciones de series y datasets viven inline.
- Son difíciles de probar y fáciles de romper con cambios visuales.

Fix esperado:

- Crear:
  - `apps/web/src/lib/dashboard-mappers.ts`
  - `apps/web/src/lib/dashboard-metrics.ts`
  - `apps/web/src/lib/dashboard-trends.ts`

Definición de terminado:

- Los charts deben recibir datos ya preparados.
- Las páginas no deben construir datasets complejos inline.

### 9. Fortalecer manejo de errores y loading states

Problema:

- Muchas pantallas usan una sola cadena de error genérica.
- Hay varios `isLoading` y fetches manuales por `useEffect`.

Fix esperado:

- Estandarizar errores de API.
- Mover más carga a React Query donde aplique.
- Crear un patrón compartido de:
  - empty state
  - loading state
  - recoverable error

Definición de terminado:

- Menos `useEffect` manual para fetch.
- Estados de error más específicos por recurso.

### 10. Consolidar acceso HTTP en el frontend

Archivo afectado:

- `apps/web/src/lib/api.ts`

Problema:

- El archivo funciona, pero ya está creciendo como SDK monolítico.
- Mezcla tipos, cliente, modelos admin y modelos públicos.

Fix esperado:

- Separar por dominio:
  - `api/core.ts`
  - `api/public.ts`
  - `api/admin.ts`
  - `api/types/public.ts`
  - `api/types/admin.ts`

Definición de terminado:

- `api.ts` deja de ser un archivo único enorme.

## Prioridad P3

### 11. Reforzar tests del parser y reconciliación

Archivos afectados:

- `apps/api/scripts/verify-attendance-parser.ts`
- `apps/api/scripts/verify-absence-parser.ts`
- parser/reconcile services

Problema:

- Hoy existen scripts de verificación, pero eso no sustituye tests automatizados normales.

Fix esperado:

- Introducir suite de tests real para:
  - parser attendance
  - parser absence
  - people linking
  - reconcile
  - mappers de analytics

Definición de terminado:

- Tener fixtures reproducibles y asserts automatizados.
- No depender solo de scripts manuales.

### 12. Reducir comentarios, casts y patrones ambiguos

Problema:

- Aún hay zonas con casts amplios, nullish assumptions y patrones no ideales.

Fix esperado:

- Revisar:
  - non-null assertions
  - casts amplios
  - funciones demasiado largas
  - helpers de propósito difuso

## Refactors concretos por archivo

### Backend

#### `apps/api/src/modules/attendance/service.ts`

- Extraer por dominio.
- Mover helpers de formateo/normalización a `shared`.
- Mover consultas SQL pesadas a funciones pequeñas y nombradas.
- Tipar mejor metadata y payloads.

#### `apps/api/src/modules/jobs/service.ts`

- Eliminar serialización genérica sin contrato.
- Separar scheduler, queue y execution.

#### `apps/api/src/index.ts`

- Mover handlers por dominio.
- Reducir lógica inline del router.
- Ideal: `routes/public.ts`, `routes/admin.ts`, `routes/people.ts`.

### Frontend

#### `apps/web/src/routes/index.tsx`

- Separar datos, derivaciones y secciones visuales.
- Convertir datasets a utilidades puras.

#### `apps/web/src/routes/admin.tsx`

- Separar paneles y hooks.
- Reducir número de estados locales acoplados.

#### `apps/web/src/routes/people.$personId.tsx`

- Reusar bloques de perfil y asistencia.
- Sacar componentes como:
  - `person-header`
  - `person-attendance-grid`
  - `person-attendance-history`

#### `apps/web/src/lib/api.ts`

- Separar cliente y tipos.
- Reemplazar `Record<string, unknown>` por contratos explícitos.

## Qué sí conviene medir con herramientas

### Herramientas recomendadas

- `oxlint`
  - Ya integrado.
  - Útil para smells rápidos y consistencia.

- `knip`
  - Para detectar exports, archivos y dependencias no usadas.

- `madge` o `dependency-cruiser`
  - Para detectar ciclos y dependencias indebidas entre módulos.

- `ts-prune`
  - Para exports muertos.

- `cloc` o `wc -l`
  - Para detectar archivos que ya deberían dividirse.

### Comandos útiles

Archivos más grandes:

```bash
find apps packages -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' \) -print0 | xargs -0 wc -l | sort -nr | sed -n '1,40p'
```

Tipado débil:

```bash
rg -n "Record<string, unknown>|as Record<string, unknown>|any\\b|unknown>" apps packages --glob '!**/routeTree.gen.ts'
```

Deuda explícita:

```bash
rg -n "TODO|FIXME|HACK|XXX|@ts-ignore|@ts-expect-error|eslint-disable" apps packages --glob '!**/routeTree.gen.ts'
```

Componentes/rutas sobrecargadas:

```bash
rg -n "useEffect\\(|useMemo\\(|useState\\(|Promise\\.all\\(" apps/web/src/routes
```

## Orden recomendado de ejecución

### Fase 1

- Romper `attendance/service.ts`
- Romper `admin.tsx`
- Romper `index.tsx`

### Fase 2

- Tipar jobs y respuestas API
- Limpiar `api.ts`
- Consolidar módulo de persona canónica

### Fase 3

- Construir vista de lista de asistencia por sesión
- Extraer utilidades de charts y métricas
- Reforzar manejo de errores/empty states

### Fase 4

- Agregar tests reales
- Endurecer reglas de lint gradualmente
- Rehabilitar reglas hoy desactivadas una por una

## Reglas de lint que hoy están relajadas y deberíamos recuperar después

Estas reglas no deberían quedarse “off” para siempre; solo están relajadas mientras se refactoriza:

- `func-style`
- `require-await`
- `complexity`
- `react-hooks/exhaustive-deps`
- `no-negated-condition`
- `no-loop-func`
- `@typescript-eslint/no-non-null-assertion`

Plan:

- Reactivar una sola por sprint.
- Limpiar primero los archivos grandes.
- No reactivar todo de golpe.

## Definición de éxito

Consideraremos el código en buen estado cuando:

- Ninguna ruta principal exceda ~300-400 líneas.
- Ningún servicio de dominio exceda ~500-700 líneas.
- El frontend no use `Record<string, unknown>` para respuestas conocidas.
- Los jobs no dependan de casts genéricos.
- Exista una vista interna para listas de asistencia por sesión.
- El parser y la reconciliación tengan tests automatizados.
- Se puedan reactivar varias reglas de lint actualmente relajadas sin romper medio repo.

## Siguiente paso recomendado

Empezar por este orden:

1. Dividir `apps/api/src/modules/attendance/service.ts`
2. Dividir `apps/web/src/routes/admin.tsx`
3. Dividir `apps/web/src/routes/index.tsx`
4. Tipar `jobs/service.ts` y `web/src/lib/api.ts`
5. Diseñar y construir la vista de lista por sesión

