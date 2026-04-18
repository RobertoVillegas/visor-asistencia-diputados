# Deploy Guide

Guía operativa para desplegar `web` y `api` en producción.

Este proyecto es un monorepo con:

- `apps/api`: Bun + Hono + Drizzle + Better Auth
- `apps/web`: TanStack Start + Nitro

## Arquitectura

Producción recomendada:

- `api` en `https://api.tudominio.com`
- `web` en `https://tudominio.com`

La `web` consume la `api` vía `VITE_API_BASE_URL`.
La `api` usa `BETTER_AUTH_URL` y `CORS_ORIGIN` para auth/cookies/orígenes confiables.

## Requisitos previos

- Base de datos Postgres accesible desde la `api`
- Dominio o subdominio para `web`
- Dominio o subdominio para `api`
- `BETTER_AUTH_SECRET` fuerte, mínimo 32 caracteres

## Variables de entorno

### API

Variables obligatorias:

```env
PORT=3001
TZ=America/Mexico_City
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME
BETTER_AUTH_SECRET=una-clave-larga-y-segura-de-32+-chars
BETTER_AUTH_URL=https://api.tudominio.com
CORS_ORIGIN=https://tudominio.com
ADMIN_EMAILS=tu@correo.com,otro@correo.com
```

Variables recomendadas:

```env
LOG_LEVEL=info
CRON_ENABLED=true
CRON_HOUR=3
JOB_POLL_INTERVAL_MS=5000
```

Variables opcionales:

```env
CRON_TARGET_LEGISLATURE=
FIRECRAWL_API_KEY=
```

Notas:

- `BETTER_AUTH_URL` debe ser la URL pública real del backend.
- `CORS_ORIGIN` debe ser la URL pública real del frontend.
- `ADMIN_EMAILS` acepta una lista separada por comas.
- Si todavía no quieres jobs automáticos, usa `CRON_ENABLED=false`.
- Ese valor ahora desactiva tanto el scheduler como el background worker.
- Es la forma recomendada de mantener vivo el contenedor durante el primer deploy antes de correr migraciones.
- `CRON_HOUR` se interpreta en la timezone del contenedor.
- Recomendado en producción: `TZ=America/Mexico_City`.

### Web

Variable necesaria en build:

```env
TZ=America/Mexico_City
VITE_API_BASE_URL=https://api.tudominio.com
```

Importante:

- Esta variable se usa en build time.
- Si buildas con la URL equivocada, la `web` quedará apuntando mal aunque el contenedor arranque.

## Dockerfiles

Archivos usados:

- `apps/api/Dockerfile`
- `apps/web/Dockerfile`

## Dokploy

### API

Configuración:

- Build Type: `Dockerfile`
- Docker File: `apps/api/Dockerfile`
- Docker Context Path: `.`
- Docker Build Stage: vacío

Puerto:

- `3001`

Variables:

- `PORT=3001`
- `DATABASE_URL=...`
- `BETTER_AUTH_SECRET=...`
- `BETTER_AUTH_URL=https://api.tudominio.com`
- `CORS_ORIGIN=https://tudominio.com`
- `ADMIN_EMAILS=...`
- opcionales según necesidad

### Web

Configuración:

- Build Type: `Dockerfile`
- Docker File: `apps/web/Dockerfile`
- Docker Context Path: `.`
- Docker Build Stage: vacío

Puerto:

- `3000`

Build args:

- `VITE_API_BASE_URL=https://api.tudominio.com`

No depende de runtime env para la URL del API; depende del build arg.

## Orden recomendado de despliegue

### Primer deploy

1. Desplegar o actualizar la `api`
2. Correr migración
3. Validar healthcheck del backend
4. Desplegar la `web`
5. Validar login, dashboard y perfiles

### Deploys siguientes

1. Desplegar `api`
2. Ejecutar migración si aplica
3. Desplegar `web` si hubo cambios frontend o cambió `VITE_API_BASE_URL`

## Migraciones

La migración se corre con la imagen de `api`.

Comando:

```bash
bun run db:migrate
```

Si la plataforma permite ejecutar un comando one-off con la imagen desplegada, ese es el ideal.

Si usas Docker manualmente:

```bash
docker run --rm \
  -e DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DBNAME' \
  gaceta-api \
  bun run db:migrate
```

O si el contenedor ya está corriendo:

```bash
docker exec -e DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DBNAME' <api-container> bun run db:migrate
```

No recomiendo meter la migración en el `CMD` del contenedor.

Motivos:

- puede correr varias veces al escalar
- mezcla arranque de app con operación de schema
- complica rollback y troubleshooting

## Validación post-deploy

### API

Revisar:

- `GET /health`
- login o sesión
- `GET /api/people`
- `GET /api/legislators`

Esperado:

- backend responde
- auth no rompe por origen/cookies
- la base conecta correctamente

### Web

Revisar:

- carga del dashboard
- cambio de periodos
- apertura de perfiles
- apertura de personas por `personId`
- tabla de legisladores
- cards de `/people`

## Checklist pre-producción

- `BETTER_AUTH_SECRET` no es placeholder
- `BETTER_AUTH_URL` apunta al dominio real del backend
- `CORS_ORIGIN` apunta al dominio real del frontend
- `VITE_API_BASE_URL` apunta al dominio real del backend
- la base de datos de producción está accesible desde la `api`
- la migración corrió antes de validar tráfico real
- `CRON_ENABLED` está configurado intencionalmente
- `ADMIN_EMAILS` contiene los correos correctos

## Problemas comunes

### Error: `failed to read dockerfile`

Causa usual:

- `Docker File` mal configurado en Dokploy

Configuración correcta:

- API:
  - `Docker File`: `apps/api/Dockerfile`
  - `Docker Context Path`: `.`
- Web:
  - `Docker File`: `apps/web/Dockerfile`
  - `Docker Context Path`: `.`

### Error: `lockfile had changes, but lockfile is frozen`

Causa:

- Dockerfile copiando solo parte de los manifests del monorepo

Estado actual:

- Ya corregido en ambos Dockerfiles copiando los `package.json` de todos los workspaces antes de `bun install --frozen-lockfile`

### Login falla por CORS/cookies

Revisar:

- `BETTER_AUTH_URL`
- `CORS_ORIGIN`
- que frontend y backend estén en URLs públicas correctas
- que la `web` apunte al `api` correcto vía `VITE_API_BASE_URL`

### La web sigue apuntando a localhost

Causa:

- se buildó con `VITE_API_BASE_URL` equivocado

Fix:

- rebuild del `web` con el build arg correcto

## Valores recomendados para producción inicial

### API

```env
PORT=3001
TZ=America/Mexico_City
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME
BETTER_AUTH_SECRET=una-clave-larga-y-segura-de-32+-chars
BETTER_AUTH_URL=https://api.tudominio.com
CORS_ORIGIN=https://tudominio.com
ADMIN_EMAILS=tu@correo.com
LOG_LEVEL=info
CRON_ENABLED=true
CRON_HOUR=3
JOB_POLL_INTERVAL_MS=5000
```

### Web

Build arg:

```env
VITE_API_BASE_URL=https://api.tudominio.com
```

## Próximo paso

Antes de abrir tráfico real:

1. Desplegar `api`
2. Ejecutar migración
3. Probar `/health`
4. Desplegar `web`
5. Validar login y dashboard
