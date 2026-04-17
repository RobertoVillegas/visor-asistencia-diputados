# Gaceta Attendance

Monorepo for the Cámara de Diputados attendance project.

## Apps

- `apps/web`: TanStack Start frontend
- `apps/api`: Bun + Hono backend for crawling, parsing, auth, and analytics

## Development

Install workspace dependencies from the repo root:

```bash
bun install
```

Run the apps with Turbo:

```bash
bun run dev
```

Default local ports:

- web: `http://localhost:3000`
- api: `http://localhost:3001`

## Adding components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button";
```
